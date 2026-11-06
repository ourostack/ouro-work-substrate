# Full-Moon Work-Suite Refresh

Created during the post-Unit-0c reset, after the vault item ontology was corrected and after the human explicitly asked for packaging/deployment to be treated as first-class scope.

## Spark

Ouro Work Mail should be ready for prime time, not merely demo-ready. Slugger needs a real native mail sense with autonomous receive and policy-governed send, while Alex's HEY mailbox is a delegated executive-assistant source with full backfill plus future forwarding. The agent should never have to squint to know whether it is looking at its own correspondence or Alex's delegated mailbox.

The emotional bar matters: this is future home infrastructure. It should be calm, recoverable, well-documented, and honest enough that a future agent can continue without repeating this churn.

## Observed Terrain

- `ouro-work-substrate` is a private hosted-service repo. Its deploy artifacts are service Docker images tagged by commit SHA and deployed through `.github/workflows/deploy-azure.yml` after green CI on `main`. It is not currently shaped like an npm-published product.
- `deploy-azure.yml` provides a post-merge deployment hook: successful `CI` on `main` triggers Azure deploy for non-doc changes, checks out the exact CI-tested commit, builds all service images, pushes to ACR, and deploys Bicep. A later Unit 4c follow-up found and fixed an important skip-decision bug: the hook must compare the current deployed commit-tagged image to the tested commit, not just inspect the head commit.
- `package.json` has `private: true`; `packages/work-protocol/package.json` is also private. `@ouro/work-protocol` is used inside substrate workspaces and Docker images, but the harness has a parallel Mailroom model rather than consuming that package today.
- CI has two required-looking jobs in branch protection: `test` and `coverage`. Current `main` protection for `ouro-work-substrate` requires strict status checks `test` and `coverage`, enforces admins, requires linear history, and requires conversation resolution.
- Current `main` protection for `ouroboros` requires `coverage`, enforces admins, requires linear history, and requires conversation resolution. The earlier linear-history/conversation-resolution request is already satisfied there.
- Inbound hosted proof exists on Container Apps external TCP `2525`; production MX remains blocked because `ouro.bot` still points at a dead Microsoft 365-shaped target.
- `apps/mail-ingress/src/server.ts` disables `STARTTLS` and `AUTH`; it has size collection, unknown-recipient rejection, encrypted storage, and body-safe-ish event metadata, but not production port-25/TLS/rate/recipient policy.
- `apps/mail-control/src/server.ts` can ensure hosted registry entries and returns generated private keys once. Harness setup still creates local registry/key state and does not yet call hosted Mail Control for production truth.
- `src/mailroom/reader.ts` in the harness can read file or Azure Blob Mailroom stores from `runtime/config`, but production setup must write the hosted Blob coordinates and appropriate credential path.
- Harness outbound still records `draft | sent | failed`; ACS is recognized but throws "configured but not enabled". Provider acceptance/delivery/bounce/quarantine/suppression are not modeled end to end.
- Unit 0c harness correction is complete on `slugger/vault-item-surface` at `4dec8d50...`: generic vault items first, managed workflows second, non-secret bindings third, notes never parsed, `vault ops porkbun` deprecated compatibility alias.
- There is no PR yet for the harness vault-item branch and no PR yet for the substrate full-moon branch. Harness alpha.466 release preflight passes but the branch is not merged/published/installed.

## Surviving Shape

The production shape should be three coordinated release lanes:

1. **Harness product lane**: npm-published `@ouro.bot/cli` / `ouro.bot` releases. This is how agent-facing CLI/runtime changes reach real agents. The vault-item correction must merge, publish alpha.466+, and be installed before DNS/mail workflow work depends on it.
2. **Hosted service lane**: private repo, commit-addressed Docker images, Bicep, and GitHub Actions deploy-after-green-CI. Do not invent a substrate npm package for deployable apps; the production artifact is the deployed Container Apps revision plus rollback path.
3. **Shared contract lane**: either make `@ouro/work-protocol` a real versioned package that the harness consumes, or create generated schema/fixture contract tests that fail on drift. Because native/delegated mail and outbound status semantics cross repo boundaries, this cannot remain a vibe or duplicated TypeScript by memory.

The credential shape is now stable:

- A vault item is just a private item/credential with notes and fields.
- A workflow binding says how a workflow uses that item.
- Code consumes binding/config, never note prose.
- Provider templates are convenience, not ontology.

## Scrutiny Notes

### Tinfoil Hat

