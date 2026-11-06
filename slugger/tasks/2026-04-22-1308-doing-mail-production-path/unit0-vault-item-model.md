# Unit 0 Vault Item Model

Captured after compaction and a user correction. This is the canonical orientation for the credential work in this program.

## Correction

The primitive is not an ops credential.
The primitive is not an authority.
The primitive is not a Porkbun credential.
The primitive is not a DNS credential.

The primitive is:

```yaml
vault item / credential:
  item: ops/porkbun/owner@example.test
  secrets: hidden
  public fields: optional
  notes: "Freeform human/agent context, recovery hints, warnings, and non-assumptions."
  organization: tags/folder-ish path
  timestamps/provenance: present
  assumed use: none
```

A vault item is a private agent-owned vault record with a stable item name/path, secret material, optional public fields, freeform notes, organization, timestamps/provenance, and no assumed use.

Everything else is outside that item.

## Three Separate Things

### 1. Managed Workflow

Examples:

- `ouro connect perplexity`
- `ouro connect mail`
- provider auth
- portable runtime config
- local sense attachment config

The harness owns the semantics, validation, health checks, repair, runtime loading, and user guidance. These workflows may store data in reserved harness-readable vault items, but they are not the generic credential model.

### 2. Freeform Vault Item

An agent or human stores a credential or secret with notes. The system does not infer its meaning. The item can be useful for many future workflows, or none.

Freeform vault items need a first-class human-facing surface:

- generic `ouro vault item ...` or `ouro vault credential ...`;
- hidden secret entry;
- optional public fields;
- editable freeform notes;
- metadata-only status/list;
- no secret printing;
- clear warnings around reserved harness-managed item paths.

### 3. Binding / Run Config

A binding is non-secret configuration that says a workflow should use a specific vault item for a specific purpose.

Example:

```yaml
dns workflow:
  domain: ouro.bot
  driver: porkbun
  credential item: ops/porkbun/owner@example.test
```

That does not make the vault item a DNS credential. It only says this workflow plans to use that vault item.

If a workflow needs structured meaning, the structure belongs in the binding or run config, not in the credential notes.

## Notes Invariant

Notes are for humans and agents.

Code must not parse meaning out of notes. If a workflow needs machine-readable facts, put them in explicit workflow binding fields, committed run config, or another structured non-secret record.

Good notes say things like:

- what this item is;
- what not to assume;
- how it was obtained;
- who can rotate it;
- recovery hints;
- human context that would help a future agent.

Bad notes behavior:

- parsing `driver=porkbun` from a note;
- treating a phrase in a note as an allowlist;
- using note text to decide authority;
- hiding required machine semantics in prose.

## Template Rule

Templates are convenience only.

`--template porkbun-api` may prompt for two hidden fields. It must not create a special credential kind. It creates or updates an ordinary vault item.

Existing `ouro vault ops porkbun ...` should become a deprecated compatibility alias to the generic command. It may preserve or migrate the already-created item, but its docs/help must point future agents toward the generic vault item model.

## Patch-Forward Requirements

1. Introduce generic `ouro vault item ...` or `ouro vault credential ...`.
2. Make notes first-class and editable.
3. Add templates only as prompt conveniences.
4. Make generic status/list show item existence, public field names, note presence, timestamps, and provenance, never secret values.
5. Convert `ouro vault ops porkbun ...` into a deprecated compatibility alias over the generic surface.
6. Stop saying "Porkbun credential path" as architecture.
7. Say "vault item referenced by DNS workflow."
8. Make DNS/mail production code consume configured vault item references through workflow bindings.
9. Add docs/contracts that forbid: ops credential as ontology, provider credential ontology for freeform items, `ouro connect` as generic password entry, and notes-as-machine-contract.

## Why This Matters

The previous docs and CLI helper made one workflow-specific credential look like a new kind of credential. That caused planning churn and confused the boundary between stored secret, workflow semantics, and provider-specific convenience.

The correct orientation keeps the hosted mail work general-purpose:

- Mail setup can reference vault items without redefining what they are.
- DNS automation can reference a vault item without calling it a DNS credential.
- Future providers can add templates without creating new credential species.
- Future agents can understand what is stored, what is assumed, and what is merely a workflow plan.
