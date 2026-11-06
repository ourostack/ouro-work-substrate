import * as fs from "node:fs"
import { BlobServiceClient } from "@azure/storage-blob"
import type { MailroomRegistry } from "@ouro.bot/work-protocol"
import { logEvent } from "./log"

export interface MailroomRegistryProvider {
  current(): Promise<MailroomRegistry>
}

export function emptyRegistry(domain: string): MailroomRegistry {
  return {
    schemaVersion: 1,
    domain,
    mailboxes: [],
    sourceGrants: [],
  }
}

export class StaticRegistryProvider implements MailroomRegistryProvider {
  constructor(private readonly registry: MailroomRegistry) {}

  async current(): Promise<MailroomRegistry> {
    return this.registry
  }
}

export class FileRegistryProvider implements MailroomRegistryProvider {
  private cached: MailroomRegistry | null = null
  private cachedMtime = 0

  constructor(
    private readonly filePath: string,
    private readonly fallbackDomain: string,
  ) {}

  async current(): Promise<MailroomRegistry> {
    const stat = fs.existsSync(this.filePath) ? fs.statSync(this.filePath) : null
    if (!stat) {
      this.cached = this.cached ?? emptyRegistry(this.fallbackDomain)
      return this.cached
    }
    if (this.cached && stat.mtimeMs === this.cachedMtime) return this.cached
    this.cached = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as MailroomRegistry
    this.cachedMtime = stat.mtimeMs
    return this.cached
  }
}

export class AzureBlobRegistryProvider implements MailroomRegistryProvider {
  private cached: MailroomRegistry | null = null
  private lastLoad = 0

  constructor(
    private readonly serviceClient: BlobServiceClient,
    private readonly containerName: string,
    private readonly blobName: string,
    private readonly fallbackDomain: string,
    private readonly refreshMs = 0,
  ) {}

  async current(): Promise<MailroomRegistry> {
    const now = Date.now()
    if (this.refreshMs > 0 && this.cached && now - this.lastLoad < this.refreshMs) return this.cached
    const container = this.serviceClient.getContainerClient(this.containerName)
    const blob = container.getBlockBlobClient(this.blobName)
    try {
      if (!await blob.exists()) {
        this.cached = this.cached ?? emptyRegistry(this.fallbackDomain)
        this.lastLoad = now
        return this.cached
      }
      this.cached = JSON.parse((await blob.downloadToBuffer()).toString("utf-8")) as MailroomRegistry
      this.lastLoad = now
      return this.cached
    } catch (error) {
      logEvent({
        level: this.cached ? "warn" : "error",
        component: "mail-ingress",
        event: "registry_load_failed",
        message: "mail registry load failed",
        meta: { blobName: this.blobName, error: error instanceof Error ? error.message : String(error) },
      })
      if (this.cached) return this.cached
      throw error
    }
  }
}
