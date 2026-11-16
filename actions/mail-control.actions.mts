// The agent-facing operations of apps/mail-control, declared once. `ouro-actions.mts generate` writes the CLI command
// definitions and the MCP tools from these; the mail-control CLI (tools/mail-control-ax) runs them against the service.
import { defineAction, defineActions, field } from "../tools/ouro-actions/ouro-actions.mts";

const agentId = field.string({
  label: "Agent",
  description: "The agent's id: 2 to 63 letters, numbers, underscores or hyphens.",
  arg: true,
});

const ownerEmail = field.string({
  label: "Owner email",
  description: "The email address of the family member who delegates their mail to this agent.",
  optional: true,
  format: "email",
});

const source = field.string({
  label: "Source",
  description: "Where the delegated mail comes from. Defaults to hey when an owner email is given.",
  optional: true,
  maxLength: 64,
});

const sourceTag = field.string({
  label: "Source tag",
  description: "A short tag that tells this source's mail apart.",
  optional: true,
  maxLength: 64,
});

const mailboxAddress = field.string({
  label: "Mailbox address",
  description: "The agent's native mailbox address, such as agent@ouro.bot.",
});

const generatedPrivateKeys = field.string({
  label: "New private keys",
  description: "A JSON object of the new private keys, by key id. The service returns them once: store each value in the owning agent's vault before reporting setup complete.",
});

const healthDomain = field.string({ label: "Domain", description: "The domain the service gives mail addresses on." });

export const serviceHealth = defineAction({
  id: "service_health",
  consent: "read",
  label: "Check mail service",
  description: "Check that the mail service answers, and which domain it serves.",
  agent: "Check that mail-control answers, and the domain and counts it serves. Changes nothing.",
  input: {},
  output: {
    domain: healthDomain,
    mailboxes: field.integer({ label: "Mailboxes", description: "How many native mailboxes the registry holds." }),
    sourceGrants: field.integer({ label: "Source grants", description: "How many delegated source grants the registry holds." }),
  },
  cli: "health",
});

export const ensureMailbox = defineAction({
  id: "ensure_mailbox",
  consent: "write",
  label: "Set up mail",
  description: "Give the agent its mailbox, and any delegated mail, idempotently.",
  agent: "Set up the agent's mailbox and delegated mail; new keys come back once.",
  input: { agentId, ownerEmail, source, sourceTag },
  output: { mailboxAddress, generatedPrivateKeys },
  cli: "mailbox ensure",
});

export const rotateMailboxKeys = defineAction({
  id: "rotate_mailbox_keys",
  consent: "write",
  destructive: true,
  label: "Rotate mail keys",
  description: "Replace the mailbox's or the source grant's public keys with new ones.",
  agent: "Replace the mailbox's or source grant's keys; the old keys stop working for new mail.",
  input: {
    agentId,
    ownerEmail,
    source,
    sourceTag,
    rotateMailbox: field.boolean({ label: "Rotate mailbox", description: "Replace the native mailbox's keys.", optional: true }),
    rotateSourceGrant: field.boolean({ label: "Rotate source grant", description: "Replace the delegated source grant's keys.", optional: true }),
    reason: field.string({ label: "Reason", description: "Why the keys change, in a short line.", optional: true, maxLength: 256 }),
  },
  output: { mailboxAddress, generatedPrivateKeys },
  cli: "mailbox rotate-keys",
});

export default defineActions("mail-control", [serviceHealth, ensureMailbox, rotateMailboxKeys], { tool: "mail-control" });
