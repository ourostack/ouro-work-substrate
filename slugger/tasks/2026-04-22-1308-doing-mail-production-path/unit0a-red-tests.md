# Unit 0a Red Tests

Harness worktree:

- path: `/Users/maintainer/Projects/_worktrees/slugger-vault-item-surface`
- branch: `slugger/vault-item-surface`
- commit: `778d74b68d1fe2295e0d173d7a5c511ad2f35afd`

## Command

```bash
npx vitest run src/__tests__/docs/auth-and-providers.contract.test.ts src/__tests__/heart/daemon/cli-help.test.ts src/__tests__/heart/daemon/provider-cli-commands.test.ts src/__tests__/repertoire/tools-credential.test.ts
```

## Result

Expected red:

- 4 test files failed.
- 7 tests failed.
- 258 tests passed.

The failures are the intended Unit 0a contract failures:

- `docs/auth-and-providers.md` still has `## Operational Credentials` and does not yet teach `## Vault Items, Managed Workflows, And Bindings`.
- `README.md`, `AGENTS.md`, and `docs/auth-and-providers.md` do not yet make `vault item / credential` with `no assumed use` the first-class model.
- `ouro help vault` still lists `ops porkbun` without generic `vault item set/status/list`.
- `parseOuroCommand` does not yet parse `vault item set/status/list`.
- `vault ops porkbun set/status` still behaves as a first-class ops credential flow and prints `authority:`.
- The stored Porkbun payload still includes provider-shaped meaning instead of an ordinary vault item payload with `publicFields` and `secretFields`.
- Agent-facing `credential_*` tools still describe stored credentials as domains instead of vault item names/paths.

## Invariant Locked By These Tests

The primitive is an ordinary vault item / credential with no assumed use. Managed workflows and workflow bindings may reference a vault item, but the item itself does not become an ops credential, DNS credential, provider credential, or authority. Notes are for human/agent orientation and are not machine contracts.
