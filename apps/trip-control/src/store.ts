import * as fs from "node:fs"
import * as path from "node:path"
import { BlobServiceClient, type BlockBlobClient } from "@azure/storage-blob"
import {
  emptyTripLedgerRegistry,
  ensureAgentTripLedger,
  tripLedgerRegistryRevision,
  type AgentTripLedgerRecord,
  type EncryptedPayload,
  type TripLedgerRegistry,
} from "@ouro.bot/work-protocol"

export interface EnsureLedgerInput {
  agentId: string
  label?: string
}

export interface EnsureLedgerResult {
  ledger: AgentTripLedgerRecord
  added: boolean
  /** Returned only on the call that created the ledger; subsequent calls return undefined. */
  generatedPrivateKeyPem?: string
  registryRevision: string
}

export interface UpsertTripInput {
  agentId: string
  tripId: string
  payload: EncryptedPayload
}

export interface GetTripResult {
  payload: EncryptedPayload
}

export interface ListTripsResult {
  agentId: string
  tripIds: string[]
}

/**
 * Hosted store for trip ledgers. Two surfaces:
 *   - registry (one blob, holds public AgentTripLedgerRecord per agent)
 *   - per-trip blobs (encrypted TripRecord JSON, keyed by agentId+tripId)
 *
 * Implementations must guarantee:
 *   - ensureLedger is idempotent on agentId
 *   - ensureLedger returns the freshly generated private key exactly once
 *   - upsertTrip / getTrip are scoped to the calling agentId; cross-agent
 *     reads / writes are not part of this surface (callers enforce auth)
 */
export interface TripLedgerStore {
  readRegistry(): Promise<{ registry: TripLedgerRegistry; revision: string }>
  ensureLedger(input: EnsureLedgerInput): Promise<EnsureLedgerResult>
  upsertTrip(input: UpsertTripInput): Promise<{ revision: string }>
  getTrip(input: { agentId: string; tripId: string }): Promise<GetTripResult>
  listTrips(input: { agentId: string }): Promise<ListTripsResult>
}

const REGISTRY_FILENAME = "trip-ledgers.json"
const TRIPS_DIR = "trips"

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8")
  fs.renameSync(tmp, filePath)
}

/**
 * Trip not found in store. Distinct error class so the server can map it to
 * a 404 without parsing message text.
 */
export class TripNotFoundError extends Error {
  readonly statusCode = 404
  constructor(input: { agentId: string; tripId: string }) {
    super(`trip not found: agent=${input.agentId} trip=${input.tripId}`)
  }
}

export class FileTripLedgerStore implements TripLedgerStore {
  constructor(private readonly rootDir: string) {}

  private registryPath(): string {
    return path.join(this.rootDir, REGISTRY_FILENAME)
  }

  private tripPath(agentId: string, tripId: string): string {
    return path.join(this.rootDir, TRIPS_DIR, agentId, `${tripId}.json`)
  }

  private agentTripsDir(agentId: string): string {
    return path.join(this.rootDir, TRIPS_DIR, agentId)
  }

  async readRegistry(): Promise<{ registry: TripLedgerRegistry; revision: string }> {
    const stored = readJson<TripLedgerRegistry>(this.registryPath()) ?? emptyTripLedgerRegistry()
    return { registry: stored, revision: tripLedgerRegistryRevision(stored) }
  }

  async ensureLedger(input: EnsureLedgerInput): Promise<EnsureLedgerResult> {
    const { registry } = await this.readRegistry()
    const result = ensureAgentTripLedger(registry, {
      agentId: input.agentId,
      label: input.label,
    })
    if (result.added) {
      writeJsonAtomic(this.registryPath(), result.registry)
    }
    return {
      ledger: result.ledger,
      added: result.added,
      generatedPrivateKeyPem: result.generatedPrivateKeyPem,
      registryRevision: tripLedgerRegistryRevision(result.registry),
    }
  }

  async upsertTrip(input: UpsertTripInput): Promise<{ revision: string }> {
    writeJsonAtomic(this.tripPath(input.agentId, input.tripId), input.payload)
    return { revision: input.payload.keyId }
  }

  async getTrip(input: { agentId: string; tripId: string }): Promise<GetTripResult> {
    const payload = readJson<EncryptedPayload>(this.tripPath(input.agentId, input.tripId))
    if (!payload) throw new TripNotFoundError(input)
    return { payload }
  }

