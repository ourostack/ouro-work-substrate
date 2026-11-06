# Doing: Mail Production Path

**Status**: in-progress
**Execution Mode**: direct
**Created**: 2026-04-22 14:33
**Planning**: ./2026-04-22-1308-planning-mail-production-path.md
**Artifacts**: ./2026-04-22-1308-doing-mail-production-path/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Bring Agent Mail to full production shape across Ouro Work Substrate and the Ouroboros harness while keeping native agent correspondence and delegated human mailbox access visibly separate. Agent-native mail must support real autonomous receive and policy-governed autonomous send as `slugger@ouro.bot`; delegated HEY mail must provide full executive-assistant access to Alex's mailbox through export backfill and future forwarding without becoming Slugger's own correspondence or send-as-human authority.

## Upstream Work Items
- None

## Completion Criteria
- [x] Production setup calls hosted Mail Control, stores one-time private keys in the owning agent vault, configures hosted Blob reader coordinates, enables Mail sense, and reports native plus delegated addresses without printing secrets.
- [x] Setup and repair are idempotent across hosted registry, local registry, vault config, source grants, keys, and Blob settings.
- [x] Native agent mail and delegated human mailbox source stay separate in protocol records, storage compartments, access tools, Outlook, audit, policy, recovery, and prompt/sense context.
- [x] The harness vault surface is corrected before DNS/mail implementation: generic human-facing vault item commands exist, notes are first-class, `ouro connect` remains harness-managed only, and templates/compatibility aliases never create new credential species.
- [x] The harness vault-item branch is merged, published through the harness npm release lane, and installed locally before DNS/mail workflow code depends on the new surface.
- [x] DNS/mail production workflows consume explicit non-secret bindings that reference generic vault item paths; no code or docs treat the referenced item as an ops credential, authority, Porkbun credential, DNS credential, or provider-shaped ontology.
- [x] Shared mail protocol semantics are protected by a consumed `@ouro/work-protocol` package boundary or generated/schema contract tests so harness and substrate cannot drift silently.
- [x] Production MX points to a proven port-25 edge with STARTTLS, size limits, transient/permanent failures, rate limits, recipient limits, and body-safe observability.
- [ ] Native live mail to `slugger@ouro.bot` reaches encrypted Blob storage, decrypts through Slugger's vault key, enters the right Imbox/Screener state, and behaves as a body-safe sense.
- [ ] Alex's delegated HEY source is backfilled from MBOX with provenance/freshness and receives all future forwarded mail at `test.example.owner.slugger@ouro.bot` with owner/source labels everywhere.
- [ ] HEY forwarding onboarding is resumable, browser/MFA-aware, source-scoped, and recoverable when forwarding is missing, stale, or lossy.
- [ ] Production outbound uses authenticated provider submission, records provider ids/events, and distinguishes submitted, accepted, delivered, bounced, suppressed, quarantined/spam-filtered, and failed outcomes.
- [ ] Policy-governed autonomous native-agent sending is implemented with default confirmation for risky/new sends, explicit allow policy for autonomous low-risk sends, rate/recipient limits, audit, and kill switch.
- [ ] Delegated human mail never grants send-as-human authority by default; follow-ups based on Alex's HEY mail send from the agent identity unless a future delegated-send product is approved.
- [ ] SPF, DKIM/DKIM2 where required, and DMARC records are applied and verified for the chosen sender domain.
- [x] Recovery docs/tooling cover DNS, port 25, Mail Control, vault/key drift, HEY forwarding, Blob access, decryption, wrong placement/provenance, outbound provider failures, and delivery events.
- [x] Hosted substrate packaging/deployment is documented and verified as private commit-addressed Docker images plus Bicep/GitHub Actions deploy, not an npm package for deployable services.
- [x] Branch protections for `ouro-work-substrate` and `ouroboros` require the intended green checks, enforce admins, require linear history, and require conversation resolution.
- [ ] Live smoke proves hosted health, mailbox/source ensure, SMTP accept/reject, encryption/decryption, native Screener/Imbox, delegated HEY backfill and forward, autonomous native send policy, provider event reconciliation, and Ouro Outlook audit.
- [x] `npm run ci:local` passes in `ouro-work-substrate`.
- [x] Relevant harness tests, `npx tsc --noEmit`, and release preflight pass in `/Users/maintainer/Projects/ouroboros-agent-harness` or its task worktree.
- [x] 100% test coverage on all new code.
- [x] All tests pass.
- [x] No warnings.

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

