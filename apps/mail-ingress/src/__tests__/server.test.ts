import * as http from "node:http"
import * as fs from "node:fs"
import * as net from "node:net"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { ensureMailboxRegistry } from "@ouro.bot/work-protocol"
import { FileMailroomStore } from "../store"
import { createMailIngressHealthServer, createMailIngressSmtpServer, parsePrivateMailEnvelope, startMailIngress, type MailIngressOptions } from "../server"
import { StaticRegistryProvider } from "../registry"

type SmtpProductionOptions = MailIngressOptions & {
  tls?: { key: string; cert: string }
  maxRecipients?: number
  maxConnections?: number
  connectionRateLimitMax?: number
  connectionRateLimitWindowMs?: number
}

const defaultTlsOptions = require("smtp-server/lib/tls-options") as () => { key: string; cert: string }

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve(typeof address === "object" && address ? address.port : 0)
    })
  })
}

function listenSmtp(server: { listen(port: number, host: string, callback: () => void): void; server?: { address(): unknown } }): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.server?.address()
      resolve(typeof address === "object" && address && "port" in address ? Number(address.port) : 0)
    })
  })
}

function closeSmtp(server: { close(callback: () => void): void }): Promise<void> {
  return new Promise((resolve) => server.close(resolve))
}

async function smtpExchange(port: number, steps: Array<{ send: string; expect: RegExp }>, initialExpect: RegExp = /^220/m): Promise<string> {
  const socket = net.createConnection({ host: "127.0.0.1", port })
  let transcript = ""
  socket.on("data", (chunk) => {
    transcript += chunk.toString("utf-8")
  })
  function waitFor(pattern: RegExp, startAt = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}; transcript: ${transcript}`)), 1500)
      const check = () => {
        if (pattern.test(transcript.slice(startAt))) {
          clearTimeout(deadline)
          socket.off("data", check)
          resolve()
        }
      }
      socket.on("data", check)
      check()
    })
  }
  await waitFor(initialExpect)
  for (const step of steps) {
    const startAt = transcript.length
    socket.write(step.send)
    await waitFor(step.expect, startAt)
  }
  socket.end()
  return transcript
}

function openSmtpSocket(port: number, initialExpect: RegExp = /^220/m): Promise<{ socket: net.Socket; transcript: () => string }> {
  const socket = net.createConnection({ host: "127.0.0.1", port })
  let transcript = ""
  socket.on("data", (chunk) => {
    transcript += chunk.toString("utf-8")
  })
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Timed out waiting for ${initialExpect}; transcript: ${transcript}`)), 1500)
    const check = () => {
      if (initialExpect.test(transcript)) {
        clearTimeout(deadline)
        socket.off("data", check)
        resolve({ socket, transcript: () => transcript })
      }
    }
    socket.on("data", check)
    socket.on("error", reject)
    check()
  })
}

