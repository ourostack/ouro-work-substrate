# Unit 5 Merge, Release, Deploy Evidence

## Pull Requests

Substrate:

- PR: https://github.com/ourostack/ouro-work-substrate/pull/17
- Merge commit: `cdc84d0dafaeb2aa6de87f55a9d8a868a1330ab1`
- PR checks:
  - `test`: pass
  - `coverage`: pass

Harness:

- PR: https://github.com/ourostack/ouroboros/pull/590
- Merge commit: `3ef7054294aac2b09091ff998cf52e1ae9f01c4b`
- PR checks:
  - `coverage`: pass
  - `integration`: pass
  - `package-e2e`: pass

## Harness Release

Main workflow: https://github.com/ourostack/ouroboros/actions/runs/24822283326

Result:

- `coverage`: pass
- `integration`: pass
- `package-e2e`: pass
- `publish`: pass
- `@ouro.bot/cli@0.1.0-alpha.469`: published
- `ouro.bot@0.1.0-alpha.469`: published
- npm dist-tags: verified by the workflow
- published package binary smoke: pass

Local install verification:

```text
/opt/homebrew/bin/ouro
0.1.0-alpha.469
/opt/homebrew/bin/ouro.bot
0.1.0-alpha.469
```

## Substrate Deploy

Main CI workflow:

- https://github.com/ourostack/ouro-work-substrate/actions/runs/24822104244
- commit: `cdc84d0dafaeb2aa6de87f55a9d8a868a1330ab1`
- result: pass

Deploy workflow:

- https://github.com/ourostack/ouro-work-substrate/actions/runs/24822161358
- commit: `cdc84d0dafaeb2aa6de87f55a9d8a868a1330ab1`
- result: pass

Azure Container Apps after deploy:

```text
ouro-prod-mail-ingress
  revision: ouro-prod-mail-ingress--0000010
  image: ouroworkprodk2aumligevt3e.azurecr.io/ouro-mail-ingress:cdc84d0dafaeb2aa6de87f55a9d8a868a1330ab1
  provisioning: Succeeded

ouro-prod-mail-control
  revision: ouro-prod-mail-control--0000009
  image: ouroworkprodk2aumligevt3e.azurecr.io/ouro-mail-control:cdc84d0dafaeb2aa6de87f55a9d8a868a1330ab1
  provisioning: Succeeded

ouro-prod-vault-control
  revision: ouro-prod-vault-control--0000009
  image: ouroworkprodk2aumligevt3e.azurecr.io/ouro-vault-control:cdc84d0dafaeb2aa6de87f55a9d8a868a1330ab1
  provisioning: Succeeded
```

Health checks:

```json
{"ok":true,"service":"ouro-mail-ingress","domain":"ouro.bot","mailboxes":1,"sourceGrants":1}
{"ok":true,"service":"ouro-mail-control","domain":"ouro.bot","mailboxes":1,"sourceGrants":1,"revision":"1:1:1436"}
{"ok":true,"service":"ouro-vault-control"}
```

## Still Not Claimed

This evidence proves the Unit 5 code/docs/coverage/release/deploy lane. It does not claim:

- Slugger has completed the HEY browser login/export/forwarding-confirmation flow.
- Alex's historical HEY export has been imported.
- Future HEY forwarding has been observed at `test.example.owner.slugger@ouro.bot`.
- Native autonomous outbound mail is production-ready.
