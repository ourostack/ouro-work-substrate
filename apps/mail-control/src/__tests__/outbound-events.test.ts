import { Readable } from "node:stream"
import { describe, expect, it } from "vitest"
import type { MailOutboundDeliveryEvent, MailOutboundRecord } from "@ouro/work-protocol"
import { AzureBlobOutboundEventSink } from "../outbound-events"

class FakeBlob {
  data: Buffer | null = null
  uploads: unknown[] = []
  streamMissing = false
  failDownload = false
  streamAsString = false

  async download(): Promise<{ readableStreamBody?: Readable }> {
    if (this.failDownload) throw new Error("download failed")
    return this.streamMissing
      ? {}
      : { readableStreamBody: Readable.from([this.streamAsString ? (this.data ?? Buffer.alloc(0)).toString("utf-8") : (this.data ?? Buffer.alloc(0))]) }
  }

  async uploadData(data: Buffer, options?: unknown): Promise<void> {
    this.uploads.push(options)
    this.data = Buffer.from(data)
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

  async *listBlobsFlat(options?: { prefix?: string }): AsyncGenerator<{ name: string }> {
    for (const [name] of this.blobs) {
      if (!options?.prefix || name.startsWith(options.prefix)) yield { name }
    }
  }
}

class FakeBlobServiceClient {
  readonly container = new FakeContainer()

  getContainerClient(name: string): FakeContainer {
    expect(name).toBe("mailroom")
    return this.container
  }
}

function outboundRecord(): MailOutboundRecord {
  return {
    schemaVersion: 1,
    id: "draft_1",
    agentId: "slugger",
    status: "submitted",
    mailboxRole: "agent-native-mailbox",
    sendAuthority: "agent-native",
    ownerEmail: null,
    source: null,
    from: "slugger@ouro.bot",
    to: ["owner@example.test"],
    cc: [],
    bcc: [],
    subject: "Provider event proof",
    text: "private outbound body",
    actor: { kind: "agent", agentId: "slugger" },
    reason: "provider event sink proof",
    createdAt: "2026-04-23T12:00:00.000Z",
    updatedAt: "2026-04-23T12:01:00.000Z",
    sendMode: "confirmed",
    provider: "azure-communication-services",
    providerMessageId: "acs-operation-1",
    submittedAt: "2026-04-23T12:01:00.000Z",
    deliveryEvents: [],
  }
}

function deliveryEvent(overrides: Partial<MailOutboundDeliveryEvent> = {}): MailOutboundDeliveryEvent {
  return {
    schemaVersion: 1,
    provider: "azure-communication-services",
    providerEventId: "event-delivered-1",
    providerMessageId: "acs-operation-1",
    outcome: "delivered",
    recipient: "owner@example.test",
    occurredAt: "2026-04-23T12:02:00.000Z",
    receivedAt: "2026-04-23T12:02:01.000Z",
    bodySafeSummary: "ACS delivery report Delivered for owner@example.test",
    providerStatus: "Delivered",
    ...overrides,
  }
}

describe("AzureBlobOutboundEventSink", () => {
  it("reconciles ACS delivery events into existing Blob outbound records", async () => {
    const serviceClient = new FakeBlobServiceClient()
    serviceClient.container.getBlockBlobClient("outbound/not-json.txt").data = Buffer.from("ignore me", "utf-8")
    const otherBlob = serviceClient.container.getBlockBlobClient("outbound/other.json")
    otherBlob.data = Buffer.from(JSON.stringify({ ...outboundRecord(), id: "draft_other", providerMessageId: "other-operation" }), "utf-8")
    otherBlob.streamAsString = true
    const blob = serviceClient.container.getBlockBlobClient("outbound/draft_1.json")
    blob.data = Buffer.from(JSON.stringify(outboundRecord()), "utf-8")

    const sink = new AzureBlobOutboundEventSink(serviceClient as never, "mailroom")
    const result = await sink.recordDeliveryEvent(deliveryEvent())

    expect(result).toEqual({ matched: true, outboundId: "draft_1", status: "delivered" })
    const updated = JSON.parse(blob.data!.toString("utf-8")) as MailOutboundRecord
    expect(updated.status).toBe("delivered")
    expect(updated.deliveredAt).toBe("2026-04-23T12:02:00.000Z")
    expect(updated.deliveryEvents).toEqual([deliveryEvent()])
    expect(serviceClient.container.createCalls).toBe(1)
  })

  it("keeps unmatched or malformed outbound delivery events body-safe and auditable", async () => {
    const serviceClient = new FakeBlobServiceClient()
    serviceClient.container.getBlockBlobClient("outbound/corrupt.json").data = Buffer.from("{nope", "utf-8")
    serviceClient.container.getBlockBlobClient("outbound/missing-stream.json").streamMissing = true
    serviceClient.container.getBlockBlobClient("outbound/download-failure.json").failDownload = true

    const sink = new AzureBlobOutboundEventSink(serviceClient as never, "mailroom")
    const event = deliveryEvent({
      providerEventId: "///",
      providerMessageId: "///",
      outcome: "bounced",
      bodySafeSummary: "ACS delivery report Bounced for owner@example.test",
      providerStatus: "Bounced",
    })

    const result = await sink.recordDeliveryEvent(event)

    expect(result).toEqual({ matched: false })
    const unmatched = serviceClient.container.getBlockBlobClient("outbound-events/unmatched/unknown/unknown.json")
    expect(unmatched.data).not.toBeNull()
    const payload = JSON.parse(unmatched.data!.toString("utf-8")) as { event: MailOutboundDeliveryEvent }
    expect(payload.event).toEqual(event)
    expect(JSON.stringify(payload)).not.toContain("private outbound body")
  })
})
