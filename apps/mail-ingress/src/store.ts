import * as fs from "node:fs"
import * as path from "node:path"
import { BlobServiceClient } from "@azure/storage-blob"
import {
  buildStoredMailMessage,
  classifyResolvedMailPlacement,
  decryptStoredMailMessage,
  resolveMailAddress,
  type DecryptedMailMessage,
  type EncryptedPayload,
  type MailAuthenticationSummary,
  type MailClassification,
  type MailEnvelopeInput,
  type MailIngestProvenance,
  type MailroomRegistry,
  type PrivateMailEnvelope,
  type ResolvedMailAddress,
  type StoredMailMessage,
} from "@ouro.bot/work-protocol"
import { logEvent } from "./log"

const MESSAGE_INDEX_PREFIX = "message-index"
const MESSAGE_INDEX_SORT_MAX_MS = 9_999_999_999_999
const MESSAGE_INDEX_SORT_WIDTH = 13
const MESSAGE_INDEX_NO_SOURCE = "~"

export interface MailroomStore {
  putRawMessage(input: {
    resolved: ResolvedMailAddress
    envelope: MailEnvelopeInput
    rawMime: Buffer
    privateEnvelope: PrivateMailEnvelope
    receivedAt?: Date
    ingest?: MailIngestProvenance
    classification: MailClassification
    authentication?: MailAuthenticationSummary
  }): Promise<{ created: boolean; message: StoredMailMessage }>
  getMessage(id: string): Promise<StoredMailMessage | null>
  readRawPayload(objectName: string): Promise<EncryptedPayload | null>
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function blobText(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

async function downloadJson<T>(blob: { exists(): Promise<boolean>; downloadToBuffer(): Promise<Buffer> }): Promise<T | null> {
  if (!await blob.exists()) return null
  return JSON.parse((await blob.downloadToBuffer()).toString("utf-8")) as T
}

function encodeSourceToken(source?: string): string {
  return source ? encodeURIComponent(source.toLowerCase()) : MESSAGE_INDEX_NO_SOURCE
}

function parseSortMs(receivedAt: string): number {
  const parsed = Date.parse(receivedAt)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(MESSAGE_INDEX_SORT_MAX_MS, parsed))
}

function messageIndexBlobName(message: Pick<StoredMailMessage, "id" | "agentId" | "compartmentKind" | "placement" | "source" | "receivedAt">): string {
  const sortKey = String(MESSAGE_INDEX_SORT_MAX_MS - parseSortMs(message.receivedAt)).padStart(MESSAGE_INDEX_SORT_WIDTH, "0")
  return `${MESSAGE_INDEX_PREFIX}/${message.agentId}/${sortKey}__${message.compartmentKind}__${message.placement}__${encodeSourceToken(message.source)}__${message.id}.json`
}

function messageIndexRecord(message: Pick<StoredMailMessage, "id" | "agentId" | "compartmentKind" | "placement" | "source" | "receivedAt">): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: message.id,
    agentId: message.agentId,
    compartmentKind: message.compartmentKind,
    placement: message.placement,
    source: message.source ?? null,
    receivedAt: message.receivedAt,
  }
}

export class FileMailroomStore implements MailroomStore {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
    ensureDir(path.join(this.rootDir, "messages"))
    ensureDir(path.join(this.rootDir, "raw"))
    ensureDir(path.join(this.rootDir, "candidates"))
  }

  private messagePath(id: string): string {
    return path.join(this.rootDir, "messages", `${id}.json`)
  }

  private rawPath(objectName: string): string {
    return path.join(this.rootDir, objectName)
  }

  private candidatePath(id: string): string {
    return path.join(this.rootDir, "candidates", `${id}.json`)
  }

  async putRawMessage(input: Parameters<MailroomStore["putRawMessage"]>[0]): Promise<{ created: boolean; message: StoredMailMessage }> {
    const { message, rawPayload, candidate } = buildStoredMailMessage(input)
    const existing = readJson<StoredMailMessage>(this.messagePath(message.id))
    if (existing) return { created: false, message: existing }
    writeJson(this.rawPath(message.rawObject), rawPayload)
    writeJson(this.messagePath(message.id), message)
    if (candidate) writeJson(this.candidatePath(candidate.id), candidate)
    return { created: true, message }
  }

  async getMessage(id: string): Promise<StoredMailMessage | null> {
    return readJson<StoredMailMessage>(this.messagePath(id))
  }

  async readRawPayload(objectName: string): Promise<EncryptedPayload | null> {
    return readJson<EncryptedPayload>(this.rawPath(objectName))
  }
}

