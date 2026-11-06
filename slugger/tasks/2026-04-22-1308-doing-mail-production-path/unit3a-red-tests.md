# Unit 3a Red Tests: DNS And Certificate Automation

Date: 2026-04-22 20:33

## Scope

This unit defines the failing contract for DNS and certificate automation before any implementation exists.

The intended shape is:

- substrate owns the non-secret production DNS binding and operations runbook;
- harness owns agent-vault lookup and workflow execution;
- the binding references an ordinary vault item by path;
- Porkbun is only the current `ouro.bot` DNS driver;
- code reads structured secret fields, never vault-item notes;
- every mutation path has backup, dry-run, apply, verify, rollback, allowlist, and redaction behavior.

Official Porkbun API references used for the driver expectations:

- https://porkbun.com/api/json/v3/spec
- https://porkbun.com/api/json/v3/documentation

The current Porkbun spec documents header authentication with `X-API-Key` / `X-Secret-API-Key`, GET support for read-only endpoints, rate-limit metadata, DNS management, and SSL bundle retrieval. The tests pin the safe read-only shape for `ping`, `dns/retrieve`, and `ssl/retrieve`.

## Substrate Red Tests

Commit:

- `08abeaa70b3458b1fa94f9ca615cf22e4489fc5f` — `test(dns): Unit 3a - workflow binding docs contract`

Files:

- `scripts/__tests__/dns-workflow-contract.test.ts`

Command:

```bash
set -o pipefail; npx vitest run scripts/__tests__/dns-workflow-contract.test.ts 2>&1 | tee slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3a-substrate-red.log
```

Expected red result:

- 2 failed tests.
- `docs/operations.md` does not yet document `## DNS Workflow Binding`.
- `infra/dns/ouro.bot.binding.json` does not yet exist.

The raw log is present locally at `unit3a-substrate-red.log`; `*.log` artifacts are intentionally ignored by repo gitignore.

## Harness Red Tests

Commit:

- `d2c42c7156624ab5b8041eca64803432cdf6f9d9` — `test(dns): Unit 3a - workflow binding red tests`

Files:

- `src/__tests__/heart/daemon/provider-cli-commands.test.ts`
- `src/__tests__/heart/daemon/dns-workflow.test.ts`

Command:

```bash
set -o pipefail; npx vitest run src/__tests__/heart/daemon/provider-cli-commands.test.ts -t "DNS workflow" src/__tests__/heart/daemon/dns-workflow.test.ts 2>&1 | tee /Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3a-harness-red.log
```

Expected red result:

- 6 failed tests.
- `ouro dns ...` is currently an unknown command.
- `src/heart/daemon/dns-workflow.ts` does not yet exist.

The raw log is present locally at `unit3a-harness-red.log`; `*.log` artifacts are intentionally ignored by repo gitignore.

## Implementation Contract For Unit 3b

The next unit must make these tests green without weakening the vault model:

- Add harness `ouro dns backup|plan|apply|verify|rollback --binding <path>` parsing.
- Keep credential item selection inside the binding; do not add `--credential-item` as a command override.
- Add a harness DNS workflow module that validates explicit binding fields and rejects note-derived contracts.
- Resolve only hidden `apiKey` and `secretApiKey` fields from the referenced vault item.
- Use Porkbun GET read endpoints with header auth for read-only checks.
- Preserve unrelated records such as Google/Microsoft verification TXT records.
- Refuse desired records outside the binding allowlist.
- Redact API keys, secret API keys, provider request headers, and certificate private keys from all artifacts.
- Add substrate `infra/dns/ouro.bot.binding.json` and operations docs that describe binding, backup, dry-run, apply, verify, rollback, and recovery.
