# Unit 3c - DNS Workflow Coverage, Observability, And Live Read-Only Repair

Date: 2026-04-22

## Scope

Unit 3c hardened the DNS workflow path after Unit 3b added the binding-backed Porkbun driver.

The important production correction from this unit: the live Porkbun read-only plan showed that provider records are returned with fully-qualified names (`ouro.bot`) and Porkbun's `prio` field, while the desired binding uses relative names (`@`) and `priority`. Without normalization, applying the plan would have created a second MX record and left the old Outlook MX with priority `0`. The harness now normalizes provider records before planning.

## Harness Changes

- `src/heart/daemon/dns-workflow.ts`
  - Normalizes Porkbun provider records:
    - root `ouro.bot` -> `@`;
    - subdomain `mx1.ouro.bot` -> `mx1`;
    - `prio` -> `priority`;
    - string TTL/prio values -> numbers.
  - Preserves non-managed provider record types in backup/preserved records without allowing bindings to manage unsupported types.
  - Emits redacted Nerves events around provider requests:
    - `daemon.dns_provider_request_start`;
    - `daemon.dns_provider_request_end`;
    - `daemon.dns_provider_request_error`.
  - Keeps request bodies and provider secrets out of events.

- `src/heart/daemon/cli-exec.ts`
  - DNS workflow secret resolution still prefers the generic vault item shape:
    - `secretFields.apiKey`;
    - `secretFields.secretApiKey`.
  - It also supports the known legacy Porkbun helper payload shape with top-level `apiKey` / `secretApiKey`, because the real Slugger item was created before the generic vault item patch-forward landed.
  - This compatibility path does not parse notes and does not infer credential meaning from the vault item.

- `src/__tests__/heart/daemon/dns-workflow.test.ts`
  - Added coverage for malformed bindings, provider mutation errors, rollback application, artifact redaction, provider-record normalization, no-id provider records, and Nerves-covered driver paths.

- `src/__tests__/heart/daemon/provider-cli-commands.test.ts`
  - Added DNS command parser guard coverage.
  - Added CLI workflow coverage for:
    - generic `secretFields` vault item shape;
    - legacy flat Porkbun payload shape;
    - absolute and current-directory-relative binding paths;
    - apply/rollback mutation endpoints.

## Verification

- Focused DNS workflow tests:
  - `npx vitest run src/__tests__/heart/daemon/dns-workflow.test.ts`
  - 8 tests passed.

- Focused DNS CLI tests:
  - `npx vitest run src/__tests__/heart/daemon/provider-cli-commands.test.ts -t "dns workflow"`
  - 3 tests passed, 182 skipped.

- TypeScript:
  - `npx tsc --noEmit`
  - Passed.

- Full harness coverage/Nerves gate:
  - `npm run test:coverage -- --run src/__tests__/heart/daemon/provider-cli-commands.test.ts src/__tests__/heart/daemon/dns-workflow.test.ts src/__tests__/docs/agent-mail-setup.contract.test.ts`
  - 483 test files passed.
  - 9166 tests passed, 33 skipped.
  - All files: 100% statements, 100% branches, 100% functions, 100% lines.
  - `cli-exec.ts`: 100%.
  - `cli-parse.ts`: 100%.
  - `dns-workflow.ts`: 100%.
  - Nerves audit: pass.
  - Coverage gate: pass.
  - Saved log: `unit3c-harness-coverage.log`.

- Work substrate coverage:
  - `npm run test:coverage`
  - 16 files passed.
  - 91 tests passed.
  - 100% statements, branches, functions, lines.

## Live Read-Only Proof

Command:

```sh
npm run ouro -- dns plan --agent slugger --binding /Users/maintainer/Projects/ouro-work-substrate/infra/dns/ouro.bot.binding.json --output /Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit3c-live-dns-plan.json
```

Result:

- Succeeded without `--yes`; no DNS mutation occurred.
- Used the real Slugger vault item:
  - `vault:slugger:ops/registrars/porkbun/accounts/owner@example.test`.
- Wrote `unit3c-live-dns-plan.json`.
- No `apiKey`, `secretApiKey`, `X-API-Key`, `X-Secret-API-Key`, or private-key material appeared in the JSON/log artifact.
- Planned changes after provider normalization:
  - create `A mx1 -> 20.10.114.197`;
  - update existing root `MX @` by provider id `540390853` from Outlook to `mx1.ouro.bot` priority `10`;
  - create `_dmarc` TXT.
- Preserved records: 12.
- Applied records: 0.

## Notes For The Next Agent

- Do not apply DNS until the live plan has been reviewed in the current deployment context.
- If apply is approved by task scope, use `ouro dns apply --yes` only after taking a backup artifact.
- Rollback requires a backup artifact and `--yes`; the code only mutates allowlisted records.
- The vault item remains an ordinary item. DNS workflow semantics live in the binding, not in the credential.
- Notes are still human/agent orientation only. No code path added here parses notes.
