# TradePilot Skill package security model

## Scope of this phase

The Skills registry imports a bounded source bundle from a public GitHub repository and performs heuristic static inspection. It is a source-management and review workflow only. It is not a package installer, runtime, sandbox, malware verdict, or authorization to execute code.

## Import controls

- Source host is restricted to HTTPS `github.com`; file content is fetched only from GitHub API and `raw.githubusercontent.com`.
- GitHub redirects are rejected rather than followed.
- Recursive Git trees marked as truncated are rejected; partial packages are never persisted as complete.
- Maximum 60 files, 256,000 bytes per file, and 768,000 bytes per package.
- Hidden files, repository metadata, credential-like files, private keys, and common executable binary formats are excluded.
- Symlinks and submodules are not imported because only Git tree entries of type `blob` are considered.
- All records are stored under the authenticated Supabase owner and the Skill key; imports are always written with `enabled=false`.

## Static review

The current heuristic pass inventories dependencies from common package manifests, extracts referenced HTTPS domains, and flags selected patterns for dynamic code execution, process execution, filesystem access, network access, and environment-variable access.

Findings are signals for a human reviewer, not proof of exploitability or safety. The scanner is intentionally conservative and incomplete. It does not resolve dependency trees, execute scripts, inspect runtime behavior, prove network destinations, or detect every obfuscation technique.

Every imported Skill receives `pending_human_review` and `disabled_pending_review`. The UI must not present a successful import or a low finding count as approval.

## Required gates before execution is implemented

1. **Manifest and contract validation** — define input/output schemas, declared tools, side effects, data classes, and required permissions.
2. **Dependency policy** — lockfile-aware dependency resolution, vulnerability and license checks, provenance and integrity verification.
3. **Capability policy** — explicit network allowlist, secret scopes, read/write resource scopes, and no ambient credentials.
4. **Isolated execution** — ephemeral sandbox per run, no host filesystem access, resource/time/output limits, egress enforcement, and kill switch.
5. **Human approval** — approval for external writes, messages, imports, deletes, payments, and other consequential actions.
6. **Audit and rollback** — immutable source digest, reviewer identity, runtime image digest, tool calls, approvals, outputs, and revocation history.
7. **Lifecycle controls** — version pinning, signed/verified source where available, diff review on sync, rollback, disable and revoke.

## Data model direction

Keep Skill identity and owner scoping in `agent_profiles` for now. The imported bundle records the source reference, bounded files, per-file hashes, package inventory, and review result. Before materially increasing package size or adding execution artifacts, move bundles to private object storage and keep only immutable metadata and object references in Postgres.

## Non-goals

- No automatic dependency installation.
- No script execution in the Cloudflare request Worker.
- No activation toggle in this phase.
- No claim that static checks certify a Skill as safe.
- No support for private GitHub repositories or OAuth credentials in this phase.
