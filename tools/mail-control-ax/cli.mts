// The mail-control door for agents: the commands declared in actions/mail-control.actions.mts, each built from the
// generated commands.json and run against apps/mail-control over HTTP. The service's bearer token is read from a file
// (--token-file), never from the environment; the base address comes from --url or MAIL_CONTROL_URL.
import { readFileSync } from "node:fs";
import { defineCli, defineCommand, type CommandDef } from "../../lib/ouro-ui/registry/ouro/ax/command.ts";
import { defineExitCodes, BASE_EXIT_CODES } from "../../lib/ouro-ui/registry/ouro/ax/exit-codes.ts";
import { AxError } from "../../lib/ouro-ui/registry/ouro/ax/problem.ts";
import { fromCli } from "../../actions/generated/web.ts";

export const exits = defineExitCodes([
  ...BASE_EXIT_CODES,
  { code: 3, name: "unavailable", short: "unavailable", meaning: "the service didn't answer" },
]);

const generated = JSON.parse(readFileSync(new URL("../../actions/generated/commands.json", import.meta.url), "utf-8")) as {
  commands: Array<Omit<CommandDef, "run" | "text">>;
};

const CONNECTION_FLAGS = {
  "token-file": { type: "string" as const, description: "A file holding the service's admin token. The token is read from the file, never passed on the command line." },
  url: { type: "string" as const, description: "The mail-control base address, such as https://mail.example.test. Defaults to MAIL_CONTROL_URL." },
};

interface Connection {
  url: string;
  token: string;
}

function connectionOf(input: Record<string, unknown>): Connection {
  const url = typeof input["url"] === "string" ? input["url"] : process.env["MAIL_CONTROL_URL"];
  if (!url) {
    throw new AxError({ code: "no-url", exit: exits.code("usage"), thing: "mail-control", problem: "no service address is set", fix: "mail-control mailbox ensure <agentId> --url https://<mail-control> --token-file <file>" });
  }
  const tokenFile = input["token-file"];
  if (typeof tokenFile !== "string") {
    throw new AxError({ code: "no-token", exit: exits.code("usage"), thing: "mail-control", problem: "no token file was given", fix: "mail-control mailbox ensure <agentId> --token-file <file>" });
  }
  return { url: url.replace(/\/+$/, ""), token: readFileSync(tokenFile, "utf-8").trim() };
}