Legend: ⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Workspace And Foundation Baseline
**What**: Prepare dedicated worktrees/branches for work-substrate and harness, record current dirty-state boundaries, reread foundation task docs, and capture the live baseline for DNS, Azure, GitHub, harness Mail sense, Slugger vault readiness, and deployed services.
**Output**: Baseline artifact with repo/worktree paths, current commits, live DNS/Azure facts, foundation-doc summary, and immediate blockers.
**Acceptance**: Baseline proves no user changes were overwritten, names the active remotes/branches, and confirms which human inputs are genuinely missing before implementation begins.

### ✅ Unit 0a: Harness Vault Item Surface — Tests
**What**: Write failing harness tests and doc contracts for a generic human-facing vault item/credential surface: stable item name/path, hidden secret entry, optional public fields, freeform editable notes, tags/folder-ish organization, timestamps/provenance, list/status without secret exposure, reserved runtime/config guidance, templates as convenience only, and provider helper compatibility.
**Output**: Red CLI/docs tests in the harness worktree, including docs contracts for `README.md`, `AGENTS.md`, `docs/auth-and-providers.md`, and `ouro help vault`.
**Acceptance**: Tests fail where the only human CLI path for an arbitrary credential is provider-specific, where docs/help show template or compatibility helpers before the generic item surface, or where docs imply ops credentials, authorities, DNS credentials, or provider credentials are separate ontologies for freeform vault items.

### ✅ Unit 0b: Harness Vault Item Surface — Implementation
**What**: Implement or expose generic `ouro vault item` or `ouro vault credential` commands over the existing agent-vault item primitive, with clear item naming, notes, hidden secret prompts, metadata-only status/list, and guardrails around reserved harness-managed items. Templates such as `--template porkbun-api` only shape prompts/fields. Keep `vault ops porkbun` as a deprecated compatibility alias that stores an ordinary vault item and points users toward the generic model.
**Output**: Harness CLI/code/docs changes, compatibility behavior, and task notes. `docs/auth-and-providers.md` must replace the misleading `Operational Credentials` framing with `Vault Items, Managed Workflows, And Bindings` or equivalent wording.
**Acceptance**: A human can store/check a non-runtime credential for Slugger without a provider-specific command; the existing Porkbun-related item remains usable as a normal vault item that a DNS workflow binding may reference.

### ✅ Unit 0c: Harness Vault Item Surface — Coverage And Release
**What**: Cover error paths, noninteractive failures, reserved item collisions, no-secret logging, notes handling, and command-help ergonomics; run harness tests, full coverage, TypeScript, and release preflight so the branch is ready for PR/release.
**Output**: Coverage artifacts, release-preflight evidence, and harness branch evidence.
**Acceptance**: 100% coverage on new vault-surface code and future agents see "vault item / credential with no assumed use" first in help/docs before templates or compatibility aliases. Docs/tests explicitly say notes are for human/agent orientation and are never machine contracts.

### ✅ Unit 0d: Full-Moon Work-Suite Refresh
**What**: Rerun the post-vault-correction full-moon thinking pass and update the plan around packaging/deployment lanes, shared protocol drift, branch protections, and the exact production-ready bar.
**Output**: `full-moon-work-suite-refresh.md` plus refreshed planning/doing docs.
**Acceptance**: The task docs make clear that harness npm release/install, hosted Azure deploy, shared protocol package/contract gates, branch protection, and live smoke are part of "done"; no unresolved human product questions remain.

### ✅ Unit 0e: Harness Vault Item Surface — Merge, Publish, Install
**What**: Create the harness PR for `slugger/vault-item-surface`, wait for CI, merge to `main`, publish/install the resulting harness alpha release, and verify the installed `ouro` exposes the generic vault item surface plus deprecated Porkbun compatibility alias.
**Output**: PR URL, CI/merge/release/install evidence, installed CLI verification logs.
**Acceptance**: The local agent runtime can rely on `ouro vault item` in the installed harness; `vault ops porkbun` still works as a deprecated alias over an ordinary item; DNS/mail workflow work is no longer blocked on unreleased harness surface changes.