- "Mail works" can lie if it means proof port `2525`; MX cannot encode that port. Prime time requires external port 25 or a dedicated mail edge.
- "Setup works" can lie if the harness creates local keys while hosted ingress encrypts to a different hosted public key. Production setup must make Mail Control the truth and store returned private keys immediately.
- "Sent" can lie if it only means provider submission. Outbound records must model submitted, accepted, delivered, bounced, suppressed, quarantined/spam-filtered, failed, and reconciled outcomes.
- "Forwarding works" can lie if HEY forwards to `slugger@ouro.bot`; that proves delivery while destroying delegated-source provenance. HEY must target `test.example.owner.slugger@ouro.bot`.
- "Deploys automatically" can lie if packaging/release gates are separate. Harness npm release and hosted Azure deploy are different lanes and both need evidence.
- "Shared protocol" can lie if the harness keeps a copied model. Cross-repo drift needs an explicit package or contract gate.

### Stranger With Candy

- A Porkbun API item is not a DNS credential. The DNS workflow binding may reference it, but the item itself has no assumed use.
- `runtime/config` looks like just another vault item, but it is harness-managed and must stay outside freeform vault item commands.
- Azure Container Apps looks like the obvious inbound edge because it already worked on `2525`, but port 25 may still fail. The plan needs a fallback edge, not sunk-cost attachment.
- ACS looks like "email solved", but it is outbound submission/domain-auth/events, not the inbound mailbox engine.
- HEY browser automation looks agent-run, but login/MFA/export/forwarding confirmation are human-at-keyboard gates. Slugger should drive browser MCP as far as safe, then ask only for the irreducible human step.
- A docs-only planning commit can skip Azure deploy correctly only when every change since the currently deployed commit-tagged image is documentation-only. A docs-only head commit after runtime changes must still deploy.

## Thin Slice

The next production slice should not jump straight into DNS cutover. The safe sequence is:

1. Merge/publish/install the harness vault-item surface so future DNS/mail work has the right credential primitive.
2. Refresh planning/doing docs with packaging/deploy lanes and shared-contract strategy.
3. Add tests for the two-lane mail contract and shared protocol drift.
4. Make production setup call hosted Mail Control and write hosted Blob coordinates/private keys into `runtime/config`.
5. Add DNS workflow binding and provider driver tests that reference generic vault item paths.
6. Only then proceed to port-25/TLS/DNS apply, HEY onboarding, outbound provider/events, autonomy, and live smoke.

## Non-Goals

- Do not npm-publish the whole hosted substrate as if it were the harness CLI.
- Do not let notes become machine-readable workflow contracts.
- Do not do HEY login/export/forwarding manually as Codex; Slugger should manage browser MCP and request human help only for MFA/auth/export/confirmation gates.
- Do not make delegated HEY mail send as Alex in this program.
- Do not declare production mail ready on proof-port delivery, local-only setup, provider submission without delivery events, or screenshots without live smoke.

## Open Questions

- No human product decision is blocking the refreshed plan. The main design decision is agent-runnable: whether `@ouro/work-protocol` should become a published package or whether a generated schema/contract gate is enough for the first production release. My current recommendation is to plan for a package boundary unless code inspection shows release overhead is larger than drift risk.

## Planner Handoff

Goal: update the existing full-moon planning/doing docs so they reflect the corrected vault item primitive, three release lanes, shared contract packaging decision, branch protection facts, and the exact "done" bar for merged + deployed + smoke-tested production mail.

Constraints:

- Process approval gates remain waived by the human; stop only for real external gates.
- Work must be committed and pushed after each logical checkpoint.
- Maintain 100% coverage on new code and no warnings.
- Keep native agent mail and delegated human mailbox source visibly separate in every protocol, storage, UI, tool, prompt, policy, and recovery surface.
- Keep hosted services unable to read private mail bodies or hold private keys.
- Slugger, not Codex, should own HEY browser/MFA/export/forwarding automation during live onboarding.

Likely files/modules:

- Substrate: `packages/work-protocol/src/mail.ts`, `apps/mail-control/src/*`, `apps/mail-ingress/src/*`, `infra/azure/main.bicep`, `.github/workflows/*`, `scripts/*`, `docs/*`.
- Harness: `src/heart/daemon/cli-exec.ts`, `src/mailroom/*`, `src/repertoire/tools-mail.ts`, `src/heart/outlook/*`, `docs/agent-mail-setup.md`, package/release metadata.
- DNS workflow: new binding/driver files to be located by planner after code scan; must consume vault item refs without parsing notes.

Acceptance signals:

- Harness vault-item branch merged, published, and installed.
- Branch protections verified or repaired for both repos.
- Production setup idempotently calls hosted Mail Control and stores one-time private keys.
- Hosted Blob reader config works from Slugger's vault.
- DNS dry-run/backup/apply/verify/rollback works through a binding referencing a generic vault item.
- Port 25 and STARTTLS are proven on final MX target or a fallback mail edge is deployed.
- Native inbound, delegated HEY backfill/forward, native outbound provider/events/autonomy, Outlook audit, and recovery docs are live-smoked.
- `npm run ci:local` passes in substrate; harness coverage/release preflight passes; no warnings.
