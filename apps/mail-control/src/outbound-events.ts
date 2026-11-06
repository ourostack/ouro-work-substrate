import { BlobServiceClient, type BlockBlobClient, type ContainerClient } from "@azure/storage-blob"
import {
  reconcileMailDeliveryEvent,
  type MailOutboundDeliveryEvent,
  type MailOutboundRecord,
  type MailOutboundStatus,
} from "@ouro.bot/work-protocol"
import { logEvent } from "./log"

export interface OutboundEventRecordResult {
  matched: boolean
  outboundId?: string
  status?: MailOutboundStatus
}

interface BlobPayload {
  readableStreamBody?: NodeJS.ReadableStream
}

function blobText(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

async function downloadJson<T>(blob: BlockBlobClient): Promise<T | null> {
  let payload: BlobPayload
  try {
    payload = await blob.download()
  } catch {
    return null
  }
  if (!payload.readableStreamBody) return null
  try {
    return JSON.parse((await streamToBuffer(payload.readableStreamBody)).toString("utf-8")) as T
  } catch {
    return null
  }
}

function safeBlobSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}

export class AzureBlobOutboundEventSink {
  private readonly container: ContainerClient

  constructor(serviceClient: BlobServiceClient, containerName: string) {
    this.container = serviceClient.getContainerClient(containerName)
  }

  private async findOutbound(event: MailOutboundDeliveryEvent): Promise<{ name: string; record: MailOutboundRecord } | null> {
    for await (const item of this.container.listBlobsFlat({ prefix: "outbound/" })) {
      if (!item.name.endsWith(".json")) continue
      const record = await downloadJson<MailOutboundRecord>(this.container.getBlockBlobClient(item.name))
      if (record?.providerMessageId === event.providerMessageId) {
        return { name: item.name, record }
      }
    }
    return null
  }

  private async recordUnmatched(event: MailOutboundDeliveryEvent): Promise<void> {
    const providerMessageId = safeBlobSegment(event.providerMessageId)
    const providerEventId = safeBlobSegment(event.providerEventId)
    await this.container
      .getBlockBlobClient(`outbound-events/unmatched/${providerMessageId}/${providerEventId}.json`)
      .uploadData(blobText({
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        event,
      }))
    logEvent({
      component: "mail-control",
      event: "outbound_delivery_event_unmatched",
      message: "outbound delivery event had no matching outbound record",
      meta: {
        provider: event.provider,
        providerEventId: event.providerEventId,
        providerMessageId: event.providerMessageId,
        outcome: event.outcome,
      },
    })
  }

  async recordDeliveryEvent(event: MailOutboundDeliveryEvent): Promise<OutboundEventRecordResult> {
    await this.container.createIfNotExists()
    const match = await this.findOutbound(event)
    if (!match) {
      await this.recordUnmatched(event)
      return { matched: false }
    }
    const updated = reconcileMailDeliveryEvent({ outbound: match.record, event })
    await this.container.getBlockBlobClient(match.name).uploadData(blobText(updated))
    logEvent({
      component: "mail-control",
      event: "outbound_delivery_event_reconciled",
      message: "outbound delivery event reconciled",
      meta: {
        provider: event.provider,
        providerEventId: event.providerEventId,
        providerMessageId: event.providerMessageId,
        outcome: event.outcome,
        outboundId: updated.id,
        status: updated.status,
      },
    })
    return { matched: true, outboundId: updated.id, status: updated.status }
  }
}
