import { describe, expect, it, vi } from "vitest"
import {
  buildVaultRegistrationPayload,
  createVaultAccount,
  deriveMasterKey,
  deriveMasterPasswordHash,
  deriveStretchedMasterKey,
} from "../bitwarden-registration"

describe("bitwarden registration", () => {
  it("builds a Bitwarden-compatible registration payload without exposing the password", async () => {
    const payload = await buildVaultRegistrationPayload({
      agentName: "slugger",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
    })

    expect(payload.name).toBe("slugger")
    expect(payload.email).toBe("slugger@ouro.bot")
    expect(payload.kdf).toBe(0)
    expect(payload.kdfIterations).toBe(600000)
    expect(payload.masterPasswordHash).not.toContain("Correct")
    expect(payload.key).toMatch(/^2\./)
    expect(payload.keys.encryptedPrivateKey).toMatch(/^2\./)
    expect(payload.keys.publicKey.length).toBeGreaterThan(100)
  })

  it("uses expand-only stretching for the master key", async () => {
    const master = await deriveMasterKey("password", "slugger@ouro.bot", 2)
    const hash = await deriveMasterPasswordHash(master, "password")
    const stretched = deriveStretchedMasterKey(master)

    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(stretched.byteLength).toBe(64)
    expect(stretched.subarray(0, 32).equals(stretched.subarray(32))).toBe(false)
  })

  it("requests a verification token, then finishes registration with it", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: init?.headers as Record<string, string>,
      })
      return calls.length === 1
        ? new Response(JSON.stringify("tok-123"), { status: 200 })
        : new Response("{}", { status: 200 })
    }) as typeof fetch

    const result = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com/",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl,
    })

    expect(result.success).toBe(true)
    expect(calls.map((call) => call.url)).toEqual([
      "https://vault.example.com/identity/accounts/register/send-verification-email",
      "https://vault.example.com/identity/accounts/register/finish",
    ])
    expect(calls[0].headers.Accept).toBe("application/json")
    expect(calls[0].body).toEqual({ email: "slugger@ouro.bot", name: "slugger", receiveMarketingEmails: false })
    expect(calls[1].body.email).toBe("slugger@ouro.bot")
    expect(calls[1].body.masterPasswordHash).toEqual(expect.any(String))
    expect(calls[1].body.emailVerificationToken).toBe("tok-123")
  })

  it("accepts a plain-text verification token", async () => {
    const bodies: Array<Record<string, unknown>> = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(bodies.length === 1 ? "plain-token\n" : "{}", { status: 200 })
    }) as typeof fetch

    const result = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl,
    })

    expect(result.success).toBe(true)
    expect(bodies[1].emailVerificationToken).toBe("plain-token")
  })

  it("falls back to the legacy register endpoint on servers without the verification flow", async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url))
      return urls.length === 1 ? new Response("", { status: 404 }) : new Response("{}", { status: 200 })
    }) as typeof fetch

    const result = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl,
    })

    expect(result.success).toBe(true)
    expect(urls[1]).toBe("https://vault.example.com/identity/accounts/register")

    let legacyCalls = 0
    const legacyFailure = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => {
        legacyCalls += 1
        return legacyCalls === 1
          ? new Response("", { status: 404 })
          : new Response(JSON.stringify({ message: "Email already taken" }), { status: 400 })
      }) as typeof fetch,
    })
    expect(legacyFailure.success).toBe(false)
    expect(legacyFailure.error).toContain("Email already taken from https://vault.example.com/identity/accounts/register.")
  })

  it("turns closed signups into an invite instruction", async () => {
    const result = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => new Response(
        JSON.stringify({ message: "Registration not allowed or user already exists" }),
        { status: 400 },
      )) as typeof fetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("doesn't allow signups for slugger@ouro.bot")
    expect(result.error).toContain("Invite User")
  })

  it("explains that emailed verification can't finish unattended", async () => {
    for (const response of [() => new Response(null, { status: 204 }), () => new Response("{}", { status: 200 })]) {
      const result = await createVaultAccount({
        agentName: "slugger",
        serverUrl: "https://vault.example.com",
        email: "slugger@ouro.bot",
        masterPassword: "Correct Horse Battery Staple! 2026",
        fetchImpl: (async () => response()) as typeof fetch,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain("requires email verification")
    }
  })

  it("surfaces failures from the finish step", async () => {
    let calls = 0
    const result = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => {
        calls += 1
        return calls === 1
          ? new Response(JSON.stringify("tok"), { status: 200 })
          : new Response(JSON.stringify({ message: "Email already taken" }), { status: 400 })
      }) as typeof fetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Email already taken from https://vault.example.com/identity/accounts/register/finish")
  })

  it("uses global fetch when no fetch implementation is injected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify("tok"), { status: 200 }))
    try {
      const result = await createVaultAccount({
        agentName: "slugger",
        serverUrl: "https://vault.example.com/",
        email: "slugger@ouro.bot",
        masterPassword: "Correct Horse Battery Staple! 2026",
      })

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith("https://vault.example.com/identity/accounts/register/send-verification-email", expect.objectContaining({
        method: "POST",
      }))
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("surfaces vault registration errors from JSON or HTTP status", async () => {
    const jsonFailure = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => new Response(JSON.stringify({ message: "registration closed" }), { status: 400 })) as typeof fetch,
    })
    expect(jsonFailure.success).toBe(false)
    expect(jsonFailure.error).toContain("registration closed")

    const textFailure = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => new Response("not json", { status: 503, statusText: "Service Unavailable" })) as typeof fetch,
    })
    expect(textFailure.error).toContain("HTTP 503 Service Unavailable")

    const statusFallback = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => new Response(JSON.stringify({}), { status: 409, statusText: "Conflict" })) as typeof fetch,
    })
    expect(statusFallback.error).toContain("HTTP 409 Conflict")
  })

  it("reports network failures when the vault cannot be reached", async () => {
    const result = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com/",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => {
        throw new Error("socket closed")
      }) as typeof fetch,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("cannot reach vault registration endpoint")
    expect(result.error).toContain("socket closed")

    const stringFailure = await createVaultAccount({
      agentName: "slugger",
      serverUrl: "https://vault.example.com/",
      email: "slugger@ouro.bot",
      masterPassword: "Correct Horse Battery Staple! 2026",
      fetchImpl: (async () => {
        throw "offline"
      }) as typeof fetch,
    })
    expect(stringFailure.error).toContain("offline")
  })
})