### ✅ Unit 1a: Two-Lane Mail Contract — Tests
**What**: Write failing tests/contract checks that native agent mail and delegated human mailbox source cannot collapse across protocol, harness types, tools, Outlook labels, prompt/sense summaries, and recovery records.
**Output**: Red tests in work-substrate and/or harness for compartment/source labels, source-scoped policy, delegated reads, native autonomous send policy, and no delegated send-as-human path.
**Acceptance**: Tests fail against the current production branch where the distinction is incomplete or not enforced end to end.

### ✅ Unit 1b: Two-Lane Mail Contract — Implementation
**What**: Update shared protocol, harness mailroom types, docs, prompts, Outlook reader/UI, and tool responses so every mail object is clearly native-agent or delegated-human-source with stable owner/source provenance.
**Output**: Contract/code/docs changes in the appropriate repo PRs.
**Acceptance**: Red tests pass; no user-facing surface can present Alex's HEY mail as Slugger's own correspondence.

### ✅ Unit 1c: Two-Lane Mail Contract — Coverage And Refactor
**What**: Fill branch/error coverage, remove duplicate vocabulary, and verify cross-repo contract drift is caught by tests or generated/shared types.
**Output**: Coverage artifacts and cleanup commits.
**Acceptance**: 100% coverage on new/changed contract code and focused tests green in both repos.

### ✅ Unit 2a: Hosted Provisioning Truth — Tests
**What**: Write failing tests for production `ouro account ensure` / `ouro connect mail` calling hosted Mail Control, storing returned keys in vault, configuring Blob reader coordinates, preserving existing keys, and detecting hosted/local/vault drift.
**Output**: Red harness and hosted control-plane tests.
**Acceptance**: Tests fail where setup can still be local-only or drift is not recoverable.

### ✅ Unit 2b: Hosted Provisioning Truth — Implementation
**What**: Implement production-mode setup/repair that uses hosted Mail Control as registry truth, stores keys and Blob coordinates in `runtime/config`, keeps local mode explicit, and gives actor-labeled recovery guidance.
**Output**: Harness setup code, hosted API/client code if needed, docs, and tests.
**Acceptance**: Repeated setup is boring/idempotent; private keys are not printed or hosted; Slugger can read hosted Blob mail through vault-held keys.

### ✅ Unit 2c: Hosted Provisioning Truth — Coverage And Refactor
**What**: Cover locked vault, missing token, Mail Control outage, one-time key loss, malformed registry, stale local registry, and Blob credential failures.
**Output**: Coverage pass and repair-path documentation.
**Acceptance**: Error paths are tested and recovery copy names agent-runnable versus human-required work.

### ✅ Unit 3a: DNS And Certificate Automation — Tests
**What**: Write failing tests for DNS workflow binding resolution: domain, driver, explicit vault item path, resource allowlist, no note parsing, Porkbun read-only ping/retrieve as the current `ouro.bot` driver, DNS backup, dry-run diff, apply, verify, rollback, and ACME/certificate material handling without logging secrets.
**Output**: Red tests and fixture DNS records.
**Acceptance**: Tests fail until automation can prove safe DNS mutation behavior without treating the referenced vault item as a DNS credential, ops credential, authority, or provider-shaped credential.

### ✅ Unit 3b: DNS And Certificate Automation — Implementation
**What**: Implement DNS automation and certificate flow for `mx1.ouro.bot` as a workflow binding plus provider driver. The binding names `domain`, `driver`, `credentialItem`, and resource allowlist. The driver reads only the required secret fields from the referenced vault item. Store no raw secrets outside approved secret paths, do not parse notes, and preserve unrelated verification records.
**Output**: Scripts/CLI/workflow, binding docs, driver docs, and secret hygiene checks.
**Acceptance**: With the configured workflow binding, automation can retrieve current records and produce a safe dry-run; apply/rollback are available for cutover.

### ✅ Unit 3c: DNS And Certificate Automation — Coverage And Refactor
**What**: Verify no secrets in logs/process artifacts, cover vault item lookup failures, missing required secret fields, provider API failures, rate limits, propagation pending, and document future-session access using the generic vault-item plus workflow-binding model.
**Output**: Coverage artifacts and operations docs.
**Acceptance**: 100% coverage on new DNS/cert automation and a successful read-only workflow-binding check for the current `ouro.bot` binding.

### ✅ Unit 4a: Production SMTP Edge — Tests
**What**: Write failing tests for STARTTLS advertisement/certificate config, max size, recipient limits, connection/rate limits, transient storage failures, unknown recipient rejection, and body-safe logs.
**Output**: Red mail-ingress tests and infra expectations.
**Acceptance**: Tests fail against current STARTTLS-disabled, proof-port-only behavior.

