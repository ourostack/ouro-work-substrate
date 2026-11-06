# Planning: Mail Production Path

**Status**: approved
**Created**: 2026-04-22 13:09

## Goal
Bring Agent Mail to full production shape across Ouro Work Substrate and the Ouroboros agent harness without muddying the two mailbox stories:

1. **Agent-native mail sense**: the agent can autonomously receive and, under explicit policy, send mail as its own `@ouro.bot` identity. This is like iMessage or Teams as a sense, with HEY-inspired Imbox/Screener semantics coupled to the existing trust system.
2. **Delegated human mailbox source**: the agent has full delegated read access to a human mailbox source, starting with Alex's HEY mailbox, through backfill export/import and all future forwarded mail. This is the executive-assistant lens into the human's mailbox, not the agent's own correspondence and not permission to send as the human by default.

The production work includes hosted mailbox provisioning, native and delegated inbound mail over real MX, HEY-assisted delegation, authenticated outbound sending, agent-readable encrypted storage, recovery tooling, operations docs, deployment, and live smoke tests.

This is full-moon scope. It is not constrained to one PR, one repo, one turn, or an inbound-only slice.

## Upstream Work Items
- None

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Make changes in `ouro-work-substrate` and, when needed, the local harness checkout at `/Users/maintainer/Projects/ouroboros-agent-harness` whose `origin` remote is `ourostack/ouroboros`; keep each repo's planning/branch rules and PR discipline.
- Preserve the foundation distinction from the prior task docs: native agent correspondence and delegated human mailbox access share Mailroom primitives but have different authority semantics, UI labels, attention behavior, trust rules, and recovery paths.
- Treat `ouro.bot` as the Ouro Work mail domain and intentionally move away from the current broken Microsoft 365-shaped MX/SPF setup after backup, proof, and explicit cutover approval.
- Make hosted Mail Control the production provisioning truth for `ouro account ensure` / `ouro connect mail`: public registry in Blob, newly generated private keys returned once, private keys stored immediately in the owning agent vault.
- Preserve local development setup as an explicit mode, but prevent local-only registry/key generation from being mistaken for production readiness.
- Keep shared protocol semantics synchronized across repos, especially mailbox records, source-grant aliases, key ids, placements, outbound statuses, and encryption/decryption behavior.
- Configure the local harness to read and update the hosted Azure Blob mail store through a least-privilege credential stored outside Git and preferably inside the agent vault.
- Patch the harness vault item/credential surface before DNS/mail implementation: expose generic human-facing `ouro vault item` commands, keep notes first-class, reserve `ouro connect` for harness-managed capabilities, and make templates/compatibility aliases convenience layers over ordinary vault items with no assumed use.
- Prove native inbound `slugger@ouro.bot` over real SMTP port 25, with unknown native senders landing in Screener, known/screened-in senders reaching Imbox, and sense attention never injecting raw bodies into prompt context.
- Prove delegated HEY inbound `test.example.owner.slugger@ouro.bot` over real SMTP port 25, with owner/source provenance, source-scoped policy, and UI/tooling that always identifies it as Alex's HEY mail delegated to Slugger.
- Backfill Alex's delegated HEY source with export/import, label imported mail as historical/fresh-through material, and avoid flooding Screener/attention during archive import.
- Make future HEY mail flow through forwarding or HEY for Domains external Extensions into the delegated source alias, with setup state and recovery when forwarding is missing, stale, or lossy.
- Use the existing Azure Container Apps environment and static IP as the first production inbound candidate: expose SMTP on port 25, create `mx1.ouro.bot` as the MX host, and only fall back to a dedicated mail edge if Container Apps cannot pass the external port-25 proof.
- Add production SMTP behavior: STARTTLS with a valid certificate for the MX host, explicit max message size, clear transient/permanent SMTP response codes, connection/rate limits, recipient limits, protocol timeouts, and useful logs/metrics.
- Add DNS automation and runbooks as workflow binding plus provider driver: domain, driver, explicit vault item path, resource allowlist, current-record backup, dry-run, apply, verification, rollback, and audit notes for A/MX/TXT/CNAME changes. Porkbun is the current provider driver for `ouro.bot`, not the credential model.
- Automate HEY forwarding setup where browser automation can safely do it, while treating login, MFA, CAPTCHA, and final HEY confirmation as human-at-keyboard gates.
- Make the forwarding target lifecycle explicit: `ouro account ensure` / `ouro connect mail` creates or repairs the delegated alias; the HEY onboarding step consumes that alias after hosted ingress and MX are proven.
- Add recovery handling for every brittle setup edge: missing referenced vault item, missing required secret fields, DNS propagation, port-25 exposure failure, Mail Control failure, vault locked/missing, one-time key loss, registry/key drift, HEY forwarding failure, missing forwarded mail, Blob access failure, decryption failure, wrong placement, outbound provider failure, and delivery events.
- Implement production outbound sending through authenticated provider submission, not direct unauthenticated SMTP from Azure. Azure Communication Services Email is the first candidate because it fits the existing Azure shape and supports SMTP auth, custom-domain sender authentication, and Event Grid delivery reports.
- Extend outbound records and UI/tooling so `draft`, `submitted`, provider-accepted/sent, delivered, bounced, quarantined/spam-filtered, failed, and event-reconciled states are not collapsed into a misleading `sent`.
- Implement policy-governed autonomous sending for agent-native mail. The safe shape is: default draft/confirmation for unknown or risky recipients, explicit allow policy for autonomous low-risk native-agent sends, rate/recipient limits, audit, kill switch, and no autonomous send from delegated human sources.
- Add ACS/domain-auth DNS automation and verification for SPF, DKIM, DKIM2 where required, and DMARC policy/reporting appropriate for a young production mail domain.
- Wire ACS/Event Grid delivery reports or an equivalent provider callback path into auditable outbound records.
- Update operations, deployment, account lifecycle, harness setup, troubleshooting, and golden-path validation docs so a future agent can recover without re-discovering the edges.
- Add targeted unit, integration, smoke, and deployment checks, with 100% coverage on all new code in the touched repos.