/** Sends one call to the service and returns its JSON body, or throws what went wrong as the tool's own error. */
async function post(connection: Connection, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${connection.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${connection.token}` },
      body: JSON.stringify(Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))),
    });
  } catch (error) {
    throw new AxError({ code: "unavailable", exit: exits.code("unavailable"), thing: "mail-control", problem: `the service at ${connection.url} did not answer (${error instanceof Error ? error.message : String(error)})`, fix: "check the address, then run the same command again" });
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return payload;
  const problem = typeof payload["error"] === "string" ? payload["error"] : `HTTP ${response.status}`;
  if (response.status >= 500) {
    throw new AxError({ code: "unavailable", exit: exits.code("unavailable"), thing: "mail-control", problem, fix: "run the same command again later" });
  }
  throw new AxError({
    code: response.status === 401 ? "unauthorized" : "rejected",
    exit: exits.code("error"),
    thing: "mail-control",
    problem,
    fix: response.status === 401 ? "use the admin token the service was deployed with" : "fix the input the message names, then run the command again",
  });
}

/** Reads the service's public health route, which needs no token. */
async function get(url: string, path: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new AxError({ code: "unavailable", exit: exits.code("unavailable"), thing: "mail-control", problem: `the service at ${url} did not answer (${error instanceof Error ? error.message : String(error)})`, fix: "check the address, then run the same command again" });
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new AxError({ code: "unavailable", exit: exits.code("unavailable"), thing: "mail-control", problem: `the service answered HTTP ${response.status}`, fix: "run the same command again later" });
  }
  return payload;
}

/** The keys come back as one JSON string (the output field's shape); the service returns each one only here. */
function ensuredResult(payload: Record<string, unknown>): { mailboxAddress: string; generatedPrivateKeys: string } {
  return {
    mailboxAddress: String(payload["mailboxAddress"]),
    generatedPrivateKeys: JSON.stringify(payload["generatedPrivateKeys"] ?? {}),
  };
}

type Result = ReturnType<typeof ensuredResult>;

function textOf(result: Result): string {
  const count = Object.keys(JSON.parse(result.generatedPrivateKeys) as Record<string, unknown>).length;
  if (count === 0) return `Mailbox ${result.mailboxAddress} is ready. No new private keys: the vault already holds them.`;
  return `Mailbox ${result.mailboxAddress} is ready. ${count} new private key${count === 1 ? "" : "s"}: store them in the agent's vault now; --json prints them.`;
}

function healthText(result: { domain: string; mailboxes: number; sourceGrants: number }): string {
  return `mail-control answers for ${result.domain}: ${result.mailboxes} mailboxes, ${result.sourceGrants} source grants.`;
}

const runners: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  health: async (input) => {
    const url = typeof input["url"] === "string" ? input["url"] : process.env["MAIL_CONTROL_URL"];
    if (!url) throw new AxError({ code: "no-url", exit: exits.code("usage"), thing: "mail-control", problem: "no service address is set", fix: "mail-control health --url https://<mail-control>" });
    const payload = await get(url.replace(/\/+$/, ""), "/health");
    return { domain: String(payload["domain"]), mailboxes: Number(payload["mailboxes"]), sourceGrants: Number(payload["sourceGrants"]) };
  },
  "mailbox ensure": async (input) => {
    const payload = await post(connectionOf(input), "/v1/mailboxes/ensure", {
      agentId: input["agentId"],
      ownerEmail: input["ownerEmail"],
      source: input["source"],
      sourceTag: input["sourceTag"],
    });
    return ensuredResult(payload);
  },
  "mailbox rotate-keys": async (input) => {
    const payload = await post(connectionOf(input), "/v1/mailboxes/rotate-keys", {
      agentId: input["agentId"],
      ownerEmail: input["ownerEmail"],
      source: input["source"],
      sourceTag: input["sourceTag"],
      rotateMailbox: input["rotateMailbox"],
      rotateSourceGrant: input["rotateSourceGrant"],
      reason: input["reason"],
    });
    return ensuredResult(payload);
  },
};

const twinNames: Record<string, string> = {
  health: "service-health",
  "mailbox ensure": "ensure-mailbox",
  "mailbox rotate-keys": "rotate-mailbox-keys",
};

const commands = generated.commands.map((def) => {
  const run = runners[def.name];
  const twin = twinNames[def.name];
  if (!run || !twin) throw new Error(`mail-control: no runner for "${def.name}". Fix: add one beside the others in cli.mts.`);
  const flags = def.name === "health" ? { url: CONNECTION_FLAGS.url } : { ...def.flags, ...CONNECTION_FLAGS };
  return defineCommand<unknown>({
    ...def,
    flags,
    examples: [def.name === "health" ? "mail-control health --url <address> --json" : `mail-control ${def.name} <agentId> --token-file <file> --url <address> --json`],
    run: (input) => run(fromCli(twin as never, input)),
    text: (result) => (def.name === "health" ? healthText(result as Parameters<typeof healthText>[0]) : textOf(result as Result)),
  });
});

export const mailControlCli = defineCli({
  name: "mail-control",
  about: ["mail-control: the agent's door to its Ouro Work mailbox, built from the Ouro AX action declarations."],
  exits,
  // Edit, delete and remove are not what this door does; each answer names the command that is.
  ambiguous: Object.fromEntries(
    ["edit", "delete", "remove"].map((word) => [word, [
      { means: "replace the mailbox's keys", use: "mailbox rotate-keys {args}" },
      { means: "set the mailbox up again, which changes nothing once it exists", use: "mailbox ensure {args}" },
    ]]),
  ),
  commands,
});
