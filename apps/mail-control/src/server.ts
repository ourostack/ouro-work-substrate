import * as http from "node:http"
import * as fs from "node:fs"
import { normalizeMailAddress, parseAcsEmailDeliveryReportEvent, type MailOutboundDeliveryEvent } from "@ouro.bot/work-protocol"
import type { MailRegistryStore } from "./store"
import { logEvent } from "./log"

export interface PublicRegistryCoordinates {
  kind: "azure-blob"
  azureAccountUrl: string
  container: string
  blob: string
  domain: string
}

export interface BlobStoreCoordinates {
  kind: "azure-blob"
  azureAccountUrl: string
  container: string
}

export interface MailControlOptions {
  store: MailRegistryStore
  adminToken?: string
  adminTokenFile?: string
  allowedEmailDomain: string
  outboundSenderProvisioner?: {
    ensureSenderUsername(input: { agentId: string }): Promise<unknown> | unknown
  }
  publicRegistry?: PublicRegistryCoordinates
  blobStore?: BlobStoreCoordinates
  rateLimitWindowMs?: number
  rateLimitMax?: number
  allowUnauthenticatedLocal?: boolean
  outboundEvents?: {
    recordDeliveryEvent(event: MailOutboundDeliveryEvent): Promise<unknown> | unknown
  }
}

interface Bucket {
  count: number
  resetAt: number
}

class PayloadTooLargeError extends Error {
  readonly statusCode = 413
}

function takeRateLimit(buckets: Map<string, Bucket>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}

function json(response: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  })
  response.end(text)
}

function bearerToken(request: http.IncomingMessage): string | null {
  const header = request.headers.authorization
  if (!header) return null
  return header.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

function expectedAdminToken(options: Pick<MailControlOptions, "adminToken" | "adminTokenFile">): string | undefined {
  if (options.adminTokenFile) return fs.readFileSync(options.adminTokenFile, "utf-8").trim()
  return options.adminToken
}

function readBody(request: http.IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let tooLarge = false
    request.on("data", (chunk: Buffer) => {
      /* v8 ignore next -- extra data events after rejection only drain an already-failed request. */
      if (tooLarge) return
      total += chunk.byteLength
      if (total > maxBytes) {
        tooLarge = true
        reject(new PayloadTooLargeError("request body too large"))
        request.resume()
        return
      }
      chunks.push(chunk)
    })
    /* v8 ignore next 3 -- low-level request stream errors require a broken client socket. */
    request.on("error", (error) => {
      if (!tooLarge) reject(error)
    })
    request.on("end", () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString("utf-8"))
    })
  })
}

function validateAgentId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(value)) {
    throw new Error("agentId must be 2-63 characters of letters, numbers, underscore, or hyphen")
  }
  return value
}

function validateOptionalEmail(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") throw new Error("ownerEmail must be a string")
  const normalized = value.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("ownerEmail must be valid")
  return normalized
}

function validateOptionalText(value: unknown, fallback?: string): string | undefined {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value !== "string" || value.length > 64) throw new Error("source fields must be short strings")
  return value
}

function validateOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "boolean") throw new Error("rotation target flags must be booleans")
  return value
}

function validateOptionalReason(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string" || value.length > 256) throw new Error("reason must be a short string")
  return value
}

function errorStatus(error: unknown, reason: string): number {
  if (error instanceof PayloadTooLargeError) return error.statusCode
  if (reason.includes("must") || reason.includes("required") || reason.includes("valid") || reason.includes("Unexpected") || reason.includes("JSON")) return 400
  return 500
}

function publicRegistryResponse(options: MailControlOptions, revision: string): (PublicRegistryCoordinates & { revision: string }) | undefined {
  return options.publicRegistry ? { ...options.publicRegistry, revision } : undefined
}

function isEventGridValidation(payload: unknown): payload is Array<{ data?: { validationCode?: string } }> {
  return Array.isArray(payload) &&
    payload.some((event) =>
      event &&
      typeof event === "object" &&
      (event as { eventType?: unknown }).eventType === "Microsoft.EventGrid.SubscriptionValidationEvent" &&
      typeof (event as { data?: { validationCode?: unknown } }).data?.validationCode === "string")
}

