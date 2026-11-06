# Unit 0 Vault Surface Documentation Map

This artifact follows `unit0-vault-item-model.md`. The model is now clear; this maps the code, CLI, and docs that must make that model obvious to the next agent.

## Spark

Future agents should not have to rediscover the credential ontology by arguing with a provider-specific helper. They should see the existing primitive first:

- an agent-owned vault item / credential;
- stable item name/path;
- hidden secret material;
- optional public fields;
- freeform notes;
- folder-ish organization and tags;
- timestamps/provenance;
- no assumed use.

`ouro connect` remains for managed workflows the harness owns. DNS/mail/etc. use non-secret bindings that reference vault items. Notes orient humans and agents; code does not parse them.

## Observed Terrain

### Existing Primitive Already Exists

The harness already has a general vault-backed credential layer:

- `/Users/maintainer/Projects/ouroboros-agent-harness/src/repertoire/credential-access.ts` says each agent owns one credential vault and `getCredentialStore()` returns that agent's vault directly.
- `CredentialStore` exposes `get`, `getRawSecret`, `store`, `list`, `delete`, and `isReady` over item names.
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/repertoire/bitwarden-store.ts` already creates, edits, lists, reads, and deletes Bitwarden/Vaultwarden items.
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/repertoire/tools-credential.ts` already has agent-facing credential tools with notes, metadata-only list/get, hidden secret handling, and no password return.

So the production fix is not "invent a new credential system." It is exposing and documenting the existing primitive correctly.

### Existing Docs Are Partly Right

The current checked-out harness docs already say:

- each agent owns one vault;
- the vault is the agent's password manager;
- most items are just stored credentials for tools and services;
- a few well-known items are harness-readable because Ouro uses them on the agent's behalf.

Good phrases exist in:

- `/Users/maintainer/Projects/ouroboros-agent-harness/README.md`;
- `/Users/maintainer/Projects/ouroboros-agent-harness/AGENTS.md`;
- `/Users/maintainer/Projects/ouroboros-agent-harness/CONTRIBUTING.md`;
- `/Users/maintainer/Projects/ouroboros-agent-harness/docs/auth-and-providers.md`;
- `/Users/maintainer/Projects/ouroboros-agent-harness/docs/cross-machine-setup.md`;
- `/Users/maintainer/Projects/ouroboros-agent-harness/skills/travel-planning.md`.

The docs are not strong enough yet because they do not put the neutral vault item primitive, managed workflow, freeform item, and binding/run-config distinction in one canonical place.

### Misleading Surface On Harness Origin

`/Users/maintainer/Projects/ouroboros-agent-harness` was one commit behind origin during this inspection. Inspecting `FETCH_HEAD` showed the problematic production-facing surface:

- `docs/auth-and-providers.md` adds `## Operational Credentials`;
- `docs/auth-and-providers.md` teaches `ops/registrars/porkbun/accounts/<account>` as an operational credential pattern;
- `README.md` advertises `ouro vault ops porkbun set --agent <name> --account <account>`;
- `src/heart/daemon/porkbun-ops.ts` defines `PORKBUN_OPS_CREDENTIAL_KIND = "ops-credential/porkbun"`;
- `src/heart/daemon/cli-help.ts` lists `ops porkbun set` and `ops porkbun status` under `ouro vault`;
- `src/heart/daemon/cli-parse.ts`, `cli-types.ts`, and `cli-exec.ts` make `vault.ops.porkbun.*` first-class command kinds;
- `src/__tests__/heart/daemon/provider-cli-commands.test.ts` asserts `kind: "ops-credential/porkbun"` inside the stored secret payload.

The installed CLI confirms that this is not theoretical:

```text
ouro help vault
  ops porkbun set
  ops porkbun status

ouro vault ops porkbun
  Usage: ouro vault ops porkbun set|status [--agent <name>] [--account <account>]
```

That helper did useful safety work: hidden prompts, no secret printing, stable account-scoped naming, SerpentGuide guardrails, status without secrets, and account/domain separation. The mistake is that those safety choices were encoded as a new credential species.

### Misleading Older Vocabulary

Even before the Porkbun helper, some generic surfaces use domain-shaped language:

- `CredentialMeta.domain`;
- `CredentialStore.get(domain)`;
- `CredentialStore.store(domain, ...)`;
- agent tools named around "credential domains";
- credential tool schemas requiring `domain` even when an item path like `ops/porkbun/owner@example.test` is not a domain.

This vocabulary quietly teaches the wrong thing. A vault item name can be a service domain, but it can also be a path, account label, integration key, local machine attachment, or future workflow reference.

## Divergent Pass

### Boring Version

Only add docs saying "Porkbun is an example."

Rejected. The CLI and tests would still make the wrong model executable and future agents would keep following the stronger signal.

### Ambitious Version

Rename the whole credential subsystem from credentials/domains to vault items, migrate all types, add arbitrary secret/public fields, and remove provider-shaped command kinds in one sweep.

Useful direction, but too broad for the first mail-production correction. It risks dragging provider auth, runtime config, travel tools, user profile, and external tool credentials into one huge PR before DNS/mail can move.