describe("mail ingress server", () => {
  it("serves a compact health endpoint", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger", ownerEmail: "owner@example.test" }).registry
    const server = createMailIngressHealthServer(new StaticRegistryProvider(registry))
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      const body = await response.json() as Record<string, unknown>
      expect(body).toEqual(expect.objectContaining({
        ok: true,
        service: "ouro-mail-ingress",
        domain: "ouro.bot",
        mailboxes: 1,
        sourceGrants: 1,
      }))
    } finally {
      server.close()
    }
  })

  it("reports unhealthy registry reads", async () => {
    const server = createMailIngressHealthServer({
      async current() {
        throw "registry unavailable"
      },
    })
    const port = await listen(server)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(503)
      expect(body.error).toBe("registry unavailable")
      const missing = await fetch(`http://127.0.0.1:${port}/missing`)
      expect(missing.status).toBe(404)
    } finally {
      server.close()
    }

    const errorServer = createMailIngressHealthServer({
      async current() {
        throw new Error("registry exploded")
      },
    })
    const errorPort = await listen(errorServer)
    try {
      const response = await fetch(`http://127.0.0.1:${errorPort}/health`)
      const body = await response.json() as Record<string, unknown>
      expect(response.status).toBe(503)
      expect(body.error).toBe("registry exploded")
    } finally {
      errorServer.close()
    }
  })

  it("parses mail into a private envelope with untrusted content warning", async () => {
    const parsed = await parsePrivateMailEnvelope(Buffer.from([
      "From: Alex <owner@example.test>",
      "To: slugger@ouro.bot",
      "Subject: Plans",
      "",
      "Please check this itinerary.",
    ].join("\r\n"), "utf-8"))

    expect(parsed.privateEnvelope.from).toEqual(["owner@example.test"])
    expect(parsed.privateEnvelope.subject).toBe("Plans")
    expect(parsed.privateEnvelope.snippet).toBe("Please check this itinerary.")
    expect(parsed.privateEnvelope.untrustedContentWarning).toContain("untrusted external data")
  })

  it("parses richer MIME envelopes and authentication states", async () => {
    const parsed = await parsePrivateMailEnvelope(Buffer.from([
      "Message-ID: <rich@example.com>",
      "Date: Wed, 22 Apr 2026 19:00:00 +0000",
      "Authentication-Results: mx.ouro.bot; spf=fail smtp.mailfrom=example.com; dkim=softfail; dmarc=neutral; arc=weird",
      "From: Sender <sender@example.com>",
      "To: slugger@ouro.bot",
      "Cc: Copy <copy@example.com>",
      "Subject: Rich",
      "Content-Type: multipart/mixed; boundary=frontier",
      "",
      "--frontier",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Hello HTML</p>",
      "--frontier",
      "Content-Type: application/octet-stream",
      "Content-Disposition: attachment",
      "",
      "abc",
      "--frontier--",
    ].join("\r\n"), "utf-8"))

    expect(parsed.privateEnvelope.messageId).toBe("<rich@example.com>")
    expect(parsed.privateEnvelope.date).toBe("2026-04-22T19:00:00.000Z")
    expect(parsed.privateEnvelope.html).toContain("Hello HTML")
    expect(parsed.privateEnvelope.cc).toEqual(["copy@example.com"])
    expect(parsed.privateEnvelope.attachments[0]).toEqual(expect.objectContaining({
      filename: "(unnamed attachment)",
      contentType: "application/octet-stream",
    }))
    expect(parsed.privateEnvelope.snippet).toBe("Rich")
    expect(parsed.authentication).toEqual({
      spf: "fail",
      dkim: "softfail",
      dmarc: "neutral",
      arc: "unknown",
    })

    const sparse = await parsePrivateMailEnvelope(Buffer.from([
      "From: Friends: Alice <alice@example.com>, Bob <bob@example.com>;",
      "To: undisclosed-recipients:;",
      "",
      "",
    ].join("\r\n"), "utf-8"))
    expect(sparse.privateEnvelope.from).toEqual(["alice@example.com", "bob@example.com"])
    expect(sparse.privateEnvelope.to).toEqual([])
    expect(sparse.privateEnvelope.subject).toBe("")
    expect(sparse.privateEnvelope.snippet).toBe("(no text body)")
  })

  it("accepts known SMTP recipients and stores encrypted mail", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-"))
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const store = new FileMailroomStore(dir)
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store,
    })
    const port = await listenSmtp(server)
    try {
      await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^250/m },
        { send: "DATA\r\n", expect: /^354/m },
        {
          send: [
            "Authentication-Results: mx.ouro.bot; spf=pass smtp.mailfrom=example.test",
            "From: Alex <owner@example.test>",
            "To: Slugger <slugger@ouro.bot>",
            "Subject: Hello",
            "",
            "Hello from SMTP.",
            ".",
            "",
          ].join("\r\n"),
          expect: /^250/m,
        },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(fs.readdirSync(path.join(dir, "messages"))).toHaveLength(1)
      expect(fs.readdirSync(path.join(dir, "candidates"))).toHaveLength(1)
    } finally {
      await closeSmtp(server)
    }
  })

  it("advertises STARTTLS and SIZE without AUTH for production ingress", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const tls = defaultTlsOptions()
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-starttls-"))),
      maxMessageBytes: 64,
      tls,
    } satisfies SmtpProductionOptions)
    const port = await listenSmtp(server)
    try {
      const transcript = await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toMatch(/^250-STARTTLS/m)
      expect(transcript).toMatch(/^250[ -]SIZE 64/m)
      expect(transcript).not.toMatch(/^250-AUTH/m)
    } finally {
      await closeSmtp(server)
    }
  })

  it("rejects declared oversized messages before DATA", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-size-"))),
      maxMessageBytes: 64,
      tls: defaultTlsOptions(),
    } satisfies SmtpProductionOptions)
    const port = await listenSmtp(server)
    try {
      const transcript = await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test> SIZE=65\r\n", expect: /^[25]\d\d/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toMatch(/^552/m)
    } finally {
      await closeSmtp(server)
    }
  })

  it("enforces recipient count limits per transaction", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-recipient-limit-"))),
      maxRecipients: 2,
      tls: defaultTlsOptions(),
    } satisfies SmtpProductionOptions)
    const port = await listenSmtp(server)
    try {
      const transcript = await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^[245]\d\d/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toMatch(/^452/m)
    } finally {
      await closeSmtp(server)
    }
  })

  it("limits concurrent SMTP connections", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-connection-limit-"))),
      maxConnections: 1,
      tls: defaultTlsOptions(),
    } satisfies SmtpProductionOptions)
    const port = await listenSmtp(server)
    let first: { socket: net.Socket; transcript: () => string } | undefined
    try {
      first = await openSmtpSocket(port)
      const second = await openSmtpSocket(port, /^421/m)
      expect(second.transcript()).toContain("Too many connected clients")
      second.socket.destroy()
    } finally {
      first?.socket.destroy()
      await closeSmtp(server)
    }
  })

  it("rate-limits repeated SMTP connections by remote address", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-rate-limit-"))),
      connectionRateLimitMax: 1,
      connectionRateLimitWindowMs: 60_000,
      tls: defaultTlsOptions(),
    } satisfies SmtpProductionOptions)
    const port = await listenSmtp(server)
    try {
      await smtpExchange(port, [
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      const transcript = await smtpExchange(port, [], /^421/m)
      expect(transcript).toContain("too many connection attempts")
    } finally {
      await closeSmtp(server)
    }
  })

  it("keeps handler fallbacks safe when smtp-server omits session details", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-handler-fallbacks-"))),
      connectionRateLimitMax: 2,
      tls: defaultTlsOptions(),
    } satisfies SmtpProductionOptions)
    const connectError = await new Promise<Error | undefined>((resolve) => {
      server.options.onConnect?.(
        { id: "connect-fallback", remoteAddress: "" } as any,
        (error) => resolve(error ?? undefined),
      )
    })
    expect(connectError).toBeUndefined()

    const rcptError = await new Promise<Error | undefined>((resolve) => {
      server.options.onRcptTo?.(
        { address: "slugger@ouro.bot", args: {} },
        { id: "rcpt-fallback", envelope: { rcptTo: [] } } as any,
        (error) => resolve(error ?? undefined),
      )
    })
    expect(rcptError).toBeUndefined()
  })

  it("rejects unknown SMTP recipients", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-reject-"))),
    })
    const port = await listenSmtp(server)
    try {
      const transcript = await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<nobody@ouro.bot>\r\n", expect: /^550/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toContain("unknown recipient nobody@ouro.bot")
    } finally {
      await closeSmtp(server)
    }
  })

  it("surfaces registry and data errors through SMTP responses", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const rejectingRcpt = createMailIngressSmtpServer({
      registryProvider: {
        async current() {
          throw "registry failed"
        },
      },
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-registry-error-"))),
    })
    const rcptPort = await listenSmtp(rejectingRcpt)
    try {
      const transcript = await smtpExchange(rcptPort, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^[45]\d\d/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toContain("temporary recipient validation failure")
      expect(transcript).not.toContain("registry failed")
    } finally {
      await closeSmtp(rejectingRcpt)
    }

    const errorRcpt = createMailIngressSmtpServer({
      registryProvider: {
        async current() {
          throw new Error("registry exploded")
        },
      },
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-registry-error-object-"))),
    })
    const errorPort = await listenSmtp(errorRcpt)
    try {
      const transcript = await smtpExchange(errorPort, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^[45]\d\d/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toContain("temporary recipient validation failure")
      expect(transcript).not.toContain("registry exploded")
    } finally {
      await closeSmtp(errorRcpt)
    }

    const oversized = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(fs.mkdtempSync(path.join(os.tmpdir(), "ouro-smtp-data-error-"))),
      maxMessageBytes: 12,
    })
    const dataPort = await listenSmtp(oversized)
    try {
      await smtpExchange(dataPort, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^250/m },
        { send: "DATA\r\n", expect: /^354/m },
        { send: "Subject: Too large\r\n\r\nThis body is too large.\r\n.\r\n", expect: /^[45]\d\d/m },
      ])
    } finally {
      await closeSmtp(oversized)
    }
  })

  it("logs data handler failures from store errors", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: {
        async putRawMessage() {
          throw "store failed"
        },
        async getMessage() {
          return null
        },
        async readRawPayload() {
          return null
        },
      },
    })
    const port = await listenSmtp(server)
    try {
      const transcript = await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^250/m },
        { send: "DATA\r\n", expect: /^354/m },
        { send: "From: owner@example.test\r\nTo: slugger@ouro.bot\r\nSubject: Hi\r\n\r\nHi\r\n.\r\n", expect: /^[45]\d\d/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toContain("temporary mail ingestion failure")
      expect(transcript).not.toContain("store failed")
    } finally {
      await closeSmtp(server)
    }
  })

  it("does not leak mail body text through SMTP errors or logs", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const leakedBody = "DO-NOT-LOG-BODY-CONTENT"
    const stdout: string[] = []
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdout.push(String(chunk))
      return true
    })
    const server = createMailIngressSmtpServer({
      registryProvider: new StaticRegistryProvider(registry),
      store: {
        async putRawMessage() {
          throw new Error(`store failed after reading ${leakedBody}`)
        },
        async getMessage() {
          return null
        },
        async readRawPayload() {
          return null
        },
      },
      tls: defaultTlsOptions(),
    } satisfies SmtpProductionOptions)
    const port = await listenSmtp(server)
    try {
      const transcript = await smtpExchange(port, [
        { send: "EHLO localhost\r\n", expect: /^250/m },
        { send: "MAIL FROM:<owner@example.test>\r\n", expect: /^250/m },
        { send: "RCPT TO:<slugger@ouro.bot>\r\n", expect: /^250/m },
        { send: "DATA\r\n", expect: /^354/m },
        { send: `From: owner@example.test\r\nTo: slugger@ouro.bot\r\nSubject: Hi\r\n\r\n${leakedBody}\r\n.\r\n`, expect: /^[45]\d\d/m },
        { send: "QUIT\r\n", expect: /^221/m },
      ])
      expect(transcript).toMatch(/^451/m)
      expect(transcript).not.toContain(leakedBody)
      expect(stdout.join("")).not.toContain(leakedBody)
      expect(stdout.join("")).toContain("smtp data handling failed")
    } finally {
      stdoutSpy.mockRestore()
      await closeSmtp(server)
    }
  })

  it("starts SMTP and health servers together", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-start-ingress-"))
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const servers = startMailIngress({
      registryProvider: new StaticRegistryProvider(registry),
      store: new FileMailroomStore(dir),
      smtpPort: 0,
      httpPort: 0,
    })
    try {
      await Promise.all([
        new Promise((resolve) => servers.smtp.server?.once("listening", resolve)),
        new Promise((resolve) => servers.health.once("listening", resolve)),
      ])
      expect(servers.health.address()).toEqual(expect.objectContaining({ address: "0.0.0.0" }))
    } finally {
      await Promise.all([
        closeSmtp(servers.smtp),
        new Promise((resolve) => servers.health.close(resolve)),
      ])
    }
  })
})
