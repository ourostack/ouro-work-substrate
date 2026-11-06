import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { ensureMailboxRegistry } from "@ouro.bot/work-protocol"
import { parseMailIngressArgs, readRegistry } from "../args"

describe("mail ingress args", () => {
  it("parses explicit file store and registry arguments", () => {
    const parsed = parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mailroom",
      "--smtp-port", "2526",
      "--http-port", "8081",
      "--host", "127.0.0.1",
    ])

    expect(parsed).toEqual(expect.objectContaining({
      registryPath: "/tmp/registry.json",
      storePath: "/tmp/mailroom",
      smtpPort: 2526,
      httpPort: 8081,
      host: "127.0.0.1",
      azureContainer: "mailroom",
    }))
  })

  it("parses key=value arguments for container app command lines", () => {
    const parsed = parseMailIngressArgs([
      "registry-base64=abc",
      "azure-account-url=https://storage.blob.core.windows.net",
      "azure-container=mail",
      "azure-managed-identity-client-id=identity-client-id",
      "smtp-port=25",
      "http-port=8082",
      "registry-domain=OURO.BOT",
      "max-message-bytes=1024",
      "max-recipients=50",
      "max-connections=25",
      "connection-rate-limit-max=40",
      "connection-rate-limit-window-ms=30000",
      "tls-key-file=/mnt/secrets/tls.key",
      "tls-cert-file=/mnt/secrets/tls.crt",
      "ignored=value",
    ])

    expect(parsed.registryBase64).toBe("abc")
    expect(parsed.azureAccountUrl).toBe("https://storage.blob.core.windows.net")
    expect(parsed.azureContainer).toBe("mail")
    expect(parsed.azureManagedIdentityClientId).toBe("identity-client-id")
    expect(parsed.smtpPort).toBe(25)
    expect(parsed.httpPort).toBe(8082)
    expect(parsed.registryDomain).toBe("OURO.BOT")
    expect(parsed.maxMessageBytes).toBe(1024)
    expect(parsed.maxRecipients).toBe(50)
    expect(parsed.maxConnections).toBe(25)
    expect(parsed.connectionRateLimitMax).toBe(40)
    expect(parsed.connectionRateLimitWindowMs).toBe(30000)
    expect(parsed.tlsKeyFile).toBe("/mnt/secrets/tls.key")
    expect(parsed.tlsCertFile).toBe("/mnt/secrets/tls.crt")
  })

  it("reads registry JSON from file or base64", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-ingress-"))
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    const file = path.join(dir, "registry.json")
    fs.writeFileSync(file, JSON.stringify(registry), "utf-8")

    expect(readRegistry({ registryPath: file }).mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")
    const encoded = Buffer.from(JSON.stringify(registry), "utf-8").toString("base64")
    expect(readRegistry({ registryBase64: encoded }).mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")
  })

  it("requires both routing and storage configuration", () => {
    expect(() => parseMailIngressArgs(["--store", "/tmp/mail"])).toThrow("Missing --registry")
    expect(() => parseMailIngressArgs(["--registry", "/tmp/registry.json"])).toThrow("Missing --store")
  })

  it("rejects invalid ports and numbers", () => {
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--smtp-port", "70000",
    ])).toThrow("--smtp-port must be a TCP port")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--registry-refresh-ms", "-1",
    ])).toThrow("--registry-refresh-ms must be a non-negative integer")
    expect(() => parseMailIngressArgs([
      "--registry=/tmp/registry.json",
      "--store", "/tmp/mail",
    ])).toThrow("Missing --registry")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--smtp-port",
    ])).toThrow("--smtp-port must be a non-negative integer")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--tls-key-file", "/tmp/tls.key",
    ])).toThrow("--tls-key-file and --tls-cert-file must be provided together")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--max-recipients", "0",
    ])).toThrow("--max-recipients must be a positive integer")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--max-connections", "0",
    ])).toThrow("--max-connections must be a positive integer")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--connection-rate-limit-max", "0",
    ])).toThrow("--connection-rate-limit-max must be a positive integer")
    expect(() => parseMailIngressArgs([
      "--registry", "/tmp/registry.json",
      "--store", "/tmp/mail",
      "--connection-rate-limit-window-ms", "0",
    ])).toThrow("--connection-rate-limit-window-ms must be a positive integer")
    expect(() => readRegistry({})).toThrow("Missing registry path")
  })

  it("supports a dynamic Azure Blob registry", () => {
    const parsed = parseMailIngressArgs([
      "--registry-azure-account-url", "https://storage.blob.core.windows.net",
      "--azure-account-url", "https://storage.blob.core.windows.net",
      "--registry-container", "mail",
      "--registry-blob", "registry/prod.json",
    ])

    expect(parsed.registryAzureAccountUrl).toBe("https://storage.blob.core.windows.net")
    expect(parsed.registryContainer).toBe("mail")
    expect(parsed.registryBlob).toBe("registry/prod.json")
    expect(parsed.registryRefreshMs).toBe(0)
  })

  it("keeps explicit dynamic Azure Blob registry refresh caching opt-in", () => {
    const parsed = parseMailIngressArgs([
      "--registry-azure-account-url", "https://storage.blob.core.windows.net",
      "--azure-account-url", "https://storage.blob.core.windows.net",
      "--registry-refresh-ms", "5000",
    ])

    expect(parsed.registryRefreshMs).toBe(5000)
  })
})