### ✅ Unit 4b: Production SMTP Edge — Implementation
**What**: Harden mail ingress and infra for production SMTP on port 25, first trying existing Container Apps static-IP shape and falling back to a dedicated mail edge if port 25 still cannot be proven.
**Output**: App/infra changes, deployment workflow updates, docs, and proof artifacts.
**Acceptance**: App and deploy path are ready for live edge proof: SMTP can advertise STARTTLS from mounted PEM material, enforce size/recipient/connection/rate limits, store encrypted mail, reject unknown recipients, and avoid relay/submission behavior. Live port-25 proof remains Unit 4c.

### ✅ Unit 4c: Production SMTP Edge — Coverage And Refactor
**What**: Run local and deployed SMTP policy tests, inspect logs for body leakage, and document rollback/diagnostics.
**Output**: Test logs and operations updates.
**Acceptance**: Port-25 proof is reproducible or a fallback edge is live and proven.

### ✅ Unit 5a: Delegated HEY Source — Tests
**What**: Write failing tests for HEY MBOX backfill freshness/provenance, no import wake storm, future-forwarded source placement, source-scoped Screener decisions, source revocation, and forwarding setup state.
**Output**: Red harness/work-substrate tests and HEY fixture cases.
**Acceptance**: Tests fail where historical import and live delegated forwarding are not clearly separated.

### ✅ Unit 5b: Delegated HEY Source — Implementation
**What**: Complete backfill/import and forwarding setup/recovery flow for Alex's HEY mailbox, including browser-automation hooks where available and guided fallback for login/MFA/export/forwarding.
**Output**: Harness setup/onboarding changes, source-state records, docs, and verification tooling.
**Acceptance**: Alex's imported and future-forwarded HEY mail are searchable/readable with bounded audited tools and always labeled as delegated source mail.

### ✅ Unit 5c: Delegated HEY Source — Coverage And Refactor
**What**: Cover missing MBOX, duplicate imports, forwarding not configured, source revoked while mail still forwards, wrong alias, and source-scoped allow/discard conflicts.
**Output**: Coverage artifacts and recovery runbook.
**Acceptance**: 100% coverage on new delegated-source code and successful local proof.

### ✅ Unit 6a: Native Agent Mail Autonomy — Tests
**What**: Write failing tests for native mail sense receive behavior, Screener attention, known sender Imbox, autonomous send policy, confirmation fallback, rate/recipient limits, kill switch, and no autonomous sends to risky/new recipients.
**Output**: Red harness tests and hosted protocol tests where needed.
**Acceptance**: Tests fail until native autonomous sending is policy-governed and auditable.

### ✅ Unit 6b: Native Agent Mail Autonomy — Implementation
**What**: Implement production native send/receive behavior: compact sense state, cross-sense attention, authenticated outbound submission, policy-governed autonomous sends, confirmation fallback, and kill switch.
**Output**: Harness tools/sense/outbound code, provider config, hosted event endpoints if needed, docs.
**Acceptance**: Slugger can receive native mail and send as `slugger@ouro.bot` within explicit native-agent policy while refusing out-of-policy sends.

### ✅ Unit 6c: Native Agent Mail Autonomy — Coverage And Refactor
**What**: Cover provider failures, bounce/delivery events, policy revocation, trust downgrade, mail loops, and audit visibility.
**Output**: Coverage artifacts and autonomy policy docs.
**Acceptance**: 100% coverage on new autonomy code and no unsafe send path remains untested.

### ✅ Unit 7a: Outbound Provider And Events — Tests
**What**: Write failing tests for ACS or selected provider submission, credential resolution, provider message ids, Event Grid/webhook delivery events, bounce/suppression/quarantine/spam-filtered states, and idempotent event reconciliation.
**Output**: Red provider adapter and hosted event tests.
**Acceptance**: Tests fail until provider acceptance and final delivery outcomes are separated.

### ✅ Unit 7b: Outbound Provider And Events — Implementation
**What**: Implement authenticated outbound provider submission, domain-auth DNS records, event endpoint/subscription, event reconciliation, and audited sent-copy storage.
**Output**: Provider adapter, hosted callback/event code, DNS records, docs, and deploy changes.
**Acceptance**: Confirmed and autonomous native sends produce provider ids and later delivery/bounce/event updates.

