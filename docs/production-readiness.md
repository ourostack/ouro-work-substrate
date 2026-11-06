# Production Readiness

Production-grade is not a vibe. It is a set of promises the system keeps when nobody is watching closely.

For Ouro Work, those promises are technical, operational, and emotional. The service has to be secure and scalable, yes, but it also has to leave future agents feeling oriented instead of haunted by unexplained cloud state.

## Current Bar

A change should not be considered production-ready unless these are true:

- `npm run ci:local` passes.
- GitHub `CI` passes on the PR.
- `main` is protected by the `test` status check.
- The deploy path uses GitHub OIDC, not long-lived Azure secrets.
- Runtime, infrastructure, and workflow changes merged to `main` deploy only after green CI.
- Docs-only changes skip Azure rollout.
- The deployed services expose healthy `/health` endpoints.
- Mail Control and Mail Ingress agree on mailbox/source-grant counts.
- Mailbox ensure is idempotent.
- New private mail keys are returned exactly once.
- Hosted mail payloads are encrypted at rest.
- Agent-side decryption works through vault-held private keys.
- DNS/MX repointing, HEY forwarding/export, browser auth/MFA, human-controlled live mail sends, and autonomous sending remain human-gated.

## Live Proof To Preserve

The production proof for Slugger established:

- Native mail: `slugger@ouro.bot`.
- Delegated HEY alias: `test.example.owner.slugger@ouro.bot`.
- Native inbound placement: Screener.
- Delegated HEY placement: Imbox.
- Storage: Azure Blob Storage encrypted payload records.
- Encryption: `RSA-OAEP-SHA256+A256GCM`.
- Deployment: Azure Container Apps through GitHub Actions and Azure OIDC.
- SMTP edge: public port `25` mapped to Mail Ingress target port `2525`.

Future changes do not need to reuse Slugger for every test, but they must preserve the same properties.

## Scalability Posture

The system scales by keeping responsibilities separate:

- Blob Storage is durable data and registry backing.
- Mail Ingress scales for inbound SMTP volume.
- Mail Control scales for account setup and repair.
- Vault Control scales conservatively because account creation is sensitive.
- Agent-side readers and senses stay in the harness, where private keys and lived context belong.

Before increasing traffic, decide whether the bottleneck is:

- SMTP edge capacity;
- registry refresh cadence;
- Blob Storage throughput;
- sender-policy and Screener processing;
- local agent decryption/read throughput;
- human review and recovery workflows.

Do not solve a human review bottleneck by giving hosted services more private authority. That is how systems become impressive and wrong.

## Change Checklist

For mail routing changes:

- Prove unknown recipients are rejected.
- Prove native and delegated recipients resolve differently.
- Prove placement is correct.
- Prove encrypted storage still decrypts with the expected private key.

For control-plane changes:

- Prove unauthenticated mutation requests fail.
- Prove invalid domains fail.
- Prove repeated ensure calls are idempotent.
- Prove token rotation does not require stale process memory.

For infra changes:

- Prove Bicep builds locally and in CI.
- Prove Docker images build in CI.
- Prove the deploy workflow uses the intended commit SHA.
- Prove rollback remains available through Container Apps revisions.

For docs changes:

- Update the runbook when commands or deployment behavior change.
- Update the deployment story when a gate moves from open to proven.
- Keep the first-read path kind enough that a new agent will actually follow it.

## Known Gates

These are intentionally not complete:

- Native provider-level inbound smoke from a human-controlled external mailbox.
- Delegated HEY forwarding/export setup.
- Autonomous sending.
- Owner-facing recovery views for discarded/quarantined mail.
- Invite records, per-agent quotas, and revocation tooling.

Gates are not failures. They are promises not to smuggle risk past the human.

## What Good Feels Like

A production-ready Ouro Work change should feel quiet after it lands. CI is green. Deploys are automatic. Rollback is clear. The docs know what happened. The agent can explain the trust boundary without squinting.

That quietness is the craft.
