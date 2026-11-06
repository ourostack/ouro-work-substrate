# Operations

This is the runbook for keeping Ouro Work calm in production. It should read like something you can trust when you are tired: direct commands, clear checks, and enough context to see why the steps matter.

## Services

- `mail-ingress`: SMTP ingress plus HTTP health. It reads the public registry from Blob Storage and stores encrypted mail objects in Blob Storage. Azure registry reads are fresh by default; a registry refresh cache is opt-in because stale public keys after rotation can create mail that only an old private key can decrypt.
- `mail-control`: authenticated mailbox control plane. It updates the public registry and returns newly generated private keys once.
- `vault-control`: authenticated Vaultwarden account creation control plane.

Current proof deployment:

- Resource group: `rg-ouro-work-substrate`.
- Environment: `prod`.
- Region: `eastus2`.
- SMTP public edge: `mx1.ouro.bot:25`.
- SMTP app target port: `2525`.
- Production MX: `ouro.bot MX 10 mx1.ouro.bot`.
- Current ingress revision: check `az containerapp revision list --resource-group rg-ouro-work-substrate --name ouro-prod-mail-ingress`.

## Daily Confidence Check

Use this when you just need to know whether the house is standing.

1. Check latest GitHub runs:

   ```bash
   gh run list --repo ourostack/ouro-work-substrate --limit 8
   ```

2. Confirm no open PRs are waiting unexpectedly:

   ```bash
   gh pr list --repo ourostack/ouro-work-substrate
   ```

3. Check deployed app health using the current deploy outputs or known FQDNs:

   ```bash
   curl -fsS https://<mail-control-fqdn>/health
   curl -fsS https://<mail-ingress-fqdn>/health
   curl -fsS https://<vault-control-fqdn>/health
   ```

Healthy means all three return `ok: true`, and Mail Control plus Mail Ingress agree on mailbox/source-grant counts.

## Secrets And Variables

GitHub repository secrets:

- `MAIL_CONTROL_ADMIN_TOKEN`
- `VAULT_CONTROL_ADMIN_TOKEN`
- Optional together: `MAIL_INGRESS_TLS_KEY`
- Optional together: `MAIL_INGRESS_TLS_CERT`

`MAIL_INGRESS_TLS_KEY` and `MAIL_INGRESS_TLS_CERT` are the PEM private key and certificate chain mounted into Mail Ingress for SMTP STARTTLS. Configure both or neither. The deploy workflow fails when exactly one is set; with neither set, Mail Ingress keeps STARTTLS disabled and remains proof-only.

