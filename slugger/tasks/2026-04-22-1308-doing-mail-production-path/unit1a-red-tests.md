# Unit 1a: Two-Lane Mail Contract — Red Tests

## Purpose

Add failing tests that force the product distinction between:

- Slugger's native agent mailbox, and
- Alex's delegated human mailbox source.

The tests intentionally use product terms rather than low-level implementation terms so future work cannot satisfy the contract by merely carrying `native` / `delegated` as ambiguous flags.

## Substrate Red Test

Command:

```bash
npx vitest run packages/work-protocol/src/__tests__/mail.test.ts
```

Result:

- Failed as expected.
- 1 failed, 12 passed.
- Failure: `describeMailProvenance` is missing from `packages/work-protocol/src/mail.ts`.

Expected contract:

- Native mail describes itself as `agent-native-mailbox`.
- Delegated mail describes itself as `delegated-human-mailbox`.
- Both descriptors include a stable product label, agent id, owner/source fields, recipient, and `sendAsHumanAllowed: false`.

## Harness Red Tests

Command:

```bash
npx vitest run src/__tests__/mailroom/core.test.ts src/__tests__/mailroom/tools-mail.test.ts src/__tests__/mailroom/attention.test.ts src/__tests__/mailroom/outbound.test.ts src/__tests__/heart/outlook/outlook-mail.test.ts
```

Result:

- Failed as expected.
- 5 files failed.
- 5 failed tests, 32 passed.

Intentional failures:

- `mailroom/core.test.ts`: missing shared `describeMailProvenance`.
- `mailroom/tools-mail.test.ts`: access log output and raw access entries do not carry delegated mailbox provenance.
- `mailroom/attention.test.ts`: queued Screener attention summaries do not include mailbox role / compartment / owner / source.
- `mailroom/outbound.test.ts`: outbound draft/sent records do not explicitly say they are native-agent sends and not delegated-human sends.
- `heart/outlook/outlook-mail.test.ts`: Outlook collapses two humans' HEY delegated sources into one `source:hey` folder instead of owner-scoping them.

## Harness Branch

- Repo: `ourostack/ouroboros`
- Worktree: `/Users/maintainer/Projects/_worktrees/slugger-mail-two-lane-contract`
- Branch: `slugger/mail-two-lane-contract`
- Base: `origin/main` at `c4c784edc1f209504c2d991f23d9394132cf5f69`

## Next

Unit 1b should implement the shared provenance descriptor and thread it through stored mail, access logs, attention summaries, outbound records, and Outlook folders without weakening the existing body-safety or trust gates.
