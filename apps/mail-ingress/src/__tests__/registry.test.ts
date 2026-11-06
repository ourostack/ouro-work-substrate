import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { ensureMailboxRegistry } from "@ouro.bot/work-protocol"
import { AzureBlobRegistryProvider, FileRegistryProvider, StaticRegistryProvider, emptyRegistry } from "../registry"

class FakeBlob {
  data: Buffer | null = null
  throwOnDownload: Error | string | false = false

  async exists(): Promise<boolean> {
    return this.data !== null
  }

  async downloadToBuffer(): Promise<Buffer> {
    if (this.throwOnDownload) throw this.throwOnDownload
    return this.data ?? Buffer.alloc(0)
  }
}

class FakeContainer {
  readonly blob = new FakeBlob()

  getBlockBlobClient(): FakeBlob {
    return this.blob
  }
}

class FakeBlobServiceClient {
  readonly container = new FakeContainer()

  getContainerClient(): FakeContainer {
    return this.container
  }
}

describe("mail ingress registry providers", () => {
  it("serves static and empty registries", async () => {
    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    await expect(new StaticRegistryProvider(registry).current()).resolves.toBe(registry)
    expect(emptyRegistry("ouro.bot")).toEqual({
      schemaVersion: 1,
      domain: "ouro.bot",
      mailboxes: [],
      sourceGrants: [],
    })
  })

  it("caches file registries by mtime and falls back when the file is missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-registry-provider-"))
    const file = path.join(dir, "registry.json")
    const provider = new FileRegistryProvider(file, "ouro.bot")

    expect((await provider.current()).mailboxes).toHaveLength(0)

    const first = ensureMailboxRegistry({ agentId: "slugger" }).registry
    fs.writeFileSync(file, JSON.stringify(first), "utf-8")
    const loaded = await provider.current()
    expect(loaded.mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")
    expect(await provider.current()).toBe(loaded)

    fs.writeFileSync(file, JSON.stringify(ensureMailboxRegistry({ agentId: "clio" }).registry), "utf-8")
    fs.utimesSync(file, new Date(), new Date(fs.statSync(file).mtimeMs + 1000))
    expect((await provider.current()).mailboxes[0]?.canonicalAddress).toBe("clio@ouro.bot")
  })

  it("loads Azure Blob registries with refresh caching and cached fallback on errors", async () => {
    const now = vi.spyOn(Date, "now")
    now.mockReturnValue(1000)
    const serviceClient = new FakeBlobServiceClient()
    const provider = new AzureBlobRegistryProvider(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot", 100)

    expect((await provider.current()).domain).toBe("ouro.bot")

    const registry = ensureMailboxRegistry({ agentId: "slugger" }).registry
    serviceClient.container.blob.data = Buffer.from(JSON.stringify(registry), "utf-8")
    now.mockReturnValue(1200)
    expect((await provider.current()).mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")

    serviceClient.container.blob.data = Buffer.from(JSON.stringify(ensureMailboxRegistry({ agentId: "clio" }).registry), "utf-8")
    now.mockReturnValue(1250)
    expect((await provider.current()).mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")

    serviceClient.container.blob.throwOnDownload = new Error("download failed")
    now.mockReturnValue(1400)
    expect((await provider.current()).mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")
    now.mockRestore()
  })

  it("reloads Azure Blob registries on every read by default so key rotation cannot serve stale keys", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const provider = new AzureBlobRegistryProvider(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot")

    serviceClient.container.blob.data = Buffer.from(JSON.stringify(ensureMailboxRegistry({ agentId: "slugger" }).registry), "utf-8")
    expect((await provider.current()).mailboxes[0]?.canonicalAddress).toBe("slugger@ouro.bot")

    serviceClient.container.blob.data = Buffer.from(JSON.stringify(ensureMailboxRegistry({ agentId: "clio" }).registry), "utf-8")
    expect((await provider.current()).mailboxes[0]?.canonicalAddress).toBe("clio@ouro.bot")
  })

  it("throws Azure Blob registry load errors when there is no cached copy", async () => {
    const serviceClient = new FakeBlobServiceClient()
    serviceClient.container.blob.data = Buffer.from("{}", "utf-8")
    serviceClient.container.blob.throwOnDownload = "download failed"
    const provider = new AzureBlobRegistryProvider(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot", 100)

    await expect(provider.current()).rejects.toBe("download failed")
  })
})
