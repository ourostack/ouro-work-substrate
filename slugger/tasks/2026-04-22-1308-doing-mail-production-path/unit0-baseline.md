# Unit 0 Baseline

Captured: 2026-04-22 17:56 PDT

## Worktrees And Branches

### Work Substrate

- Path: `/Users/maintainer/Projects/ouro-work-substrate`
- Branch: `slugger/mail-production-shape`
- Head: `d016d88c77d0ac7d2a755ae8bfbd0966cb3ca7c1`
- Remote: `git@github.com:ourostack/ouro-work-substrate.git`
- Status at capture: clean, tracking `origin/slugger/mail-production-shape`
- Task docs: `/Users/maintainer/Projects/ouro-work-substrate/slugger/tasks/2026-04-22-1308-*.md`

### Ouroboros Agent Harness

- Primary checkout: `/Users/maintainer/Projects/ouroboros-agent-harness`
- Primary checkout status at capture: clean `main`, behind `origin/main` by #586.
- Task worktree: `/Users/maintainer/Projects/_worktrees/slugger-vault-item-surface`
- Task branch: `slugger/vault-item-surface`
- Task branch base: `origin/main`
- Head: `3c62b8de2c4d66472159ec09fe8efacba753525f`
- Remote: `https://github.com/ourostack/ouroboros`
- Status at capture: clean

`origin/main` contains #586, `Add ops vault entry for Porkbun credentials`. That is the exact surface Unit 0a-c will correct.

## Skill Freshness

Checked `~/.agents/skills/_registry.json` against `github.com/ourostack/ouroboros-skills` for:

- `skill-management`
- `work-ideator`
- `work-planner`
- `work-doer`
- `work-merger`
- `frontend-design`

All checked installed skill SHAs matched the latest upstream commit for their `SKILL.md` files.

## Current Live DNS

Command evidence:

```text
dig +short MX ouro.bot
0 ouro-bot.mail.protection.outlook.com.

dig +short A ouro-bot.mail.protection.outlook.com
<no answer>

dig +short CNAME ouro-bot.mail.protection.outlook.com
<no answer>

dig +short TXT ouro.bot
"MS=ms39590390"
"google-site-verification=WXUIjHyie17jPtPxOPJ24hzDCiWWbCcxJOiTCrKBZVo"
"v=spf1 include:spf.protection.outlook.com -all"

dig +short A mx1.ouro.bot
uixie.porkbun.com.
44.230.85.241
52.33.207.7
```

Interpretation:

- Current root MX still points at the dead Outlook protection hostname.
- The HEY bounce remains expected before our app sees the message.
- `mx1.ouro.bot` currently resolves through Porkbun parking/default infrastructure, not the production mail ingress static IP.
- Existing TXT/SPF records must be backed up before DNS changes.

## Current Azure Production Shape

Resource group: `rg-ouro-work-substrate`

Container Apps environment:

```json
{
  "name": "ouro-prod-cae",
  "location": "East US 2",
  "defaultDomain": "blueflower-44af4710.eastus2.azurecontainerapps.io",
  "staticIp": "20.10.114.197"
}
```

Mail ingress:

```json
{
  "name": "ouro-prod-mail-ingress",
  "fqdn": "ouro-prod-mail-ingress.blueflower-44af4710.eastus2.azurecontainerapps.io",
  "external": true,
  "targetPort": 8080,
  "transport": "Http",
  "additionalPortMappings": [
    {
      "exposedPort": 2525,
      "external": true,
      "targetPort": 2525
    }
  ]
}
```

Mail Control:

```json
{
  "name": "ouro-prod-mail-control",
  "fqdn": "ouro-prod-mail-control.blueflower-44af4710.eastus2.azurecontainerapps.io",
  "external": true,
  "targetPort": 8080
}
```

Vault Control:

```json
{
  "name": "ouro-prod-vault-control",
  "fqdn": "ouro-prod-vault-control.blueflower-44af4710.eastus2.azurecontainerapps.io",
  "external": true,
  "targetPort": 8080
}
```

Health checks:

```text
mail-control: {"ok":true,"service":"ouro-mail-control","domain":"ouro.bot","mailboxes":1,"sourceGrants":1,"revision":"1:1:1436"}
mail-ingress: {"ok":true,"service":"ouro-mail-ingress","domain":"ouro.bot","mailboxes":1,"sourceGrants":1}
vault-control: {"ok":true,"service":"ouro-vault-control"}
```

Port checks against `20.10.114.197`:

```text
2525/tcp: succeeded
25/tcp: timed out
```

Interpretation:

- Hosted control/ingress services are healthy.
- Registry counts agree between Mail Control and Mail Ingress.
- Proof SMTP port `2525` remains live.
- Production port `25` remains unproven/down from the public internet.

## GitHub Baseline

Work Substrate:

- `gh pr list --repo ourostack/ouro-work-substrate --limit 20`: no open PRs printed.
- Latest runs included successful `CI` and successful `Deploy Azure` on `main` at 2026-04-22T20:06:56Z.

Ouroboros Agent Harness:

- `gh pr list --repo ourostack/ouroboros --limit 10`: no open PRs printed.
- Latest main run for #586 was successful: `coverage-gate`, run `24807608718`, 2026-04-22T23:16:57Z.

## Slugger Local Readiness

`ouro vault status --agent slugger` reported:

- Vault: `slugger@ouro.bot` at `https://vault.ouroboros.bot`
- Vault locator: `agent.json`
- Local unlock store: macOS Keychain
- Local unlock: available
- Runtime credentials include:
  - `integrations.openaiEmbeddingsApiKey`
  - `integrations.perplexityApiKey`
  - `mailroom.mailboxAddress`
  - `mailroom.privateKeys.mail_slugger-hey_08c2033a62a2627b`
  - `mailroom.privateKeys.mail_slugger-native_83d8cb6cc4f52c29`
  - `mailroom.registryPath`
  - `mailroom.storePath`
- Provider credentials ready:
  - outward: `openai-codex / gpt-5.4`
  - inner: `minimax / MiniMax-M2.5`

`ouro vault ops porkbun status --agent slugger --account owner@example.test` reported:

```text
agent: slugger
ops credentials: Porkbun
item: vault:slugger:ops/registrars/porkbun/accounts/owner@example.test
status: present
account: owner@example.test
secret values were not printed
```

Interpretation:

- Slugger's vault is locally usable.
- Mailroom runtime keys currently exist locally.
- The Porkbun item exists and remains usable for the immediate DNS driver work, but Unit 0a-c must correct the vocabulary and surface around it before DNS automation consumes it.

## Foundation Mail Docs Reread

Reviewed the foundation docs named in the planning artifact:

- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-20-2100-email-access-research-proposal/proposal.md`
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-20-2319-proposal-agent-native-mail.md`
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1434-ideation-agent-mail-user-stories.md`
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1447-doing-agent-mail-whole-moon.md`
- `/Users/maintainer/AgentBundles/slugger.ouro/tasks/one-shots/2026-04-21-1447-doing-agent-mail-whole-moon/unit16-azure-proof.md`

Carry-forward facts:

- HEY has no normal programmatic fetch path like IMAP; MBOX export is the historical/backfill path and forwarding is useful but not a sole critical-mail source of truth.
- Agent-native `@ouro.bot` mail and delegated human mailbox copies are two stories that share Mailroom substrate but not authority semantics.
- Mail is a sense. Bounded tools inspect mail; raw inbox bodies do not become unfiltered prompt text.
- Native agent mail is Slugger's correspondence. Delegated HEY mail is Alex's mailbox content copied into Slugger's work substrate under owner/source provenance.
- Unknown sender to a known recipient is accepted, stored, and screened. Unknown recipient is rejected during SMTP.
- Discard means retained recovery drawer, not bounce/delete/silent loss.
- Family can grant delegated mailbox access and approve durable mail policy; friend can correspond with the agent through native mail but cannot delegate a human mailbox.
- The completed whole-moon harness work already proved local Mailroom policy, bounded tools, MBOX import, Screener/Discarded behavior, Outlook mailbox UI, confirmed local outbound, Mail sense attention, and Azure proof on port `2525`.
- Prior Azure proof already found that Container Apps runtime, managed identity, Blob path, SMTP accept/reject, and public TCP `2525` worked while public port `25` timed out. The current production baseline still matches that boundary.

## Current Blockers / Human Inputs

No process approval is needed. The user waived planning/doing gates for this task.

Known genuine external/human gates remain:

- Secret material must be entered only through hidden prompts or approved secret stores.
- Slugger's vault may need human unlock if the local unlock state changes.
- DNS/MX changes require careful backup/dry-run/apply/verify/rollback, and final cutover remains a human-at-keyboard production action even if the agent runs the workflow.
- HEY login, MFA/CAPTCHA, export download, forwarding confirmation, and ambiguous browser-account changes remain human-at-keyboard gates; browser automation may only drive safe/recoverable steps.
- Live mail smoke may require the human to send or approve messages from human-controlled mailboxes.
- Provider/domain verification for outbound sending may require browser/provider-console confirmation.

## Next Unit

Proceed to Unit 0a in the harness task worktree:

- Write failing docs/help/CLI tests that make `ouro vault item` the canonical generic human-facing surface.
- Fail where docs or help teach `Operational Credentials`, `ops-credential/porkbun`, `authority`, or provider-shaped credential species as architecture for freeform vault items.
- Keep the existing Porkbun item usable as an ordinary vault item referenced later by a DNS workflow binding.