### ✅ Unit 7c: Outbound Provider And Events — Coverage And Refactor
**What**: Cover credential failure, provider retry, duplicate events, unknown provider messages, and body-safe event logs.
**Output**: Coverage artifacts and operations docs.
**Acceptance**: 100% coverage on new provider/event code and local provider smoke passes. Live provider smoke remains Unit 10 after deployment, domain authentication, provider credentials, and event subscription wiring are in place.

### ✅ Unit 8a: Outlook, Tools, And Audit Ergonomics — Tests
**What**: Write failing tests/screenshots for clear native versus delegated labeling, source folders, access logs, autonomous send audit, delivery events, recovery drawers, and no body leakage in summaries.
**Output**: Red API/UI/tool tests.
**Acceptance**: Red harness API/tool/UI tests now fail until the mailbox surface shows executive-assistant clarity instead of a blended inbox. Evidence lives in `unit8a-red-tests.md`.

### ✅ Unit 8b: Outlook, Tools, And Audit Ergonomics — Implementation
**What**: Polish Outlook, mail tools, access logs, and prompt/sense summaries around the two-lane model and production delivery states.
**Output**: Harness UI/API/tooling/docs changes.
**Acceptance**: The focused harness API/tool/UI tests now pass; Outlook and mail tools show native/delegated mailbox provenance, autonomous policy audit, and provider delivery state. Evidence lives in `unit8b-implementation.md`.

### ✅ Unit 8c: Outlook, Tools, And Audit Ergonomics — Coverage And Refactor
**What**: Run UI tests/build/screenshot checks, focused mail tool tests, and accessibility/responsive checks.
**Output**: Screenshot artifacts and green UI/API tests.
**Acceptance**: No overlapping/blank UI states and 100% coverage on new reader/tool code.

### ✅ Unit 9: Recovery, Operations, And Docs
**What**: Update operations/account lifecycle/harness setup docs and implement any doctor/status checks needed for DNS, MX, HEY source, hosted registry/vault key drift, Blob access, delivery events, and autonomy kill switch.
**Output**: Runbooks, contract tests, and recovery tooling.
**Acceptance**: A future agent can recover each documented failure mode without rediscovering the system.

### 🔄 Unit 10: Deploy, Cutover, And Live Smoke
**What**: Deploy after green CI, run DNS dry-run and apply after proof, verify MX/STARTTLS, run native inbound/outbound/autonomy tests, run HEY backfill/forwarding tests, inspect Outlook/audit, and merge/release/install as repo workflows require.
**Output**: Deployment logs, DNS backup/diff, live smoke artifacts, PR/CI/merge/release evidence, and final installed-state verification.
**Acceptance**: Full production completion criteria are met; remaining issues are either fixed or documented as explicit follow-up work with owner/removal criteria.

## Execution
- Work in dedicated worktrees and branches for every repo touched.
- Human approval gates for planning/doing/process are waived for this task; proceed directly unless a genuine external input is required.
- Stop only for genuine human inputs: missing secret material through hidden prompt or approved secret store, Slugger vault unlock/secret entry, HEY browser/MFA/export/forwarding, provider verification that cannot be automated, and live mail sent from human-controlled accounts.
- Treat packaging/deployment as separate release lanes: harness CLI/runtime changes must be merged, npm-published, and installed; hosted substrate services must be merged, deployed through GitHub Actions/Bicep as commit-tagged images, and live-smoked; shared protocol semantics need a package or contract gate.
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase or logical unit.
- Push after each unit complete.
- Run focused tests before marking unit done and full repo validation before merge/deploy.
- **All artifacts**: Save outputs, logs, data to `./2026-04-22-1308-doing-mail-production-path/`.
- **Decisions made**: Update docs immediately, commit right away.

