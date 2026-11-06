import { Readable } from "node:stream"
import { describe, expect, it } from "vitest"
import { encryptTripRecord, generateTripKeyPair, type TripRecord } from "@ouro.bot/work-protocol"
import { AzureBlobTripLedgerStore, TripNotFoundError } from "../store"

class FakeBlob {
  data: Buffer | null = null
  etag: string | undefined
  failUploads = 0
  uploads: unknown[] = []

  async exists(): Promise<boolean> {
    return this.data !== null
  }

  async download(): Promise<{ readableStreamBody?: Readable; etag?: string }> {
    return {
      readableStreamBody: Readable.from([this.data ?? Buffer.alloc(0)]),
      ...(this.etag ? { etag: this.etag } : {}),
    }
  }

  async uploadData(data: Buffer, options?: unknown): Promise<void> {
    this.uploads.push(options)
    if (this.failUploads > 0) {
      this.failUploads -= 1
      throw new Error("etag conflict")
    }
    this.data = Buffer.from(data)
    this.etag = `etag-${this.uploads.length}`
  }
}

class FakeContainer {
  blobs = new Map<string, FakeBlob>()
  createCalls = 0

  async createIfNotExists(): Promise<void> {
    this.createCalls += 1
  }

  getBlockBlobClient(name: string): FakeBlob {
    let blob = this.blobs.get(name)
    if (!blob) {
      blob = new FakeBlob()
      this.blobs.set(name, blob)
    }
    return blob
  }

  async *listBlobsFlat(options: { prefix?: string }): AsyncGenerator<{ name: string }> {
    const prefix = options.prefix ?? ""
    for (const name of this.blobs.keys()) {
      if (!name.startsWith(prefix)) continue
      if (this.blobs.get(name)?.data == null) continue // unwritten blob, skip
      yield { name }
    }
  }
}

class FakeBlobServiceClient {
  readonly container = new FakeContainer()

  getContainerClient(): FakeContainer {
    return this.container
  }
}

function tripRecord(): TripRecord {
  return {
    schemaVersion: 1,
    tripId: "trip_test_0000000000000000",
    agentId: "slugger",
    ownerEmail: "owner@example.test",
    name: "Europe summer 2026",
    status: "confirmed",
    travellers: [{ name: "Alex" }],
    legs: [],
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
  }
}

describe("AzureBlobTripLedgerStore", () => {
  it("creates the registry blob with optimistic ifNoneMatch on first ensureLedger", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")

    const result = await store.ensureLedger({ agentId: "slugger" })

    expect(result.added).toBe(true)
    expect(result.generatedPrivateKeyPem).toContain("BEGIN PRIVATE KEY")
    const registryBlob = serviceClient.container.getBlockBlobClient("registry/trip-ledgers.json")
    expect(registryBlob.uploads).toEqual([{ conditions: { ifNoneMatch: "*" } }])
  })

  it("uses ifMatch with the prior etag on subsequent registry mutations", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")

    await store.ensureLedger({ agentId: "slugger" })
    await store.ensureLedger({ agentId: "ouroboros" })

    const registryBlob = serviceClient.container.getBlockBlobClient("registry/trip-ledgers.json")
    expect(registryBlob.uploads[0]).toEqual({ conditions: { ifNoneMatch: "*" } })
    expect(registryBlob.uploads[1]).toEqual({ conditions: { ifMatch: "etag-1" } })
  })

  it("does not upload when ensureLedger is idempotent (agent already has a ledger)", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")

    await store.ensureLedger({ agentId: "slugger" })
    const registryBlob = serviceClient.container.getBlockBlobClient("registry/trip-ledgers.json")
    expect(registryBlob.uploads).toHaveLength(1)

    const second = await store.ensureLedger({ agentId: "slugger" })
    expect(second.added).toBe(false)
    expect(second.generatedPrivateKeyPem).toBeUndefined()
    expect(registryBlob.uploads).toHaveLength(1) // no new write
  })

  it("retries on etag conflict and succeeds within the retry budget", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")

    // Pre-populate the registry blob with one failed upload primed.
    const registryBlob = serviceClient.container.getBlockBlobClient("registry/trip-ledgers.json")
    registryBlob.failUploads = 1

    const result = await store.ensureLedger({ agentId: "slugger" })
    expect(result.added).toBe(true)
    // Two upload attempts: the first failed, the second succeeded.
    expect(registryBlob.uploads).toHaveLength(2)
  })

  it("throws after the retry budget is exhausted on persistent conflicts", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")
    const registryBlob = serviceClient.container.getBlockBlobClient("registry/trip-ledgers.json")
    registryBlob.failUploads = 999

    await expect(store.ensureLedger({ agentId: "slugger" })).rejects.toThrow("etag conflict")
  })

  it("readRegistry returns empty registry + revision when blob is absent", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")

    const result = await store.readRegistry()
    expect(result.registry.ledgers).toEqual([])
    expect(result.revision).toMatch(/^0:[0-9a-f]{16}$/)
  })

  it("upserts and reads back encrypted trip blobs by agentId+tripId", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")
    const keypair = generateTripKeyPair("slugger")
    const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)

    await store.upsertTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000", payload })
    const got = await store.getTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000" })
    expect(got.payload).toEqual(payload)
  })

  it("getTrip throws TripNotFoundError when the trip blob does not exist", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")
    await expect(store.getTrip({ agentId: "slugger", tripId: "trip_missing_0000000000000000" })).rejects.toBeInstanceOf(TripNotFoundError)
  })

  it("listTrips returns sorted tripIds for an agent and ignores non-trip prefix entries", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")
    const keypair = generateTripKeyPair("slugger")
    const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)

    await store.upsertTrip({ agentId: "slugger", tripId: "trip_b_0000000000000000", payload })
    await store.upsertTrip({ agentId: "slugger", tripId: "trip_a_0000000000000000", payload })
    await store.upsertTrip({ agentId: "ouroboros", tripId: "trip_z_0000000000000000", payload })

    const listed = await store.listTrips({ agentId: "slugger" })
    expect(listed.tripIds).toEqual(["trip_a_0000000000000000", "trip_b_0000000000000000"])
    const otherListed = await store.listTrips({ agentId: "ouroboros" })
    expect(otherListed.tripIds).toEqual(["trip_z_0000000000000000"])
    const emptyListed = await store.listTrips({ agentId: "missing" })
    expect(emptyListed.tripIds).toEqual([])
  })

  it("listTrips skips non-json blobs and entries whose stem is empty", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")
    const keypair = generateTripKeyPair("slugger")
    const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)

    // One legitimate trip blob
    await store.upsertTrip({ agentId: "slugger", tripId: "trip_a_0000000000000000", payload })

    // Inject a non-json blob and an empty-stem blob into the fake container
    const container = serviceClient.container
    const nonJson = container.getBlockBlobClient("trips/slugger/notes.txt")
    await nonJson.uploadData(Buffer.from("ignore me", "utf-8"))
    const emptyStem = container.getBlockBlobClient("trips/slugger/.json")
    await emptyStem.uploadData(Buffer.from("{}", "utf-8"))

    const listed = await store.listTrips({ agentId: "slugger" })
    expect(listed.tripIds).toEqual(["trip_a_0000000000000000"])
  })

  it("ensureLedger without label still produces a usable ledger keyed by agentId", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobTripLedgerStore(serviceClient as never, "trips")

    const result = await store.ensureLedger({ agentId: "slugger" })
    expect(result.added).toBe(true)
    expect(result.ledger.keyId.startsWith("trip_slugger_")).toBe(true)
  })
})
