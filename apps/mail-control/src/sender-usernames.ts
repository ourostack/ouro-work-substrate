import { DefaultAzureCredential } from "@azure/identity"
import { safeAddressPart } from "@ouro.bot/work-protocol"
import { logEvent } from "./log"

interface AccessToken {
  token: string
}

export interface ArmCredential {
  getToken(scope: string | string[]): Promise<AccessToken | null>
}

export interface EnsureSenderUsernameInput {
  agentId: string
}

export interface EnsureSenderUsernameResult {
  senderUsername: string
  domainName: string
}

export interface OutboundSenderProvisioner {
  ensureSenderUsername(input: EnsureSenderUsernameInput): Promise<EnsureSenderUsernameResult>
}

export interface CreateAcsSenderUsernameProvisionerInput {
  subscriptionId: string
  resourceGroupName: string
  emailServiceName: string
  domainName: string
  managedIdentityClientId?: string
  credential?: ArmCredential
  fetch?: typeof fetch
  apiVersion?: string
}

function titleCaseAgent(agentId: string, fallback: string): string {
  const words = agentId
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return fallback
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function armErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: { message?: unknown } }).error
    if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim()
    }
    const message = (payload as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message.trim()
  }
  return `HTTP ${status}`
}

export function createAcsSenderUsernameProvisioner(input: CreateAcsSenderUsernameProvisionerInput): OutboundSenderProvisioner {
  const credential = input.credential ?? new DefaultAzureCredential(
    input.managedIdentityClientId ? { managedIdentityClientId: input.managedIdentityClientId } : undefined,
  )
  const fetchImpl = input.fetch ?? fetch
  const domainName = input.domainName.toLowerCase()
  const apiVersion = input.apiVersion ?? "2026-03-18"
  return {
    async ensureSenderUsername({ agentId }) {
      const senderUsername = safeAddressPart(agentId)
      if (!senderUsername) throw new Error(`cannot derive ACS sender username from agent id ${JSON.stringify(agentId)}`)
      const token = await credential.getToken("https://management.azure.com/.default")
      if (!token?.token) throw new Error(`ACS sender username ensure failed for ${senderUsername}@${domainName}: missing ARM access token`)
      const url = new URL(
        `https://management.azure.com/subscriptions/${encodeURIComponent(input.subscriptionId)}` +
        `/resourceGroups/${encodeURIComponent(input.resourceGroupName)}` +
        `/providers/Microsoft.Communication/emailServices/${encodeURIComponent(input.emailServiceName)}` +
        `/domains/${encodeURIComponent(domainName)}` +
        `/senderUsernames/${encodeURIComponent(senderUsername)}`,
      )
      url.searchParams.set("api-version", apiVersion)
      const response = await fetchImpl(url.toString(), {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            displayName: titleCaseAgent(agentId, senderUsername),
            username: senderUsername,
          },
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }))
        const reason = armErrorMessage(payload, response.status)
        logEvent({
          level: "error",
          component: "mail-control",
          event: "acs_sender_username_ensure_failed",
          message: "ACS sender username ensure failed",
          meta: { agentId, senderUsername, domainName, reason, status: response.status },
        })
        throw new Error(`ACS sender username ensure failed for ${senderUsername}@${domainName}: ${reason}`)
      }
      logEvent({
        component: "mail-control",
        event: "acs_sender_username_ensured",
        message: "ACS sender username ensured",
        meta: { agentId, senderUsername, domainName },
      })
      return {
        senderUsername,
        domainName,
      }
    },
  }
}
