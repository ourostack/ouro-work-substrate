import * as fs from "node:fs"
import type { MailroomRegistry } from "@ouro.bot/work-protocol"

export interface MailIngressArgs {
  registryPath?: string
  registryBase64?: string
  registryAzureAccountUrl?: string
  registryContainer: string
  registryBlob: string
  registryDomain: string
  registryRefreshMs: number
  storePath?: string
  azureAccountUrl?: string
  azureContainer: string
  azureManagedIdentityClientId?: string
  smtpPort: number
  httpPort: number
  host: string
  maxMessageBytes: number
  maxRecipients: number
  maxConnections: number
  connectionRateLimitMax: number
  connectionRateLimitWindowMs: number
  tlsKeyFile?: string
  tlsCertFile?: string
}

const KEY_VALUE_ARGS = new Map([
  ["registry", "--registry"],
  ["registry-base64", "--registry-base64"],
  ["registry-azure-account-url", "--registry-azure-account-url"],
  ["registry-container", "--registry-container"],
  ["registry-blob", "--registry-blob"],
  ["registry-domain", "--registry-domain"],
  ["registry-refresh-ms", "--registry-refresh-ms"],
  ["store", "--store"],
  ["azure-account-url", "--azure-account-url"],
  ["azure-container", "--azure-container"],
  ["azure-managed-identity-client-id", "--azure-managed-identity-client-id"],
  ["smtp-port", "--smtp-port"],
  ["http-port", "--http-port"],
  ["host", "--host"],
  ["max-message-bytes", "--max-message-bytes"],
  ["max-recipients", "--max-recipients"],
  ["max-connections", "--max-connections"],
  ["connection-rate-limit-max", "--connection-rate-limit-max"],
  ["connection-rate-limit-window-ms", "--connection-rate-limit-window-ms"],
  ["tls-key-file", "--tls-key-file"],
  ["tls-cert-file", "--tls-cert-file"],
])

function expandKeyValueArgs(args: string[]): string[] {
  const expanded: string[] = []
  for (const arg of args) {
    const equalsIndex = arg.indexOf("=")
    if (!arg.startsWith("--") && equalsIndex > 0) {
      const key = arg.slice(0, equalsIndex).trim()
      const flag = KEY_VALUE_ARGS.get(key)
      if (flag) {
        expanded.push(flag, arg.slice(equalsIndex + 1))
        continue
      }
    }
    expanded.push(arg)
  }
  return expanded
}

function optionalValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

function optionalNumber(args: string[], flag: string, fallback: number): number {
  const index = args.indexOf(flag)
  if (index === -1) return fallback
  const value = Number.parseInt(args[index + 1] ?? "", 10)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return value
}

function optionalPort(args: string[], flag: string, fallback: number): number {
  const value = optionalNumber(args, flag, fallback)
  if (value > 65535) throw new Error(`${flag} must be a TCP port`)
  return value
}

export function parseMailIngressArgs(args: string[]): MailIngressArgs {
  const expanded = expandKeyValueArgs(args)
  const storePath = optionalValue(expanded, "--store")
  const azureAccountUrl = optionalValue(expanded, "--azure-account-url")
  if (!storePath && !azureAccountUrl) {
    throw new Error("Missing --store or --azure-account-url")
  }
  const registryPath = optionalValue(expanded, "--registry")
  const registryBase64 = optionalValue(expanded, "--registry-base64")
  const registryAzureAccountUrl = optionalValue(expanded, "--registry-azure-account-url")
  if (!registryPath && !registryBase64 && !registryAzureAccountUrl) {
    throw new Error("Missing --registry, --registry-base64, or --registry-azure-account-url")
  }
  const tlsKeyFile = optionalValue(expanded, "--tls-key-file")
  const tlsCertFile = optionalValue(expanded, "--tls-cert-file")
  if ((tlsKeyFile && !tlsCertFile) || (!tlsKeyFile && tlsCertFile)) {
    throw new Error("--tls-key-file and --tls-cert-file must be provided together")
  }
  const maxRecipients = optionalNumber(expanded, "--max-recipients", 100)
  if (maxRecipients < 1) throw new Error("--max-recipients must be a positive integer")
  const maxConnections = optionalNumber(expanded, "--max-connections", 100)
  if (maxConnections < 1) throw new Error("--max-connections must be a positive integer")
  const connectionRateLimitMax = optionalNumber(expanded, "--connection-rate-limit-max", 120)
  if (connectionRateLimitMax < 1) throw new Error("--connection-rate-limit-max must be a positive integer")
  const connectionRateLimitWindowMs = optionalNumber(expanded, "--connection-rate-limit-window-ms", 60_000)
  if (connectionRateLimitWindowMs < 1) throw new Error("--connection-rate-limit-window-ms must be a positive integer")
  return {
    ...(registryPath ? { registryPath } : {}),
    ...(registryBase64 ? { registryBase64 } : {}),
    ...(registryAzureAccountUrl ? { registryAzureAccountUrl } : {}),
    registryContainer: optionalValue(expanded, "--registry-container") ?? "mailroom",
    registryBlob: optionalValue(expanded, "--registry-blob") ?? "registry/mailroom.json",
    registryDomain: optionalValue(expanded, "--registry-domain") ?? "ouro.bot",
    registryRefreshMs: optionalNumber(expanded, "--registry-refresh-ms", 0),
    ...(storePath ? { storePath } : {}),
    ...(azureAccountUrl ? { azureAccountUrl } : {}),
    azureContainer: optionalValue(expanded, "--azure-container") ?? "mailroom",
    ...(optionalValue(expanded, "--azure-managed-identity-client-id")
      ? { azureManagedIdentityClientId: optionalValue(expanded, "--azure-managed-identity-client-id") }
      : {}),
    smtpPort: optionalPort(expanded, "--smtp-port", 2525),
    httpPort: optionalPort(expanded, "--http-port", 8080),
    host: optionalValue(expanded, "--host") ?? "0.0.0.0",
    maxMessageBytes: optionalNumber(expanded, "--max-message-bytes", 25 * 1024 * 1024),
    maxRecipients,
    maxConnections,
    connectionRateLimitMax,
    connectionRateLimitWindowMs,
    ...(tlsKeyFile ? { tlsKeyFile } : {}),
    ...(tlsCertFile ? { tlsCertFile } : {}),
  }
}

export function readRegistry(args: Pick<MailIngressArgs, "registryPath" | "registryBase64">): MailroomRegistry {
  if (args.registryBase64) {
    return JSON.parse(Buffer.from(args.registryBase64, "base64").toString("utf-8")) as MailroomRegistry
  }
  if (!args.registryPath) throw new Error("Missing registry path")
  return JSON.parse(fs.readFileSync(args.registryPath, "utf-8")) as MailroomRegistry
}
