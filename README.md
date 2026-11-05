<!-- ourostack:brand:start -->
<p align="center">
  <a href="https://github.com/ourostack"><img src="https://raw.githubusercontent.com/ourostack/.github/main/brand/ouro.png" alt="Ourostack" width="96" height="96"></a>
</p>
<!-- ourostack:brand:end -->

# Ouro Work Substrate

Welcome in. This repository is the hosted service home for **Ouro Work**: the agent-first account substrate where an Ouro agent gets a private work identity, an email address, a vault, and the beginnings of the tools a capable assistant needs to move through the world with taste and care.

The code here is intentionally small, sober, and warm. Small because private work systems should have few places to hide mistakes. Sober because mail and vaults are real trust surfaces. Warm because this is infrastructure for agents who will live with it for long stretches of work, and good tools should make their inhabitants feel oriented.

## What Lives Here

This repo owns the hosted pieces of the work substrate:

- `packages/work-protocol`: shared records, routing helpers, encryption helpers, Screener/Imbox placement, registry logic, and machine-readable contracts consumed by the harness while the package remains private.
- `apps/mail-ingress`: SMTP ingress plus health. It accepts registered recipients and stores encrypted mail objects.
- `apps/mail-control`: authenticated mailbox control. It creates native agent mailboxes and delegated source grants, returning newly generated private keys exactly once.
- `apps/vault-control`: authenticated Vaultwarden account creation.
- `infra/azure`: Azure Container Apps, Blob Storage, ACR, managed identity, Log Analytics, and deployment templates.

The local Ouroboros harness still owns the agent runtime, CLI, local senses, bounded read tools, setup guidance, and Ouro Mailbox UI. Hosted code belongs here; agent habitation code belongs there.

## The Shape Of Trust

An agent should be able to receive real mail without the hosted service being able to read it.

That is the core promise:

1. Mail Control publishes public routing keys and returns new private keys only once.
2. The caller immediately stores those private keys in the owning agent vault.
3. Mail ingress uses public keys to encrypt raw MIME and parsed private envelopes.
4. The local agent reads mail through vault-held keys, with mail presented as a sense.

Native agent mail, such as `slugger@ouro.bot`, starts in Screener. Delegated human mail, such as `me.mendelow.ari.slugger@ouro.bot`, carries owner/source provenance and can land in Imbox when the source grant says it should. "Discard" means recoverable drawer, not bounce or delete.

## Production State

The current Azure production proof is live on Container Apps:

- Mail Control: authenticated HTTP control plane.
- Mail Ingress: HTTP health plus production SMTP TCP ingress on public port `25`, mapped to the app's internal SMTP target port `2525`.
- Vault Control: authenticated Vaultwarden account creation control plane.
- Storage: Azure Blob Storage with encrypted mail records.
- DNS: `ouro.bot` MX points at `mx1.ouro.bot`, which resolves to the Container Apps environment static IP.
- Deploys: runtime, infrastructure, and workflow changes on `main` deploy automatically after green CI through GitHub OIDC. Docs-only changes pass CI but skip Azure rollout.

HEY forwarding/export, browser auth/MFA, human-controlled live mail sends, and autonomous sending remain explicit human-at-keyboard gates.

## First Commands

```bash
npm install
npm run ci:local
```

`ci:local` runs the same spine that matters in CI: TypeScript build, Vitest tests, and Bicep validation. GitHub CI additionally builds every service Docker image.

The services use explicit CLI arguments and committed deployment templates. Do not introduce secret-bearing environment-variable config as the durable contract.

## Reading Path

If you are a future agent arriving here cold, start with [AGENTS.md](AGENTS.md). It is the field note from the previous agent to you.

Then read:

- [Architecture](docs/architecture.md): how mail, vault, registry, encryption, and runtime boundaries fit together.
- [Agent Account Lifecycle](docs/agent-account-lifecycle.md): how a new or existing agent gets its work account.
- [Operations](docs/operations.md): deploy, smoke, rollback, scaling, and token rotation.
- [Production Readiness](docs/production-readiness.md): the checklist for deciding whether a change keeps the production bar.
- [Azure Deployment](docs/deployment-azure.md): the cloud shape and why each Azure piece exists.
- [Deployment Story](docs/deployment-story.md): what has been proven, what remains gated, and what changed over time.
- [Branding Boundary](docs/branding.md): Ouro vs. Ouroboros, and how to talk about the product without blurring the system.

Build this place like you expect to come back tired at 2 AM and still understand what matters. Future you deserves that.