  async listTrips(input: { agentId: string }): Promise<ListTripsResult> {
    const dir = this.agentTripsDir(input.agentId)
    if (!fs.existsSync(dir)) return { agentId: input.agentId, tripIds: [] }
    const tripIds = fs.readdirSync(dir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .sort()
    return { agentId: input.agentId, tripIds }
  }
}

// ── Azure Blob backing ─────────────────────────────────────────────

const AZURE_REGISTRY_BLOB_NAME = "registry/trip-ledgers.json"
const AZURE_TRIPS_PREFIX = "trips/"

async function downloadRegistryBlob(blob: BlockBlobClient): Promise<{ registry: TripLedgerRegistry; etag?: string }> {
  if (!await blob.exists()) return { registry: emptyTripLedgerRegistry() }
  const response = await blob.download()
  /* v8 ignore next -- defensive: download responses always carry a readable stream when exists() is true. */
  if (!response.readableStreamBody) throw new Error("trip ledger registry blob download returned no readable stream")
  const chunks: Buffer[] = []
  for await (const chunk of response.readableStreamBody) {
    /* v8 ignore next -- defensive: Azure SDK download streams emit Buffer chunks; the string fallback is only for fakes. */
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return {
    registry: JSON.parse(Buffer.concat(chunks).toString("utf-8")) as TripLedgerRegistry,
    etag: response.etag,
  }
}

async function downloadPayloadBlob(blob: BlockBlobClient): Promise<EncryptedPayload | null> {
  if (!await blob.exists()) return null
  const response = await blob.download()
  /* v8 ignore next -- defensive: download responses always carry a readable stream when exists() is true. */
  if (!response.readableStreamBody) throw new Error("trip payload blob download returned no readable stream")
  const chunks: Buffer[] = []
  for await (const chunk of response.readableStreamBody) {
    /* v8 ignore next -- defensive: Azure SDK download streams emit Buffer chunks; the string fallback is only for fakes. */
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as EncryptedPayload
}

/**
 * Hosted Azure-Blob backing for the trip ledger.
 * Registry blob (singleton) holds public AgentTripLedgerRecord per agent;
 * each trip is stored as a separate ciphertext blob keyed by agentId+tripId.
 *
 * Registry mutations use optimistic etag concurrency control identical to
 * AzureBlobMailRegistryStore — first write requires `ifNoneMatch: "*"`,
 * subsequent writes require `ifMatch: <etag>`, retried up to 3 times.
 *
 * Trip blobs use last-write-wins (no etag) because each trip is owned by a
 * single agent and the agent serializes its own writes upstream.
 */
export class AzureBlobTripLedgerStore implements TripLedgerStore {
  constructor(
    private readonly serviceClient: BlobServiceClient,
    private readonly containerName: string,
  ) {}

  private async container() {
    const client = this.serviceClient.getContainerClient(this.containerName)
    await client.createIfNotExists()
    return client
  }

  private async registryBlob(): Promise<BlockBlobClient> {
    const container = await this.container()
    return container.getBlockBlobClient(AZURE_REGISTRY_BLOB_NAME)
  }

  private async tripBlob(agentId: string, tripId: string): Promise<BlockBlobClient> {
    const container = await this.container()
    return container.getBlockBlobClient(`${AZURE_TRIPS_PREFIX}${agentId}/${tripId}.json`)
  }

  async readRegistry(): Promise<{ registry: TripLedgerRegistry; revision: string }> {
    const { registry } = await downloadRegistryBlob(await this.registryBlob())
    return { registry, revision: tripLedgerRegistryRevision(registry) }
  }

  async ensureLedger(input: EnsureLedgerInput): Promise<EnsureLedgerResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const blob = await this.registryBlob()
      const existing = await downloadRegistryBlob(blob)
      const updated = ensureAgentTripLedger(existing.registry, {
        agentId: input.agentId,
        label: input.label,
      })
      // Idempotent: if no change is needed, no upload.
      if (!updated.added) {
        return {
          ledger: updated.ledger,
          added: false,
          registryRevision: tripLedgerRegistryRevision(updated.registry),
        }
      }
      const payload = Buffer.from(`${JSON.stringify(updated.registry, null, 2)}\n`, "utf-8")
      try {
        await blob.uploadData(payload, {
          conditions: existing.etag ? { ifMatch: existing.etag } : { ifNoneMatch: "*" },
        })
        return {
          ledger: updated.ledger,
          added: true,
          generatedPrivateKeyPem: updated.generatedPrivateKeyPem,
          registryRevision: tripLedgerRegistryRevision(updated.registry),
        }
      } catch (error) {
        if (attempt === 2) throw error
      }
    }
    /* v8 ignore next -- the loop either returns after upload or rethrows the final upload error. */
    throw new Error("trip ledger registry update failed after retries")
  }

  async upsertTrip(input: UpsertTripInput): Promise<{ revision: string }> {
    const blob = await this.tripBlob(input.agentId, input.tripId)
    const payload = Buffer.from(`${JSON.stringify(input.payload, null, 2)}\n`, "utf-8")
    await blob.uploadData(payload)
    return { revision: input.payload.keyId }
  }

  async getTrip(input: { agentId: string; tripId: string }): Promise<GetTripResult> {
    const blob = await this.tripBlob(input.agentId, input.tripId)
    const payload = await downloadPayloadBlob(blob)
    if (!payload) throw new TripNotFoundError(input)
    return { payload }
  }

  async listTrips(input: { agentId: string }): Promise<ListTripsResult> {
    const container = await this.container()
    const prefix = `${AZURE_TRIPS_PREFIX}${input.agentId}/`
    const tripIds: string[] = []
    for await (const entry of container.listBlobsFlat({ prefix })) {
      if (!entry.name.endsWith(".json")) continue
      const stem = entry.name.slice(prefix.length, -".json".length)
      if (stem) tripIds.push(stem)
    }
    return { agentId: input.agentId, tripIds: tripIds.sort() }
  }
}
