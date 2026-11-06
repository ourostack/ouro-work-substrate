import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? "/tmp/ouro-work-substrate-unit8c-playwright/node_modules/playwright"
const { chromium } = require(playwrightModule)

const artifactsDir = process.env.UNIT8C_ARTIFACTS_DIR
if (!artifactsDir) throw new Error("UNIT8C_ARTIFACTS_DIR is required")

const baseUrl = process.env.OUTLOOK_VISUAL_URL ?? "http://127.0.0.1:6878"
const generatedAt = "2026-04-23T01:35:00.000Z"

const machine = {
  overview: {
    totals: { liveTasks: 1, blockedTasks: 0, openObligations: 0, activeCodingAgents: 1 },
    daemon: { mode: "dev" },
    runtime: { version: "0.1.0-alpha.469" },
    freshness: { status: "fresh" },
  },
  agents: [{
    agentName: "slugger",
    tasks: { liveCount: 1 },
    obligations: { openCount: 0 },
    coding: { activeCount: 1 },
    attention: { level: "active", label: "mail" },
  }],
}

const agentView = {
  productName: "Ouro Outlook",
  interactionModel: "read-only",
  viewer: { kind: "human", innerDetail: "summary" },
  agent: {
    agentName: "slugger",
    agentRoot: "/tmp/slugger.ouro",
    enabled: true,
    provider: "openai",
    freshness: { status: "fresh", latestActivityAt: generatedAt, ageMs: 0 },
    degraded: { status: "ok", issues: [] },
    attention: { level: "active", label: "mail" },
    senses: [],
  },
  work: {
    tasks: {
      totalCount: 1,
      liveCount: 1,
      blockedCount: 0,
      byStatus: { drafting: 0, processing: 1, validating: 0, collaborating: 0, paused: 0, blocked: 0, done: 0, cancelled: 0 },
      liveTaskNames: ["Mail production path"],
      actionRequired: [],
      activeBridges: [],
    },
    obligations: { openCount: 0, items: [] },
    sessions: { liveCount: 0, items: [] },
    coding: { totalCount: 1, activeCount: 1, blockedCount: 0, items: [] },
    bridges: [],
  },
  inner: { mode: "summary", status: "idle", summary: null, hasPending: false },
  activity: { freshness: { status: "fresh", latestActivityAt: generatedAt, ageMs: 0 }, recent: [] },
}

