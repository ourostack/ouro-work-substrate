import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { FileMailRegistryStore } from "../store"

describe("mail registry store", () => {
  it("ensures native and delegated mailboxes without storing private keys", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-store-"))
    const store = new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot")

    const first = await store.ensureMailbox({
      agentId: "slugger",
      ownerEmail: "owner@example.test",
      source: "hey",
    })
    const second = await store.ensureMailbox({
      agentId: "slugger",
      ownerEmail: "owner@example.test",
      source: "hey",
    })

    expect(first.mailboxAddress).toBe("slugger@ouro.bot")
    expect(first.sourceAlias).toBe("test.example.owner.slugger@ouro.bot")
    expect(Object.keys(first.generatedPrivateKeys)).toHaveLength(2)
    expect(second.generatedPrivateKeys).toEqual({})
    expect(second.addedMailbox).toBe(false)
    expect(second.addedSourceGrant).toBe(false)
    const read = await store.read()
    expect(read.registry.mailboxes).toHaveLength(1)
    expect(read.registry.sourceGrants).toHaveLength(1)
  })

  it("rotates selected public keys and returns only the newly generated private keys", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-control-store-rotate-"))
    const store = new FileMailRegistryStore(path.join(dir, "registry.json"), "ouro.bot")

    const first = await store.ensureMailbox({
      agentId: "slugger",
      ownerEmail: "owner@example.test",
      source: "hey",
    })
    const oldMailboxKey = first.registry.mailboxes[0]!.keyId
    const oldSourceKey = first.registry.sourceGrants[0]!.keyId
    const rotated = await store.rotateMailboxKeys({
      agentId: "slugger",
      ownerEmail: "owner@example.test",
      source: "hey",
      rotateMailbox: true,
      rotateSourceGrant: true,
    })

    const newMailbox = rotated.registry.mailboxes[0]!
    const newSource = rotated.registry.sourceGrants[0]!
    expect(rotated.rotatedMailbox).toBe(true)
    expect(rotated.rotatedSourceGrant).toBe(true)
    expect(newMailbox.keyId).not.toBe(oldMailboxKey)
    expect(newSource.keyId).not.toBe(oldSourceKey)
    expect(rotated.generatedPrivateKeys[newMailbox.keyId]).toContain("BEGIN PRIVATE KEY")
    expect(rotated.generatedPrivateKeys[newSource.keyId]).toContain("BEGIN PRIVATE KEY")
    expect(rotated.generatedPrivateKeys[oldMailboxKey]).toBeUndefined()
    expect(rotated.generatedPrivateKeys[oldSourceKey]).toBeUndefined()
  })
})