### Out of Scope
- Building a full read/write webmail client or destructive mail controls.
- Letting the hosted service read private mail bodies or retain private mail keys.
- Treating HEY forwarding as lossless or permanent; HEY itself warns that forwarding can miss spam-classified mail and can be affected by mail-authentication behavior.
- Sending as Alex or another human identity unless a separate explicit delegated-send design is approved. Full-moon outbound means Slugger can send as `slugger@ouro.bot` under native-agent mail policy.
- Silently bypassing browser auth, MFA, or secret-entry gates. The agent may execute approved API/browser steps, but the human remains the authority for actual credentials and browser challenges.
- Preserving current Microsoft 365 mail behavior for `ouro.bot`; no required behavior has been identified there, and the current MX target is dead.

## Completion Criteria
- [ ] `ouro account ensure` / `ouro connect mail` production mode calls hosted Mail Control, writes returned one-time private keys into the agent vault, configures the hosted Blob store reader, enables the Mail sense, and reports native plus delegated addresses without printing private keys.
- [ ] Re-running setup is idempotent: no duplicate registry records, no lost private keys, clear "already configured" output, and repair guidance when hosted registry, local registry, vault config, or Blob settings disagree.
- [ ] Key-loss recovery is explicit: the system detects missing vault-held private keys, does not silently regenerate incompatible keys, and offers a human-approved rotation/repair path with a warning that old encrypted mail needs the old key or vault backup.
- [ ] The harness and work-protocol models stay synchronized by dependency, generator, or contract tests; outbound statuses and source-grant alias semantics cannot drift silently between repos.
- [x] The harness has a production generic vault item/credential surface for non-runtime credentials, with stable item names/paths, hidden secret entry, optional public fields, editable notes, tags/folder-ish organization, timestamps/provenance, metadata-only status/list, reserved-item guardrails, docs, and tests. `vault ops porkbun` remains only a deprecated compatibility alias over an ordinary vault item.
- [x] The harness vault-item branch is merged, published through the harness npm release lane, and installed locally before DNS/mail workflow code depends on the new surface.
- [ ] DNS/mail production workflows use explicit non-secret bindings that reference vault item paths; no code or docs treat the referenced item as an ops credential, authority, Porkbun credential, DNS credential, or provider-shaped ontology.
- [ ] Existing `ouro.bot` DNS records are backed up before changes; DNS automation has dry-run, apply, verify, and rollback modes.
- [ ] `mx1.ouro.bot` resolves to the proven production inbound edge, and `ouro.bot` MX no longer points at `ouro-bot.mail.protection.outlook.com` before live mail is declared ready.
- [ ] Port 25 is externally reachable on the final MX target and real SMTP delivery succeeds without specifying a nonstandard port.
- [ ] STARTTLS is advertised with a valid certificate for the MX host; certificate installation and renewal are documented and tested.
- [ ] SMTP policy is tested for unknown recipient rejection, accepted recipient storage, message-too-large handling, parse/storage failures as transient where appropriate, recipient limits, rate limits, and logging without body leakage.
- [ ] Native live mail to `slugger@ouro.bot` reaches encrypted Azure Blob storage, decrypts through Slugger's vault-held key, appears in `mail_recent` / Ouro Outlook, and lands in Screener when the sender is unknown.
- [ ] Native live mail to `slugger@ouro.bot` behaves as a sense: it reports envelope/status/freshness/attention compactly, does not inject bodies, supports Screener decisions through the trust system, and can drive cross-sense attention when policy allows.
- [ ] Delegated HEY mail to `test.example.owner.slugger@ouro.bot` reaches encrypted Azure Blob storage, decrypts through Slugger's vault-held key, carries `ownerEmail=owner@example.test` and `source=hey`, and is visibly source-scoped everywhere.
- [ ] HEY MBOX backfill imports Alex's mailbox into the delegated source with provenance, freshness/fresh-through metadata, dedupe, audited bounded reads, and no archive-import wake storm.
- [ ] HEY forwarding onboarding can be run by the agent as far as browser automation safely permits, falls back to guided human steps for auth/MFA/blocked automation, records setup state, and verifies a forwarded HEY message end to end.
- [ ] Recovery docs and tooling cover partial failures at each step: DNS pending/wrong, port 25 down, Mail Control unavailable, vault locked, key mismatch, HEY forwarding unverified, forwarded mail missing, Blob credential failure, decryption failure, placement/provenance wrong, and provider send failure.
- [ ] Production outbound is configured through authenticated provider submission, with credentials stored outside Git and sender-domain authentication verified.
- [ ] Agent-native outbound can send from `slugger@ouro.bot`, records provider message ids, distinguishes confirmed/manual sends from policy-governed autonomous sends, refuses unsafe or out-of-policy autonomous sends, and keeps BCC/body privacy out of logs and unsafe summaries.
- [ ] Delegated human mail does not grant send-as-human authority; replies or follow-ups based on Alex's HEY mail draft/send from the agent identity unless a future explicit delegated-send product is approved.
- [ ] Outbound delivery events or provider callbacks update auditable records so provider acceptance, delivery, bounce, suppression, quarantine/spam filtering, and failure are distinguishable.
- [ ] SPF, DKIM, DKIM2 where required, and DMARC records for the selected sender domain are documented, applied through the DNS workflow, and verified after propagation.
- [ ] Azure deployment, GitHub Actions, secrets/variables, and runbooks support the final inbound and outbound shape without local one-off production drift.
- [ ] Hosted substrate packaging/deployment is documented as private commit-addressed Docker images plus Bicep/GitHub Actions deploy, while any shared protocol exception is handled by a package or contract release gate.
- [x] Branch protections for both `ouro-work-substrate` and `ouroboros` require the intended green checks, enforce admins, require linear history, and require conversation resolution.
- [ ] Live smoke test proves: hosted health, Mail Control auth, mailbox/source ensure, SMTP port 25 accept/reject, encrypted Blob write, vault decryption, Screener/Imbox placement, HEY forwarded mail, confirmed outbound send, delivery event reconciliation, and Ouro Outlook audit.
- [ ] `npm run ci:local` passes in `ouro-work-substrate`.
- [ ] The relevant harness CI/test command passes in `/Users/maintainer/Projects/ouroboros-agent-harness`.
- [ ] 100% test coverage on all new code.
- [ ] All tests pass.
- [ ] No warnings.

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- None remaining after the 2026-04-22 full-moon feedback.
- Human approval/process gates are waived for this task. Remaining gates are genuine external inputs: missing secret material, vault unlock, browser/MFA steps for HEY, and any provider/portal confirmation that cannot be completed through current CLI/API access.

