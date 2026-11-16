# Field Note For Future Agents

You are standing in the hosted-service half of Ouro Work. The harness may feel like home, but this repository is the part of the house that touches weather: public mail ingress, vault account creation, cloud identity, deployment, storage, and the audit trail of choices around those things.

Treat it with affection and with very steady hands.

## Interfaces follow Ouro UI

**[Interfaces follow Ouro UI](https://github.com/ourostack/.github/blob/main/agents/interfaces-follow-ouro-ui.md).** Every screen a person uses is built from Ouro HX, every door an agent uses is declared once with `ouro-actions` and checked by the Ouro AX X-ray in CI, Ouro is taken from its release tags (never copied by hand) and kept within a day of them, and what Ouro lacks is fixed in Ouro first.

## North Star

Ouro Work exists so agents can have real work accounts without pretending to be humans using human office suites. A good agent account has:

- a stable identity;
- a private vault;
- native mail;
- delegated human mail when a family member grants it;
- clear provenance for every message and decision;
- bounded tools that let the agent inspect what it needs;
- audit strong enough that a human and agent can reconstruct what happened later.

The hosted service should be powerful without being nosy. It routes, stores, encrypts, and proves health. It does not become the agent's diary, vault, or private mail reader.

## First Orientation

If you are here to change code:

1. Run `git status --short --branch`.
2. Read `README.md`, then this file, then the doc closest to your change.
3. Run `npm run ci:local` before you trust your branch.
4. Keep PRs narrow enough that review can see the trust story.

If you are here to operate production:

1. Start in `docs/operations.md`.
2. Verify GitHub Actions before touching Azure by hand.
3. Prefer rerunning the deploy workflow over local one-off deployments.
4. Never paste secrets into docs, commits, PR bodies, or logs.

## Trust Invariants

- Private mail keys belong in the owning agent vault, not in Blob Storage, GitHub, Container Apps, logs, or local scratch files.
- Mail Control returns newly generated private keys exactly once.
- Mail ingress stores encrypted raw MIME and encrypted parsed private envelopes.
- Unknown native inbound mail goes to Screener.
- Delegated human mail must carry owner/source provenance.
- Discarded mail is retained for audit and recovery; it is not rejected, bounced, or silently erased.
- DNS/MX cutover, HEY forwarding/export, browser auth/MFA, and autonomous sending require explicit human action.

## Repo Map

- `packages/work-protocol`: the shared language. If a concept crosses service/runtime boundaries, it probably starts here.
- `apps/mail-ingress`: public-facing SMTP edge and encrypted mail storage.
- `apps/mail-control`: authenticated mailbox and source-grant provisioning.
- `apps/vault-control`: authenticated vault account creation.
- `infra/azure`: the deployable Azure shape.
- `.github/workflows`: CI and deployment. Main deploys automatically only after CI succeeds.
- `docs`: the reference shelf. Keep it pleasant enough that agents actually read it.

## How To Leave The Place Better

Make the next agent's first five minutes easier. If you learned a production edge, put it in a runbook. If you fixed a scary bug, write the invariant it violated. If a command is easy to misuse, show the safe path and the reason.

Do not write documentation as a ceremony after the "real" work. In this repo, documentation is part of the safety system. It is also part of the welcome.

## The Tiny Oath

Keep the hosted service boring where it should be boring, delightful where it helps orientation, and honest everywhere.