## Progress Log
- 2026-04-22 14:33 Created from planning doc after human waived process gates and foundation mail docs were reread.
- 2026-04-22 14:34 Fixed unit heading format after template check.
- 2026-04-22 14:36 Started Unit 0 baseline and worktree setup.
- 2026-04-22 17:25 Captured post-compaction credential-orientation correction: generic vault item first, workflow binding second, provider template last.
- 2026-04-22 17:36 Promoted the generic harness vault item surface from documentation debt into first-order Units 0a-0c before DNS/mail implementation.
- 2026-04-22 17:45 Rewrote credential orientation to the stricter primitive: vault item/credential with no assumed use; workflows bind to items outside the item; notes are never machine contracts.
- 2026-04-22 17:51 Mapped the documentation and surface fix: harness origin currently teaches `Operational Credentials` plus `vault ops porkbun`; implementation must make `ouro vault item` canonical and reduce provider helpers to templates or deprecated compatibility aliases.
- 2026-04-22 17:56 Unit 0 complete: captured clean substrate and harness worktrees, live DNS/Azure/GitHub/vault facts, foundation mail carry-forward, and genuine remaining human gates in `unit0-baseline.md`.
- 2026-04-22 18:04 Unit 0a complete: added and pushed red harness tests for generic vault item docs, help, parsing, execution, compatibility alias behavior, and agent-facing credential tool vocabulary. Evidence lives in `unit0a-red-tests.md`.
- 2026-04-22 18:12 Unit 0b complete: implemented and pushed the generic harness vault item surface, documentation ladder, agent-tool vocabulary, and Porkbun deprecated compatibility alias. Evidence lives in `unit0b-implementation.md`.
- 2026-04-22 18:49 Unit 0c complete: pushed harness commit `4dec8d50c9f5c05986352fb48616b9ceb229e563` with 100% full coverage, nerves audit pass, release preflight pass after alpha.466 version/changelog bump, and guardrail coverage for reserved/freeform vault item behavior. Evidence lives in `unit0c-coverage-release.md`.
- 2026-04-22 18:49 Human explicitly flagged that the full-moon mail plan needs a fresh work-suite pass after the vault ontology correction and that packaging/deployment must be first-class scope, not an afterthought.
- 2026-04-22 18:52 Unit 0d complete: ran a fresh work-suite refresh and recorded the three release lanes, shared protocol drift risk, branch protection facts, and next thin slice in `full-moon-work-suite-refresh.md`.
- 2026-04-22 19:13 Unit 0e complete: merged harness PR #587, watched green main publish job, verified npm/latest at `0.1.0-alpha.466`, updated local `ouro` to alpha.466, and verified installed generic vault item status/list plus deprecated Porkbun compatibility alias. Evidence lives in `unit0e-merge-publish-install.md`.
- 2026-04-22 19:18 Unit 1a complete: added red tests in substrate and harness for shared mailbox provenance, access-log provenance, attention summaries, outbound native-send authority, and owner-scoped Outlook delegated source folders. Evidence lives in `unit1a-red-tests.md`.
- 2026-04-22 19:37 Unit 1b complete: implemented shared/harness two-lane provenance descriptors, access-log and attention provenance, native outbound authority fields, Outlook owner-scoped source folders, legacy fallbacks, and 100% coverage. Evidence lives in `unit1b-implementation.md`.
- 2026-04-22 19:48 Unit 1c complete: added canonical substrate mail provenance contract JSON, harness vendored contract drift tests, docs for the private-package contract lane, and 100% coverage evidence. Evidence lives in `unit1c-coverage-contract.md`.
- 2026-04-22 19:53 Unit 2a complete: added red hosted provisioning tests for Mail Control public records/Blob coordinates, harness production setup calling hosted Mail Control, key preservation, and hosted registry/vault drift detection. Evidence lives in `unit2a-red-tests.md`.
- 2026-04-22 19:59 Unit 2b complete: Mail Control now returns public records and hosted coordinates; harness hosted setup calls Mail Control, stores returned keys, preserves existing keys, records Blob reader coordinates, and detects key-id drift. Evidence lives in `unit2b-implementation.md`.
- 2026-04-23 15:37 Unit 10 live smoke found a production outbound gap: ACS domain auth and linking were green, but confirmed native self-send failed because the custom domain only had the default `donotreply` sender username and not `slugger`. Immediate prod repair proved the root cause by creating `senderUsernames/slugger` directly in ACS; the permanent fix is to make Mail Control ensure native sender usernames before returning mailbox success so future agents do not rediscover this.
- 2026-04-22 20:26 Unit 2c complete: restored hosted Mail Control response coverage, covered hosted repair and failure edges, and reran substrate plus harness coverage gates at 100%. Evidence lives in `unit2c-coverage-repair.md`.
- 2026-04-22 20:33 Unit 3a complete: added and pushed red substrate/harness tests for DNS workflow bindings, Porkbun read-only driver behavior, no note parsing, backup/dry-run/apply/verify/rollback, allowlists, and certificate secret redaction. Evidence lives in `unit3a-red-tests.md`.
- 2026-04-22 20:41 Unit 3b complete: added the `ouro.bot` DNS workflow binding/runbook plus harness parser, binding validator, vault-field secret resolver, Porkbun read/mutation driver, backup/plan/apply/verify/rollback execution, rollback planning, and redacted artifacts. Evidence lives in `unit3b-implementation.md`.
- 2026-04-22 21:27 Unit 3c complete: closed DNS workflow coverage and Nerves observability, added legacy flat-payload support for the real Slugger Porkbun vault item, normalized live Porkbun DNS records before planning, and proved a read-only `ouro.bot` DNS plan with no secret leakage. Evidence lives in `unit3c-coverage-repair.md`.
- 2026-04-22 21:31 Unit 4a complete: added red mail-ingress tests for STARTTLS/SIZE advertisement, pre-DATA declared-size rejection, recipient-count limits, and body-safe DATA failure responses/logs. Evidence lives in `unit4a-red-tests.md`.
- 2026-04-22 21:42 Unit 4b complete: implemented STARTTLS/SIZE, recipient/connection/rate limits, safe transient failures, TLS secret-file deployment, workflow guards, and operations docs. Evidence lives in `unit4b-implementation.md`.
- 2026-04-22 22:35 Unit 4c complete: public `ouro.bot` MX now points at a proven Container Apps port-25 edge with STARTTLS, SMTP policy checks, DNS backup/apply/verify, body-safe log inspection, deployment evidence, and harness DNS certificate workflow support at `9d14f5dd`. Evidence lives in `unit4c-production-edge-proof.md`; real provider delivery remains the next human-sender smoke.
- 2026-04-22 22:50 Unit 4d deploy-hook repair complete: fixed the post-merge Azure deploy skip decision to compare the current deployed commit-tagged image against the CI-tested commit range instead of trusting a docs-only head commit. Evidence lives in `unit4d-deploy-hook-repair.md`.
- 2026-04-22 23:20 Unit 4e harness release-lane repair complete: alpha.467 published but its main smoke hit an npm `ECONNRESET`; harness PR #589 added retry coverage, published alpha.468 cleanly, and local `ouro`/`ouro.bot` now report `0.1.0-alpha.468`. Evidence lives in `unit4e-harness-release-lane-repair.md`.
- 2026-04-22 23:36 Unit 5a complete: added red substrate and harness tests for delegated HEY archive freshness/provenance, no import wake storm, live SMTP ingest provenance, Slugger-managed HEY browser setup state, wrong-alias recovery, CLI output, and docs guidance. Evidence lives in `unit5a-red-tests.md`.
- 2026-04-22 23:43 Unit 5b complete: implemented shared ingest provenance, historical MBOX import freshness, source-state recovery, CLI import output, and HEY setup docs. Evidence lives in `unit5b-implementation.md`.
- 2026-04-23 00:08 Unit 5c complete: closed delegated-source coverage, added body-safe source-state Nerves events, bumped harness release lane to alpha.469, and passed substrate `ci:local`, harness coverage/audit, release preflight, and package e2e. Evidence lives in `unit5c-coverage-refactor.md`.
- 2026-04-23 00:27 Unit 5 merge/release/deploy evidence captured: substrate PR #17 merged/deployed to Azure at `cdc84d0`, harness PR #590 merged/published alpha.469, local `ouro`/`ouro.bot` report `0.1.0-alpha.469`, and hosted health checks are green. Evidence lives in `unit5d-merge-release-deploy.md`.
- 2026-04-23 00:42 Unit 6a complete: added and pushed red substrate/harness tests for native autonomous send policy, confirmation fallback, rate/recipient limits, kill switch, delegated send-as-human refusal, runtime config parsing, docs guidance, and native receive attention behavior. Evidence lives in `unit6a-red-tests.md`.
- 2026-04-23 00:50 Unit 6b complete: implemented shared native-mail autonomy policy/evaluator contracts, harness autonomous send enforcement and audit fields, runtime config parsing, guarded `mail_send` behavior, and outbound docs. Evidence lives in `unit6b-implementation.md`.
- 2026-04-23 01:10 Unit 6c complete: closed native autonomy coverage/refactor in substrate and harness at 100%, passed substrate `ci:local`, harness full coverage/Nerves audit, and recorded the Unit 6 versus Unit 7 provider-event boundary. Evidence lives in `unit6c-coverage-refactor.md`.
- 2026-04-23 01:14 Unit 7a complete: added red substrate/harness tests for outbound provider submission, provider message ids, ACS Event Grid delivery reports, hosted webhook validation, body-safe delivery event sink payloads, and idempotent reconciliation. Evidence lives in `unit7a-red-tests.md`.
- 2026-04-23 01:31 Unit 7b complete: implemented shared outbound provider states/events, Mail Control ACS Event Grid webhook handling, harness ACS HMAC provider client, explicit vault-item credential binding fields, Outlook/tool status visibility, and docs for the harness/package versus hosted/deploy lanes. Evidence lives in `unit7b-implementation.md`.
- 2026-04-23 02:07 Unit 7c complete: closed substrate and harness provider/event branch coverage at 100%, including ACS malformed events, sparse provider responses, no-note credential bindings, body-safe webhook failures, unknown provider message reconciliation, and `mail_send` submitted/provider fallback output. Evidence lives in `unit7c-coverage-refactor.md`.
- 2026-04-23 02:16 Unit 8a complete: added and pushed red harness API/tool/UI tests for owner-scoped source folders, native/delegated audit labels, autonomous send authority/policy output, provider delivery events, and body-safe outbound summaries. Evidence lives in `unit8a-red-tests.md`.
- 2026-04-23 02:20 Unit 8b complete: implemented the Outlook reader/tool/UI audit surface, greened the Unit 8a suites, and passed root plus Outlook UI builds. Evidence lives in `unit8b-implementation.md`.
- 2026-04-23 03:03 Unit 8c complete: restored full 100% harness coverage, fixed the Outlook StrictMode deep-link reset found by screenshot proof, and captured desktop/mobile audit screenshots. Evidence lives in `unit8c-coverage-refactor.md`.
- 2026-04-23 03:22 Unit 9 complete: added substrate and harness recovery runbooks, contract tests, harness doctor mail config checks for hosted Blob/key/mailbox drift and autonomy kill switch state, and green substrate plus harness 100% coverage gates. Evidence lives in `unit9-recovery-operations-docs.md`.
- 2026-04-23 04:36 Unit 10 live setup exposed a hosted registry/vault key drift repair gap: Mail Control correctly refused to re-return one-time private keys, while Slugger's vault lacked the referenced hosted private mail key ids. Substrate and harness key-rotation repair branches are implemented and verified locally; evidence lives in `unit10-hosted-key-rotation-repair.md`.
- 2026-04-23 06:13 Unit 10 key-rotation follow-up complete: substrate PR #22 merged/deployed at `3c6463d`, harness PR #593 merged/published alpha.472, alpha.472 installed globally, live native smoke `Codex live native smoke 20260423T130636Z fresh-registry` decrypted, and the old stale-key smoke now renders as a body-safe warning. Evidence lives in `unit10-hosted-key-rotation-repair.md`.
- 2026-04-23 06:23 Slugger resumed delegated HEY onboarding with browser MCP, reached the HEY sign-in page in the real Chrome Default profile, and reported `NEEDS_LOGIN`. This is now a genuine human browser-login gate; credentials must be entered in the browser, not pasted into chat. Evidence lives in `hey-onboarding.md`.
- 2026-04-23 06:31 HEY login-gate record PR #24 is merged on `main`; main CI and the doc-only deploy hook both passed, with runtime deploy steps correctly skipped.
- 2026-04-23 07:14 Harness PR #594 merged to `main`, main coverage/publish passed, alpha.473 was published, and local `ouro`/`ouro.bot` now report `0.1.0-alpha.473`; this installs the runtime ACS provider binding reader for live outbound mail.
- 2026-04-23 07:18 Substrate PR #26 merged to `main` at `29ced058`; main CI passed and the Azure deploy hook started the ACS/Event Grid deployment path.
- 2026-04-23 07:23 The first ACS/Event Grid production deploy failed because `Microsoft.EventGrid` was not registered in subscription `261e0bf1-934d-41ab-9295-229b0d254418`. Registered the provider from the production subscription context and opened PR #27 to make the deploy workflow register and verify both `Microsoft.Communication` and `Microsoft.EventGrid` before Bicep deployment. Local repair tests passed: `npx vitest run scripts/__tests__/deploy-azure-workflow.contract.test.ts`, `npm run infra:check`, and `npm run test:coverage` with 100% coverage.
