# Unit 0e: Harness Vault Item Surface — Merge, Publish, Install

## Purpose

Get the completed harness vault-item surface out of a feature branch and into the actual runtime lane agents use.

This is a production gate for later DNS/mail work: workflow code may reference ordinary vault item paths only after the installed harness has the generic `ouro vault item` surface and the deprecated `vault ops porkbun` compatibility alias.

## Harness Branch

- Repo: `ourostack/ouroboros`
- Worktree: `/Users/maintainer/Projects/_worktrees/slugger-vault-item-surface`
- Branch: `slugger/vault-item-surface`
- Head: `4dec8d50c9f5c05986352fb48616b9ceb229e563`
- Version prepared for publish: `0.1.0-alpha.466`

## PR

- PR: https://github.com/ourostack/ouroboros/pull/587
- Created: 2026-04-22
- Result: merged 2026-04-23T02:03:57Z
- Merge commit: `c4c784edc1f209504c2d991f23d9394132cf5f69`
- PR CI: `coverage`, `integration`, and `package-e2e` passed.

## Local Verification Already Completed

- Focused vault/docs/help/credential/nerves tests passed.
- `npx tsc --noEmit` passed.
- `npm run test:coverage` passed with the harness 100% gate.
- `npm run release:preflight` passed after the alpha.466 version and changelog bump.

## Release Mechanics

Harness `.github/workflows/coverage.yml` is the release lane:

- Pull requests run `coverage`, `integration`, and `package-e2e`.
- The `coverage` PR job also runs `npm run release:preflight -- --base-ref origin/main`.
- Pushes to `main` run the same required jobs.
- On `main`, the `publish` job waits for `coverage`, `integration`, and `package-e2e`, then:
  - builds the repo,
  - publishes `@ouro.bot/cli@<package.json version>` if that version is not already published,
  - publishes `ouro.bot@<packages/ouro.bot version>` when wrapper changes require it,
  - verifies the supported `latest` dist tags,
  - runs `npm run release:smoke`.

## Remaining Steps

- None.

## Published And Installed Evidence

- Post-merge `coverage-gate` push run passed: https://github.com/ourostack/ouroboros/actions/runs/24812690091
- The `publish` job passed after publishing/verifying packages and running release smoke.
- `npm view @ouro.bot/cli@latest version`: `0.1.0-alpha.466`
- `npm view ouro.bot@latest version`: `0.1.0-alpha.466`
- `npx --yes ouro.bot@latest -v` installed `@ouro.bot/cli@0.1.0-alpha.466` and reported:
  - `ouro updated to 0.1.0-alpha.466 (was 0.1.0-alpha.465)`
  - `0.1.0-alpha.466`
- Local `ouro -v`: `0.1.0-alpha.466`
- Installed `ouro help vault` includes `item` in the vault subcommand list.
- Installed `ouro vault item status --agent slugger --item ops/registrars/porkbun/accounts/owner@example.test` reported:
  - item present,
  - username `owner@example.test`,
  - notes present,
  - secret values not printed.
- Installed `ouro vault item list --agent slugger --prefix ops/registrars/porkbun` listed `ops/registrars/porkbun/accounts/owner@example.test` without printing secrets.
- Installed `ouro vault ops porkbun status --agent slugger --account owner@example.test` reported:
  - deprecated compatibility alias,
  - ordinary vault item path,
  - account `owner@example.test`,
  - notes present,
  - secret values not printed.

## Notes

- The first `gh pr create` attempt failed because `--head slugger/vault-item-surface` was parsed as an `owner:branch` pair. Retried successfully with `--head ourostack:slugger/vault-item-surface`.
- Before merge, local `ouro -v`, `npx ouro.bot@latest -v`, `@ouro.bot/cli@latest`, and `ouro.bot@latest` all reported `0.1.0-alpha.465`; `0.1.0-alpha.466` was not published yet. This is expected until the `main` publish job completes.
- Post-merge `coverage-gate` push run for `main`: https://github.com/ourostack/ouroboros/actions/runs/24812690091
- This unit became done only after the installed runtime, not just the branch, had the surface.
