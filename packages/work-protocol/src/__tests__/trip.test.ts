import { describe, expect, it } from "vitest"
import {
  decryptTripRecord,
  emptyTripLedgerRegistry,
  encryptTripRecord,
  ensureAgentTripLedger,
  findAgentTripLedger,
  generateTripKeyPair,
  newLegId,
  newTripId,
  tripLedgerRegistryRevision,
  type TripLedgerRegistry,
  type TripRecord,
} from "../trip"

function tripRecord(overrides: Partial<TripRecord> = {}): TripRecord {
  return {
    schemaVersion: 1,
    tripId: "trip_test_0000000000000000",
    agentId: "slugger",
    ownerEmail: "owner@example.test",
    name: "Europe summer 2026",
    status: "confirmed",
    startDate: "2026-08-01",
    endDate: "2026-08-15",
    travellers: [{ name: "Alex" }],
    legs: [
      {
        legId: "leg_lodging_0000000000000000",
        kind: "lodging",
        status: "confirmed",
        vendor: "Hotel Marthof",
        confirmationCode: "BSL47291",
        amount: { value: 420, currency: "USD" },
        city: "Basel",
        checkInDate: "2026-08-02",
        checkOutDate: "2026-08-05",
        evidence: [{
          messageId: "mail_booking_basel",
          reason: "booking confirmation",
          recordedAt: "2026-04-01T08:00:00.000Z",
          discoveryMethod: "extracted",
          excerpt: "Confirmation: BSL47291",
        }],
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ],
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
    ...overrides,
  }
}

describe("generateTripKeyPair", () => {
  it("returns a fresh RSA keypair with a trip_-prefixed keyId derived from the public key fingerprint", () => {
    const a = generateTripKeyPair("slugger")
    const b = generateTripKeyPair("slugger")
    expect(a.keyId).toMatch(/^trip_slugger_[0-9a-f]{16}$/)
    expect(b.keyId).toMatch(/^trip_slugger_[0-9a-f]{16}$/)
    expect(a.keyId).not.toBe(b.keyId)
    expect(a.publicKeyPem).toContain("BEGIN PUBLIC KEY")
    expect(a.privateKeyPem).toContain("BEGIN PRIVATE KEY")
  })

  it("falls back to ledger when the label has no safe characters", () => {
    const pair = generateTripKeyPair("!!!")
    expect(pair.keyId.startsWith("trip_ledger_")).toBe(true)
  })
})

describe("encryptTripRecord / decryptTripRecord", () => {
  it("round-trips a TripRecord through the agent's keypair", () => {
    const keypair = generateTripKeyPair("slugger")
    const original = tripRecord()
    const payload = encryptTripRecord(original, keypair.publicKeyPem, keypair.keyId)
    expect(payload.algorithm).toBe("RSA-OAEP-SHA256+A256GCM")
    expect(payload.keyId).toBe(keypair.keyId)
    const decrypted = decryptTripRecord(payload, keypair.privateKeyPem)
    expect(decrypted).toEqual(original)
  })

  it("round-trips a TripRecord that mixes leg kinds and evidence discovery methods", () => {
    const keypair = generateTripKeyPair("slugger")
    const original = tripRecord({
      legs: [
        {
          legId: "leg_rental-car_0000000000000000",
          kind: "rental-car",
          status: "confirmed",
          rentalVendor: "Sixt",
          confirmationCode: "XCDR/123456789",
          pickupLocation: "Basel SBB",
          dropoffLocation: "Zurich Airport",
          pickupAt: "2026-08-05T10:00:00+02:00",
          dropoffAt: "2026-08-08T18:00:00+02:00",
          amount: { value: 320, currency: "EUR" },
          evidence: [{
            messageId: "mail_sixt_confirm",
            reason: "rental car confirmation",
            recordedAt: "2026-04-02T08:00:00.000Z",
            discoveryMethod: "extracted",
          }],
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z",
        },
        {
          legId: "leg_lodging_0000000000000001",
          kind: "lodging",
          status: "tentative",
          city: "Zurich",
          checkInDate: "2026-08-08",
          checkOutDate: "2026-08-09",
          evidence: [{
            messageId: "mail_flight_change",
            reason: "Zurich overnight inferred from flight schedule shift",
            recordedAt: "2026-04-03T08:00:00.000Z",
            discoveryMethod: "inferred",
          }, {
            messageId: "operator-direct-2026-04-03",
            reason: "Alex confirmed during chat that he plans to overnight in Zurich",
            recordedAt: "2026-04-03T09:00:00.000Z",
            discoveryMethod: "operator_supplied",
          }],
          createdAt: "2026-04-03T08:00:00.000Z",
          updatedAt: "2026-04-03T09:00:00.000Z",
        },
      ],
    })
    const payload = encryptTripRecord(original, keypair.publicKeyPem, keypair.keyId)
    const decrypted = decryptTripRecord(payload, keypair.privateKeyPem)
    expect(decrypted).toEqual(original)
    // The rental-car kind survives the round trip and remains narrowable.
    const rental = decrypted.legs.find((leg) => leg.kind === "rental-car")
    expect(rental?.kind).toBe("rental-car")
    if (rental?.kind === "rental-car") {
      expect(rental.rentalVendor).toBe("Sixt")
      expect(rental.pickupLocation).toBe("Basel SBB")
    }
    // Evidence discovery methods are preserved.
    const lodging = decrypted.legs.find((leg) => leg.kind === "lodging")
    expect(lodging?.evidence.map((e) => e.discoveryMethod)).toEqual(["inferred", "operator_supplied"])
  })
})

describe("newTripId", () => {
  it("is deterministic across the same agentId+name+createdAt and uses a slug from the trip name", () => {
    const a = newTripId("slugger", "Europe Summer 2026", "2026-04-24T18:00:00.000Z")
    const b = newTripId("slugger", "Europe Summer 2026", "2026-04-24T18:00:00.000Z")
    expect(a).toBe(b)
    expect(a).toMatch(/^trip_europe-summer-2026_[0-9a-f]{16}$/)
  })

  it("falls back to a generic trip slug when the name is unrepresentable", () => {
    const id = newTripId("slugger", "!!!", "2026-04-24T18:00:00.000Z")
    expect(id.startsWith("trip_trip_")).toBe(true)
  })

  it("differs when any input changes", () => {
    const base = newTripId("slugger", "Trip A", "2026-04-24T18:00:00.000Z")
    expect(newTripId("ouroboros", "Trip A", "2026-04-24T18:00:00.000Z")).not.toBe(base)
    expect(newTripId("slugger", "Trip B", "2026-04-24T18:00:00.000Z")).not.toBe(base)
    expect(newTripId("slugger", "Trip A", "2026-04-25T18:00:00.000Z")).not.toBe(base)
  })
})

describe("newLegId", () => {
  it("is deterministic when distinguished by vendor", () => {
    const input = {
      tripId: "trip_test_0000000000000000",
      kind: "lodging" as const,
      vendor: "Hotel Marthof",
      createdAt: "2026-04-01T08:00:00.000Z",
    }
    expect(newLegId(input)).toBe(newLegId(input))
  })

  it("is deterministic when distinguished by confirmationCode and no vendor", () => {
    const input = {
      tripId: "trip_test_0000000000000000",
      kind: "flight" as const,
      confirmationCode: "PNR123",
      createdAt: "2026-04-01T08:00:00.000Z",
    }
    expect(newLegId(input)).toBe(newLegId(input))
  })

  it("falls back to a random distinguisher when neither vendor nor confirmation are present", () => {
    const input = {
      tripId: "trip_test_0000000000000000",
      kind: "ground-transport" as const,
      createdAt: "2026-04-01T08:00:00.000Z",
    }
    expect(newLegId(input)).not.toBe(newLegId(input))
  })

  it("encodes the kind in the id prefix", () => {
    const id = newLegId({
      tripId: "trip_test_0000000000000000",
      kind: "ferry",
      vendor: "Anonymous",
      createdAt: "2026-04-01T08:00:00.000Z",
    })
    expect(id.startsWith("leg_ferry_")).toBe(true)
  })

  it("encodes the rental-car kind in the id prefix", () => {
    const id = newLegId({
      tripId: "trip_test_0000000000000000",
      kind: "rental-car",
      vendor: "Sixt",
      createdAt: "2026-04-01T08:00:00.000Z",
    })
    expect(id.startsWith("leg_rental-car_")).toBe(true)
  })
})

describe("emptyTripLedgerRegistry / findAgentTripLedger", () => {
  it("starts empty and returns null when an agent has no ledger yet", () => {
    const registry = emptyTripLedgerRegistry()
    expect(registry).toEqual({ schemaVersion: 1, ledgers: [] })
    expect(findAgentTripLedger(registry, "slugger")).toBeNull()
  })

  it("finds the matching ledger entry by agentId", () => {
    const registry: TripLedgerRegistry = {
      schemaVersion: 1,
      ledgers: [
        { agentId: "slugger", ledgerId: "ledger_a", keyId: "trip_a_0", publicKeyPem: "pem-a", createdAt: "2026-04-24T00:00:00.000Z" },
        { agentId: "ouroboros", ledgerId: "ledger_b", keyId: "trip_b_0", publicKeyPem: "pem-b", createdAt: "2026-04-24T00:00:00.000Z" },
      ],
    }
    expect(findAgentTripLedger(registry, "ouroboros")?.ledgerId).toBe("ledger_b")
    expect(findAgentTripLedger(registry, "missing")).toBeNull()
  })
})

describe("ensureAgentTripLedger", () => {
  it("creates a new ledger and returns the private key exactly once", () => {
    const registry = emptyTripLedgerRegistry()
    const result = ensureAgentTripLedger(registry, {
      agentId: "slugger",
      label: "slugger",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    expect(result.added).toBe(true)
    expect(result.ledger.agentId).toBe("slugger")
    expect(result.ledger.ledgerId).toMatch(/^ledger_slugger_[0-9a-f]{16}$/)
    expect(result.ledger.publicKeyPem).toContain("BEGIN PUBLIC KEY")
    expect(result.generatedPrivateKeyPem).toBeDefined()
    expect(result.generatedPrivateKeyPem).toContain("BEGIN PRIVATE KEY")
    expect(result.registry.ledgers).toHaveLength(1)
    // Original registry is left intact.
    expect(registry.ledgers).toHaveLength(0)
  })

  it("is idempotent when the agent already has a ledger and does not return the private key again", () => {
    const initial = ensureAgentTripLedger(emptyTripLedgerRegistry(), {
      agentId: "slugger",
      label: "slugger",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    const second = ensureAgentTripLedger(initial.registry, { agentId: "slugger" })
    expect(second.added).toBe(false)
    expect(second.generatedPrivateKeyPem).toBeUndefined()
    expect(second.ledger).toEqual(initial.ledger)
    expect(second.registry).toBe(initial.registry)
  })

  it("falls back to the agentId when no label is provided", () => {
    const result = ensureAgentTripLedger(emptyTripLedgerRegistry(), {
      agentId: "slugger",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    expect(result.ledger.keyId.startsWith("trip_slugger_")).toBe(true)
  })

  it("falls back to a generic agent slug when the agentId has no safe characters", () => {
    const result = ensureAgentTripLedger(emptyTripLedgerRegistry(), {
      agentId: "!!!",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    expect(result.ledger.ledgerId.startsWith("ledger_agent_")).toBe(true)
  })

  it("uses the wall clock when no override is provided", () => {
    const result = ensureAgentTripLedger(emptyTripLedgerRegistry(), { agentId: "slugger" })
    expect(() => new Date(result.ledger.createdAt).toISOString()).not.toThrow()
    expect(new Date(result.ledger.createdAt).toString()).not.toBe("Invalid Date")
  })

  it("supports multiple distinct agents in the same registry", () => {
    const first = ensureAgentTripLedger(emptyTripLedgerRegistry(), {
      agentId: "slugger",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    const second = ensureAgentTripLedger(first.registry, {
      agentId: "ouroboros",
      now: () => "2026-04-24T19:00:00.000Z",
    })
    expect(second.added).toBe(true)
    expect(second.registry.ledgers).toHaveLength(2)
    expect(second.registry.ledgers.map((l) => l.agentId)).toEqual(["slugger", "ouroboros"])
  })
})

describe("tripLedgerRegistryRevision", () => {
  it("encodes ledger count and a stable hash so writers can do etag-style concurrency control", () => {
    const empty = tripLedgerRegistryRevision(emptyTripLedgerRegistry())
    expect(empty).toMatch(/^0:[0-9a-f]{16}$/)

    const populated = ensureAgentTripLedger(emptyTripLedgerRegistry(), {
      agentId: "slugger",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    const rev1 = tripLedgerRegistryRevision(populated.registry)
    const rev2 = tripLedgerRegistryRevision(populated.registry)
    expect(rev1).toBe(rev2)
    expect(rev1.startsWith("1:")).toBe(true)
  })

  it("changes when a new ledger is added", () => {
    const first = ensureAgentTripLedger(emptyTripLedgerRegistry(), {
      agentId: "slugger",
      now: () => "2026-04-24T18:00:00.000Z",
    })
    const second = ensureAgentTripLedger(first.registry, {
      agentId: "ouroboros",
      now: () => "2026-04-24T19:00:00.000Z",
    })
    expect(tripLedgerRegistryRevision(first.registry)).not.toBe(tripLedgerRegistryRevision(second.registry))
  })
})