### Surviving Version

Create a small canonical vault item surface and make every stronger signal point at it:

- docs define the primitive and three separate objects;
- help shows `ouro vault item ...` before templates;
- generic CLI supports hidden secret fields, notes, public fields, status/list, and no secret output;
- templates only shape prompts and field names;
- `vault ops porkbun` becomes a deprecated compatibility alias that stores/reads an ordinary item through the generic path;
- tests make the model hard to regress.

## Surviving Shape

### Canonical Documentation Ladder

1. Harness `README.md` and `AGENTS.md`
   - Say "vault item / credential" as the primitive.
   - Say ordinary items have no assumed use.
   - Link to `docs/auth-and-providers.md`.

2. Harness `docs/auth-and-providers.md`
   - Replace `## Operational Credentials` with `## Vault Items, Managed Workflows, And Bindings`.
   - Define:
     - managed workflow;
     - freeform vault item;
     - binding / run config.
   - State that `ouro connect` is only for managed workflows the harness owns.
   - State that notes are human/agent orientation, never machine contracts.
   - State that templates are convenience only.
   - State that `vault ops porkbun` is a deprecated compatibility alias if it remains visible.

3. Harness CLI help
   - Add `ouro vault item set/status/list` as the human-facing generic surface.
   - Show `vault item` before template or compatibility helpers.
   - Mark `vault ops porkbun` as deprecated compatibility, not a primary command family.
   - Never describe a freeform item as an ops credential, DNS credential, authority, or provider credential.

4. Harness agent tools
   - Keep existing `credential_*` tools if needed for compatibility.
   - Introduce or alias item-shaped parameters (`item`, `itemName`, or `path`) so future tool use is not forced through `domain`.
   - Tool descriptions should say "vault item name/path"; domains are examples, not the schema.

5. Work-substrate docs
   - `AGENTS.md` trust invariants should mention that vault items are neutral and workflow bindings carry task semantics.
   - `docs/operations.md` should explain DNS/mail workflow binding references without calling the referenced item a DNS/provider/ops credential.
   - DNS automation docs should name `credentialItem` or `vaultItem`, required secret field names, and resource allowlists in the binding.

6. Contract tests
   - Harness doc contracts assert the primitive and distinctions.
   - Harness CLI/help tests assert `vault item` comes first.
   - Compatibility tests assert `vault ops porkbun` stores an ordinary item and labels itself deprecated.
   - Substrate docs/tests assert "vault item referenced by workflow binding" and forbid notes-as-contract.

### Naming Recommendation

Use `ouro vault item` as the canonical human CLI name.

Reason: "item" is closest to Bitwarden/Vaultwarden and least likely to imply semantics. `credential` can remain as descriptive prose or a compatibility alias, but it is overloaded by provider auth and the existing `credential_*` tools.

Suggested commands:

```bash
ouro vault item set --agent <agent> --item <path> [--field <name> ...] [--public-field <name=value>] [--note <text>] [--template <template>]
ouro vault item status --agent <agent> --item <path>
ouro vault item list --agent <agent> [--prefix <path-prefix>]
ouro vault item note --agent <agent> --item <path>
```

Template behavior:

```bash
ouro vault item set --agent slugger --item ops/porkbun/owner@example.test --template porkbun-api
```

The template prompts for hidden fields. It does not create a special credential kind.

Compatibility behavior:

```bash
ouro vault ops porkbun set --agent slugger --account owner@example.test
```

This should print something like:

```text
deprecated compatibility alias: use ouro vault item set --template porkbun-api
stored ordinary vault item for slugger
item: vault:slugger:ops/registrars/porkbun/accounts/owner@example.test
notes: present
secret values were not printed
```

It should not print `authority:` as a property of the item. If authority/resource scope matters to a DNS workflow, that belongs in the DNS workflow binding.

## Scrutiny Notes

### Tinfoil Hat

- Docs-only would be theater because installed help currently teaches `vault ops porkbun`.
- CLI-only would still fail because future agents read `docs/auth-and-providers.md`, `README.md`, and task docs before running help.
- A template can become ontology again if tests assert `kind: "ops-credential/porkbun"` in the stored payload.
- Notes become unsafe if any workflow parses them for driver, resource allowlist, account scope, or authority.
- `ops/...` is acceptable folder-ish organization, but "ops credential" is not an architectural object.
- Secret shape should be structured enough for the generic item store to hold multiple hidden fields, but workflow semantics must stay in binding/run config.
- The existing `CredentialStore` password slot may tempt a JSON blob of all secret fields. That can be a compatibility bridge, but the user-facing model must expose field names and status without leaking values.

### Stranger With Candy

- "domain" is the lying word in the current generic store/tool surface.
- "Operational Credentials" looks useful but smuggles in a credential category.
- "authority" in command output looks precise but belongs to a workflow/resource binding, not the secret item.
- "Porkbun account" is valid as note/public metadata, but code should not infer DNS authority from that note.
- `ouro connect porkbun` would be wrong unless Ouro owns a full managed runtime capability with validation, health checks, and repair. DNS automation is a workflow binding plus driver, not a connect-bay capability.
- The current Porkbun helper is not trash; it is a good template trapped in the wrong object model.

