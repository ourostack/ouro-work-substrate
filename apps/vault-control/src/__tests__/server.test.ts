import * as http from "node:http"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createVaultControlServer, startVaultControlServer } from "../server"

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve(typeof address === "object" && address ? address.port : 0)
    })
  })
}

function postJson(port: number, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/v1/vaults",
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (response) => {
      let responseBody = ""
      response.setEncoding("utf-8")
      response.on("data", (chunk) => {
        responseBody += chunk
      })
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: responseBody }))
    })
    request.on("error", reject)
    request.end(payload)
  })
}

describe("vault control server", () => {
  it("serves health and rejects unknown routes", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`)
      expect(await health.json()).toEqual({ ok: true, service: "ouro-vault-control" })
      const missing = await fetch(`http://127.0.0.1:${port}/nope`, { method: "POST" })
      expect(missing.status).toBe(404)
    } finally {
      server.close()
    }
  })

  it("requires bearer authorization for vault creation", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, { method: "POST" })
      expect(response.status).toBe(401)
      const malformed = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: { authorization: "Token nope" },
      })
      expect(malformed.status).toBe(401)
    } finally {
      server.close()
    }
  })

  it("rejects mutation when no expected token is configured", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: { authorization: "Bearer token" },
      })
      expect(response.status).toBe(401)
    } finally {
      server.close()
    }
  })

  it("creates vault accounts through authenticated requests", async () => {
    let captured = false
    const fetchImpl = (async () => {
      captured = true
      return new Response(JSON.stringify("verify-token"), { status: 200 })
    }) as typeof fetch
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
      fetchImpl,
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@ouro.bot",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(201)
      expect(body).toEqual(expect.objectContaining({ ok: true, email: "slugger@ouro.bot" }))
      expect(captured).toBe(true)
    } finally {
      server.close()
    }
  })

  it("blocks non-substrate email domains", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
      fetchImpl: (async () => new Response(JSON.stringify("verify-token"), { status: 200 })) as typeof fetch,
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@example.com",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(response.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it("validates agent ids and passwords before creating accounts", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
      fetchImpl: (async () => new Response(JSON.stringify("verify-token"), { status: 200 })) as typeof fetch,
    })
    const port = await listen(server)
    try {
      const badAgent = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "!",
          email: "slugger@ouro.bot",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(badAgent.status).toBe(400)

      const badPassword = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@ouro.bot",
          masterPassword: "short",
        }),
      })
      expect(badPassword.status).toBe(400)

      const badEmail = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: 42,
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(badEmail.status).toBe(400)

      const invalidEmail = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "not-mail",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(invalidEmail.status).toBe(400)

      const invalidJson = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: "{",
      })
      expect(invalidJson.status).toBe(400)

      const tooLarge = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: "x".repeat(1024 * 1024 + 1),
      })
      expect(tooLarge.status).toBe(413)
    } finally {
      server.close()
    }
  })

  it("reports server-side configuration errors", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminTokenFile: path.join(os.tmpdir(), "missing-ouro-vault-token"),
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: { authorization: "Bearer token" },
      })
      expect(response.status).toBe(500)
    } finally {
      server.close()
    }
  })

  it("falls through to process fetch when no injected fetch is configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify("verify-token"), { status: 200 }))
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
    })
    const port = await listen(server)
    try {
      const response = await postJson(port, {
        agentId: "slugger",
        email: "slugger@ouro.bot",
        masterPassword: "Correct Horse Battery Staple! 2026",
      })
      expect(response.status).toBe(201)
      expect(fetchMock).toHaveBeenCalled()
    } finally {
      server.close()
      fetchMock.mockRestore()
    }
  })

  it("rate limits and reports vault registration failures", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
      allowedEmailDomain: "ouro.bot",
      rateLimitMax: 1,
      fetchImpl: (async () => new Response(JSON.stringify({ message: "registration closed" }), { status: 400 })) as typeof fetch,
    })
    const port = await listen(server)
    try {
      const failed = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@ouro.bot",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      const failedBody = await failed.json() as Record<string, unknown>
      expect(failed.status).toBe(502)
      expect(failedBody.error).toContain("registration closed")

      const limited = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@ouro.bot",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(limited.status).toBe(429)
    } finally {
      server.close()
    }
  })

  it("allows explicit unauthenticated local setup", async () => {
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      allowedEmailDomain: "ouro.bot",
      allowUnauthenticatedLocal: true,
      fetchImpl: (async () => new Response(JSON.stringify("verify-token"), { status: 200 })) as typeof fetch,
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@ouro.bot",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(response.status).toBe(201)
    } finally {
      server.close()
    }
  })

  it("reads token files at request time so rotations do not require process restart", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-vault-control-token-"))
    const tokenFile = path.join(dir, "token")
    fs.writeFileSync(tokenFile, "first", "utf-8")
    let captured = false
    const server = createVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminTokenFile: tokenFile,
      allowedEmailDomain: "ouro.bot",
      fetchImpl: (async () => {
        captured = true
        return new Response(JSON.stringify("verify-token"), { status: 200 })
      }) as typeof fetch,
    })
    const port = await listen(server)
    try {
      fs.writeFileSync(tokenFile, "second", "utf-8")
      const response = await fetch(`http://127.0.0.1:${port}/v1/vaults`, {
        method: "POST",
        headers: {
          authorization: "Bearer second",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: "slugger",
          email: "slugger@ouro.bot",
          masterPassword: "Correct Horse Battery Staple! 2026",
        }),
      })
      expect(response.status).toBe(201)
      expect(captured).toBe(true)
    } finally {
      server.close()
    }
  })

  it("starts on an explicit host and port", async () => {
    const server = startVaultControlServer({
      vaultServerUrl: "https://vault.example.com",
      adminToken: "token",
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
