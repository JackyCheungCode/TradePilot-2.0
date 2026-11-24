# TradePilot Skill execution runtime architecture

## Decision

A Skill is untrusted, versioned source code plus a declared capability contract. It must never execute inside the primary TradePilot request Worker or share the host Worker process, environment, or credentials.

For the existing Cloudflare Workers application, use a separate execution service:

- **Cloudflare Sandbox SDK / Containers** for Skills that need Linux, Python, Node.js packages, shell commands, native dependencies, or multiple files at runtime.
- **Dynamic Workers** only for a deliberately restricted JavaScript/TypeScript-only execution class that can run without a Linux filesystem or shell.

The initial ten Skills are not assumed to all be JavaScript. The runtime must select a compatible execution class from a validated manifest and dependency lock, not infer it from the Skill name.

## Cloudflare product constraints

Cloudflare's current Sandbox documentation describes Containers and isolated Workers as separate sandbox environments. The Sandbox product is listed as available on Workers Paid plans. Before provisioning it, verify the account's plan, regional availability, container limits, pricing, and package compatibility.

This repository already uses Wrangler and Cloudflare Workers. Do not replace its deployment model. If Sandbox is approved for the account, integrate the stable `@cloudflare/sandbox` package and matching stable container image; do not mix stable and preview SDK/image lines. Re-evaluate the SDK migration separately when Cloudflare's 1.0 line is stable.

Dynamic Workers support runtime-loaded Worker code and explicit bindings, resource limits, observability, and outbound network interception. For an untrusted JavaScript Worker, default `globalOutbound: null` and expose only narrow host-controlled bindings. Dynamic Workers are not a substitute for Linux/Python execution.

## Artifact storage implementation

The production Worker binds the dedicated private R2 bucket `tradepilot-skill-artifacts` through `SKILL_ARTIFACTS`. It uses the Standard storage class and keeps both the managed `r2.dev` endpoint and custom public domains disabled.

- New imports and syncs serialize the bounded, sorted file manifest as a single immutable object at `sha256/<digest>.json`.
- The SHA-256 digest is calculated over the exact UTF-8 object bytes. The object carries matching custom metadata and is read-after-write verified before the database record is updated.
- `agent_profiles.config` stores only the object key, digest, byte size, file count, and package metadata; package file contents are no longer added to new JSONB records.
- Content-addressed writes are idempotent. Repeated syncs of identical package contents reuse the existing object after verifying its digest metadata and size.
- A failed database write may leave an unreferenced immutable object. A later garbage-collection job must compare R2 keys with database references before deleting anything; no automatic destructive cleanup is enabled.
- Existing legacy records may still contain their old JSONB bundle until that Skill is synced again. Public API responses never return the embedded file contents.

The R2 free tier currently includes 10 GB-month Standard storage, 1 million Class A requests, and 10 million Class B requests per month. Usage beyond included amounts is billable; monitor usage before enabling high-volume imports. Do not use Infrequent Access for Skill artifacts.

## Trust boundaries

1. **Control plane (TradePilot Worker)** — authenticates the owner, validates run requests, checks Skill approval/version, applies policy, creates a durable run, and passes a minimal capability contract to the runtime.
2. **Artifact plane (private R2 bucket)** — stores immutable Skill bundle versions by content digest. Postgres stores metadata and object references, not full package contents.
3. **Execution plane (isolated sandbox)** — receives only the pinned Skill artifact, declared inputs, bounded scratch space, and explicit capability proxies. It receives no Supabase service-role key, integration credentials, or broad Worker bindings.
4. **Tool gateway (host-controlled)** — performs authenticated external calls only after validating tool schema, tenant scope, risk policy, approval state, and per-run capability grant.
5. **Audit plane** — stores source digest, runtime image/SDK version, manifest digest, policy snapshot, approval, tool calls, egress decisions, resource usage, output digest, and terminal status.

## Execution lifecycle

1. Resolve an owner-scoped Skill and immutable package digest.
2. Verify the package is enabled, human-reviewed, and compatible with the selected runtime.
3. Validate input against the Skill's declared JSON Schema.
4. Build a per-run capability grant from the approved manifest and account policy.
5. Create a durable run with an idempotency key and a fixed timeout.
6. Start an isolated ephemeral sandbox and mount the package read-only.
7. Apply deny-by-default egress. Package installation may use a temporary, narrowly allowlisted setup phase; runtime egress remains denied unless specific hosts are approved.
8. Route permitted tool requests through the host gateway. Never inject long-lived secrets into the sandbox.
9. Enforce wall-clock, CPU, memory, process, file-count, output-size, and network quotas.
10. Persist bounded logs and output, terminate the sandbox, and record a complete audit trail.

## Permission contract

Each Skill version must declare:
- `runtime` and supported runtime version range.
- Entry point and invocation protocol.
- Input and output JSON Schemas.
- Required tools by stable tool ID and version.
- Read/write data scopes and tenant ownership requirements.
- Network destinations, if any, with purpose.
- Secret references by logical name only; never secret values.
- Side effects and approval requirements.
- Maximum duration, memory, output size, and expected cost class.

Undeclared tools, network destinations, secrets, and data scopes are denied. A model-generated plan cannot expand this contract.

## Package and dependency policy

- Store package versions in private object storage by SHA-256 digest.
- Require immutable source revision, per-file hashes, and a complete file manifest.
- Resolve and lock dependencies before execution.
- Scan dependencies for known vulnerabilities, license restrictions, malicious package indicators, and install scripts.
- Do not install dependencies from arbitrary registries at runtime.
- Reproducible builds should produce a pinned runtime artifact or container image.
- Syncing a new source revision creates a new version and resets human approval; never mutate an already approved version in place.

## Human approval gates

Require approval for:
- Any write to CRM, leads, contacts, opportunities, quotes, orders, shipments, or payments.
- Email, social messages, outbound communication, or webhook triggers.
- Data export, bulk import, deletion, merge, or update.
- Any external operation whose effect cannot be proven read-only.
- Adding network destinations, secrets, or data scopes.
- Activating a new Skill version or changing its executable bundle.

Approvals bind the exact run, Skill version digest, capability grant, arguments, and operation snapshot. Any change invalidates the approval.

## Failure handling and observability

Use Cloudflare Workflows for durable multi-step execution and retries. Sandbox creation and termination must be idempotent. A timeout, policy violation, or worker disconnect must not leave an orphaned running container. Record structured events for start, policy decision, tool call, approval, timeout, sandbox termination, output persistence, and failure.

Provide per-owner and per-Skill quotas, concurrency limits, kill switch, disable/revoke, and rollback to a previously reviewed digest.

## Rollout gates

- **Gate A:** account plan and Sandbox availability verified.
- **Gate B:** Skill manifest contract and versioned artifact storage shipped.
- **Gate C:** dependency/provenance checks and manual review workflow shipped.
- **Gate D:** sandbox provisioning, egress denial, resource limits, and kill switch tested.
- **Gate E:** host tool gateway and approvals tested against malicious fixtures.
- **Gate F:** restricted pilot with read-only Skills, then gradual expansion.

Until all gates pass, Skills remain non-executable. A successful GitHub import or heuristic static scan is never sufficient to activate code.
