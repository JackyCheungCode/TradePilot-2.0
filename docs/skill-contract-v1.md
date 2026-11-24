# Skill contract v1

A Skill package may include a root-level `skill.json`. The file is optional for source import, but required before a Skill version can proceed to execution review. A missing or invalid contract never blocks source inspection; it always blocks activation.

## Example

```json
{
  "schemaVersion": 1,
  "name": "market-intel",
  "version": "1.0.0",
  "runtime": "dynamic_worker",
  "entrypoint": "index.mjs",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "maxLength": 200 }
    },
    "required": ["query"],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" }
    },
    "required": ["summary"],
    "additionalProperties": false
  },
  "requiredTools": ["native:market.search"],
  "permissions": {
    "networkHosts": ["api.example.com"],
    "dataScopes": ["market_data:read"],
    "secrets": [],
    "sideEffects": []
  },
  "limits": {
    "timeoutSeconds": 60,
    "memoryMb": 256,
    "maxOutputBytes": 100000
  }
}
```

## Contract fields

- `schemaVersion`: currently exactly `1`.
- `name`: must equal the Skill name in `SKILL.md` frontmatter.
- `version`: semantic version.
- `runtime`: `dynamic_worker`, `sandbox_nodejs`, or `sandbox_python`.
- `entrypoint`: safe relative path to an imported UTF-8 source file. Dynamic Workers accept `.js` / `.mjs`; Node sandbox accepts `.js` / `.mjs` / `.cjs`; Python sandbox accepts `.py`.
- `inputSchema` / `outputSchema`: restricted JSON Schema subset. Root must be an object; object schemas must set `additionalProperties: false`. External references and unsupported keywords are rejected.
- `requiredTools`: stable tool identifiers, not natural-language tool names.
- `permissions.networkHosts`: exact DNS hostnames only. Wildcards, IP literals, localhost and internal/local domains are rejected.
- `permissions.dataScopes`: explicit resource and action pairs, such as `leads:read` or `market_data:read`.
- `permissions.secrets`: logical secret references only; never values or credentials.
- `permissions.sideEffects`: declared effects such as `send_email`, `update_record`, `delete_record`, `export_data`, or `payment`.
- `limits`: timeout 1–600 seconds, memory 64–2048 MB, and output 1 KB–1 MB.

## Validation boundary

The importer validates structure, allowed fields, paths, runtime/entrypoint compatibility, tool identifier format, permission declarations, resource ranges, and a bounded JSON Schema subset. It does not prove that source code honors its declared contract.

A valid contract is only a typed declaration. It does not install dependencies, execute code, grant tools, expose secrets, approve side effects, or enable a Skill. The runtime must enforce the contract independently at every invocation.