export class AzureBlobMailroomStore implements MailroomStore {
  private containerReady: Promise<void> | null = null

  constructor(
    private readonly serviceClient: BlobServiceClient,
    private readonly containerName: string,
  ) {}

  private get container() {
    return this.serviceClient.getContainerClient(this.containerName)
  }

  private async ensureContainer(): Promise<void> {
    if (!this.containerReady) {
      this.containerReady = this.container.createIfNotExists().then(() => undefined)
    }
    await this.containerReady
  }

  private messageBlob(id: string) {
    return this.container.getBlockBlobClient(`messages/${id}.json`)
  }

  private rawBlob(objectName: string) {
    return this.container.getBlockBlobClient(objectName)
  }

  private candidateBlob(id: string) {
    return this.container.getBlockBlobClient(`candidates/${id}.json`)
  }

  private messageIndexBlob(name: string) {
    return this.container.getBlockBlobClient(name)
  }

  async putRawMessage(input: Parameters<MailroomStore["putRawMessage"]>[0]): Promise<{ created: boolean; message: StoredMailMessage }> {
    await this.ensureContainer()
    const { message, rawPayload, candidate } = buildStoredMailMessage(input)
    const existing = await downloadJson<StoredMailMessage>(this.messageBlob(message.id))
    if (existing) {
      await this.messageIndexBlob(messageIndexBlobName(existing)).uploadData(blobText(messageIndexRecord(existing)))
      return { created: false, message: existing }
    }
    await this.rawBlob(message.rawObject).uploadData(blobText(rawPayload))
    await this.messageBlob(message.id).uploadData(blobText(message))
    await this.messageIndexBlob(messageIndexBlobName(message)).uploadData(blobText(messageIndexRecord(message)))
    if (candidate) await this.candidateBlob(candidate.id).uploadData(blobText(candidate))
    return { created: true, message }
  }

  async getMessage(id: string): Promise<StoredMailMessage | null> {
    await this.ensureContainer()
    return downloadJson<StoredMailMessage>(this.messageBlob(id))
  }

  async readRawPayload(objectName: string): Promise<EncryptedPayload | null> {
    await this.ensureContainer()
    return downloadJson<EncryptedPayload>(this.rawBlob(objectName))
  }
}

export async function ingestRawMailToStore(input: {
  registry: MailroomRegistry
  store: MailroomStore
  envelope: MailEnvelopeInput
  rawMime: Buffer
  privateEnvelope: PrivateMailEnvelope
  receivedAt?: Date
  ingest?: MailIngestProvenance
  authentication?: MailAuthenticationSummary
}): Promise<{ accepted: StoredMailMessage[]; rejectedRecipients: string[] }> {
  const accepted: StoredMailMessage[] = []
  const rejectedRecipients: string[] = []
  for (const recipient of input.envelope.rcptTo) {
    const resolved = resolveMailAddress(input.registry, recipient)
    if (!resolved) {
      rejectedRecipients.push(recipient)
      continue
    }
    const classification = classifyResolvedMailPlacement({
      registry: input.registry,
      resolved,
      sender: input.envelope.mailFrom,
      ...(input.authentication ? { authentication: input.authentication } : {}),
    })
    const result = await input.store.putRawMessage({
      resolved,
      envelope: input.envelope,
      rawMime: input.rawMime,
      privateEnvelope: input.privateEnvelope,
      receivedAt: input.receivedAt,
      ...(input.ingest ? { ingest: input.ingest } : {}),
      classification,
      ...(input.authentication ? { authentication: input.authentication } : {}),
    })
    accepted.push(result.message)
  }
  logEvent({
    component: "mail-ingress",
    event: "mail_ingest_complete",
    message: "mail ingest completed",
    meta: { accepted: accepted.length, rejected: rejectedRecipients.length },
  })
  return { accepted, rejectedRecipients }
}

export function decryptMessages(messages: StoredMailMessage[], privateKeys: Record<string, string>): DecryptedMailMessage[] {
  return messages.map((message) => decryptStoredMailMessage(message, privateKeys))
}