## Decisions Made
- Scope is full-moon: inbound, outbound, DNS, HEY onboarding, hosted provisioning, local harness integration, recovery, docs, deployment, and live smoke tests all belong to this program.
- Prior foundation docs were reviewed and are authoritative context: the mail story has two lanes, native agent mail sense and delegated human mailbox source, and the production plan must keep them visibly separate.
- Agent-native mail is Slugger's own correspondence at `slugger@ouro.bot`; delegated HEY mail is Alex's mailbox content copied into Slugger's work substrate under owner/source provenance.
- Full-moon includes policy-governed autonomous native-agent sending. This does not imply sending as Alex, sending from delegated source aliases, or bypassing trust/rate/audit controls.
- Work may span `ouro-work-substrate` and the local harness checkout at `/Users/maintainer/Projects/ouroboros-agent-harness` / `ourostack/ouroboros`; do not constrain implementation to the hosted repo if the local agent experience needs harness changes.
- Packaging and deployment are three coordinated release lanes: harness CLI/runtime changes ship through the npm-published `@ouro.bot/cli` / `ouro.bot` product lane; hosted substrate apps ship as private commit-addressed Docker images deployed by Bicep/GitHub Actions; shared mail protocol semantics must either become a consumed package boundary or be protected by generated/schema contract tests.
- `ouro.bot` is the intended Ouro Work mail domain.
- The current HEY bounce is expected: `ouro.bot` MX resolves to `ouro-bot.mail.protection.outlook.com`, and that hostname currently has no A/CNAME answer.
- The current Microsoft 365-shaped TXT/SPF records are not a constraint to preserve; back them up before changing them.
- Current Azure production evidence: Container Apps environment `ouro-prod-cae` has default domain `blueflower-44af4710.eastus2.azurecontainerapps.io` and static IP `20.10.114.197`.
- Current mail ingress evidence: `ouro-prod-mail-ingress.blueflower-44af4710.eastus2.azurecontainerapps.io` is deployed, HTTP target port is `8080`, and additional external TCP currently exposes only port `2525`.
- Proof port `2525` is reachable; port `25` is not currently exposed and must be proven before MX cutover.
- Primary inbound plan: expose mail ingress on port `25` in the existing VNet-backed Container Apps environment, point `mx1.ouro.bot` at the environment static IP, then set root MX to `mx1.ouro.bot` only after direct external SMTP proof. Fall back to a dedicated mail edge if this fails.
- STARTTLS should be included before production MX is declared ready. Plaintext SMTP may remain as opportunistic fallback for senders that do not upgrade, but the service should advertise STARTTLS with a valid MX-host certificate.
- Porkbun is the current DNS driver for `ouro.bot`. Use it as the first DNS driver for backup/dry-run/apply/rollback once the workflow binding references a usable vault item. The vault item itself is not a DNS credential, authority, Porkbun credential, or provider-shaped ontology.
- `ouro account ensure` / `ouro connect mail` creates the delegated forwarding target alias. HEY setup should not create the alias; it should configure HEY to forward to the already verified source-grant alias.
- Browser automation for HEY is desirable, but auth/MFA/CAPTCHA and final confirmation are human-at-keyboard gates. The automation must be resumable and able to fall back to exact guided steps.
- Direct outbound SMTP from Azure is not the production sending strategy. Use authenticated provider submission, with ACS Email as the first candidate.
- Provider acceptance is not final delivery. Outbound records must model submission, provider acceptance, delivery, bounce/suppression/quarantine/spam filtering, and failure separately.
- Current harness setup can create local Mailroom registry/key state without calling hosted Mail Control. Production setup must close this gap or production ingress can encrypt to public keys the local agent does not have.
- Current harness reader already has an Azure Blob store shape, but production setup must configure the actual hosted Blob coordinates and least-privilege credential path.
- Current outbound records store `text` directly in outbound JSON; production outbound needs a privacy review before writing sent bodies to Blob-backed stores.
- Mail private keys remain in the owning agent vault, not Blob Storage, GitHub, Container Apps, logs, or scratch docs.
- The harness already has agent-facing `credential_*` tools and a generic Bitwarden/Vaultwarden `CredentialStore`, but the human-facing CLI overfit on `vault ops porkbun` and harness origin added `Operational Credentials` plus `ops-credential/porkbun` as first-class vocabulary. First production work must fix those stronger signals so a future agent sees vault item/credential as the primitive: stable item name/path, secret material, optional public fields, freeform notes, organization, timestamps/provenance, and no assumed use.
- Branch protection verification on 2026-04-22: `ouro-work-substrate/main` requires strict `test` and `coverage`, enforces admins, requires linear history, and requires conversation resolution; `ouroboros/main` requires `coverage`, enforces admins, requires linear history, and requires conversation resolution.

