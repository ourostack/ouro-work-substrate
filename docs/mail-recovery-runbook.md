# Mail Recovery Runbook

Use this when Agent Mail behaves strangely in production or during live smoke. The goal is to restore confidence without crossing the trust boundary: hosted services route and store encrypted mail, while the harness and the owning agent vault keep private keys, reads, policy, and sense context.

Start by deciding which mailbox lane is affected:

- Native agent mailbox, for example `slugger@ouro.bot`.
- Delegated human mailbox source, for example `test.example.owner.slugger@ouro.bot` for Alex's HEY source.

If those lanes are confused, stop and fix provenance before doing more delivery work.

## First Checks

1. Check CI and deploy state:

   ```bash
   gh run list --repo ourostack/ouro-work-substrate --limit 8
   gh pr list --repo ourostack/ouro-work-substrate
   ```

2. Check hosted health:

   ```bash
   curl -fsS https://<mail-control-fqdn>/health
   curl -fsS https://<mail-ingress-fqdn>/health
   curl -fsS https://<vault-control-fqdn>/health
   ```

   Health endpoints should agree on mailbox and source-grant counts. Treat mismatch as a registry/read-path failure until proven otherwise.

3. Use the current production DNS workflow binding for any DNS repair:

   ```bash
   infra/dns/ouro.bot.binding.json
   ```

   The binding is run config. The referenced vault item is an ordinary vault item. Do not parse vault item notes. Notes orient humans and agents; machine-readable facts belong in the binding.

4. Keep evidence body-safe. Artifacts may include timestamps, record names, provider ids, event ids, addresses, status codes, and safe summaries. They must never paste provider keys, TLS private keys, raw MIME, message bodies, private mail keys, or vault unlock material.

## Recovery Map

| Failure mode | Agent-runnable | Human-required | Body-safe evidence |
| --- | --- | --- | --- |
| DNS/MX drift | Run DNS `backup`, `plan`, `verify`, and, after review, `apply` or `rollback` from `infra/dns/ouro.bot.binding.json`. Preserve records outside the allowlist. | Registrar/API access must already be available in the agent vault; human approval is required for intentional cutover or provider-auth record changes. | DNS backup JSON, plan diff, provider record ids, public DNS answers. |
| port 25 or STARTTLS failure | Check `GET /health`, Container Apps revision, deploy outputs, TCP reachability, `EHLO`, `STARTTLS`, and `SIZE`. Rerun `Deploy Azure` if config drift is likely. | If a network blocks outbound port 25, use an external checker or real mailbox-provider send; do not ask the human to debug a local ISP block as an app failure. | SMTP transcript without message body, STARTTLS advertisement, health output, revision id. |
| native send rejected with `Invalid email sender username` | Call `POST /v1/mailboxes/ensure` through Mail Control or rerun `ouro connect mail` so Mail Control can provision the missing ACS `senderUsernames/<local-part>` resource before mailbox success returns. Confirm the latest deploy revision includes the sender-username repair and that Mail Control still has ARM rights on the ACS email domain. | Human/provider help is only needed if ACS domain auth itself is broken or if Azure RBAC drift cannot be repaired from the repo deploy lane. | Mailbox address, sender username/local-part, safe provider error text, deploy revision, ACS sender-username resource id when present. |
| hosted registry/vault key drift | Call `POST /v1/mailboxes/ensure` through Mail Control. Rerun `ouro account ensure` or `ouro connect mail` from the harness so returned one-time keys are stored in the owning agent vault. If ensure reports hosted public key ids that are not in the vault, run `ouro account ensure --rotate-missing-mail-keys` or `ouro connect mail --rotate-missing-mail-keys`; the harness calls `POST /v1/mailboxes/rotate-keys` only for missing key ids and stores the new one-time private keys. | rotation cannot recover mail already encrypted to a lost private key; it only makes future mail decryptable under fresh keys. Human/provider help may still be needed if old messages matter. | Key ids, mailbox/source records, ensure and rotation counts, no private key material. |
| Blob reader or decryption failure | Verify hosted Blob coordinates in the harness `runtime/config` item, managed identity/Blob role assignment, and that the matching key id exists in the agent vault. If only some messages fail with missing private key warnings, keep the mailbox usable and identify whether those records were encrypted before rotation. | Human may need to unlock or repair the agent vault if vault access is blocked. Mail already encrypted to a lost key needs that exact old key restored; rotation only repairs future mail. | Blob account/container/blob names, key ids, sanitized `AUTH_REQUIRED:mailroom` or decryption warning. |
| hosted recent-mail reads are slow or time out after a large legacy import | Confirm the harness runtime includes the hosted index repair release, then run `ouro mail backfill-indexes --agent <agent>` from the owning agent lane. That rebuilds `message-index/<agent>/...` blobs without reimporting mail and is safe to rerun. New inbound mail writes its index eagerly; old archive mail may need this one-time repair. | Human help is only needed if the harness cannot reach Blob Storage or the agent vault is unavailable for normal Mailroom resolution. | Agent name, store label, indexed count, safe timing observations from `mail_recent`/Mailbox before and after. |
| wrong mailbox provenance | Inspect registry/source grants, accepted message metadata, Ouro Mailbox, `mail_recent`, and `mail_access_log`. Repair classification or source state before importing/forwarding more mail. | Human confirms the intended owner/source when the source grant is ambiguous. | Message id, recipient, mailbox role, compartment kind, owner email, source label. |
| HEY export/backfill stale | Ask Slugger to guide browser export, then run `ouro mail import-mbox` with owner/source flags. Compare import counts and `sourceFreshThrough`. | HEY browser login, MFA, CAPTCHA, export request, and download are human-at-keyboard gates. | MBOX filename/path, import counts, newest message date, owner/source labels. |
| HEY forwarding missing or lossy | Verify source state, target alias, recent forwarded probes, `mail_recent`, `mail_screener`, and Mailbox source folders. Wrong-target probes to `slugger@ouro.bot` are recoverable setup friction, not delegated mail. | Human confirms HEY forwarding/extension settings and final forwarding confirmation. HEY can miss spam-classified or authentication-broken forwarded mail. | Forwarding status, target alias, probe message id, observed recipient, safe delivery summary. |
| delivery event missing | Check Mail Control Event Grid endpoint health, ACS webhook subscription, provider message id, and idempotent reconciliation. A `submitted` outbound record is provider API acceptance, not delivery. | Human/provider console access may be needed for ACS domain verification, webhook subscription repair, or provider-side suppression investigation. | Provider message/operation id, Event Grid event id, canonical outcome, body-safe provider status. |
| autonomy kill switch | Inspect `mailroom.autonomousSendPolicy` in the owning agent vault runtime config. If `killSwitch` is true or policy is disabled, autonomous sends must fall back to `CONFIRM_SEND`. | Human explicitly approves final autonomous-send enablement and any change to allowed recipients/domains, limits, or kill switch. | Policy id, decision code, fallback, recipient count, rate-window counters. |
| discarded/quarantined recovery | Use Ouro Mailbox recovery drawers plus `mail_screener`, `mail_decide restore`, and `mail_access_log` to restore or explain retained messages. | Family-authorized human decides sender/source policy changes for suspicious or unknown mail. | Message id, previous/next placement, actor, reason, retained drawer counts. |

