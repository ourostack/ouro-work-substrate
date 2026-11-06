# Deployment Story

This repository is the hosted service home for Ouro Work. It does not replace the local Ouroboros harness runtime; it gives that runtime a clean, deployable service boundary for mail, vault, and future work surfaces.

This doc is the record of how the deploy story changed. Keep it honest. A future agent should be able to tell what is proven, what is gated, and what is merely imagined.

## Current State

- Hosted service code lives here: shared protocol, Mail Ingress, Mail Control, Vault Control, Dockerfiles, and Azure infra.
- The Ouroboros harness still owns local setup commands, the Mail sense, bounded mail tools, local development stores, and Ouro Mailbox.
- Azure proof deployment is live from this repo.
- Runtime, infrastructure, and workflow changes on `main` deploy automatically after green CI through GitHub OIDC. The skip decision compares the commit-tagged image currently running in Azure with the CI-tested commit, so docs-only changes skip Azure rollout only when the whole range since the deployed image is documentation-only.
- Mail Ingress listens on internal target port `2525` and is exposed on public SMTP port `25`.
- Mail Ingress code and deploy templates support STARTTLS from mounted PEM secrets, SMTP `SIZE`, connection/rate limits, recipient transaction limits, unknown-recipient rejection, and body-safe transient failure logging.
- Production DNS/MX for `ouro.bot` points at `mx1.ouro.bot`.
- Autonomous sending is not enabled.

## What CI Must Prove

The `CI` workflow runs on PRs and pushes to `main`:

- `npm ci`
- `npm test`
- `az bicep build --file infra/azure/main.bicep`
- `az bicep build --file infra/azure/registry.bicep`
- Docker build for `apps/mail-control`
- Docker build for `apps/mail-ingress`
- Docker build for `apps/vault-control`

Those checks are intentionally boring: the hosted service should always be buildable before anyone thinks about Slugger live mail.

## Deployment Phases

### Phase 1: Local And CI Proof

Run the services locally where possible, validate protocol behavior with tests, compile Azure infra, and build both container images in CI.

Status: complete and continuously enforced.

### Phase 2: Azure Proof Deployment

Build and push images to ACR, then deploy `infra/azure/main.bicep` into an Azure resource group with the manual **Deploy Azure** workflow. The proof should use external TCP `2525` first and verify:

- Mail Control can create `slugger@ouro.bot` and `test.example.owner.slugger@ouro.bot` in the Blob-backed public registry.
- SMTP recipient rejection for unknown recipients.
- Accepted mail lands in Azure Blob Storage encrypted.
- Slugger can decrypt through vault-held private keys.
- Health endpoints are reachable.
- Vault control rejects unauthenticated and non-`ouro.bot` account requests.

Status: complete. The live proof verified native `slugger@ouro.bot` mail to Screener, delegated `test.example.owner.slugger@ouro.bot` mail to Imbox, encrypted Blob storage, and decryption with the one-time private key returned by Mail Control.

### Phase 3: Production Ingress Decision

Decide whether Azure Container Apps can support the final production MX path on port `25`. If not, keep Container Apps for control/services and add a small Azure mail edge for SMTP ingress.

Status: complete for the Container Apps edge decision. The app is deployed with public port `25` mapped to target port `2525`, TLS secrets mounted, STARTTLS verified on the app path, DNS/MX cut over to `mx1.ouro.bot`, and external TCP reachability confirmed from multiple check-host nodes. A local direct port-25 SMTP transcript may fail from networks that block outbound SMTP; use real mailbox-provider sends for the next delivery proof.

### Phase 4: Deployment Automation

Phase 4 is deploy-after-green-CI automation. It should use the exact CI-tested commit, Azure OIDC, ACR image tags tied to the commit SHA, serialized environment deployment, and range-aware docs-only skip behavior.

Status: complete. A workflow-run deploy now starts after successful `CI` on `main`, inspects the current `mail-ingress` Container App image tag, deploys conservatively when that image cannot be matched to the tested history, and skips only when every change since the deployed image is documentation-only. The `prod` GitHub Environment OIDC subject is authorized in Azure.

Manual deployment remains available for token rotation, repairs, and proof-port changes.

### Phase 5: Production Mail Edge

Phase 5 is the real mail-delivery proof: native provider delivery to `slugger@ouro.bot`, delegated HEY forwarding/export, outbound provider sending, delivery events, and operational monitoring.

Status: gated on live provider-level smoke, not a separate approval ceremony. The current deploy lane keeps hosted services as private commit-addressed Docker images built by GitHub Actions and applied through Bicep; these services are not published as npm packages.

Outbound provider implementation now has a protocol and hosted callback lane: provider submission records `submitted` with provider ids, and Event Grid delivery reports can reconcile later delivered/bounced/suppressed/quarantined/spam-filtered/failed outcomes without treating API acceptance as final delivery. The harness release lane remains npm packaging and install verification; the hosted service lane remains CI-tested Azure deployment. Live ACS domain authentication, DNS records, webhook subscription, and end-to-end outbound smoke are still Phase 5 proof work.

## Branch Protection

`main` should require the CI `test` status check before merge. Admins may still need emergency bypass while this repo is young, but normal work should flow through PRs.

Dependabot watches npm and GitHub Actions weekly. CODEOWNERS routes all changes to the repository owner until a broader Ouro operations team exists.

## Slugger Testing Impact

Slugger local testing can resume before auto-deployment. These are not blocked by hosted deployment automation:

- HEY MBOX import.
- Local Mail sense readiness.
- Bounded mail reads.
- Screener decisions.
- Ouro Mailbox audit.

Live inbound forwarding to `@ouro.bot` should use the proven public edge, but HEY browser auth/MFA/export/forwarding confirmation and any live mail sent from a human-controlled account remain explicit human actions.
