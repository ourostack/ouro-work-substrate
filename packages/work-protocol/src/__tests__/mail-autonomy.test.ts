import { describe, expect, it } from "vitest"
import {
  buildConfirmedMailSendDecision,
  buildNativeMailAutonomyPolicy,
  evaluateNativeMailSendPolicy,
  type MailAutonomyPolicy,
  type MailOutboundRecord,
} from "../mail"

const actor = { kind: "human" as const, friendId: "alex", trustLevel: "family" as const }

function policy(overrides: Partial<MailAutonomyPolicy> = {}): MailAutonomyPolicy {
  return buildNativeMailAutonomyPolicy({
    agentId: "Slugger",
    mailboxAddress: "Slugger@OURO.bot",
    enabled: true,
    killSwitch: false,
    allowedRecipients: ["OWNER@EXAMPLE.TEST"],
    allowedDomains: ["trusted.example"],
    maxRecipientsPerMessage: 3,
    rateLimit: { maxSends: 2, windowMs: 60_000 },
    actor,
    reason: "Alex approved low-risk autonomous native mail",
    updatedAt: "2026-04-23T00:00:00.000Z",
    ...overrides,
  })
}

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
    subject: "Low-risk check",
    text: "Can you confirm the plan?",
    actor: { kind: "agent", agentId: "slugger" },
    reason: "low-risk autonomous check",
    createdAt: "2026-04-23T00:01:00.000Z",
    updatedAt: "2026-04-23T00:01:00.000Z",
    ...overrides,
  }
}