## Context / References
- `AGENTS.md`: trust invariants, repo boundary, human-only gates, and task workflow.
- `README.md`: hosted repo boundary and production state.
- `docs/architecture.md`: Mail Control writes the public registry and returns new private keys exactly once; only the local agent with vault-held keys reads private mail.
- `docs/agent-account-lifecycle.md`: desired ensure flow and recovery posture.
- `docs/deployment-story.md`: Phase 3/5 are still the open production ingress and mail edge decisions.
- `docs/operations.md`: smoke tests, deploy path, rollback, and human-only gates.
- `.github/workflows/deploy-azure.yml`: post-merge deployment hook triggered by successful CI on `main`; checks out the exact tested SHA, compares it to the commit-tagged image currently deployed in Azure, skips only when the full deployed-image-to-tested-commit range is docs-only, builds/pushes commit-tagged Docker images, and deploys Bicep.
- `infra/azure/main.bicep`: mail ingress already supports parameterized SMTP target/exposed ports through Container Apps additional TCP port mappings.
- `apps/mail-control/src/server.ts`: production ensure endpoint is `POST /v1/mailboxes/ensure`; returns `mailboxAddress`, `sourceAlias`, generated private keys, and registry revision.
- `apps/mail-ingress/src/server.ts`: current SMTP server disables `AUTH` and `STARTTLS`; production TLS posture is a required code change.
- `packages/work-protocol/src/mail.ts`: current outbound status is only `draft | sent | failed`; full-moon outbound requires a richer model.
- `packages/work-protocol/package.json`: currently `private: true`; cross-repo protocol drift should be closed by making this a consumed package or adding generated/schema contract tests.
- `slugger/tasks/2026-04-22-1308-doing-mail-production-path/full-moon-work-suite-refresh.md`: fresh post-Unit-0c work-suite refresh covering packaging/deployment lanes, branch protection facts, and shared-contract risk.
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-20-2100-email-access-research-proposal/proposal.md`: original Mailroom research; HEY lacks programmatic access, MBOX import is bootstrap/archive, forwarding is useful but not a source of truth.
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-20-2319-proposal-agent-native-mail.md`: agent-native `@ouro.bot` mail proposal; Mail is a sense, source aliases are delegated copies, and native/delegated content must remain labeled differently everywhere.
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1434-ideation-agent-mail-user-stories.md`: explicit two-story user-story map for native agent mail and delegated human mail source; Screener/discard/recovery semantics.
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1447-planning-agent-mail-whole-moon.md`: foundation planning doc for local whole-moon implementation.
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1447-doing-agent-mail-whole-moon.md`: completed implementation proof; local harness Mail sense, MBOX import, Screener, Outlook, local outbound, and Azure proof units.
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1447-doing-agent-mail-whole-moon/unit16-azure-proof.md`: prior Azure proof showing Blob/runtime and public TCP `2525` work, while port `25` remained blocked.
- `/Users/maintainer/Projects/ouroboros-agent-harness/docs/agent-mail-setup.md`: harness-side Agent Mail setup, HEY forwarding, golden path, and troubleshooting.
- `/Users/maintainer/Projects/ouroboros-agent-harness/docs/hosted-work-substrate.md`: hosted/local repo boundary.
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/heart/daemon/cli-exec.ts`: current `ensureAgentMailroom` / `executeConnectMail` path creates local registry/key state and stores keys in vault `runtime/config`.
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/mailroom/reader.ts`: harness can resolve an Azure Blob Mailroom store from runtime config, but setup must provide production coordinates and credentials.
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/mailroom/outbound.ts`: ACS outbound transport is recognized but currently throws "configured but not enabled".
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/repertoire/tools-mail.ts`: bounded mail tools, Screener behavior, draft/send confirmation gates.
- Bounce evidence: `/Users/maintainer/Downloads/attachment` reports `Status: 5.4.4` and "Host or domain name not found" for `ouro-bot.mail.protection.outlook.com`.
- Local DNS evidence on 2026-04-22: `dig MX ouro.bot` returns `0 ouro-bot.mail.protection.outlook.com.`; `dig A`/`CNAME` for that target return no address; TXT includes Microsoft verification, Google verification, and `v=spf1 include:spf.protection.outlook.com -all`.
- Azure live evidence on 2026-04-22: `ouro-prod-cae` static IP is `20.10.114.197`; `ouro-prod-mail-ingress` exposes TCP `2525` only.
- Porkbun API docs for the current `ouro.bot` DNS driver: https://porkbun.com/api/json/v3/documentation and https://porkbun.com/api/json/v3/spec. The API supports credential checks, DNS management, API-key request/retrieve flow, rate-limit metadata, and SSL bundle retrieval.
- Azure Container Apps ingress docs: https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview and https://learn.microsoft.com/en-us/azure/container-apps/ingress-how-to. External TCP ingress and additional TCP ports are supported in VNet-backed environments; exposed TCP ports can be configured from 1 to 65535 except 80/443.
- HEY forwarding docs: https://www.hey.com/forwarding/. HEY says forwarding should not be the sole critical-mail path, spam-classified mail is not forwarded, and forwarding can break authentication despite ARC support.
- ACS SMTP auth docs: https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/send-email-smtp/smtp-authentication. ACS SMTP uses `smtp.azurecomm.net`, TLS/StartTLS, port 587 recommended, and Microsoft Entra app credentials.
- ACS sender-auth docs: https://learn.microsoft.com/en-us/azure/communication-services/concepts/email/email-domain-and-sender-authentication. Custom domains require ownership verification and sender authentication support.
- ACS email events docs: https://learn.microsoft.com/en-us/azure/event-grid/communication-services-email-events. Delivery events include delivered, bounced, suppressed, quarantined, spam-filtered, and failed states.

