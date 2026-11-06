import { Readable } from "node:stream"
import { describe, expect, it } from "vitest"
import { AzureBlobMailRegistryStore } from "../store"

class FakeBlob {
  data: Buffer | null = null
  etag: string | undefined
  failUploads = 0
  uploads: unknown[] = []
  streamAsString = false
  streamMissing = false

  async exists(): Promise<boolean> {
    return this.data !== null
  }

  async download(): Promise<{ readableStreamBody?: Readable; etag?: string }> {
    if (this.streamMissing) return {}
    return {
      readableStreamBody: Readable.from([this.streamAsString ? (this.data ?? Buffer.alloc(0)).toString("utf-8") : (this.data ?? Buffer.alloc(0))]),
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
}

class FakeBlobServiceClient {
  readonly container = new FakeContainer()

  getContainerClient(): FakeContainer {
    return this.container
  }
}

describe("AzureBlobMailRegistryStore", () => {
  it("creates and updates the public registry with optimistic blob conditions", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobMailRegistryStore(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot")

    const empty = await store.read()
    expect(empty.registry.domain).toBe("ouro.bot")
    expect(empty.registry.mailboxes).toHaveLength(0)

    const first = await store.ensureMailbox({ agentId: "slugger" })
    expect(first.generatedPrivateKeys).not.toEqual({})
    expect(first.mailboxAddress).toBe("slugger@ouro.bot")

    const second = await store.ensureMailbox({ agentId: "slugger" })
    expect(second.generatedPrivateKeys).toEqual({})

    const blob = serviceClient.container.getBlockBlobClient("registry/mailroom.json")
    expect(blob.uploads[0]).toEqual({ conditions: { ifNoneMatch: "*" } })
    expect(blob.uploads[1]).toEqual({ conditions: { ifMatch: "etag-1" } })
    expect(serviceClient.container.createCalls).toBeGreaterThanOrEqual(3)
  })

  it("rotates mailbox keys through the same optimistic blob write path", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobMailRegistryStore(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot")

    const first = await store.ensureMailbox({ agentId: "slugger", ownerEmail: "owner@example.test", source: "hey" })
    const oldMailboxKey = first.registry.mailboxes[0]!.keyId
    const oldSourceKey = first.registry.sourceGrants[0]!.keyId
    const rotated = await store.rotateMailboxKeys({
      agentId: "slugger",
      ownerEmail: "owner@example.test",
      source: "hey",
      rotateMailbox: true,
      rotateSourceGrant: true,
    })

    expect(rotated.rotatedMailbox).toBe(true)
    expect(rotated.rotatedSourceGrant).toBe(true)
    expect(rotated.registry.mailboxes[0]!.keyId).not.toBe(oldMailboxKey)
    expect(rotated.registry.sourceGrants[0]!.keyId).not.toBe(oldSourceKey)
    expect(Object.keys(rotated.generatedPrivateKeys)).toEqual(expect.arrayContaining([
      rotated.registry.mailboxes[0]!.keyId,
      rotated.registry.sourceGrants[0]!.keyId,
    ]))
    expect(serviceClient.container.getBlockBlobClient("registry/mailroom.json").uploads[1]).toEqual({ conditions: { ifMatch: "etag-1" } })
  })

  it("retries transient registry write conflicts and then gives up", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const store = new AzureBlobMailRegistryStore(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot")
    const blob = serviceClient.container.getBlockBlobClient("registry/mailroom.json")

    blob.failUploads = 1
    const retried = await store.ensureMailbox({ agentId: "slugger" })
    expect(retried.mailboxAddress).toBe("slugger@ouro.bot")
    expect(blob.uploads).toHaveLength(2)

    blob.failUploads = 3
    await expect(store.ensureMailbox({ agentId: "clio" })).rejects.toThrow("etag conflict")
  })

  it("reads registries from string chunks without etags", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const registry = {
      schemaVersion: 1 as const,
      domain: "ouro.bot",
      mailboxes: [],
      sourceGrants: [],
    }
    const blob = serviceClient.container.getBlockBlobClient("registry/mailroom.json")
    blob.data = Buffer.from(JSON.stringify(registry), "utf-8")
    blob.streamAsString = true
    const store = new AzureBlobMailRegistryStore(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot")

    await expect(store.read()).resolves.toEqual({
      registry,
      revision: "0:0:72",
    })
  })

  it("rejects blob downloads that do not expose a readable stream", async () => {
    const serviceClient = new FakeBlobServiceClient()
    const blob = serviceClient.container.getBlockBlobClient("registry/mailroom.json")
    blob.data = Buffer.from("{}", "utf-8")
    blob.streamMissing = true
    const store = new AzureBlobMailRegistryStore(serviceClient as never, "mailroom", "registry/mailroom.json", "ouro.bot")

    await expect(store.read()).rejects.toThrow("registry blob download returned no readable stream")
  })
})
