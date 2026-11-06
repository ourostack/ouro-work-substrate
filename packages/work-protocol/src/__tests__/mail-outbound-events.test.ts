import { describe, expect, it } from "vitest"
import {
  buildMailProviderSubmission,
  parseAcsEmailDeliveryReportEvent,
  reconcileMailDeliveryEvent,
  type MailOutboundDeliveryEventOutcome,
  type MailOutboundRecord,
} from "../mail"

function draft(overrides: Partial<MailOutboundRecord> = {}): MailOutboundRecord {
  return {
    schemaVersion: 1,
    id: "draft_1",
    agentId: "slugger",
    status: "draft",
    mailboxRole: "agent-native-mailbox",
    sendAuthority: "agent-native",
    ownerEmail: null,
    source: null,
    from: "slugger@ouro.bot",
    to: ["owner@example.test"],
    cc: [],
    bcc: [],
    subject: "Provider proof",
    text: "This body must not appear in provider event logs.",
    actor: { kind: "agent", agentId: "slugger" },
    reason: "prove outbound provider boundaries",
    createdAt: "2026-04-23T01:30:00.000Z",
    updatedAt: "2026-04-23T01:30:00.000Z",
    ...overrides,
  }
}

describe("mail outbound provider and delivery events", () => {
  it("records provider submission without treating provider acceptance as final delivery", () => {
    const submitted = buildMailProviderSubmission({
      draft: draft(),
      provider: "azure-communication-services",
      providerMessageId: "acs-operation-1",
      operationLocation: "https://contoso.communication.azure.com/emails/operations/acs-operation-1?api-version=2025-09-01",
      providerRequestId: "req-1",
      submittedAt: "2026-04-23T01:31:00.000Z",
    })

    expect(submitted).toEqual(expect.objectContaining({
      status: "submitted",
      provider: "azure-communication-services",
      providerMessageId: "acs-operation-1",
      providerRequestId: "req-1",
      operationLocation: "https://contoso.communication.azure.com/emails/operations/acs-operation-1?api-version=2025-09-01",
      submittedAt: "2026-04-23T01:31:00.000Z",
      deliveryEvents: [],
    }))
    expect(submitted).not.toHaveProperty("deliveredAt")
  })

  it("maps ACS delivery reports and reconciles duplicate provider events idempotently", () => {
    const submitted = buildMailProviderSubmission({
      draft: draft(),
      provider: "azure-communication-services",
      providerMessageId: "acs-operation-1",
      operationLocation: "https://contoso.communication.azure.com/emails/operations/acs-operation-1?api-version=2025-09-01",
      submittedAt: "2026-04-23T01:31:00.000Z",
    })
    const event = parseAcsEmailDeliveryReportEvent({
      id: "event-delivered-1",
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      eventTime: "2026-04-23T01:35:00.000Z",
      data: {
        sender: "slugger@ouro.bot",
        recipient: "owner@example.test",
        messageId: "acs-operation-1",
        status: "Delivered",
        deliveryStatusDetails: { statusMessage: "250 2.0.0 queued" },
        deliveryAttemptTimeStamp: "2026-04-23T01:34:59.000Z",
      },
    })

    expect(event).toEqual(expect.objectContaining({
      provider: "azure-communication-services",
      providerEventId: "event-delivered-1",
      providerMessageId: "acs-operation-1",
      outcome: "delivered",
      recipient: "owner@example.test",
      occurredAt: "2026-04-23T01:34:59.000Z",
      bodySafeSummary: expect.stringContaining("Delivered"),
    }))

    const delivered = reconcileMailDeliveryEvent({ outbound: submitted, event })
    expect(delivered).toEqual(expect.objectContaining({
      status: "delivered",
      deliveredAt: "2026-04-23T01:34:59.000Z",
    }))
    expect(delivered.deliveryEvents).toHaveLength(1)

    const duplicate = reconcileMailDeliveryEvent({ outbound: delivered, event })
    expect(duplicate.deliveryEvents).toHaveLength(1)

    expect(() => reconcileMailDeliveryEvent({
      outbound: { ...submitted, providerMessageId: "other-operation" },
      event,
    })).toThrow("providerMessageId does not match")
  })

  it.each([
    ["Expanded", "accepted"],
    ["Delivered", "delivered"],
    ["Suppressed", "suppressed"],
    ["Bounced", "bounced"],
    ["Quarantined", "quarantined"],
    ["FilteredSpam", "spam-filtered"],
    ["Failed", "failed"],
  ] as const)("maps ACS %s reports to the canonical %s outcome", (status, outcome: MailOutboundDeliveryEventOutcome) => {
    expect(parseAcsEmailDeliveryReportEvent({
      id: `event-${status}`,
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      eventTime: "2026-04-23T01:35:00.000Z",
      data: {
        sender: "slugger@ouro.bot",
        recipient: "owner@example.test",
        messageId: "acs-operation-1",
        status,
        deliveryStatusDetails: { statusMessage: `${status} proof` },
        deliveryAttemptTimeStamp: "2026-04-23T01:34:59.000Z",
      },
    })).toEqual(expect.objectContaining({ outcome }))
  })

  it("covers accepted and failed reconciliation timestamps plus ACS parser validation", () => {
    const submitted = buildMailProviderSubmission({
      draft: draft(),
      provider: "azure-communication-services",
      providerMessageId: "acs-operation-1",
      submittedAt: "2026-04-23T01:31:00.000Z",
    })
    const accepted = parseAcsEmailDeliveryReportEvent({
      id: "event-expanded-1",
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      data: {
        messageId: "acs-operation-1",
        status: "Expanded",
      },
    })
    expect(accepted).toEqual(expect.objectContaining({
      outcome: "accepted",
      receivedAt: expect.any(String),
      bodySafeSummary: expect.stringContaining("unknown recipient"),
    }))
    expect(reconcileMailDeliveryEvent({ outbound: submitted, event: accepted }))
      .toEqual(expect.objectContaining({ status: "accepted", acceptedAt: accepted.occurredAt }))

    const failed = parseAcsEmailDeliveryReportEvent({
      id: "event-failed-1",
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      eventTime: "2026-04-23T01:35:00.000Z",
      data: {
        messageId: "acs-operation-1",
        status: "Failed",
      },
    })
    expect(reconcileMailDeliveryEvent({ outbound: submitted, event: failed }))
      .toEqual(expect.objectContaining({ status: "failed", failedAt: "2026-04-23T01:35:00.000Z" }))
    expect(reconcileMailDeliveryEvent({
      outbound: { ...draft({ status: "submitted" }), providerMessageId: "acs-operation-1" },
      event: failed,
    }).deliveryEvents).toEqual([failed])

    expect(() => parseAcsEmailDeliveryReportEvent("not an event")).toThrow("missing id")
    expect(() => parseAcsEmailDeliveryReportEvent({
      id: "event-missing-type",
      data: { messageId: "acs-operation-1", status: "Delivered" },
    })).toThrow("unsupported ACS event type: unknown")
    expect(() => parseAcsEmailDeliveryReportEvent({
      id: "event-unsupported-type",
      eventType: "Microsoft.Communication.EmailEngagementTrackingReportReceived",
      data: {},
    })).toThrow("unsupported ACS event type")
    expect(() => parseAcsEmailDeliveryReportEvent({
      id: "event-missing-message",
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      data: { status: "Delivered" },
    })).toThrow("missing messageId")
    expect(() => parseAcsEmailDeliveryReportEvent({
      id: "event-unknown-status",
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      data: { messageId: "acs-operation-1", status: "Mystery" },
    })).toThrow("unsupported ACS delivery status")
    expect(() => parseAcsEmailDeliveryReportEvent({
      id: "event-missing-status",
      eventType: "Microsoft.Communication.EmailDeliveryReportReceived",
      data: { messageId: "acs-operation-1" },
    })).toThrow("unsupported ACS delivery status: unknown")
  })
})
