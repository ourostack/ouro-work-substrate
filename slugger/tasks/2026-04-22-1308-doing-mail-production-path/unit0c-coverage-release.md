# Unit 0c Coverage And Release Evidence

Harness worktree:

- path: `/Users/maintainer/Projects/_worktrees/slugger-vault-item-surface`
- branch: `slugger/vault-item-surface`
- commit: `4dec8d50c9f5c05986352fb48616b9ceb229e563`
- pushed: yes, to `origin/slugger/vault-item-surface`
- package version after release metadata: `@ouro.bot/cli@0.1.0-alpha.466`, wrapper `ouro.bot@0.1.0-alpha.466`

## What Changed In Unit 0c

- Covered generic `ouro vault item` parser and executor edge cases:
  - missing/invalid item names, prefixes, templates, secret fields, public fields, and notes;
  - noninteractive hidden-secret failure;
  - blank hidden secret rejection;
  - duplicate secret fields across template plus explicit `--secret-field`;
  - public-field absence rendered as `public fields: none`;
  - list with and without prefixes, including trailing slash prefixes;
  - status/list behavior for `SerpentGuide`, which has no persistent credential vault.
- Covered reserved freeform vault item names:
  - `providers/*` stays on `ouro auth` / `ouro connect`;
  - `runtime/config` and `runtime/machines/<id>/config` stay on `ouro vault config` / managed workflow setup.
- Added direct helper coverage for `vault-items.ts`.
- Updated nerves file-completeness rules so `daemon/vault-items.ts` is treated like the other pure CLI helper modules whose callers own observability.
- Removed the obsolete `src/heart/daemon/porkbun-ops.ts` compatibility re-export after confirming there were no production imports.
- Added changelog and version metadata for alpha.466 because release preflight rejected alpha.465 as already published.

## Verification

Focused vault/docs/credential/nerves tests:

```bash
npx vitest run src/__tests__/heart/daemon/vault-items.test.ts src/__tests__/docs/auth-and-providers.contract.test.ts src/__tests__/heart/daemon/cli-help.test.ts src/__tests__/heart/daemon/provider-cli-commands.test.ts src/__tests__/repertoire/tools-credential.test.ts src/__tests__/nerves/file-completeness.test.ts
```

Result: 6 files passed, 295 tests passed.

Compiler:

```bash
npx tsc --noEmit
```

Result: passed.

Full harness coverage gate:

```bash
npm run test:coverage
```

Result:

- lint passed
- changelog gate passed
- Outlook UI typecheck and tests passed
- Vitest coverage passed: 481 files passed, 9,135 tests passed, 33 skipped
- coverage: 100% statements, 100% branches, 100% functions, 100% lines
- nerves audit passed
- coverage gate passed

Release preflight:

```bash
npm run release:preflight
```

Initial result on alpha.465: failed because `@ouro.bot/cli@0.1.0-alpha.465` was already published.

After bumping root package, lockfile, wrapper package, and changelog to alpha.466:

```bash
npm run release:preflight
```

Result:

- `@ouro.bot/cli@0.1.0-alpha.466` is not yet published
- changelog gate passed
- wrapper package changed and local wrapper version is unpublished
- release preflight passed

## Carry Forward

- The harness vault item model is now production-shaped enough to proceed with mail/DNS planning:
  - freeform vault item first;
  - managed workflow second;
  - explicit non-secret binding/run config third;
  - provider templates and `vault ops porkbun` only convenience/compatibility, never architecture.
- Do not let DNS/mail implementation consume notes as machine contracts. If code needs meaning, put it in a binding or run config.
- Before deeper mail implementation, run a fresh full-moon work-suite pass because the planning doc predates the final vault-item ontology and the packaging/deployment questions.
