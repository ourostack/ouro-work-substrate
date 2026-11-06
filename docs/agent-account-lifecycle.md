# Agent Account Lifecycle

An Ouro Work account is created for an agent, not for a human. The account is the agent's work substrate identity: vault, native mail, delegated mail grants, private keys, setup state, audit, and recovery.

This lifecycle is deliberately one path. New agents and existing agents both travel through the same idempotent ensure flow. That keeps the system from splitting into "real setup", "migration setup", and "that thing one agent did once at midnight".

## Golden Path

When a human says, "Slugger, please set up email," the agent should guide the human through the experience. The human should not be handed raw CLI commands unless the step is genuinely human-only.

The desired flow:

1. The harness asks the agent to ensure its Ouro Work account.
2. The agent invokes the local Ouro setup path.
3. The CLI creates or repairs the agent vault account.
4. The CLI stores runtime credentials in the agent vault.
5. The CLI ensures the native mailbox, such as `slugger@ouro.bot`.
6. If a family member delegates mail, the CLI ensures a source grant alias such as `test.example.owner.slugger@ouro.bot`.
7. Mail Control returns newly generated private mail keys exactly once.
8. The CLI stores those keys in the owning agent vault before declaring setup ready.
9. Hosted Mail ingress sees only the public registry and stores encrypted messages.
10. The local agent runtime decrypts mail through vault-held keys and experiences mail as a sense.

## Account Records

For each agent, the stable desired state is:

- Vault account: `<agent>@ouro.bot`.
- Native mailbox: `<agent>@ouro.bot`.
- Mail private keys: stored only in the owning agent vault.
- Optional delegated aliases: source grants with owner/source provenance.
- Mail store: local file store in development, Azure Blob Storage in hosted production.

For Slugger right now:

- Vault: `slugger@ouro.bot`.
- Native mail: `slugger@ouro.bot`.
- Alex delegated HEY alias: `test.example.owner.slugger@ouro.bot`.
- HEY source: `hey`.
- Owner email: `owner@example.test`.

## Protections

- **Domain restriction:** hosted vault creation is limited to the configured substrate domain, default `ouro.bot`.
- **Authenticated control plane:** Mail Control and Vault Control require bearer tokens in production.
- **Rate limiting:** Vault creation is rate-limited by remote address and email.
- **Secret minimization:** Vault Control receives a password only to complete registration and never stores or logs it.
- **Hosted unreadability:** Mail ingress stores encrypted raw MIME and encrypted parsed private envelopes.
- **One-time key handoff:** Mail Control returns new private keys only when it creates a mailbox or source grant.
- **Recoverable discard:** discarded mail is retained as an auditable drawer, not bounced or deleted.
- **Human-only external actions:** registrar DNS, HEY forwarding/export, browser auth, MFA, production MX cutover, and autonomous sending stay at the keyboard.

## Native Mail Versus Delegated Mail

Native mail is mail addressed to the agent. Unknown senders belong in Screener until a decision creates an allow policy, links a friend, discards, or quarantines.

Delegated mail is mail a human intentionally routes to the agent. It carries owner/source provenance because the agent is reading on behalf of someone else. A delegated HEY alias can land in Imbox because the source grant itself is the trust act, but the message body is still untrusted external content.

Do not blur these. They overlap in UI and storage, but the agent's stance is different:

- Native: "Someone is contacting me."
- Delegated: "A family member gave me access to this stream so I can help."

## Existing Agents

Existing agents should be backfilled through the same ensure path as new agents. If an existing bundle already has some local state, the setup flow should repair missing hosted pieces rather than inventing a special migration mode.

A good repair flow is calm:

1. Show what exists.
2. Show what is missing.
3. Create only missing pieces.
4. Store private material in the vault.
5. Verify by reading back public registry health and local vault-held keys.

## Abuse And Recovery

The control plane should reject malformed agent ids, non-substrate domains, weak passwords, missing auth, and high-volume repeated requests.

The next scale step is explicit invite records, per-agent quotas, sender-policy revocation, and owner-visible recovery views. Those should extend this single account lifecycle rather than create a parallel onboarding path.

When something goes wrong, prefer recoverable drawers and clear audit over irreversible deletion. The human and agent should always be able to answer: "Why did the agent see this?" and "Why did the agent miss this?"
