# TradePilot Tools registry and permission model

## Purpose

The Tools registry is the policy control plane for capabilities that Agents can call. A connection only proves that an endpoint can be reached and its capabilities can be discovered; it does not grant permission to execute every discovered operation.

## Tool risk states

| Policy | Meaning | Planner behavior |
| --- | --- | --- |
| `read_only` | Explicitly reviewed as read-only by the account owner | May be invoked automatically by the planner |
| `approval_required` | Any operation not explicitly granted read-only status | Requires a pending approval record and a human decision before invocation |
| `blocked` | Explicitly prohibited | Excluded from planner candidates and rejected by the invoke API |

Newly discovered MCP, REST API, and Webhook tools default to `approval_required`. HTTP GET and names beginning with `get`, `search`, or `list` are not proof of read-only behavior. The owner must explicitly classify an external tool as read-only after reviewing its description, schema, endpoint, and expected side effects.

## Legacy compatibility

Older tool records may contain `risk: read_only` from the previous heuristic classifier. Such records are treated as `approval_required` unless they also contain `riskPolicySource: user`. This prevents historical heuristics from silently retaining automatic execution permission.

User-selected policies are preserved when capabilities are rediscovered. The UI displays the effective policy rather than trusting an old heuristic value.

## Approval integrity

- Approval records bind the owner, run, connection, endpoint, protocol, tool definition, arguments, and task goal into a stable snapshot hash.
- Approval is valid only while the associated run remains `awaiting_approval`.
- Approval decisions are single-use. Both approve and reject paths claim a pending approval atomically.
- Before execution, the server rechecks the connection and exact tool definition against the approved snapshot.
- Changing a tool policy or rediscovering a changed tool definition invalidates an old approval snapshot.

## Native tools

TradePilot's built-in Xiaoya business-query tools are system-managed read-only operations and are displayed separately from external tools. They are owner-scoped and do not provide write, delete, messaging, or external side-effect operations.

## Review requirements

Before granting `read_only`, review at least:
1. Tool description and input schema.
2. The actual endpoint and protocol operation.
3. Whether the tool can mutate remote state or trigger side effects.
4. Whether arguments can select arbitrary tenants, records, or destinations.
5. Whether the tool returns sensitive data beyond the current account's authorization boundary.

If any point is unclear, keep `approval_required`. Use `blocked` for tools that should never be called from TradePilot.

## Not yet implemented

- Automatic JSON Schema validation for every discovered tool's input.
- Fine-grained per-field data classification and secret scopes.
- Tool rate limits, quotas, and circuit breakers.
- A general-purpose internal tool registration API beyond the current native read-only catalog.
- Skill execution and sandbox integration.

These controls must be implemented before opening arbitrary Skill code execution.
