# Unit 8c: Outlook, Tools, And Audit Ergonomics - Coverage And Refactor

Completed: 2026-04-23

## Harness Commit

- Repo: `/Users/maintainer/Projects/_worktrees/slugger-delegated-hey-harness`
- Branch: `slugger/native-mail-autonomy`
- Commit: `356fc240116260ef440efb4f559ba13410207242`
- Pushed: yes

## What Changed

- Kept `mail_send` native-agent provenance explicit instead of allowing impossible delegated-send fallback fields into access audit output.
- Added provider-status coverage for policy-decision rendering, policy fallback rendering, and legacy policyless outbound records.
- Added Outlook reader coverage for delivery events with absent optional recipient/provider status fields.
- Replaced an ES2022 `.at(-1)` UI call with an indexed lookup so the Outlook UI type target stays compatible.
- Fixed a real Outlook deep-link regression found by visual proof: React StrictMode could consume `#/agent/slugger/mail` and then reset the active tab to Overview on the second effect pass. `AgentInspector` now only resets to Overview when the selected agent actually changes.

## Verification

- `npm test -- --run src/__tests__/heart/outlook/outlook-mail.test.ts src/__tests__/mailroom/tools-mail-provider-status.test.ts src/__tests__/mailroom/tools-mail.test.ts`
  - Result: pass
  - Files: 3 passed
  - Tests: 25 passed
- `npm --prefix packages/outlook-ui test -- --run src/components/tabs/live-refresh.test.tsx`
  - Result: pass
  - Files: 1 passed
  - Tests: 15 passed
- `npm run build`
  - Result: pass
- `npm --prefix packages/outlook-ui run build`
  - Result: pass
- `npm run test:coverage`
  - Result: pass
  - Files: 486 passed
  - Tests: 9,192 passed, 33 skipped
  - Coverage: 100% statements, 100% branches, 100% functions, 100% lines
  - Nerves audit: pass
  - Coverage summary: `/var/folders/md/_fkq3wc92_z55cgtlrfrcfh40000gn/T/ouroboros-test-runs/ouroboros-agent-harness/cwd-1b9271972c26/2026-04-23T09-56-38-495Z/coverage-gate-summary.json`
  - Nerves summary: `/var/folders/md/_fkq3wc92_z55cgtlrfrcfh40000gn/T/ouroboros-test-runs/ouroboros-agent-harness/cwd-1b9271972c26/2026-04-23T09-56-38-495Z/nerves-coverage.json`

## Visual Proof

Generated with:

```bash
UNIT8C_ARTIFACTS_DIR=/Users/maintainer/Projects/_worktrees/slugger-delegated-hey-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path OUTLOOK_VISUAL_URL=http://127.0.0.1:6878 node /Users/maintainer/Projects/_worktrees/slugger-delegated-hey-substrate/slugger/tasks/2026-04-22-1308-doing-mail-production-path/unit8c-outlook-visual.mjs
```

The script uses an artifact-local mocked API over the real Outlook UI bundle, asserts body-safe native/delegated audit text, and checks `document.documentElement.scrollWidth <= window.innerWidth + 1` at desktop and mobile widths.

Artifacts:

- `unit8c-outlook-visual.mjs`
- `unit8c-mailbox-desktop.png`
- `unit8c-mailbox-sent-desktop.png`
- `unit8c-mailbox-mobile.png`

The first visual attempt exposed the StrictMode deep-link reset described above. A regression test now covers that path before the screenshots are produced.