GitHub repository variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_ENVIRONMENT_NAME`
- Required for production MX: `AZURE_MAIL_EXPOSED_SMTP_PORT=25`
- Optional: `AZURE_MAIL_INGRESS_MAX_RECIPIENTS`
- Optional: `AZURE_MAIL_INGRESS_MAX_CONNECTIONS`
- Optional: `AZURE_MAIL_INGRESS_CONNECTION_RATE_LIMIT_MAX`
- Optional: `AZURE_MAIL_INGRESS_CONNECTION_RATE_LIMIT_WINDOW_MS`

Nonstandard exposed SMTP ports are diagnostic-only and must not back an MX record.

Outbound native-agent mail uses Azure Communication Services Email. The Bicep deploy owns the Email Communication Service and Communication Services resource. The CustomerManaged `ouro.bot` email domain is created on first deploy, then the deploy lane treats an existing ACS custom domain as an existing resource on later deploys so Azure keeps its verification state instead of resetting it. The Event Grid delivery subscription is created by the deploy workflow after app deployment, using the same CLI path that succeeds against the global Communication resource. The domain starts unlinked until the DNS verification records are applied and verified. The deploy workflow reads the current domain verification state and links the domain only after Domain, SPF, DKIM, and DKIM2 are all `Verified`; it preserves the linked domain once verification is complete instead of resetting it to empty on later deploys.

Domain verification is not enough to send as `slugger@ouro.bot` or another native agent address. ACS also requires a `senderUsernames/<local-part>` child resource on the custom domain. Mail Control now provisions that sender username idempotently before it returns mailbox-ensure success, using the same managed identity that already reaches Blob Storage plus a domain-scoped ARM `Contributor` role assignment on the ACS email domain. If a live send ever fails with `Invalid email sender username`, first verify the latest deploy is live, then rerun `POST /v1/mailboxes/ensure` or `ouro connect mail` so Mail Control can repair the missing sender username.

The deploy workflow first checks `Microsoft.Communication` and `Microsoft.EventGrid`, then requests registration only when one is still unregistered. That keeps normal resource-group-scoped deploys from failing after the providers are already enabled. The deploy identity only needs subscription-level register permission when a provider is still unregistered. If a provider genuinely is not registered and the workflow cannot register it, use an account with subscription-level rights once, then rerun the workflow.

The ACS access key is not a harness-managed `ouro connect` credential. Store it as an ordinary Slugger vault item, then reference that item from `mailroom.outbound` in runtime config:

```json
{
  "transport": "azure-communication-services",
  "endpoint": "https://ouro-prod-communication.communication.azure.com",
  "senderAddress": "slugger@ouro.bot",
  "credentialItem": "ops/mail/azure-communication-services/ouro.bot",
  "credentialFields": {
    "accessKey": "primaryAccessKey"
  }
}
```

The credential item may have freeform notes for agent/human orientation, but code must read only the explicit `credentialItem` and `credentialFields` binding.

Bootstrap or repair Azure OIDC, repo variables, and resource-group role assignments with:

```bash
scripts/bootstrap-azure-github-oidc.sh ourostack/ouro-work-substrate rg-ouro-work-substrate eastus2 prod
```

That script creates both accepted GitHub OIDC subjects:

- `repo:ourostack/ouro-work-substrate:ref:refs/heads/main`
- `repo:ourostack/ouro-work-substrate:environment:prod`

The second one matters because the deploy workflow uses the `prod` GitHub Environment.

## Deploy

Runtime, infrastructure, and workflow changes merged to `main` deploy automatically after the `CI` workflow completes successfully. The deploy workflow checks the commit-tagged `mail-ingress` image currently running in Azure and compares that deployed SHA with the exact CI-tested commit. It deploys if runtime, infrastructure, or workflow files changed anywhere in that range, or if the current deployed image cannot be inspected. It skips Azure only when the current deployed image is an ancestor of the tested commit and all changes since that image are documentation-only.

When deployment is needed, the workflow checks out the exact CI-tested commit, builds all service images, pushes them to ACR with that commit SHA as the tag, and applies the Container Apps Bicep deployment.

Use manual deployment for intentional redeploys, token rotation, or proof-port changes:

```bash
gh workflow run deploy-azure.yml --repo ourostack/ouro-work-substrate
```

The deployment is serialized per environment so only one production rollout runs at a time. Prefer this workflow over local one-off deploys; the workflow is the paved path.

## DNS Workflow Binding

DNS changes for production mail are run from explicit non-secret workflow binding files. A binding names the `domain`, the provider `driver`, the `credentialItem` path in the owning agent vault, a resource allowlist, desired records, certificate handling, and where to write audit artifacts. It is run config, not a new secret category.

For `ouro.bot`, the binding lives at:

```bash
infra/dns/ouro.bot.binding.json
```

Porkbun is the current `ouro.bot` DNS driver. The referenced vault item is an ordinary vault item / credential with no assumed use. Notes are for humans and agents; code must not parse notes. If the workflow needs machine-readable facts, those facts belong in the binding fields.

Safe DNS work follows this order:

1. `backup`: retrieve current records and write a current-record backup before mutation.
2. `plan`: produce a dry-run diff from current records to desired records, preserving anything outside the resource allowlist.
3. `apply`: make the reviewed allowlisted changes only.
4. `verify`: re-read provider records and public DNS until the expected records appear or propagation is still pending.
5. `certificate`: retrieve the allowlisted TLS certificate bundle and store it in the configured agent vault item without printing private key material.
6. `rollback`: restore allowlisted records from a recorded backup when a change is wrong.

For `ouro.bot`, the binding intentionally manages sibling apex `TXT` records for ACS domain ownership plus SPF, while preserving unrelated TXT siblings such as Google verification and older Microsoft verification records. The same binding also carries the ACS `selector1-azurecomm-prod-net._domainkey` and `selector2-azurecomm-prod-net._domainkey` `CNAME` records needed for DKIM/DKIM2 sender authentication.

Do not edit records outside the binding allowlist during this workflow. Preserve Microsoft, Google, and other third-party verification records unless a later binding intentionally manages them. Artifacts may include record names, types, TTLs, provider ids, and public certificate chains; they must never include provider keys, secret headers, certificate private keys, raw email bodies, or vault unlock material.

The certificate step stores an ordinary workflow-managed vault item named by `certificate.storeItem`; the binding and deploy configuration are still the machine-readable contracts. Do not parse certificate item notes.

## Smoke Test

Run this after a meaningful deployment. Do not skip the encryption/decryption proof when mail code or infra changed.

1. Open the `Deploy Azure` workflow outputs.
2. Record `mailControlFqdn`, `vaultControlFqdn`, `mailIngressFqdn`, and `mailSmtpPort`.
3. Call `GET /health` on each HTTPS endpoint.
4. Verify unauthenticated Mail Control and Vault Control mutations return `401`.
5. Call `POST /v1/mailboxes/ensure` on Mail Control with a bearer token.
6. Verify first creation returns private keys, public mailbox/source records, hosted registry/Blob coordinates, and that repeated ensure calls return zero new keys while preserving the same public key ids.
7. Verify ensure can also provision the native ACS sender username for the mailbox local-part before it reports success. A later `Invalid email sender username` send failure means this step or its ARM role assignment drifted.
8. If ensure reports public key ids that are absent from the owning agent vault, repair through harness setup with `ouro account ensure --rotate-missing-mail-keys ...`. That calls `POST /v1/mailboxes/rotate-keys` only for missing key ids and stores the new one-time private keys. Rotation cannot recover mail already encrypted to a lost private key.
9. After rotation, send a fresh inbound probe and verify its encrypted envelope key id is one of the key ids now present in the owning agent vault. If future mail still encrypts to an old missing key, check the deployed Mail Ingress image/revision and any explicit `--registry-refresh-ms` cache setting before rotating again.
10. Check SMTP `EHLO` on public port `25` from a network that can originate outbound SMTP. Many residential, hotel, and cloud networks block outbound port `25`; when that happens, use an external TCP checker for reachability and a real mailbox-provider send for full SMTP delivery proof.
11. When TLS secrets are configured, verify `STARTTLS` is advertised; `AUTH` must not be advertised.
12. Verify `SIZE` is advertised and a declared oversized `MAIL FROM SIZE=` is rejected before `DATA`.
13. Verify the recipient limit rejects excess recipients in one transaction.
14. Send accepted SMTP mail through the current public edge. In proof deployments that intentionally expose a nonstandard port, record that port explicitly in the artifact.
15. Verify accepted mail appears in Blob Storage as encrypted mail.
16. Decrypt through the private keys stored in the owning agent vault or, during first proof only, the one-time keys returned by Mail Control.
17. Confirm native mail lands in Screener and delegated HEY alias mail lands in Imbox with owner/source provenance.
18. Inspect Mail Ingress logs for body-safe events. Logs may include addresses, limits, and safe error categories; they must not include raw mail bodies, private MIME payloads, TLS private keys, provider credentials, or vault unlock material.

If a large legacy delegated import made hosted `mail_recent`, Outlook, or MCP mail reads feel sticky, run:

```bash
ouro mail backfill-indexes --agent <agent>
```

That rebuilds hosted message-index blobs in place without reimporting mail and is safe to rerun. New inbound mail now writes its hosted index eagerly; this command is the repair path for older mailboxes.

For Slugger, the expected public addresses are:

- Native: `slugger@ouro.bot`.
- HEY delegated alias: `test.example.owner.slugger@ouro.bot`.

## Mail Recovery

When live mail, delegated HEY forwarding, Blob access, delivery events, or autonomous-send policy behaves strangely, use [Mail Recovery Runbook](mail-recovery-runbook.md). The repo path is `docs/mail-recovery-runbook.md`. It keeps the failure modes in one place: DNS/MX drift, port 25 or STARTTLS failure, hosted registry/vault key drift, Blob reader/decryption failure, wrong mailbox provenance, HEY backfill/forwarding issues, delivery event gaps, autonomy kill switch, and retained discarded/quarantined recovery.

For outbound event recovery, check the Event Grid subscription named by the deploy output `outboundDeliveryEventSubscriptionName`. Delivery reports post to Mail Control at `/v1/outbound/events/azure-communication-services`; Mail Control validates Event Grid subscription handshakes and reconciles body-safe ACS delivery events into Blob-backed outbound records under `outbound/*.json`. If an event arrives before the matching outbound record is visible, Mail Control stores it under `outbound-events/unmatched/` for audit instead of logging message bodies. If a deploy fails while creating the subscription through ARM, rerun after provider registration or use the deploy workflow path that recreates the subscription with `az eventgrid event-subscription create`.

## Rollback

Container Apps keeps revisions. If a deploy is bad, move traffic back to a known-good revision:

```bash
az containerapp revision list --resource-group <rg> --name <app>
az containerapp ingress traffic set --resource-group <rg> --name <app> --revision-weight <known-good>=100
```

Rollback all affected apps together when a protocol change spans services. Keep previous image tags available in ACR until the newer deployment is proven.

After rollback, run health checks and a focused smoke test for the affected surface.

## Token Rotation

1. Generate a new high-entropy token.
2. Update the matching GitHub secret.
3. Rerun `Deploy Azure`.
4. Confirm the new token works.
5. Confirm the old token is rejected.

The control services read token files at request time, so a rotated mounted secret does not depend on stale process memory.

## Scaling

Current defaults:

- Mail ingress: `minReplicas=1`, `maxReplicas=5`.
- Mail ingress recipient limit: `AZURE_MAIL_INGRESS_MAX_RECIPIENTS`, default `100`.
- Mail ingress concurrent connection limit per replica: `AZURE_MAIL_INGRESS_MAX_CONNECTIONS`, default `100`.
- Mail ingress remote-address connection rate limit: `AZURE_MAIL_INGRESS_CONNECTION_RATE_LIMIT_MAX`, default `120`.
- Mail ingress remote-address rate window: `AZURE_MAIL_INGRESS_CONNECTION_RATE_LIMIT_WINDOW_MS`, default `60000`.
- Mail Control: `minReplicas=1`, `maxReplicas=3`.
- Vault Control: `minReplicas=1`, `maxReplicas=2`.

Scale Mail ingress first for inbound SMTP volume. Scale control services only after measuring setup traffic; they are authenticated, low-volume APIs.

Before raising replica caps, check:

- whether registry refresh cadence is still appropriate;
- whether Blob Storage request volume is healthy;
- whether SMTP proof traffic needs a production mail edge rather than just more Container App replicas;
- whether sender-policy and screener flows are keeping up operationally.

## Human-Only Gates

These are not chores for an agent to quietly complete. They require explicit human action:

- Domain/API access enablement and any provider portal confirmation that cannot be completed through the approved workflow.
- HEY export and forwarding setup.
- Browser auth and MFA.
- DNS/MX cutover or repointing when the target edge has not yet been proven.
- Live mail sent from a human-controlled mailbox when a smoke test needs real provider delivery.
- Autonomous sending.

## If Something Feels Weird

Prefer evidence over vibes:

1. Check GitHub run logs.
2. Check Container App health.
3. Check latest deployment outputs.
4. If Azure skipped unexpectedly, compare the current Container App image tag with the CI-tested commit and inspect the `Auto deploy decision` summary. A docs-only head commit is not enough reason to skip; only the full range since the deployed image may be docs-only.
5. Check whether Mail Control and Mail Ingress agree on registry counts.
6. Check Blob records without printing private mail content.
7. Check vault-held private keys on the local agent side.

Leave a note in the docs when you discover a new production edge. The next agent should not have to meet the same sharp corner by surprise.