## Production Surfaces

- GitHub Actions: `gh run list --repo ourostack/ouro-work-substrate`.
- Manual hosted deploy: `gh workflow run deploy-azure.yml --repo ourostack/ouro-work-substrate`.
- Container Apps rollback: `az containerapp revision list` and `az containerapp ingress traffic set`.
- Hosted control: `GET /health`, `POST /v1/mailboxes/ensure`, `POST /v1/mailboxes/rotate-keys`, ACS Event Grid delivery endpoint.
- Harness repair: `ouro account ensure`, `ouro connect mail`, `ouro mail import-mbox`.
- Harness audit/read tools: `mail_recent`, `mail_screener`, `mail_access_log`, `mail_thread`, and Ouro Mailbox.
- Outbound provider: Azure Communication Services with Event Grid reconciliation.
- Native autonomous-send policy: `mailroom.autonomousSendPolicy`.

## Registry Freshness After Key Rotation

Mail Ingress reads the Azure public registry fresh by default. Do not opt into `--registry-refresh-ms` caching for production unless you have accepted the stale-key risk and have a compensating invalidation plan. A stale registry can make future mail encrypt to a public key whose private key was already lost, and no hosted service can decrypt that record afterward.

If a post-rotation smoke message reports a missing old key id:

1. Confirm Mail Control `GET /health` and Mail Ingress `GET /health` are served by the expected deployed revision.
2. Read the public registry body-safe and compare mailbox/source key ids with the owning agent vault status.
3. Check Mail Ingress startup logs for the registry mode and `registryRefreshMs` value.
4. Send a new probe only after freshness is confirmed; do not rotate repeatedly as a cache invalidation mechanism.

## Rollback Order

1. Stop or disable the unsafe surface first. For outbound, use the autonomy kill switch. For bad deployment, shift Container Apps traffic to the known-good revision. For DNS, rollback only allowlisted records from a recorded backup.
2. Preserve evidence before changing state again.
3. Re-run focused smoke for the affected lane.
4. Update this runbook if the recovery path was not obvious.

Do not solve recovery by copying private keys into hosted services or logs. If the system cannot explain the recovery without leaking private material, the recovery path is not production-ready yet.
