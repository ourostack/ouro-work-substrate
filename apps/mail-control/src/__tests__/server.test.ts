import * as fs from "node:fs"
import * as http from "node:http"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createMailControlServer, startMailControlServer } from "../server"
import { FileMailRegistryStore } from "../store"

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve(typeof address === "object" && address ? address.port : 0)
    })
  })
}

describe("mail control server", () => {
  it("serves health and rejects unknown routes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-server-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`)
      expect(await health.json()).toEqual(expect.objectContaining({
        ok: true,
        service: "ouro-mail-control",
        domain: "ouro.bot",
        mailboxes: 0,
        sourceGrants: 0,
      }))
      const missing = await fetch(`http://127.0.0.1:${port}/missing`, { method: "POST" })
      expect(missing.status).toBe(404)
    } finally {
      server.close()
    }
  })

  it("accepts Event Grid validation and ACS delivery report webhooks body-safely", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-outbound-events-"))
    const outboundEvents = {
      recordDeliveryEvent: vi.fn(async () => ({ ok: true })),
    }
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      outboundEvents,
    } as Parameters<typeof createMailControlServer>[0] & {
      outboundEvents: typeof outboundEvents
    })
    const port = await listen(server)
    try {
      const validation = await fetch(`http://127.0.0.1:${port}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "SubscriptionValidation",
        },
        body: JSON.stringify([{
          eventType: "Microsoft.EventGrid.SubscriptionValidationEvent",
          data: { validationCode: "validation-code-1" },
        }]),
      })
      expect(validation.status).toBe(200)
      expect(await validation.json()).toEqual({ validationResponse: "validation-code-1" })

      const delivery = await fetch(`http://127.0.0.1:${port}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "Notification",
        },
        body: JSON.stringify([{
          id: "event-bounced-1",
          eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
          eventTime: "2026-04-23T01:35:00.000Z",
          data: {
            sender: "slugger@ouro.bot",
            recipient: "owner@example.test",
            messageId: "acs-operation-1",
            status: "Bounced",
            deliveryStatusDetails: { statusMessage: "mailbox unavailable; secret body must not be here" },
            deliveryAttemptTimeStamp: "2026-04-23T01:34:59.000Z",
          },
        }]),
      })
      expect(delivery.status).toBe(202)
      expect(outboundEvents.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
        provider: "azure-communication-services",
        providerEventId: "event-bounced-1",
        providerMessageId: "acs-operation-1",
        outcome: "bounced",
        recipient: "owner@example.test",
        bodySafeSummary: expect.stringContaining("Bounced"),
      }))
      expect(JSON.stringify(outboundEvents.recordDeliveryEvent.mock.calls)).not.toContain("secret body")
    } finally {
      server.close()
    }
  })

  it("handles outbound Event Grid setup failures without body or secret leakage", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-outbound-events-errors-"))
    const outboundEvents = {
      recordDeliveryEvent: vi.fn(async () => ({ ok: true })),
    }
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      outboundEvents,
    } as Parameters<typeof createMailControlServer>[0] & {
      outboundEvents: typeof outboundEvents
    })
    const port = await listen(server)
    try {
      const missingCode = await fetch(`http://127.0.0.1:${port}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "SubscriptionValidation",
        },
        body: JSON.stringify([{ eventType: "Microsoft.EventGrid.SubscriptionValidationEvent", data: {} }]),
      })
      expect(missingCode.status).toBe(400)
      expect(await missingCode.json()).toEqual(expect.objectContaining({ ok: false }))

      const malformedValidation = await fetch(`http://127.0.0.1:${port}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "SubscriptionValidation",
        },
        body: JSON.stringify({ data: { validationCode: "not-in-array" } }),
      })
      expect(malformedValidation.status).toBe(400)

      const notArray = await fetch(`http://127.0.0.1:${port}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "Notification",
        },
        body: JSON.stringify({ id: "not-array" }),
      })
      expect(notArray.status).toBe(400)

      const irrelevant = await fetch(`http://127.0.0.1:${port}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "Notification",
        },
        body: JSON.stringify([{
          id: "event-engagement-1",
          eventType: "Microsoft.Communication.EmailEngagementTrackingReportReceived",
          data: { messageId: "acs-operation-1", secret: "do not log this" },
        }]),
      })
      expect(irrelevant.status).toBe(202)
      expect(await irrelevant.json()).toEqual({ ok: true, accepted: 0 })
      expect(outboundEvents.recordDeliveryEvent).not.toHaveBeenCalled()
    } finally {
      server.close()
    }

    const noSinkDir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-outbound-events-nosink-"))
    const noSinkServer = createMailControlServer({
      store: new FileMailRegistryStore(path.join(noSinkDir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const noSinkPort = await listen(noSinkServer)
    try {
      const noSink = await fetch(`http://127.0.0.1:${noSinkPort}/v1/outbound/events/azure-communication-services`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "aeg-event-type": "Notification",
        },
        body: JSON.stringify([{
          id: "event-bounced-nosink",
          eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
          data: {
            recipient: "owner@example.test",
            messageId: "acs-operation-1",
            status: "Bounced",
            deliveryStatusDetails: { statusMessage: "secret diagnostic body" },
          },
        }]),
      })
      expect(noSink.status).toBe(503)
      expect(JSON.stringify(await noSink.json())).not.toContain("secret diagnostic body")
    } finally {
      noSinkServer.close()
    }
  })

  it("requires bearer auth for mailbox creation", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-server-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, { method: "POST" })
      expect(response.status).toBe(401)
      const malformed = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: { authorization: "Token nope" },
      })
      expect(malformed.status).toBe(401)
    } finally {
      server.close()
    }
  })

  it("rejects mutation when no expected token is configured", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-no-token-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      })
      expect(response.status).toBe(401)
    } finally {
      server.close()
    }
  })

  it("creates agent mailboxes and returns generated private keys once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-server-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          ownerEmail: "owner@example.test",
          source: "hey",
        }),
      })
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(200)
      expect(body.mailboxAddress).toBe("slugger@ouro.bot")
      expect(body.sourceAlias).toBe("test.example.owner.slugger@ouro.bot")
      expect(Object.keys(body.generatedPrivateKeys as Record<string, string>)).toHaveLength(2)

      const second = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", ownerEmail: "owner@example.test", source: "hey" }),
      })
      const secondBody = await second.json() as Record<string, unknown>
      expect(secondBody.generatedPrivateKeys).toEqual({})
    } finally {
      server.close()
    }
  })

  it("ensures the native ACS sender username before mutating registry state", async () => {
    const ensureSenderUsername = vi.fn(async () => ({ senderUsername: "slugger" }))
    const ensureMailbox = vi.fn(async () => ({
      registry: {
        schemaVersion: 1 as const,
        domain: "ouro.bot",
        mailboxes: [{
          agentId: "slugger",
          mailboxId: "mailbox_slugger",
          canonicalAddress: "slugger@ouro.bot",
          keyId: "mail_slugger-native_123",
          publicKeyPem: "public",
          defaultPlacement: "screener" as const,
        }],
        sourceGrants: [],
      },
      mailboxAddress: "slugger@ouro.bot",
      sourceAlias: null,
      addedMailbox: true,
      addedSourceGrant: false,
      keys: { mail_slugger_native_123: "private" },
      generatedPrivateKeys: { mail_slugger_native_123: "private" },
      revision: "1:0:123",
    }))
    const read = vi.fn(async () => ({
      registry: { schemaVersion: 1 as const, domain: "ouro.bot", mailboxes: [], sourceGrants: [] },
      revision: "0:0:72",
    }))
    const server = createMailControlServer({
      store: { ensureMailbox, rotateMailboxKeys: vi.fn(), read },
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      outboundSenderProvisioner: { ensureSenderUsername },
    } as Parameters<typeof createMailControlServer>[0])
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      expect(response.status).toBe(200)
      expect(ensureSenderUsername).toHaveBeenCalledWith({ agentId: "slugger" })
      expect(ensureMailbox).toHaveBeenCalledWith({ agentId: "slugger" })
      expect(ensureSenderUsername.mock.invocationCallOrder[0]).toBeLessThan(ensureMailbox.mock.invocationCallOrder[0]!)
    } finally {
      server.close()
    }
  })

  it("fails before mailbox mutation when ACS sender username provisioning fails", async () => {
    const ensureSenderUsername = vi.fn(async () => {
      throw new Error("ACS sender username ensure failed for slugger@ouro.bot: forbidden")
    })
    const ensureMailbox = vi.fn(async () => {
      throw new Error("should not be called")
    })
    const read = vi.fn(async () => ({
      registry: { schemaVersion: 1 as const, domain: "ouro.bot", mailboxes: [], sourceGrants: [] },
      revision: "0:0:72",
    }))
    const server = createMailControlServer({
      store: { ensureMailbox, rotateMailboxKeys: vi.fn(), read },
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      outboundSenderProvisioner: { ensureSenderUsername },
    } as Parameters<typeof createMailControlServer>[0])
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(500)
      expect(String(body.error)).toContain("ACS sender username ensure failed for slugger@ouro.bot")
      expect(ensureMailbox).not.toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  it("returns public records and hosted Blob reader coordinates for harness setup", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-hosted-coordinates-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      publicRegistry: {
        kind: "azure-blob",
        azureAccountUrl: "https://stourotest.blob.core.windows.net",
        container: "mailroom",
        blob: "registry/mailroom.json",
        domain: "ouro.bot",
      },
      blobStore: {
        kind: "azure-blob",
        azureAccountUrl: "https://stourotest.blob.core.windows.net",
        container: "mailroom",
      },
    } as Parameters<typeof createMailControlServer>[0] & {
      publicRegistry: Record<string, string>
      blobStore: Record<string, string>
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          ownerEmail: "owner@example.test",
          source: "hey",
        }),
      })
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(200)
      expect(body.publicRegistry).toEqual({
        kind: "azure-blob",
        azureAccountUrl: "https://stourotest.blob.core.windows.net",
        container: "mailroom",
        blob: "registry/mailroom.json",
        domain: "ouro.bot",
        revision: expect.any(String),
      })
      expect(body.blobStore).toEqual({
        kind: "azure-blob",
        azureAccountUrl: "https://stourotest.blob.core.windows.net",
        container: "mailroom",
      })
      const mailbox = body.mailbox as Record<string, unknown>
      const sourceGrant = body.sourceGrant as Record<string, unknown>
      expect(mailbox).toEqual(expect.objectContaining({
        agentId: "slugger",
        mailboxId: "mailbox_slugger",
        canonicalAddress: "slugger@ouro.bot",
        keyId: expect.stringMatching(/^mail_slugger-native_/),
        defaultPlacement: "screener",
      }))
      expect(sourceGrant).toEqual(expect.objectContaining({
        grantId: expect.stringMatching(/^grant_slugger_hey_/),
        agentId: "slugger",
        ownerEmail: "owner@example.test",
        source: "hey",
        aliasAddress: "test.example.owner.slugger@ouro.bot",
        keyId: expect.stringMatching(/^mail_slugger-hey_/),
        defaultPlacement: "imbox",
        enabled: true,
      }))
      const generatedPrivateKeys = body.generatedPrivateKeys as Record<string, string>
      expect(generatedPrivateKeys[mailbox.keyId as string]).toContain("BEGIN PRIVATE KEY")
      expect(generatedPrivateKeys[sourceGrant.keyId as string]).toContain("BEGIN PRIVATE KEY")
      expect(JSON.stringify(mailbox)).not.toContain("PRIVATE KEY")
      expect(JSON.stringify(sourceGrant)).not.toContain("PRIVATE KEY")

      const second = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", ownerEmail: "owner@example.test", source: "hey" }),
      })
      const secondBody = await second.json() as Record<string, unknown>
      expect(secondBody.generatedPrivateKeys).toEqual({})
      expect(secondBody.mailbox).toEqual(expect.objectContaining({ keyId: mailbox.keyId }))
      expect(secondBody.sourceGrant).toEqual(expect.objectContaining({ keyId: sourceGrant.keyId }))
      expect(secondBody.publicRegistry).toEqual(expect.objectContaining({ revision: expect.any(String) }))
    } finally {
      server.close()
    }
  })

  it("rotates hosted mailbox keys explicitly when one-time private keys were lost", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-rotate-keys-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      publicRegistry: {
        kind: "azure-blob",
        azureAccountUrl: "https://stourotest.blob.core.windows.net",
        container: "mailroom",
        blob: "registry/mailroom.json",
        domain: "ouro.bot",
      },
      blobStore: {
        kind: "azure-blob",
        azureAccountUrl: "https://stourotest.blob.core.windows.net",
        container: "mailroom",
      },
    } as Parameters<typeof createMailControlServer>[0] & {
      publicRegistry: Record<string, string>
      blobStore: Record<string, string>
    })
    const port = await listen(server)
    try {
      const first = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", ownerEmail: "owner@example.test", source: "hey" }),
      })
      const firstBody = await first.json() as Record<string, unknown>
      const oldMailbox = firstBody.mailbox as Record<string, unknown>
      const oldSource = firstBody.sourceGrant as Record<string, unknown>

      const rotated = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/rotate-keys`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          ownerEmail: "owner@example.test",
          source: "hey",
          rotateMailbox: true,
          rotateSourceGrant: true,
          reason: "lost one-time keys during hosted setup proof",
        }),
      })
      const body = await rotated.json() as Record<string, unknown>
      expect(rotated.status).toBe(200)
      expect(body.rotatedMailbox).toBe(true)
      expect(body.rotatedSourceGrant).toBe(true)
      const mailbox = body.mailbox as Record<string, unknown>
      const sourceGrant = body.sourceGrant as Record<string, unknown>
      expect(mailbox.keyId).not.toBe(oldMailbox.keyId)
      expect(sourceGrant.keyId).not.toBe(oldSource.keyId)
      expect(body.mailboxAddress).toBe("slugger@ouro.bot")
      expect(body.sourceAlias).toBe("test.example.owner.slugger@ouro.bot")
      expect(body.publicRegistry).toEqual(expect.objectContaining({ revision: expect.any(String) }))
      const generatedPrivateKeys = body.generatedPrivateKeys as Record<string, string>
      expect(generatedPrivateKeys[mailbox.keyId as string]).toContain("BEGIN PRIVATE KEY")
      expect(generatedPrivateKeys[sourceGrant.keyId as string]).toContain("BEGIN PRIVATE KEY")
      expect(JSON.stringify(mailbox)).not.toContain("PRIVATE KEY")
      expect(JSON.stringify(sourceGrant)).not.toContain("PRIVATE KEY")

      const noTarget = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/rotate-keys`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      expect(noTarget.status).toBe(400)

      const badBoolean = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/rotate-keys`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", rotateMailbox: "yes" }),
      })
      expect(badBoolean.status).toBe(400)

      const badReason = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/rotate-keys`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", rotateMailbox: true, reason: "x".repeat(257) }),
      })
      expect(badReason.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it("rotates by creating missing native/source records without requiring hosted coordinate output", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-rotate-create-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const native = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/rotate-keys`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "clio", rotateMailbox: true }),
      })
      const nativeBody = await native.json() as Record<string, unknown>
      expect(native.status).toBe(200)
      expect(nativeBody.addedMailbox).toBe(true)
      expect(nativeBody.rotatedMailbox).toBe(false)
      expect(nativeBody.sourceAlias).toBeNull()
      expect(nativeBody).not.toHaveProperty("sourceGrant")
      expect(nativeBody).not.toHaveProperty("publicRegistry")
      expect(nativeBody).not.toHaveProperty("blobStore")

      const source = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/rotate-keys`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "clio",
          ownerEmail: "owner@example.test",
          source: "calendar",
          sourceTag: "calendar",
          rotateSourceGrant: true,
        }),
      })
      const sourceBody = await source.json() as Record<string, unknown>
      expect(source.status).toBe(200)
      expect(sourceBody.addedMailbox).toBe(false)
      expect(sourceBody.addedSourceGrant).toBe(true)
      expect(sourceBody.rotatedSourceGrant).toBe(false)
      expect(sourceBody.sourceAlias).toBe("test.example.owner.calendar.clio@ouro.bot")
      expect(sourceBody.sourceGrant).toEqual(expect.objectContaining({ source: "calendar" }))
    } finally {
      server.close()
    }
  })

  it("allows explicit unauthenticated local setup", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-local-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      allowedEmailDomain: "ouro.bot",
      allowUnauthenticatedLocal: true,
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      expect(response.status).toBe(200)
    } finally {
      server.close()
    }
  })

  it("validates request bodies and rate limits callers", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-validate-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const invalid = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", ownerEmail: "not-mail" }),
      })
      expect(invalid.status).toBe(400)

      const badOwnerType = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", ownerEmail: 42 }),
      })
      expect(badOwnerType.status).toBe(400)

      const badAgent = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "!" }),
      })
      expect(badAgent.status).toBe(400)

      const badSource = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger", source: "x".repeat(65) }),
      })
      expect(badSource.status).toBe(400)

      const invalidJson = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: "{",
      })
      expect(invalidJson.status).toBe(400)

      const tooLarge = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: "x".repeat(1024 * 1024 + 1),
      })
      expect(tooLarge.status).toBe(413)
    } finally {
      server.close()
    }
  })

  it("surfaces unexpected store errors without leaking control flow", async () => {
    const server = createMailControlServer({
      store: {
        async read() {
          return { registry: { schemaVersion: 1, domain: "ouro.bot", mailboxes: [], sourceGrants: [] }, revision: "0:0:72" }
        },
        async ensureMailbox() {
          throw "store offline"
        },
        async rotateMailboxKeys() {
          throw "store offline"
        },
      },
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(500)
      expect(body.error).toBe("store offline")
    } finally {
      server.close()
    }
  })

  it("rate limits callers after the allowed window count", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-rate-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      rateLimitMax: 1,
    })
    const port = await listen(server)
    try {
      const first = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      expect(first.status).toBe(200)
      const limited = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "clio" }),
      })
      expect(limited.status).toBe(429)
    } finally {
      server.close()
    }
  })

  it("defaults delegated sources and persists source tags", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-source-"))
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          ownerEmail: "owner@example.test",
          sourceTag: "calendar",
        }),
      })
      const body = await response.json() as Record<string, unknown>
      expect(body.sourceAlias).toBe("test.example.owner.calendar.slugger@ouro.bot")
    } finally {
      server.close()
    }
  })

  it("reads token files at request time so rotations do not require process restart", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-token-"))
    const tokenFile = path.join(dir, "token")
    fs.writeFileSync(tokenFile, "first", "utf-8")
    const server = createMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminTokenFile: tokenFile,
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      fs.writeFileSync(tokenFile, "second", "utf-8")
      const response = await fetch(`http://127.0.0.1:${port}/v1/mailboxes/ensure`, {
        method: "POST",
        headers: {
          authorization: "Bearer second",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      expect(response.status).toBe(200)
    } finally {
      server.close()
    }
  })

  it("starts on an explicit host and port", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-start-"))
    const server = startMailControlServer({
      store: new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot"),
      adminToken: "secret",
      allowedEmailDomain: "ouro.bot",
      host: "127.0.0.1",
      port: 0,
    })
    try {
      await new Promise((resolve) => server.once("listening", resolve))
      expect(server.address()).toEqual(expect.objectContaining({ address: "127.0.0.1" }))
    } finally {
      server.close()
    }
  })
})
