import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { encryptTripRecord, generateTripKeyPair, type TripRecord } from "@ouro.bot/work-protocol"
import { FileTripLedgerStore, TripNotFoundError } from "../store"

const tempRoots: string[] = []
afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function tempStoreRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-trip-control-store-"))
  tempRoots.push(dir)
  return dir
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

describe("FileTripLedgerStore.readRegistry", () => {
  it("returns an empty registry on a fresh store and a deterministic revision", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    const { registry, revision } = await store.readRegistry()
    expect(registry).toEqual({ schemaVersion: 1, ledgers: [] })
    expect(revision).toMatch(/^0:[0-9a-f]{16}$/)
  })

  it("reads back what ensureLedger persisted", async () => {
    const root = tempStoreRoot()
    const store = new FileTripLedgerStore(root)
    await store.ensureLedger({ agentId: "slugger" })
    const fresh = new FileTripLedgerStore(root)
    const { registry } = await fresh.readRegistry()
    expect(registry.ledgers).toHaveLength(1)
    expect(registry.ledgers[0]?.agentId).toBe("slugger")
  })
})

describe("FileTripLedgerStore.ensureLedger", () => {
  it("creates a fresh ledger and returns the private key exactly once", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    const first = await store.ensureLedger({ agentId: "slugger", label: "slugger" })
    expect(first.added).toBe(true)
    expect(first.generatedPrivateKeyPem).toContain("BEGIN PRIVATE KEY")
    expect(first.ledger.keyId.startsWith("trip_slugger_")).toBe(true)
    expect(first.registryRevision).toMatch(/^1:[0-9a-f]{16}$/)

    const second = await store.ensureLedger({ agentId: "slugger" })
    expect(second.added).toBe(false)
    expect(second.generatedPrivateKeyPem).toBeUndefined()
    expect(second.ledger).toEqual(first.ledger)
  })

  it("supports multiple distinct agents in the same registry", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    await store.ensureLedger({ agentId: "slugger" })
    await store.ensureLedger({ agentId: "ouroboros" })
    const { registry } = await store.readRegistry()
    expect(registry.ledgers.map((l) => l.agentId)).toEqual(["slugger", "ouroboros"])
  })
})

describe("FileTripLedgerStore.upsertTrip / getTrip", () => {
  it("round-trips an encrypted TripRecord blob keyed by agentId+tripId", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    const ensure = await store.ensureLedger({ agentId: "slugger" })
    const keypair = generateTripKeyPair("slugger")
    const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)
    const result = await store.upsertTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000", payload })
    expect(result.revision).toBe(payload.keyId)
    const got = await store.getTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000" })
    expect(got.payload).toEqual(payload)
    expect(ensure.added).toBe(true) // sanity
  })

  it("overwrites the prior payload on a second upsert with the same tripId", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    const keypair = generateTripKeyPair("slugger")
    const first = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)
    const second = encryptTripRecord({ ...tripRecord(), name: "Updated" }, keypair.publicKeyPem, keypair.keyId)
    await store.upsertTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000", payload: first })
    await store.upsertTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000", payload: second })
    const got = await store.getTrip({ agentId: "slugger", tripId: "trip_test_0000000000000000" })
    expect(got.payload).toEqual(second)
  })

  it("throws TripNotFoundError when the requested trip does not exist", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    await expect(store.getTrip({ agentId: "slugger", tripId: "trip_missing_0000000000000000" }))
      .rejects.toBeInstanceOf(TripNotFoundError)
  })
})

describe("FileTripLedgerStore.listTrips", () => {
  it("returns an empty list when the agent has no trips on disk", async () => {
    const store = new FileTripLedgerStore(tempStoreRoot())
    const result = await store.listTrips({ agentId: "slugger" })
    expect(result).toEqual({ agentId: "slugger", tripIds: [] })
  })

  it("returns tripIds sorted, including only .json entries scoped to the agent", async () => {
    const root = tempStoreRoot()
    const store = new FileTripLedgerStore(root)
    const keypair = generateTripKeyPair("slugger")
    const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)
    await store.upsertTrip({ agentId: "slugger", tripId: "trip_b_0000000000000000", payload })
    await store.upsertTrip({ agentId: "slugger", tripId: "trip_a_0000000000000000", payload })
    await store.upsertTrip({ agentId: "ouroboros", tripId: "trip_z_0000000000000000", payload })
    // Drop a non-json file in slugger's dir to ensure it is filtered out.
    fs.writeFileSync(path.join(root, "trips", "slugger", "notes.txt"), "ignore me", "utf-8")
    const result = await store.listTrips({ agentId: "slugger" })
    expect(result.tripIds).toEqual(["trip_a_0000000000000000", "trip_b_0000000000000000"])
  })
})