async function handleOutboundEvents(request: http.IncomingMessage, response: http.ServerResponse, options: MailControlOptions): Promise<void> {
  const body = JSON.parse(await readBody(request)) as unknown
  if (isEventGridValidation(body) || request.headers["aeg-event-type"] === "SubscriptionValidation") {
    const validationCode = Array.isArray(body)
      ? body.map((event) => event.data?.validationCode).find((code): code is string => typeof code === "string")
      : undefined
    if (!validationCode) throw new Error("Event Grid validation request is missing validationCode")
    json(response, 200, { validationResponse: validationCode })
    return
  }
  if (!options.outboundEvents) {
    json(response, 503, { ok: false, error: "outbound event sink is not configured" })
    return
  }
  if (!Array.isArray(body)) throw new Error("Event Grid notification body must be an array")
  const events = body
    .filter((event) => (event as { eventType?: unknown }).eventType === "Microsoft.Communication.EmailDeliveryReportReceived")
    .map(parseAcsEmailDeliveryReportEvent)
  for (const event of events) {
    await options.outboundEvents.recordDeliveryEvent(event)
  }
  logEvent({
    component: "mail-control",
    event: "outbound_delivery_events_received",
    message: "outbound delivery events received",
    meta: { provider: "azure-communication-services", count: events.length },
  })
  json(response, 202, { ok: true, accepted: events.length })
}

