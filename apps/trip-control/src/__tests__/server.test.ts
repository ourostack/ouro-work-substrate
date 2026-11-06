import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { encryptTripRecord, generateTripKeyPair, type TripRecord } from "@ouro.bot/work-protocol"
import { FileTripLedgerStore } from "../store"
import { createTripControlServer, startTripControlServer } from "../server"

const tempRoots: string[] = []
const servers: Array<{ close: () => void }> = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function tempStoreRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-trip-control-server-"))
  tempRoots.push(dir)
  return dir
}

interface BootedServer {
  baseUrl: string
  store: FileTripLedgerStore
  close: () => void
}

async function bootServer(overrides: { adminToken?: string; allowUnauthenticatedLocal?: boolean; rateLimitMax?: number; rateLimitWindowMs?: number } = {}): Promise<BootedServer> {
  const root = tempStoreRoot()
  const store = new FileTripLedgerStore(root)
  const opts = {
    store,
    host: "127.0.0.1",
    port: 0,
    ...(overrides.adminToken === undefined ? { adminToken: "secret" } : (overrides.adminToken ? { adminToken: overrides.adminToken } : {})),
    ...(overrides.allowUnauthenticatedLocal !== undefined ? { allowUnauthenticatedLocal: overrides.allowUnauthenticatedLocal } : {}),
    ...(overrides.rateLimitMax !== undefined ? { rateLimitMax: overrides.rateLimitMax } : {}),
    ...(overrides.rateLimitWindowMs !== undefined ? { rateLimitWindowMs: overrides.rateLimitWindowMs } : {}),
  }
  const server = startTripControlServer(opts)
  servers.push(server)
  await new Promise<void>((resolve) => server.once("listening", () => resolve()))
  const address = server.address()
  if (!address || typeof address !== "object") throw new Error("server did not bind")
  const baseUrl = `http://127.0.0.1:${address.port}`
  return { baseUrl, store, close: () => server.close() }
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

async function authedPost(baseUrl: string, route: string, body: unknown, token: string | null = "secret"): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

describe("trip-control HTTP server", () => {
  describe("GET /health", () => {
    it("returns service info, ledger count, and a stable revision", async () => {
      const { baseUrl, store } = await bootServer()
      await store.ensureLedger({ agentId: "slugger" })
      const response = await fetch(`${baseUrl}/health`)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        ok: true,
        service: "ouro-trip-control",
        ledgers: 1,
        revision: expect.stringMatching(/^1:[0-9a-f]{16}$/),
      })
    })

    it("does not require auth for /health", async () => {
      const { baseUrl } = await bootServer({ adminToken: "secret" })
      const response = await fetch(`${baseUrl}/health`)
      expect(response.status).toBe(200)
    })
  })

  describe("auth + rate limit", () => {
    it("rejects POST without bearer token (401)", async () => {
      const { baseUrl } = await bootServer()
      const response = await fetch(`${baseUrl}/v1/ledgers/ensure`, { method: "POST", body: "{}" })
      expect(response.status).toBe(401)
    })

    it("rejects POST with wrong bearer token (401)", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" }, "wrong")
      expect(result.status).toBe(401)
    })

    it("allows POST without auth when allowUnauthenticatedLocal is set (no admin token)", async () => {
      const { baseUrl } = await bootServer({ adminToken: "", allowUnauthenticatedLocal: true })
      const result = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" }, null)
      expect(result.status).toBe(200)
      expect(result.body.ok).toBe(true)
    })

    it("returns 429 when the per-IP rate limit is exhausted", async () => {
      const { baseUrl } = await bootServer({ rateLimitMax: 1, rateLimitWindowMs: 60_000 })
      const first = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" })
      expect(first.status).toBe(200)
      const second = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "ouroboros" })
      expect(second.status).toBe(429)
    })

    it("rolls the rate-limit bucket forward when the window elapses", async () => {
      const { baseUrl } = await bootServer({ rateLimitMax: 1, rateLimitWindowMs: 1 })
      const first = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" })
      expect(first.status).toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const second = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "ouroboros" })
      expect(second.status).toBe(200)
    })
  })

  describe("404 / wrong method handling", () => {
    it("returns 404 for an unknown route", async () => {
      const { baseUrl } = await bootServer()
      const response = await fetch(`${baseUrl}/v1/unknown`, { method: "POST", headers: { authorization: "Bearer secret" }, body: "{}" })
      expect(response.status).toBe(404)
    })

    it("returns 404 for the wrong HTTP method on a known route", async () => {
      const { baseUrl } = await bootServer()
      const response = await fetch(`${baseUrl}/v1/ledgers/ensure`, { method: "GET" })
      expect(response.status).toBe(404)
    })
  })

  describe("POST /v1/ledgers/ensure", () => {
    it("creates a ledger and returns the private key on first call", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger", label: "slugger" })
      expect(result.status).toBe(200)
      expect(result.body.ok).toBe(true)
      expect(result.body.added).toBe(true)
      expect(result.body.ledger.agentId).toBe("slugger")
      expect(result.body.ledger.keyId.startsWith("trip_slugger_")).toBe(true)
      expect(result.body.generatedPrivateKeyPem).toContain("BEGIN PRIVATE KEY")
      expect(result.body.registryRevision).toMatch(/^1:[0-9a-f]{16}$/)
    })

    it("does not return the private key on subsequent calls (idempotent)", async () => {
      const { baseUrl } = await bootServer()
      await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" })
      const second = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" })
      expect(second.body.added).toBe(false)
      expect(second.body.generatedPrivateKeyPem).toBeUndefined()
    })

    it("rejects an invalid agentId with 400", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "x" })
      expect(result.status).toBe(400)
      expect(result.body.error).toContain("agentId")
    })

    it("rejects malformed JSON with 400", async () => {
      const { baseUrl } = await bootServer()
      const response = await fetch(`${baseUrl}/v1/ledgers/ensure`, {
        method: "POST",
        headers: { authorization: "Bearer secret", "content-type": "application/json" },
        body: "{not json",
      })
      expect(response.status).toBe(400)
    })

    it("rejects an oversized body with 413", async () => {
      const { baseUrl } = await bootServer()
      const huge = "a".repeat(2 * 1024 * 1024)
      const response = await fetch(`${baseUrl}/v1/ledgers/ensure`, {
        method: "POST",
        headers: { authorization: "Bearer secret", "content-type": "application/json" },
        body: JSON.stringify({ agentId: "slugger", filler: huge }),
      })
      expect(response.status).toBe(413)
    })

    it("rejects an over-long label with 400", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/ledgers/ensure", {
        agentId: "slugger",
        label: "x".repeat(200),
      })
      expect(result.status).toBe(400)
      expect(result.body.error).toContain("label")
    })
  })

  describe("POST /v1/trips/upsert + /v1/trips/get + /v1/trips/list", () => {
    it("round-trips an encrypted trip payload through upsert + get", async () => {
      const { baseUrl } = await bootServer()
      await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" })
      const keypair = generateTripKeyPair("slugger")
      const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)
      const upsert = await authedPost(baseUrl, "/v1/trips/upsert", {
        agentId: "slugger",
        tripId: "trip_test_0000000000000000",
        payload,
      })
      expect(upsert.status).toBe(200)
      expect(upsert.body).toMatchObject({ ok: true, tripId: "trip_test_0000000000000000", agentId: "slugger" })
      const got = await authedPost(baseUrl, "/v1/trips/get", { agentId: "slugger", tripId: "trip_test_0000000000000000" })
      expect(got.status).toBe(200)
      expect(got.body.payload).toEqual(payload)
    })

    it("returns 404 for a missing trip", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/trips/get", { agentId: "slugger", tripId: "trip_missing_0000000000000000" })
      expect(result.status).toBe(404)
      expect(result.body.error).toContain("trip not found")
    })

    it("rejects an invalid tripId shape with 400", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/trips/get", { agentId: "slugger", tripId: "not-a-trip-id" })
      expect(result.status).toBe(400)
      expect(result.body.error).toContain("tripId")
    })

    it("rejects upsert with a non-RSA-OAEP+AES-GCM payload algorithm", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/trips/upsert", {
        agentId: "slugger",
        tripId: "trip_test_0000000000000000",
        payload: { algorithm: "wrong-alg", keyId: "k", wrappedKey: "w", iv: "i", authTag: "t", ciphertext: "c" },
      })
      expect(result.status).toBe(400)
      expect(result.body.error).toContain("algorithm")
    })

    it("rejects upsert with missing payload fields", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/trips/upsert", {
        agentId: "slugger",
        tripId: "trip_test_0000000000000000",
        payload: { algorithm: "RSA-OAEP-SHA256+A256GCM", keyId: "k", wrappedKey: "", iv: "i", authTag: "t", ciphertext: "c" },
      })
      expect(result.status).toBe(400)
      expect(result.body.error).toContain("wrappedKey")
    })

    it("rejects upsert with a non-object payload entirely", async () => {
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/trips/upsert", {
        agentId: "slugger",
        tripId: "trip_test_0000000000000000",
        payload: "not an object",
      })
      expect(result.status).toBe(400)
      expect(result.body.error).toContain("EncryptedPayload")
    })

    it("lists tripIds for an agent in sorted order", async () => {
      const { baseUrl } = await bootServer()
      const keypair = generateTripKeyPair("slugger")
      const payload = encryptTripRecord(tripRecord(), keypair.publicKeyPem, keypair.keyId)
      await authedPost(baseUrl, "/v1/trips/upsert", { agentId: "slugger", tripId: "trip_b_0000000000000000", payload })
      await authedPost(baseUrl, "/v1/trips/upsert", { agentId: "slugger", tripId: "trip_a_0000000000000000", payload })
      const listed = await authedPost(baseUrl, "/v1/trips/list", { agentId: "slugger" })
      expect(listed.status).toBe(200)
      expect(listed.body.tripIds).toEqual(["trip_a_0000000000000000", "trip_b_0000000000000000"])
    })
  })

  describe("admin token sourced from a file", () => {
    it("reads the bearer token from --admin-token-file at request time", async () => {
      const root = tempStoreRoot()
      const tokenPath = path.join(root, "token")
      fs.writeFileSync(tokenPath, "file-secret\n", "utf-8")
      const store = new FileTripLedgerStore(root)
      const server = startTripControlServer({
        store,
        adminTokenFile: tokenPath,
        host: "127.0.0.1",
        port: 0,
      })
      servers.push(server)
      await new Promise<void>((resolve) => server.once("listening", () => resolve()))
      const address = server.address() as { port: number }
      const baseUrl = `http://127.0.0.1:${address.port}`
      const wrong = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" }, "secret")
      expect(wrong.status).toBe(401)
      const right = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" }, "file-secret")
      expect(right.status).toBe(200)
    })
  })

  describe("createTripControlServer (without listen)", () => {
    it("returns an http.Server instance whose request handler is wired up", async () => {
      const root = tempStoreRoot()
      const store = new FileTripLedgerStore(root)
      const server = createTripControlServer({ store, host: "127.0.0.1", port: 0 })
      expect(typeof server.listen).toBe("function")
      server.close()
    })
  })

  describe("error-status fallback + default rate-limit settings", () => {
    it("returns 500 when the store throws an error that does not match a validation phrase", async () => {
      const root = tempStoreRoot()
      const store = new FileTripLedgerStore(root)
      // Override getTrip to throw a generic non-validation, non-NotFound error.
      store.getTrip = async () => { throw new Error("disk i/o exploded") }
      const server = createTripControlServer({ store, adminToken: "secret", host: "127.0.0.1", port: 0 })
      server.listen(0, "127.0.0.1")
      servers.push(server)
      await new Promise<void>((resolve) => server.once("listening", () => resolve()))
      const port = (server.address() as { port: number }).port
      const result = await authedPost(`http://127.0.0.1:${port}`, "/v1/trips/get", { agentId: "slugger", tripId: "trip_test_0000000000000000" })
      expect(result.status).toBe(500)
      expect(result.body.error).toContain("disk i/o exploded")
    })

    it("uses default rateLimitWindowMs and rateLimitMax when neither is provided", async () => {
      // No rateLimitMax / rateLimitWindowMs in opts → defaults (60 / 60_000) apply.
      const { baseUrl } = await bootServer()
      const result = await authedPost(baseUrl, "/v1/ledgers/ensure", { agentId: "slugger" })
      expect(result.status).toBe(200)
    })

    it("rejects an Authorization header that is not Bearer-shaped (401)", async () => {
      const { baseUrl } = await bootServer()
      const response = await fetch(`${baseUrl}/v1/ledgers/ensure`, {
        method: "POST",
        headers: { authorization: "Basic dXNlcjpwYXNz", "content-type": "application/json" },
        body: JSON.stringify({ agentId: "slugger" }),
      })
      expect(response.status).toBe(401)
    })

    it("returns 500 with stringified reason when the store throws a non-Error value", async () => {
      const root = tempStoreRoot()
      const store = new FileTripLedgerStore(root)
      store.getTrip = async () => { throw "raw string failure" } // eslint-disable-line no-throw-literal
      const server = createTripControlServer({ store, adminToken: "secret", host: "127.0.0.1", port: 0 })
      server.listen(0, "127.0.0.1")
      servers.push(server)
      await new Promise<void>((resolve) => server.once("listening", () => resolve()))
      const port = (server.address() as { port: number }).port
      const result = await authedPost(`http://127.0.0.1:${port}`, "/v1/trips/get", { agentId: "slugger", tripId: "trip_test_0000000000000000" })
      expect(result.status).toBe(500)
      expect(result.body.error).toBe("raw string failure")
    })
  })
})
