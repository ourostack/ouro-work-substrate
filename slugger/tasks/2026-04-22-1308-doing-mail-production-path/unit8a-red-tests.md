# Unit 8a Red Tests: Outlook, Tools, And Audit Ergonomics

Date: 2026-04-23

Harness commit pushed:

- `05993d3c test(mail): Unit 8a - outlook tools audit ergonomics`

## What The Tests Now Require

The red tests encode the executive-assistant mailbox boundary:

- Outlook owner-scoped delegated source folders must filter by both provider source and human owner.
- Outlook access audit entries must visibly label `delegated human mailbox` versus `native agent mailbox`.
- Outlook outbound rows must show autonomous send mode, native send authority, provider ids, policy decision, delivery events, and body-safe delivery summaries.
- The Outlook reader API must expose outbound autonomy/provider/delivery fields without exposing outbound body text.
- `mail_send` output and access logs must show native send authority and autonomy policy decision/fallback.

## Red Evidence

Command:

```bash
npm test -- --run src/__tests__/heart/outlook/outlook-mail.test.ts src/__tests__/mailroom/tools-mail.test.ts
```

Result:

- Failed as expected.
- `src/__tests__/mailroom/tools-mail.test.ts`: 1 failing test, 15 passing.
- `src/__tests__/heart/outlook/outlook-mail.test.ts`: 1 failing test, 7 passing.
- Total: 2 failed, 22 passed.

Expected failures:

- `mail_send` currently omits `send authority: native agent mailbox`.
- The Outlook reader currently drops `sendMode`, `policyDecision`, `providerRequestId`, `operationLocation`, `acceptedAt`, `failedAt`, and `deliveryEvents` from outbound records.

Command:

```bash
npm --prefix packages/outlook-ui test -- --run src/components/tabs/live-refresh.test.tsx
```

Result:

- Failed as expected.
- `packages/outlook-ui/src/components/tabs/live-refresh.test.tsx`: 2 failing tests, 12 passing.

Expected failures:

- Clicking `Alex HEY` currently shows `No records here` because `source:hey:owner@example.test` is compared directly to message source `hey`.
- The access audit currently renders only tool/reason, not `delegated human mailbox`, `owner@example.test / hey`, or `native agent mailbox`.

Discovery note:

- The root harness Vitest config excludes `packages/**`, so Outlook UI tests must run through `npm --prefix packages/outlook-ui test`.

## Body-Safety Assertion

The new API/UI tests intentionally include raw body/private diagnostic strings in fixtures and only expect body-safe summaries in mailbox surfaces. Unit 8b must preserve that boundary while making the audit state visible.
