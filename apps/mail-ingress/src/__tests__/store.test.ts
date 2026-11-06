import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { decryptMailPayload, decryptStoredMailMessage, ensureMailboxRegistry } from "@ouro/work-protocol"
import { FileMailroomStore, ingestRawMailToStore } from "../store"
import { parsePrivateMailEnvelope } from "../server"

describe("mail ingress store", () => {
  it("stores encrypted delegated mail and keeps screener out of delegated source grants", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-store-"))
    const ensured = ensureMailboxRegistry({
      agentId: "slugger",
      ownerEmail: "owner@example.test",
      source: "hey",
    })
    const alias = ensured.sourceAlias!
    const raw = Buffer.from([
      "Authentication-Results: mx.ouro.bot; spf=pass smtp.mailfrom=hey.com; dkim=pass; dmarc=pass",
      "From: Travel Desk <travel@example.com>",
      `To: ${alias}`,
      "Subject: Flight updated",
      "",
      "Boarding moved to gate C7.",
    ].join("\r\n"), "utf-8")
    const parsed = await parsePrivateMailEnvelope(raw)
    const store = new FileMailroomStore(dir)

    const result = await ingestRawMailToStore({
      registry: ensured.registry,
      store,
      envelope: { mailFrom: "travel@example.com", rcptTo: [alias] },
      rawMime: raw,
      privateEnvelope: parsed.privateEnvelope,
      ingest: {
        schemaVersion: 1,
        kind: "mbox-import",
        importedAt: "2026-04-22T20:00:00.000Z",
        sourceFreshThrough: "2026-04-22T19:00:00.000Z",
        attentionSuppressed: true,
      },
      ...(parsed.authentication ? { authentication: parsed.authentication } : {}),
    })

    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0]?.ingest).toEqual({
      schemaVersion: 1,
      kind: "mbox-import",
      importedAt: "2026-04-22T20:00:00.000Z",
      sourceFreshThrough: "2026-04-22T19:00:00.000Z",
      attentionSuppressed: true,
    })
    const duplicate = await ingestRawMailToStore({
      registry: ensured.registry,
      store,
      envelope: { mailFrom: "travel@example.com", rcptTo: [alias] },
      rawMime: raw,
      privateEnvelope: parsed.privateEnvelope,
      ...(parsed.authentication ? { authentication: parsed.authentication } : {}),
    })
    expect(duplicate.accepted[0]?.id).toBe(result.accepted[0]?.id)
    expect(result.accepted[0]?.placement).toBe("imbox")
    expect(result.accepted[0]?.authentication?.spf).toBe("pass")
    const stored = await store.getMessage(result.accepted[0]!.id)
    expect(stored?.rawSize).toBe(raw.byteLength)
    expect(decryptStoredMailMessage(stored!, ensured.keys).private.subject).toBe("Flight updated")
    const rawPayload = await store.readRawPayload(stored!.rawObject)
    expect(decryptMailPayload(rawPayload!, ensured.keys[rawPayload!.keyId]!).toString("utf-8")).toContain("Boarding moved")
    expect(await store.getMessage("missing")).toBeNull()
    expect(await store.readRawPayload("raw/missing.json")).toBeNull()
  })

  it("stores accepted native mail without authentication metadata", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-store-"))
    const ensured = ensureMailboxRegistry({ agentId: "slugger" })
    const raw = Buffer.from("From: owner@example.test\r\nTo: slugger@ouro.bot\r\nSubject: Hi\r\n\r\nHi", "utf-8")
    const parsed = await parsePrivateMailEnvelope(raw)

    const result = await ingestRawMailToStore({
      registry: ensured.registry,
      store: new FileMailroomStore(dir),
      envelope: { mailFrom: "owner@example.test", rcptTo: ["slugger@ouro.bot"] },
      rawMime: raw,
      privateEnvelope: parsed.privateEnvelope,
    })

    expect(result.accepted[0]?.authentication).toBeUndefined()
    expect(result.accepted[0]?.placement).toBe("screener")
  })

  it("rejects unknown recipients without storing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ouro-mail-store-"))
    const ensured = ensureMailboxRegistry({ agentId: "slugger" })
    const raw = Buffer.from("From: x@example.com\r\nTo: no@ouro.bot\r\nSubject: nope\r\n\r\nno", "utf-8")
    const parsed = await parsePrivateMailEnvelope(raw)

    const result = await ingestRawMailToStore({
      registry: ensured.registry,
      store: new FileMailroomStore(dir),
      envelope: { mailFrom: "x@example.com", rcptTo: ["no@ouro.bot"] },
      rawMime: raw,
      privateEnvelope: parsed.privateEnvelope,
    })

    expect(result.accepted).toHaveLength(0)
    expect(result.rejectedRecipients).toEqual(["no@ouro.bot"])
  })
})
