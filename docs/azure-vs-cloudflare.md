# Azure or Cloudflare for Ouro Work

Written 2026-11-17, after Ari's personal Azure subscription (`261e0bf1…`, Visual Studio Enterprise, $150/month credit, spending limit on) was disabled for running out of credit. Cost figures come from Cost Management for the billing period 2026-10-24 to 2026-11-23, read on 2026-11-16 (24 days in, $154.18 spent). "Monthly" below means the 24-day figure scaled by 30/24, so it is an estimate.

## What used the credit

About $6.4 a day, every day, from the first day of the period. Nothing spiked; the resources are simply always on.

| Resource | 24 days | Monthly est. | Why |
| --- | --- | --- | --- |
| `ouro-desk-hosted` (Hosted Desk) | $40.84 | $51 | 2 vCPU and 4 GiB with min replicas 1 (`ourostack/desk` `hosted/infra/provision.sh`). The biggest line, 26% of the credit. Staging is min 0 and cost $0.09. |
| Load balancer + public IP, work-substrate environment | $17.0 | $21 | A Container Apps environment with an external endpoint carries its own load balancer. |
| Load balancer + public IP, mailroom environment | $17.0 | $21 | Same, for an environment that holds only `ca-ouro-mailroom-proof`. |
| Postgres Burstable B1ms, friends-relay | $14.0 | $17.5 | Always on. |
| Postgres Burstable B1ms, vault | $12.4 | $15.5 | Always on. |
| `ouro-prod-mail-ingress` | $9.3 | $11.6 | min replicas 1, 0.5 vCPU / 1 GiB. |
| `ouro-prod-friends-relay` | $9.3 | $11.6 | min replicas 1. |
| Container registries (2) | $7.1 + $3.9 | $13.8 | Basic SKU each. |
| `mail-control`, `vault-control` | $4.6 each | $5.8 each | min replicas 1, 0.25 vCPU. |
| `ca-ouro-mailroom-proof` | $4.5 | $5.6 | A proof app; no references to it in ourostack code. |
| `ouro-vault` (Vaultwarden) | $4.5 | $5.6 | |
| Storage, bandwidth, logs, CIAM, key vaults | ~$6 | ~$7 | |

Three Container Apps environments, two Postgres servers and two registries is the duplication: each environment and each database has a fixed monthly floor whether or not anything runs.

## What each service needs

| Service | Needs | Cloudflare fit |
| --- | --- | --- |
| Mail ingress | Public SMTP on port 25 (MX `mx1.ouro.bot`), encrypted blob storage | Email Routing accepts the mail and hands it to an Email Worker, which can write the encrypted message to R2. It is a rewrite of the SMTP server in `apps/mail-ingress`, not a lift. Cloudflare Containers cannot take inbound port 25. |
| Mail control, vault control, friends relay | Small HTTP services | Workers; fits inside the $5 plan. |
| Vault (Vaultwarden) | A container, Postgres, a stable disk or database | Containers run Vaultwarden, but have no persistent disk: data needs an external Postgres (Neon or Supabase free tier) or another host. Hyperdrive pools Workers connections and does not help a container. |
| Postgres (vault, friends relay) | Postgres | Cloudflare has none; D1 is SQLite. Use an external free-tier Postgres, or a SQLite Vaultwarden. |
| Entra CIAM directories | Entra External ID | Stays on Azure; the directories cost cents a month. |
| Hosted Desk | A 2 vCPU container, always on | A Container with scale to zero, or Azure min 0. |

## Price

Cloudflare Containers bill active use: memory by provisioned GiB-second ($0.0000025), CPU by active vCPU-second ($0.00002), on top of the $5 Workers Paid plan with 25 GiB-hours and 375 vCPU-minutes included ([pricing](https://developers.cloudflare.com/containers/platform/pricing/)). Email Routing is free ([Email Service](https://developers.cloudflare.com/email-service/)).

| Workload | Azure today (monthly est.) | Azure trimmed | Cloudflare |
| --- | --- | --- | --- |
| Everything | $193 | about $115 to $120: delete the mailroom environment, `ouro-desk-hosted` to min 0 | about $12 to $20: $5 plan, a basic-size always-on Vaultwarden container (about $7), R2 and Workers inside the plan, external Postgres on a free tier |

Trimmed Azure is still about 80% of the credit with nothing to spare, because the fixed floors (one load balancer, two Postgres servers, a registry) stay.

## Recommendation

Move, in this order, because Azure's floor is the problem rather than its usage:

1. Vault: a Cloudflare Container running Vaultwarden against a free external Postgres, or Vaultwarden on the Mac mini behind a Cloudflare Tunnel (`deploy/unraid` in `ourostack/ouroboros` already installs it). Keep `vault.ouro.bot` as a Cloudflare DNS record so each cutover is a record change and rolls back by changing it back.
2. Vault control, mail control, friends relay: Workers.
3. Mail ingress last: Email Routing plus an Email Worker. Change the MX record only after a test message lands, and keep the Azure ingress until then.
4. Delete the Azure resource groups after each service has run on Cloudflare for a week.

## What blocks the move tonight

- The Azure subscription is read-only while disabled: no Postgres start, no export, no resource or federated-credential writes (`ReadOnlyDisabledSubscription`). The vault's data is in a stopped Postgres, and the Mac mini's local Bitwarden cache holds no ciphers, only account and key-derivation metadata. The vault's contents come back only by re-enabling, or are re-created by hand.
- This Mac has only the `ouro.bot` DNS token. A Workers, R2 and Containers move needs a Cloudflare API token for the account.

## Deploy Azure sign-in

`AZURE_CLIENT_ID` (`990c9dbc…`) is the user-assigned managed identity `id-ourowork-github-prod`. Its federated credentials are for the old `ouroborosbot` organization (`repo:ouroborosbot/ouro-work-substrate:environment:prod` and `…:ref:refs/heads/main`), which is why the workflow has failed since the repo moved with `AADSTS700213`. The fix is two credentials for `repo:ourostack/ouro-work-substrate` (environment `prod` and `ref:refs/heads/main`); creating them needs the subscription enabled. If the work moves to Cloudflare, retire `deploy-azure.yml` instead.

## Outcome (2026-11-16)

Azure was re-enabled and the vault answers (`vault.ouro.bot/alive` 200). Done:

- Vault Postgres dumped (`pg_dump -Fc`) and `rsa_key.pem` copied to the private `vault-backups` blob container (public access off) and to a mode-700 folder on the mini.
- Federated credentials for `repo:ourostack/ouro-work-substrate` (`environment:prod` and `ref:refs/heads/main`) added to `id-ourowork-github-prod`; trip-control made optional in Bicep; Deploy Azure is green.
- Deleted the mailroom `proof` app, its environment (its load balancer, public IP and VNet), the mailroom registry and VNet. Scaled `ouro-desk-hosted` to min 0 (`ourostack/desk` provision.sh updated).

Estimated spend after the trim is about $125-130 a month, under the $150 credit, so the move is not needed for cost. Cloudflare would still need Workers Paid ($5, for Containers), an external Postgres, and a rewrite of mail ingress, with no cost win large enough to justify the risk. Decision: stay on trimmed Azure. Revisit if spend exceeds the credit.