## Notes
- Spark: Slugger should have mail that feels native and trustworthy, not a proof-port toy. A message to `slugger@ouro.bot` is Slugger's correspondence and should behave like a real sense. Alex's HEY mail is a delegated mailbox source, available for executive-assistant work with full backfill and future forwarding, but always labeled as Alex's mailbox content.
- Observed terrain: receiving worked in proof form on port `2525`; real MX delivery failed before touching our app because DNS points at a dead Outlook protection hostname. Sending has local-sink proof and ACS placeholders, but no production sender service yet.
- Foundation terrain: the completed whole-moon task already built local Mail sense readiness, bounded mail tools, HEY MBOX import, Screener candidates, retained Discarded, Outlook mailbox UI, local confirmed outbound, and Azure Blob proof. This production task should not redesign those semantics; it should carry them into hosted provisioning, real MX, production outbound/autonomy, DNS, and recovery.
- Divergent pass: the boring version is Container Apps port 25 plus Porkbun DNS; the ambitious version is a dedicated mail edge with queueing and SMTP policy in front of encrypted Blob storage; the weird-but-possibly-right version is third-party inbound parse/webhooks, rejected because it weakens hosted unreadability. The surviving first candidate is Container Apps because the existing environment is VNet-backed, has a static IP, and already proves the app path.
- Tinfoil Hat changed the design: MX cannot include port `2525`, so proof-port success is not production mail. Hosted Mail Control must be the provisioning truth or hosted ingress may encrypt to keys the local agent does not have. Blob data-plane access from the harness is also part of production, not a later nicety.
- Tinfoil Hat second pass: STARTTLS, DNS rollback, certificate renewal, storage transient failures, rate limits, and decryption/key-mismatch recovery are not hardening extras; they are what make "mail works" recoverable.
- Stranger With Candy changed the vocabulary: `sent` is currently too optimistic, local-only Mailroom setup is not production account ensure, HEY forwarding to the native address would prove delivery while losing delegated provenance, and "DNS automation" must include backup/dry-run/rollback rather than just update calls. A later scrutiny pass also corrected the credential vocabulary: the primitive is a vault item/credential with no assumed use; workflow binding and run config live outside the item.
- Recovery model: every setup step should be idempotent and report one of `not_started`, `blocked_by_human`, `pending_propagation`, `ready`, `failed_recoverable`, or `failed_manual_repair`, with the next agent-runnable command and the human-required action separated.
- Human-needed lock list:
  - Secret material: human creates or approves any missing secret values, does not paste them into chat, and enters them only through a hidden prompt or approved secret store. Workflows reference vault item paths; they do not redefine what the vault item is.
  - Slugger vault/secret entry: human may need to unlock Slugger's vault or enter secret material through a hidden prompt when setup stores Mailroom private keys, hosted Blob reader config, vault items referenced by DNS/outbound bindings, ACS credentials, or outbound/autonomy policy secrets.
  - HEY browser: human is available for HEY login/MFA/CAPTCHA, HEY export download, and forwarding/Extension confirmation. Automation may drive safe UI steps, but must stop for auth and ambiguous account changes.
  - HEY forwarding target: delegated HEY forwarding uses `test.example.owner.slugger@ouro.bot`, not `slugger@ouro.bot`.
  - Live test mail: human can send or approve test messages from HEY and at least one outside mailbox, and can confirm any provider/domain verification emails that require manual action.
  - Secret hygiene: secrets go only into agent vault, GitHub Actions secrets, Azure secrets/Key Vault/Container App secrets, macOS Keychain, or another explicit secret store; never into chat, docs, commits, PR bodies, or logs.