export function createMailControlServer(options: MailControlOptions): http.Server {
  const buckets = new Map<string, Bucket>()
  return http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        const { registry, revision } = await options.store.read()
        json(response, 200, {
          ok: true,
          service: "ouro-mail-control",
          domain: registry.domain,
          mailboxes: registry.mailboxes.length,
          sourceGrants: registry.sourceGrants.length,
          revision,
        })
        return
      }
      if (request.method === "POST" && request.url === "/v1/outbound/events/azure-communication-services") {
        await handleOutboundEvents(request, response, options)
        return
      }
      const isEnsure = request.method === "POST" && request.url === "/v1/mailboxes/ensure"
      const isRotateKeys = request.method === "POST" && request.url === "/v1/mailboxes/rotate-keys"
      if (!isEnsure && !isRotateKeys) {
        json(response, 404, { ok: false, error: "not found" })
        return
      }
      const expectedToken = expectedAdminToken(options)
      if (!options.allowUnauthenticatedLocal && (!expectedToken || bearerToken(request) !== expectedToken)) {
        json(response, 401, { ok: false, error: "unauthorized" })
        return
      }
      /* v8 ignore next -- accepted Node HTTP sockets carry a remoteAddress. */
      const rateKey = `${request.socket.remoteAddress ?? "unknown"}`
      if (!takeRateLimit(buckets, rateKey, options.rateLimitWindowMs ?? 60_000, options.rateLimitMax ?? 60)) {
        json(response, 429, { ok: false, error: "rate limited" })
        return
      }
      const body = JSON.parse(await readBody(request)) as Record<string, unknown>
      const ownerEmail = validateOptionalEmail(body.ownerEmail)
      const source = validateOptionalText(body.source, ownerEmail ? "hey" : undefined)
      const sourceTag = validateOptionalText(body.sourceTag)
      const agentId = validateAgentId(body.agentId)
      if (isRotateKeys) {
        const rotateMailbox = validateOptionalBoolean(body.rotateMailbox) ?? false
        const rotateSourceGrant = validateOptionalBoolean(body.rotateSourceGrant) ?? false
        const reason = validateOptionalReason(body.reason)
        const result = await options.store.rotateMailboxKeys({
          agentId,
          ...(ownerEmail ? { ownerEmail } : {}),
          ...(source ? { source } : {}),
          ...(sourceTag ? { sourceTag } : {}),
          rotateMailbox,
          rotateSourceGrant,
        })
        const mailbox = result.registry.mailboxes.find((entry) =>
          normalizeMailAddress(entry.canonicalAddress) === normalizeMailAddress(result.mailboxAddress))
        const sourceGrant = result.sourceAlias
          ? result.registry.sourceGrants.find((entry) => normalizeMailAddress(entry.aliasAddress) === normalizeMailAddress(result.sourceAlias!))
          : undefined
        const publicRegistry = publicRegistryResponse(options, result.revision)
        logEvent({
          component: "mail-control",
          event: "mailbox_keys_rotated",
          message: "mailbox registry keys rotated",
          meta: {
            agentId,
            rotateMailbox,
            rotateSourceGrant,
            rotatedMailbox: result.rotatedMailbox,
            rotatedSourceGrant: result.rotatedSourceGrant,
            addedMailbox: result.addedMailbox,
            addedSourceGrant: result.addedSourceGrant,
            generatedPrivateKeys: Object.keys(result.generatedPrivateKeys).length,
            ...(reason ? { reason } : {}),
          },
        })
        json(response, 200, {
          ok: true,
          mailboxAddress: result.mailboxAddress,
          sourceAlias: result.sourceAlias,
          addedMailbox: result.addedMailbox,
          addedSourceGrant: result.addedSourceGrant,
          rotatedMailbox: result.rotatedMailbox,
          rotatedSourceGrant: result.rotatedSourceGrant,
          generatedPrivateKeys: result.generatedPrivateKeys,
          revision: result.revision,
          mailbox,
          ...(sourceGrant ? { sourceGrant } : {}),
          ...(publicRegistry ? { publicRegistry } : {}),
          ...(options.blobStore ? { blobStore: options.blobStore } : {}),
        })
        return
      }
      if (options.outboundSenderProvisioner) {
        await options.outboundSenderProvisioner.ensureSenderUsername({ agentId })
      }
      const result = await options.store.ensureMailbox({
        agentId,
        ...(ownerEmail ? { ownerEmail } : {}),
        ...(source ? { source } : {}),
        ...(sourceTag ? { sourceTag } : {}),
      })
      const mailbox = result.registry.mailboxes.find((entry) =>
        normalizeMailAddress(entry.canonicalAddress) === normalizeMailAddress(result.mailboxAddress))
      const sourceGrant = result.sourceAlias
        ? result.registry.sourceGrants.find((entry) => normalizeMailAddress(entry.aliasAddress) === normalizeMailAddress(result.sourceAlias!))
        : undefined
      const publicRegistry = publicRegistryResponse(options, result.revision)
      logEvent({
        component: "mail-control",
        event: "mailbox_ensured",
        message: "mailbox registry ensured",
        meta: {
          agentId: body.agentId,
          addedMailbox: result.addedMailbox,
          addedSourceGrant: result.addedSourceGrant,
          generatedPrivateKeys: Object.keys(result.generatedPrivateKeys).length,
        },
      })
      json(response, 200, {
        ok: true,
        mailboxAddress: result.mailboxAddress,
        sourceAlias: result.sourceAlias,
        addedMailbox: result.addedMailbox,
        addedSourceGrant: result.addedSourceGrant,
        generatedPrivateKeys: result.generatedPrivateKeys,
        revision: result.revision,
        mailbox,
        ...(sourceGrant ? { sourceGrant } : {}),
        ...(publicRegistry ? { publicRegistry } : {}),
        ...(options.blobStore ? { blobStore: options.blobStore } : {}),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logEvent({
        level: "error",
        component: "mail-control",
        event: "request_error",
        message: "mail control request failed",
        meta: { reason },
      })
      json(response, errorStatus(error, reason), { ok: false, error: reason })
    }
  })
}

export function startMailControlServer(options: MailControlOptions & { host: string; port: number }): http.Server {
  const server = createMailControlServer(options)
  server.listen(options.port, options.host)
  logEvent({
    component: "mail-control",
    event: "started",
    message: "mail control server started",
    meta: { host: options.host, port: options.port, allowedEmailDomain: options.allowedEmailDomain },
  })
  return server
}
