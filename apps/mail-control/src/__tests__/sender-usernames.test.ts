import { describe, expect, it, vi } from "vitest"
import { createAcsSenderUsernameProvisioner } from "../sender-usernames"

describe("ACS sender username provisioner", () => {
  it("creates or updates the sender username using ARM and managed identity auth", async () => {
    const getToken = vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 }))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/ouro-prod-email/domains/ouro.bot/senderUsernames/slugger",
      name: "slugger",
      properties: { username: "slugger", displayName: "Slugger", provisioningState: "Succeeded" },
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }))
    const provisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken } as never,
      fetch: fetchMock as typeof fetch,
    })

    await expect(provisioner.ensureSenderUsername({ agentId: "Slugger" })).resolves.toEqual({
      senderUsername: "slugger",
      domainName: "ouro.bot",
    })
    expect(getToken).toHaveBeenCalledWith("https://management.azure.com/.default")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/ouro-prod-email/domains/ouro.bot/senderUsernames/slugger?api-version=2026-03-18",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          authorization: "Bearer arm-token",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          properties: {
            displayName: "Slugger",
            username: "slugger",
          },
        }),
      }),
    )
  })

  it("normalizes sender usernames and surfaces body-safe ARM failures", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Forbidden secret detail that still should not include mail body" },
    }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }))
    const provisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 })) } as never,
      fetch: fetchMock as typeof fetch,
    })

    await expect(provisioner.ensureSenderUsername({ agentId: "Slugger Agent" }))
      .rejects.toThrow("ACS sender username ensure failed for slugger-agent@ouro.bot: Forbidden secret detail that still should not include mail body")
  })

  it("uses top-level ARM messages and HTTP fallback when the provider response is sparse", async () => {
    const topLevelProvisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 })) } as never,
      fetch: vi.fn(async () => new Response(JSON.stringify({ message: "Top level failure" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    })

    await expect(topLevelProvisioner.ensureSenderUsername({ agentId: "slugger" }))
      .rejects.toThrow("ACS sender username ensure failed for slugger@ouro.bot: Top level failure")

    const fallbackProvisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 })) } as never,
      fetch: vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error("not json")
        },
        text: async () => {
          throw new Error("not text")
        },
      })) as never,
    })

    await expect(fallbackProvisioner.ensureSenderUsername({ agentId: "slugger" }))
      .rejects.toThrow("ACS sender username ensure failed for slugger@ouro.bot: HTTP 503")

    const nonObjectProvisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 })) } as never,
      fetch: vi.fn(async () => new Response(JSON.stringify("bad"), {
        status: 502,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    })

    await expect(nonObjectProvisioner.ensureSenderUsername({ agentId: "slugger" }))
      .rejects.toThrow("ACS sender username ensure failed for slugger@ouro.bot: HTTP 502")
  })

  it("rejects agent ids that do not produce a usable sender username", async () => {
    const provisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 })) } as never,
      fetch: vi.fn() as typeof fetch,
    })

    await expect(provisioner.ensureSenderUsername({ agentId: "___" }))
      .rejects.toThrow("cannot derive ACS sender username")
  })

  it("rejects missing ARM access tokens before any network call", async () => {
    const fetchMock = vi.fn()
    const provisioner = createAcsSenderUsernameProvisioner({
      subscriptionId: "sub",
      resourceGroupName: "rg",
      emailServiceName: "ouro-prod-email",
      domainName: "ouro.bot",
      credential: { getToken: vi.fn(async () => null) } as never,
      fetch: fetchMock as typeof fetch,
    })

    await expect(provisioner.ensureSenderUsername({ agentId: "slugger" }))
      .rejects.toThrow("ACS sender username ensure failed for slugger@ouro.bot: missing ARM access token")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses DefaultAzureCredential and default fetch/api-version when explicit overrides are omitted", async () => {
    vi.resetModules()
    const getToken = vi.fn(async () => ({ token: "default-arm-token", expiresOnTimestamp: Date.now() + 60_000 }))
    const defaultAzureCredentialMock = vi.fn(function DefaultAzureCredential(this: { getToken: typeof getToken }) {
      this.getToken = getToken
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/ouro-prod-email/domains/ouro.bot/senderUsernames/slugger",
      name: "slugger",
      properties: { username: "slugger", displayName: "Slugger", provisioningState: "Succeeded" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    const originalFetch = global.fetch
    vi.doMock("@azure/identity", () => ({
      DefaultAzureCredential: defaultAzureCredentialMock,
    }))
    global.fetch = fetchMock as typeof fetch
    try {
      const { createAcsSenderUsernameProvisioner: createWithDefaults } = await import("../sender-usernames")
      const provisioner = createWithDefaults({
        subscriptionId: "sub",
        resourceGroupName: "rg",
        emailServiceName: "ouro-prod-email",
        domainName: "ouro.bot",
      })

      await expect(provisioner.ensureSenderUsername({ agentId: "slugger" })).resolves.toEqual({
        senderUsername: "slugger",
        domainName: "ouro.bot",
      })
      expect(defaultAzureCredentialMock).toHaveBeenCalledWith(undefined)
      expect(fetchMock.mock.calls[0]?.[0]).toContain("api-version=2026-03-18")
    } finally {
      global.fetch = originalFetch
      vi.doUnmock("@azure/identity")
      vi.resetModules()
    }
  })

  it("passes managedIdentityClientId into DefaultAzureCredential when requested", async () => {
    vi.resetModules()
    const getToken = vi.fn(async () => ({ token: "default-arm-token", expiresOnTimestamp: Date.now() + 60_000 }))
    const defaultAzureCredentialMock = vi.fn(function DefaultAzureCredential(this: { getToken: typeof getToken }) {
      this.getToken = getToken
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/ouro-prod-email/domains/ouro.bot/senderUsernames/slugger",
      name: "slugger",
      properties: { username: "slugger", displayName: "Slugger", provisioningState: "Succeeded" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    const originalFetch = global.fetch
    vi.doMock("@azure/identity", () => ({
      DefaultAzureCredential: defaultAzureCredentialMock,
    }))
    global.fetch = fetchMock as typeof fetch
    try {
      const { createAcsSenderUsernameProvisioner: createWithManagedIdentity } = await import("../sender-usernames")
      const provisioner = createWithManagedIdentity({
        subscriptionId: "sub",
        resourceGroupName: "rg",
        emailServiceName: "ouro-prod-email",
        domainName: "ouro.bot",
        managedIdentityClientId: "mi-client-id",
      })

      await expect(provisioner.ensureSenderUsername({ agentId: "slugger" })).resolves.toEqual({
        senderUsername: "slugger",
        domainName: "ouro.bot",
      })
      expect(defaultAzureCredentialMock).toHaveBeenCalledWith({ managedIdentityClientId: "mi-client-id" })
    } finally {
      global.fetch = originalFetch
      vi.doUnmock("@azure/identity")
      vi.resetModules()
    }
  })

  it("falls back to the sender username when a mocked address slug has no display words", async () => {
    vi.resetModules()
    vi.doMock("@ouro.bot/work-protocol", () => ({
      safeAddressPart: () => "fallback-sender",
    }))
    try {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as { properties: { displayName: string; username: string } }
        expect(url).toContain("/senderUsernames/fallback-sender?")
        expect(payload.properties).toEqual({
          displayName: "fallback-sender",
          username: "fallback-sender",
        })
        return new Response(JSON.stringify({
          id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/ouro-prod-email/domains/ouro.bot/senderUsernames/fallback-sender",
          name: "fallback-sender",
          properties: { username: "fallback-sender", displayName: "fallback-sender", provisioningState: "Succeeded" },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      })
      const { createAcsSenderUsernameProvisioner: createWithMockedSlug } = await import("../sender-usernames")
      const provisioner = createWithMockedSlug({
        subscriptionId: "sub",
        resourceGroupName: "rg",
        emailServiceName: "ouro-prod-email",
        domainName: "ouro.bot",
        credential: { getToken: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 60_000 })) } as never,
        fetch: fetchMock as typeof fetch,
      })

      await expect(provisioner.ensureSenderUsername({ agentId: "---" })).resolves.toEqual({
        senderUsername: "fallback-sender",
        domainName: "ouro.bot",
      })
    } finally {
      vi.doUnmock("@ouro.bot/work-protocol")
      vi.resetModules()
    }
  })
})