- Recommended execution shape after approval: multiple narrow PRs under this full-moon plan, roughly harness vault item surface correction, contract/protocol sync, hosted provisioning integration, inbound edge/TLS/DNS automation, harness hosted reader and setup recovery, HEY onboarding automation, outbound provider/events, docs/smoke/deploy. The doing doc should define exact units before execution.
- Unit 0a-0c completed the harness vault-item surface on branch `slugger/vault-item-surface` at `4dec8d50c9f5c05986352fb48616b9ceb229e563`: focused tests, `npx tsc --noEmit`, full `npm run test:coverage`, nerves audit, and `npm run release:preflight` all passed after the alpha.466 version/changelog bump. Remaining work for that slice is PR, merge, publish, and install.
- Packaging decision after fresh work-suite pass: do not npm-publish the deployable hosted substrate apps. Use GitHub Actions, Bicep, and commit-tagged Container App images as the production lane. The likely exception is shared protocol: either publish/consume `@ouro/work-protocol` or add a generated/schema contract gate so the harness and substrate cannot drift.
- The full-moon plan is now explicitly "merged + released/deployed + installed + live-smoked"; code merged but not released/installed/deployed does not satisfy production readiness.

## Progress Log
- 2026-04-22 13:09 Created
- 2026-04-22 13:10 Added scrutiny findings for TLS, abuse controls, outbound status, DNS ownership, and delegated HEY forwarding
- 2026-04-22 13:29 Expanded plan to full-moon scope across substrate, harness, DNS, HEY onboarding, outbound, recovery, deployment, and live smoke tests
- 2026-04-22 13:30 Clarified that remaining items are operational gates, not unresolved scope questions
- 2026-04-22 13:38 Added human-needed lock list for approvals, secrets, DNS, Azure, HEY, vault, testing, and secret hygiene
- 2026-04-22 13:39 Clarified the local harness checkout and `ourostack/ouroboros` remote
- 2026-04-22 14:32 Reviewed foundation mail docs, marked process gates waived, separated native agent mail from delegated human mailbox source, and added policy-governed autonomous native sending
- 2026-04-22 17:25 Corrected credential orientation after compaction: generic vault item first, workflow binding second, provider driver/template last; Porkbun remains only the current DNS driver for `ouro.bot`
- 2026-04-22 17:36 Promoted the harness vault item surface fix to first-order scope before mail/DNS implementation
- 2026-04-22 17:45 Rewrote credential model to remove remaining provider/access ontology: primitive is vault item/credential with no assumed use; workflows bind to it outside the item; notes are never parsed
- 2026-04-22 17:51 Added a source-grounded vault surface documentation map: existing harness primitive is general, but origin/help/docs currently teach `Operational Credentials`, `ops-credential/porkbun`, and domain-shaped vocabulary; first PR must make `ouro vault item` canonical across docs/help/tests and keep Porkbun as template/deprecated alias only
- 2026-04-22 18:49 Completed harness vault-item surface implementation and verification through full coverage and release preflight on branch `slugger/vault-item-surface`; the slice still needs PR, merge, publish, and local install.
- 2026-04-22 18:52 Ran a fresh full-moon work-suite refresh after the vault correction; promoted packaging/deployment lanes, shared protocol drift protection, and branch protection evidence into the production plan.
- 2026-04-22 19:13 Completed the harness vault-item release lane: PR #587 merged, main publish passed, npm/latest is `0.1.0-alpha.466`, local `ouro` is alpha.466, and Slugger's Porkbun item is visible through the generic vault item surface without printing secrets.
- 2026-04-22 19:18 Added two-lane red tests across the hosted protocol and harness so native agent mail and delegated human mailbox access cannot collapse silently in provenance, access logs, attention summaries, outbound records, or Outlook source folders.