const mailView = {
  status: "ready",
  agentName: "slugger",
  mailboxAddress: "slugger@ouro.bot",
  generatedAt,
  store: { kind: "file", label: "/tmp/mailroom" },
  folders: [
    { id: "imbox", label: "Imbox", count: 2 },
    { id: "source:hey:owner@example.test", label: "Alex HEY", count: 1 },
    { id: "source:hey:maya@example.com", label: "Maya HEY", count: 1 },
    { id: "sent", label: "Sent", count: 1 },
  ],
  messages: [
    {
      id: "mail_ari",
      subject: "Alex delegated note",
      from: ["owner@example.test"],
      to: ["test.example.owner.slugger@ouro.bot"],
      cc: [],
      date: null,
      receivedAt: "2026-04-23T01:10:00.000Z",
      snippet: "Alex mailbox evidence for the executive assistant lane.",
      placement: "imbox",
      compartmentKind: "delegated",
      ownerEmail: "owner@example.test",
      source: "hey",
      recipient: "test.example.owner.slugger@ouro.bot",
      attachmentCount: 0,
      untrustedContentWarning: "untrusted external data",
      provenance: {
        placement: "imbox",
        compartmentKind: "delegated",
        ownerEmail: "owner@example.test",
        source: "hey",
        recipient: "test.example.owner.slugger@ouro.bot",
        mailboxId: "mailbox_slugger",
        grantId: "grant_ari_hey",
        trustReason: "screened-in delegated source",
      },
    },
    {
      id: "mail_maya",
      subject: "Maya delegated note",
      from: ["maya@example.com"],
      to: ["me.example.maya.slugger@ouro.bot"],
      cc: [],
      date: null,
      receivedAt: "2026-04-23T01:12:00.000Z",
      snippet: "A second delegated HEY lane proves owner-scoped filtering.",
      placement: "imbox",
      compartmentKind: "delegated",
      ownerEmail: "maya@example.com",
      source: "hey",
      recipient: "me.example.maya.slugger@ouro.bot",
      attachmentCount: 0,
      untrustedContentWarning: "untrusted external data",
      provenance: {
        placement: "imbox",
        compartmentKind: "delegated",
        ownerEmail: "maya@example.com",
        source: "hey",
        recipient: "me.example.maya.slugger@ouro.bot",
        mailboxId: "mailbox_slugger",
        grantId: "grant_maya_hey",
        trustReason: "screened-in delegated source",
      },
    },
  ],
  screener: [],
  outbound: [{
    id: "draft_acs",
    status: "accepted",
    mailboxRole: "agent-native-mailbox",
    sendAuthority: "agent-native",
    ownerEmail: null,
    source: null,
    from: "slugger@ouro.bot",
    to: ["owner@example.test"],
    cc: [],
    bcc: [],
    subject: "Autonomous provider proof",
    createdAt: "2026-04-23T01:30:00.000Z",
    updatedAt: "2026-04-23T01:32:00.000Z",
    sentAt: null,
    submittedAt: "2026-04-23T01:31:00.000Z",
    acceptedAt: "2026-04-23T01:32:00.000Z",
    deliveredAt: null,
    failedAt: null,
    sendMode: "autonomous",
    provider: "azure-communication-services",
    providerMessageId: "acs-operation-1",
    providerRequestId: "req-1",
    operationLocation: "https://contoso.communication.azure.com/emails/operations/acs-operation-1?api-version=2025-09-01",
    transport: null,
    reason: "policy-approved autonomous native send",
    policyDecision: {
      allowed: true,
      mode: "autonomous",
      code: "allowed",
      reason: "Autonomous native-agent mail policy allowed this send",
      evaluatedAt: "2026-04-23T01:30:00.000Z",
      recipients: ["owner@example.test"],
      fallback: "none",
      policyId: "policy_slugger_native_mail",
      remainingSendsInWindow: 1,
    },
    deliveryEvents: [{
      provider: "azure-communication-services",
      providerEventId: "event-expanded-1",
      providerMessageId: "acs-operation-1",
      outcome: "accepted",
      recipient: "owner@example.test",
      occurredAt: "2026-04-23T01:32:00.000Z",
      receivedAt: "2026-04-23T01:32:01.000Z",
      bodySafeSummary: "ACS delivery report Expanded for owner@example.test",
      providerStatus: "Expanded",
    }],
  }],
  recovery: { discardedCount: 0, quarantineCount: 0 },
  accessLog: [
    {
      id: "access_delegated",
      messageId: "mail_ari",
      threadId: null,
      tool: "mail_thread",
      reason: "read delegated message body",
      mailboxRole: "delegated-human-mailbox",
      compartmentKind: "delegated",
      ownerEmail: "owner@example.test",
      source: "hey",
      accessedAt: "2026-04-23T01:10:00.000Z",
    },
    {
      id: "access_send",
      messageId: null,
      threadId: null,
      tool: "mail_send",
      reason: "policy-approved autonomous native send",
      mailboxRole: "agent-native-mailbox",
      compartmentKind: "native",
      ownerEmail: null,
      source: null,
      accessedAt: "2026-04-23T01:31:00.000Z",
    },
  ],
  error: null,
}

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const apiPath = url.pathname.replace(/^\/api/, "")
    if (apiPath === "/events") {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
      return
    }

    const payload = apiPath === "/machine"
      ? machine
      : apiPath === "/agents/slugger"
        ? agentView
        : apiPath === "/agents/slugger/desk-prefs"
          ? { carrying: null, statusLine: null, tabOrder: null, starredFriends: [], pinnedConstellations: [], dismissedObligations: [] }
          : apiPath === "/agents/slugger/mail"
            ? mailView
            : null

    if (!payload) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: apiPath }) })
      return
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
  })
}

async function assertTextVisible(page, text) {
  await page.getByText(text).first().waitFor({ state: "visible", timeout: 10_000 })
}

async function assertNoHorizontalOverflow(page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (hasOverflow) {
    const measurements = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    throw new Error(`horizontal overflow detected: ${JSON.stringify(measurements)}`)
  }
}

async function main() {
  await fs.mkdir(artifactsDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    await mockApi(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${baseUrl}/#/agent/slugger/mail`, { waitUntil: "networkidle" })
    await assertTextVisible(page, "delegated human mailbox")
    await assertTextVisible(page, "owner@example.test / hey")
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: path.join(artifactsDir, "unit8c-mailbox-desktop.png"), fullPage: true })

    await page.getByRole("button", { name: /Sent/ }).click()
    await assertTextVisible(page, "Autonomous provider proof")
    await assertTextVisible(page, "acs-operation-1")
    await assertTextVisible(page, "ACS delivery report Expanded for owner@example.test")
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: path.join(artifactsDir, "unit8c-mailbox-sent-desktop.png"), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${baseUrl}/#/agent/slugger/mail`, { waitUntil: "networkidle" })
    await assertTextVisible(page, "Alex HEY")
    await assertTextVisible(page, "Maya HEY")
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: path.join(artifactsDir, "unit8c-mailbox-mobile.png"), fullPage: true })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactsDir, "unit8c-debug-failure.png"), fullPage: true }).catch(() => {})
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch((innerError) => `could not read body text: ${innerError}`)
    await fs.writeFile(path.join(artifactsDir, "unit8c-debug-body.txt"), bodyText)
    throw error
  } finally {
    await browser.close()
  }
}

await main()