describe("native mail autonomy policy", () => {
  it("normalizes policy fields and allows only explicitly low-risk native-agent drafts", () => {
    const minimalPolicy = buildNativeMailAutonomyPolicy({
      agentId: "!!!",
      mailboxAddress: "Agent@OURO.bot",
      enabled: true,
      killSwitch: false,
      maxRecipientsPerMessage: 0,
      rateLimit: { maxSends: -1, windowMs: 0 },
    })
    expect(minimalPolicy).toEqual(expect.objectContaining({
      agentId: "agent",
      mailboxAddress: "agent@ouro.bot",
      allowedRecipients: [],
      allowedDomains: [],
      maxRecipientsPerMessage: 1,
      rateLimit: { maxSends: 0, windowMs: 1 },
    }))
    expect(minimalPolicy).not.toHaveProperty("actor")
    expect(minimalPolicy).not.toHaveProperty("reason")
    expect(minimalPolicy).not.toHaveProperty("updatedAt")

    const decision = evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft({ to: ["Alex <OWNER@EXAMPLE.TEST>", "ops@trusted.example"] }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:02:00.000Z"),
    })

    expect(decision).toEqual(expect.objectContaining({
      allowed: true,
      mode: "autonomous",
      code: "allowed",
      policyId: expect.stringMatching(/^mail_auto_/),
      evaluatedAt: "2026-04-23T00:02:00.000Z",
      remainingSendsInWindow: 1,
    }))
    expect(decision.recipients).toEqual(["owner@example.test", "ops@trusted.example"])

    expect(evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft(),
      recentOutbound: [
        draft({ id: "draft_not_sent" }),
        draft({ id: "draft_confirmed", status: "sent", sendMode: "confirmed", updatedAt: "2026-04-23T00:01:10.000Z" }),
        draft({ id: "draft_bad_date", status: "sent", sendMode: "autonomous", updatedAt: "not-a-date" }),
        draft({ id: "draft_autonomous_no_sent_at", status: "sent", sendMode: "autonomous", updatedAt: "2026-04-23T00:01:30.000Z" }),
      ],
      now: new Date("2026-04-23T00:02:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: true,
      remainingSendsInWindow: 0,
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft(),
      recentOutbound: [],
    })).toEqual(expect.objectContaining({
      allowed: true,
      evaluatedAt: expect.any(String),
    }))
  })

  it("requires confirmation for new or risky recipients without mutating the draft contract", () => {
    const decision = evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft({ to: ["new.person@example.net"] }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:02:00.000Z"),
    })

    expect(decision).toEqual(expect.objectContaining({
      allowed: false,
      mode: "confirmation-required",
      code: "recipient-not-allowed",
      fallback: "CONFIRM_SEND",
      reason: "new.person@example.net is not allowed for autonomous native-agent mail",
    }))
  })

  it("blocks autonomous sends for kill switch, recipient limits, rate limits, and delegated send-as-human attempts", () => {
    const base = policy()
    const recent = [
      draft({
        id: "draft_sent_1",
        status: "sent",
        sendMode: "autonomous",
        sentAt: "2026-04-23T00:01:30.000Z",
        updatedAt: "2026-04-23T00:01:30.000Z",
      }),
      draft({
        id: "draft_sent_2",
        status: "sent",
        sendMode: "autonomous",
        sentAt: "2026-04-23T00:01:45.000Z",
        updatedAt: "2026-04-23T00:01:45.000Z",
      }),
    ]

    expect(evaluateNativeMailSendPolicy({
      policy: { ...base, killSwitch: true },
      draft: draft(),
      recentOutbound: [],
      now: new Date("2026-04-23T00:02:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      mode: "confirmation-required",
      code: "autonomy-kill-switch",
      fallback: "CONFIRM_SEND",
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: { ...base, maxRecipientsPerMessage: 1 },
      draft: draft({ to: ["owner@example.test", "ops@trusted.example"] }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:02:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      mode: "blocked",
      code: "recipient-limit-exceeded",
      fallback: "none",
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: base,
      draft: draft(),
      recentOutbound: recent,
      now: new Date("2026-04-23T00:02:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      mode: "blocked",
      code: "autonomous-rate-limit",
      fallback: "none",
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: base,
      draft: draft({
        mailboxRole: "delegated-human-mailbox",
        sendAuthority: "delegated-human" as never,
        ownerEmail: "owner@example.test",
        source: "hey",
        from: "owner@example.test",
      }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:02:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      mode: "blocked",
      code: "delegated-send-as-human-not-authorized",
      fallback: "none",
    }))
  })

  it("blocks non-draft, wrong-agent, wrong-mailbox, and disabled-policy sends and records confirmed audit decisions", () => {
    expect(evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft({ status: "sent", sentAt: "2026-04-23T00:02:30.000Z" }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:03:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      code: "draft-not-sendable",
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft({ agentId: "clio" }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:03:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      code: "agent-mismatch",
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: policy(),
      draft: draft({ from: "other@ouro.bot" }),
      recentOutbound: [],
      now: new Date("2026-04-23T00:03:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      code: "native-mailbox-mismatch",
    }))

    expect(evaluateNativeMailSendPolicy({
      policy: policy({ enabled: false }),
      draft: draft(),
      recentOutbound: [],
      now: new Date("2026-04-23T00:03:00.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: false,
      mode: "confirmation-required",
      code: "autonomy-policy-disabled",
      fallback: "CONFIRM_SEND",
    }))

    expect(buildConfirmedMailSendDecision({
      draft: draft(),
      policy: policy(),
      now: new Date("2026-04-23T00:03:30.000Z"),
    })).toEqual(expect.objectContaining({
      allowed: true,
      mode: "confirmed",
      code: "explicit-confirmation",
      evaluatedAt: "2026-04-23T00:03:30.000Z",
      policyId: expect.stringMatching(/^mail_auto_/),
    }))

    const confirmedWithoutPolicy = buildConfirmedMailSendDecision({
      draft: draft(),
    })
    expect(confirmedWithoutPolicy).toEqual(expect.objectContaining({
      allowed: true,
      mode: "confirmed",
      code: "explicit-confirmation",
      evaluatedAt: expect.any(String),
    }))
    expect(confirmedWithoutPolicy).not.toHaveProperty("policyId")
  })
})
