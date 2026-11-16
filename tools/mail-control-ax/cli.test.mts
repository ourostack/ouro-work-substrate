import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCli } from "../../lib/ouro-ui/registry/ouro/ax/cli.ts";
import { mailControlCli } from "./cli.mts";

const TOKEN = "test-admin-token-not-a-secret";

interface Seen {
  path: string;
  auth: string | undefined;
  body: Record<string, unknown>;
}

/** A loopback stand-in for mail-control's two agent routes; it records each call and answers with the reply the test sets. */
async function serve(reply: (seen: Seen) => { status: number; body: unknown }): Promise<{ url: string; calls: Seen[]; close(): Promise<void> }> {
  const calls: Seen[] = [];
  const server: Server = createServer(async (request: IncomingMessage, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const seen: Seen = {
      path: request.url ?? "",
      auth: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}") as Record<string, unknown>,
    };
    calls.push(seen);
    const { status, body } = reply(seen);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdio: { stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) } } };
}

const ensuredBody = {
  ok: true,
  mailboxAddress: "inbox-agent@ouro.example.test",
  generatedPrivateKeys: { "mail-key-1": "made-up-private-key" },
};

function tokenFile(dir: string): string {
  const path = join(dir, "admin-token");
  writeFileSync(path, `${TOKEN}\n`);
  return path;
}

test("mailbox ensure posts the agent's id and owner to the service with the token from its file, and prints the new keys under --json", async () => {
  const service = await serve(() => ({ status: 200, body: ensuredBody }));
  const dir = mkdtempSync(join(tmpdir(), "mail-door-"));
  try {
    const { out, err, stdio } = io();
    const code = await runCli(mailControlCli, ["mailbox", "ensure", "inbox-agent", "--owner-email", "owner@example.test", "--token-file", tokenFile(dir), "--url", service.url, "--json"], stdio);
    assert.equal(code, 0, err.join(""));
    assert.equal(service.calls[0]?.path, "/v1/mailboxes/ensure");
    assert.equal(service.calls[0]?.auth, `Bearer ${TOKEN}`);
    assert.deepEqual(service.calls[0]?.body, { agentId: "inbox-agent", ownerEmail: "owner@example.test" });
    const result = JSON.parse(out.join("")) as { mailboxAddress: string; generatedPrivateKeys: string };
    assert.equal(result.mailboxAddress, "inbox-agent@ouro.example.test");
    assert.deepEqual(JSON.parse(result.generatedPrivateKeys), { "mail-key-1": "made-up-private-key" });
  } finally {
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mailbox rotate-keys sends only the flags it was given, as the service names them", async () => {
  const service = await serve(() => ({ status: 200, body: ensuredBody }));
  const dir = mkdtempSync(join(tmpdir(), "mail-door-"));
  try {
    const { stdio } = io();
    const code = await runCli(mailControlCli, ["mailbox", "rotate-keys", "inbox-agent", "--rotate-mailbox", "--reason", "lost laptop", "--token-file", tokenFile(dir), "--url", service.url], stdio);
    assert.equal(code, 0);
    assert.equal(service.calls[0]?.path, "/v1/mailboxes/rotate-keys");
    assert.deepEqual(service.calls[0]?.body, { agentId: "inbox-agent", rotateMailbox: true, reason: "lost laptop" });
  } finally {
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a refused token exits 1 with the service's message and the fix", async () => {
  const service = await serve(() => ({ status: 401, body: { ok: false, error: "unauthorized" } }));
  const dir = mkdtempSync(join(tmpdir(), "mail-door-"));
  try {
    const { err, stdio } = io();
    const code = await runCli(mailControlCli, ["mailbox", "ensure", "inbox-agent", "--token-file", tokenFile(dir), "--url", service.url], stdio);
    assert.equal(code, 1);
    assert.match(err.join(""), /unauthorized/);
    assert.match(err.join(""), /admin token/);
  } finally {
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a service that does not answer exits 3, and no token file is a usage error with its fix", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mail-door-"));
  try {
    const down = io();
    assert.equal(await runCli(mailControlCli, ["mailbox", "ensure", "inbox-agent", "--token-file", tokenFile(dir), "--url", "http://127.0.0.1:9"], down.stdio), 3);
    assert.match(down.err.join(""), /did not answer/);

    const missing = io();
    assert.equal(await runCli(mailControlCli, ["mailbox", "ensure", "inbox-agent", "--url", "http://127.0.0.1:9"], missing.stdio), 2);
    assert.match(missing.err.join(""), /--token-file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
