# Unit 3b Implementation: DNS And Certificate Automation

Date: 2026-04-22 20:41

## What Changed

Substrate now carries the non-secret `ouro.bot` DNS workflow binding and production runbook language:

- `infra/dns/ouro.bot.binding.json`
- `docs/operations.md`
- `docs/architecture.md`

Harness now has the DNS workflow surface:

- `ouro dns backup|plan|apply|verify|rollback --binding <path>`
- explicit binding parsing with `--credential-item` rejected as an override;
- binding validation that rejects note-derived machine contracts and vault-item ontology fields;
- vault item secret resolution for hidden `apiKey` and `secretApiKey` fields only;
- Porkbun read-only driver calls using GET plus header auth;
- Porkbun mutation calls for create/edit/delete;
- backup, plan, apply, verify, and rollback execution paths;
- rollback planning from recorded backups with delete-on-rollback only for allowlisted records;
- artifact redaction for provider keys, secret headers, and certificate private keys.

## Commits

Substrate:

- `10781a26d1c4e5940018e44cb4da3eb7babd0636` — `feat(dns): Unit 3b - workflow binding runbook`

Harness:

- `cc11c0fbef3d391e70320659e4e174037584cda7` — `feat(dns): Unit 3b - workflow binding driver`
- `977486f618ca07a05e63e0cd1d25718e76744a7a` — `feat(dns): Unit 3b - mutation workflow execution`

## Verification

Substrate focused contract:

```bash
set -o pipefail; npx vitest run scripts/__tests__/dns-workflow-contract.test.ts 2>&1 | tee slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3b-substrate-green.log
```

Result: 1 file passed, 2 tests passed.

Substrate build:

```bash
set -o pipefail; npm run build 2>&1 | tee slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3b-substrate-build.log
```

Result: all workspace builds passed.

Harness focused DNS tests:

```bash
set -o pipefail; npx vitest run src/__tests__/heart/daemon/provider-cli-commands.test.ts -t "DNS workflow" src/__tests__/heart/daemon/dns-workflow.test.ts 2>&1 | tee /Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3b-harness-green.log
```

Result: 2 files passed, 6 tests passed, 181 skipped by focus.

Harness typecheck:

```bash
set -o pipefail; npx tsc --noEmit 2>&1 | tee /Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3b-harness-tsc.log
```

Result: passed with no output.

The `*.log` files are present locally in the task artifact directory and ignored by git.

## Notes For Unit 3c

The implementation is intentionally ready for the coverage/refactor pass:

- mutation methods need direct tests for create/edit/delete request shape and error handling;
- rollback needs coverage for malformed backups, missing provider ids, and allowlist deletes;
- CLI execution needs tests around locked/missing vault items, missing secret fields, provider failures, output-file redaction, and no note reads;
- propagation-pending verification still needs a richer status model before live DNS cutover.
