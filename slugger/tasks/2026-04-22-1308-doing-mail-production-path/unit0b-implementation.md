# Unit 0b Implementation

Harness worktree:

- path: `/Users/maintainer/Projects/_worktrees/slugger-vault-item-surface`
- branch: `slugger/vault-item-surface`
- commit: `2fb109a3b5592190f2a51173e331b704ad3a2651`

## Implemented

- Added generic `ouro vault item set/status/list` parsing, help, execution, and docs.
- Stored generic item payloads as ordinary vault items with `publicFields`, `secretFields`, `schemaVersion`, and `updatedAt`; no provider-shaped `kind`.
- Made `vault ops porkbun set/status` a deprecated compatibility alias over ordinary vault item commands.
- Preserved hidden terminal entry and no-secret output.
- Updated `README.md`, `AGENTS.md`, and `docs/auth-and-providers.md` to teach vault item / credential, managed workflow, freeform vault item, and binding / run config as separate objects.
- Updated agent-facing `credential_*` tool descriptions and schemas to prefer vault item name/path while keeping `domain` as a compatibility alias.

## Verification

Focused harness contracts:

```bash
npx vitest run src/__tests__/docs/auth-and-providers.contract.test.ts src/__tests__/heart/daemon/cli-help.test.ts src/__tests__/heart/daemon/provider-cli-commands.test.ts src/__tests__/repertoire/tools-credential.test.ts
```

Result: 4 files passed, 265 tests passed.

Compiler:

```bash
npx tsc --noEmit
```

Result: passed.

Source vocabulary check:

```bash
rg -n "Operational Credentials|ops-credential/porkbun|authority:|ops credentials|PORKBUN_OPS_CREDENTIAL_KIND|vault\\.ops\\.porkbun" src docs README.md AGENTS.md
```

Result: only the contract tests assert the forbidden strings stay absent.