## Thin Slice

### Harness PR: Vault Item Surface And Docs

1. Add failing docs/help tests first.
   - `docs/auth-and-providers.md` contains "vault item / credential", "no assumed use", "managed workflow", "freeform vault item", "binding / run config", and "code must not parse notes".
   - Docs do not teach `Operational Credentials` as an ontology.
   - `ouro help vault` shows `item set/status/list` before compatibility helpers.

2. Add failing CLI parse/help tests for generic item commands.
   - `vault item set/status/list/note`.
   - Hidden prompt failures.
   - no secret logging.
   - metadata-only status/list.
   - reserved harness-managed item warnings for `providers/*`, `runtime/config`, and `runtime/machines/*/config`.

3. Implement generic item commands over the existing vault store.
   - Canonical item name/path argument.
   - Hidden secret fields.
   - Optional public fields.
   - Editable notes.
   - Created/updated timestamps/provenance if the store can expose them.
   - Status/list that show field names and note presence, not values.

4. Convert Porkbun helper into template/compatibility.
   - Remove or stop exporting `ops-credential/porkbun` as a credential kind.
   - Keep item path compatibility for the already-created Slugger item.
   - Deprecation output points to `ouro vault item set --template porkbun-api`.
   - Tests assert ordinary vault item behavior, not a special kind.

5. Fix agent tool vocabulary enough to stop future confusion.
   - Prefer item/name/path in descriptions.
   - Keep old `domain` parameter only as compatibility if changing schemas would be too broad.

### Substrate PR: Workflow Binding Orientation

1. Add trust invariant language to `AGENTS.md`.
2. Add DNS/mail credential binding section to `docs/operations.md`.
3. Update DNS automation tasks/tests to say "vault item referenced by workflow binding."
4. Store DNS provider requirements in binding/run config:

```yaml
workflow: dns
domain: ouro.bot
driver: porkbun
vaultItem: ops/registrars/porkbun/accounts/owner@example.test
requiredSecretFields:
  - apiKey
  - secretApiKey
resourceAllowlist:
  domains:
    - ouro.bot
```

The binding may describe required secret field names. It must not rely on note text for any machine-readable fact.

## Non-Goals

- Do not build `ouro connect porkbun`.
- Do not create an ops credential system.
- Do not create DNS credential, registrar credential, or provider-shaped credential ontologies for freeform items.
- Do not parse notes.
- Do not make the vault item itself carry workflow authority.
- Do not block DNS/mail work on renaming every old `domain` variable in the harness, as long as new docs/help/tool descriptions stop teaching that as the model.

## Open Questions

No human decision is needed before implementation.

The recommendation is to make `ouro vault item` canonical because it names the primitive most cleanly. If later user experience proves `credential` is clearer for humans, it can be an alias; it should not be the architecture.

## Planner Handoff

Goal:

- Make the existing agent-owned vault item primitive obvious and hard to regress across harness docs, CLI help, CLI behavior, agent tool descriptions, and substrate runbooks before DNS/mail production automation consumes vault item references.

Constraints:

- Notes are first-class but never parsed by code.
- `ouro connect` is only for harness-managed capabilities.
- Templates are prompt conveniences only.
- Existing Slugger Porkbun item remains usable.
- New code gets 100% coverage.
- Tests come first.

Likely harness files:

- `/Users/maintainer/Projects/ouroboros-agent-harness/docs/auth-and-providers.md`
- `/Users/maintainer/Projects/ouroboros-agent-harness/README.md`
- `/Users/maintainer/Projects/ouroboros-agent-harness/AGENTS.md`
- `/Users/maintainer/Projects/ouroboros-agent-harness/CONTRIBUTING.md`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/__tests__/docs/auth-and-providers.contract.test.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/__tests__/heart/daemon/provider-cli-commands.test.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/heart/daemon/cli-help.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/heart/daemon/cli-parse.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/heart/daemon/cli-types.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/heart/daemon/cli-exec.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/heart/daemon/porkbun-ops.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/repertoire/credential-access.ts`
- `/Users/maintainer/Projects/ouroboros-agent-harness/src/repertoire/tools-credential.ts`

Likely substrate files:

- `/Users/maintainer/Projects/ouro-work-substrate/AGENTS.md`
- `/Users/maintainer/Projects/ouro-work-substrate/docs/operations.md`
- `/Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-planning-mail-production-path.md`
- `/Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path.md`

Acceptance signals:

- `ouro help vault` shows generic vault item operations before compatibility helpers.
- A human can store an arbitrary item with notes and hidden fields without using a provider-specific command.
- Generic status/list show metadata, field names, note presence, timestamps/provenance, and no secret values.
- Porkbun helper output says deprecated compatibility alias and ordinary vault item.
- Docs define managed workflow, freeform vault item, and binding/run config.
- No docs or tests treat `ops credential`, `Porkbun credential`, `DNS credential`, `authority`, or provider-shaped credential kinds as the architecture for freeform vault items.
- DNS/mail docs consume explicit workflow bindings that reference vault item paths.
