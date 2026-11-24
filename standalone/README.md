# TradePilot Standalone Developer Edition

This directory documents how to create an independent copy of TradePilot for development and self-hosting.

## Independence model

A standalone installation must use resources owned by its operator:

- A separate GitHub repository (not a GitHub Fork).
- A separate Supabase project and database.
- A separate Cloudflare account, Worker, R2 bucket, and required bindings.
- Independently issued third-party API credentials.
- Its own deployment secrets and CI/CD configuration.

Do not reuse credentials, production data, Supabase project URLs/keys, Cloudflare account IDs, Worker names, R2 buckets, or webhook URLs from another installation.

## Download and create a repository with fresh Git history

1. Open the source repository and select the `standalone/developer-handoff` branch.
2. Download that branch as a ZIP archive. Do not use GitHub's Fork button.
3. Create a new empty repository under your own GitHub account. Do not initialize it with a README, license, or .gitignore.
4. Extract the ZIP archive into a local folder.
5. Review and replace environment-specific configuration as described below.
6. Initialize and push a new repository:

```bash
git init
git add .
git commit -m "Initial standalone TradePilot source"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

The new repository has its own Git history and does not inherit a remote connection to the source repository.

## Local application setup

Use the Node.js version specified by the repository's CI workflow (currently Node.js 22).

```bash
npm ci
cp .env.example .env
cp .dev.vars.example .dev.vars
```

Fill in your own values:

- `.env`: `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` for the local Cloudflare build; frontend public variables may be set if your chosen frontend integration uses them.
- `.dev.vars`: local Worker-only secrets and private API keys.
- `wrangler.jsonc`: your own Worker name, Supabase URL/key, R2 bucket name, and any resource bindings.
- `cloudflare.config.ts`: its Worker and Workflow names should match the resources in your own `wrangler.jsonc`; the supplied standalone values are namespaced to avoid colliding with another installation.

Never commit populated `.env` or `.dev.vars` files. Never place service-role keys or private API credentials in `VITE_` variables or committed configuration.

## CI and deployment

The included CI workflow validates builds and Worker bundles only; it does not deploy.

The standalone deployment workflow is manual-only, targets the `main` branch, and requires the explicit `approved` selection. Configure these repository secrets in your own GitHub repository:

- `CLOUDFLARE_API_TOKEN`: a token created in your own Cloudflare account with the minimum required Worker deployment permissions.
- `CLOUDFLARE_ACCOUNT_ID`: your own Cloudflare account ID.
- Repository variable `SUPABASE_URL`: your own Supabase project URL.
- Repository variable `SUPABASE_ANON_KEY`: your own Supabase publishable/anon key.

Configure the GitHub environment named `standalone-production` and, preferably, require an environment reviewer before production deployment. Create the R2 bucket and all required Cloudflare Workflow resources in your own account before deployment.

Set Worker runtime secrets separately using Wrangler, for example:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.jsonc
npx wrangler secret put AGENT_ENCRYPTION_KEY --config wrangler.jsonc
```

Repeat for the private API keys required by the features you enable (for example Apify, OpenRouter, Google Maps, DeepL, SERP providers, shipping-provider credentials, and inbox-scanner HMAC). Never store these values in GitHub source files. For local development, keep these in `.dev.vars`; the supplied example lists the supported Worker secret names.

## Supabase setup — important migration limitation

Read [DATABASE-BOOTSTRAP-AUDIT.md](./DATABASE-BOOTSTRAP-AUDIT.md) before initializing Supabase. The audit records the current migration-ledger differences and read-only schema inventory. The current migration history does not reproduce the source database one-to-one.

The repository now includes `supabase/config.toml` with PostgreSQL 17, local Auth/API settings, and the five known Storage bucket definitions. Seed loading is disabled until the required non-production reference data has been reviewed. The Inbox private-attachment bucket remains deferred.

### Local clean-install validation

Install Docker and Supabase CLI 3.1.0, then run these commands from the repository root:

```bash
supabase start --exclude studio,logflare,vector,edge-runtime,mailpit
supabase db reset
supabase test db supabase/tests/monitoring-bootstrap.test.sql
supabase stop --no-backup
```

This starts an isolated local Supabase stack, applies the repository migration sequence to a clean database, and runs the monitoring/RLS integration test. It does not connect to any hosted Supabase project. CI also runs this clean-install path; do not describe the database as certified until that workflow passes.

For a new hosted project, first complete the clean local test, then authenticate and link only the recipient's own project. Review the migration plan before applying it:

```bash
supabase login
supabase link --project-ref YOUR_OWN_PROJECT_REF
supabase db push --remote
```

The hosted push is intentionally not part of the Cloudflare deployment workflow yet. Do not link this checkout to the original TradePilot production project.

Therefore:

- Do not connect a fresh installation to somebody else's production Supabase project.
- Do not assume that running every SQL file in filename order recreates the production schema.
- Do not blindly run `supabase db reset` or apply deferred migrations without reviewing dependencies.
- Validate the complete schema, RLS policies, grants, triggers, functions/RPCs, extensions, and seed data in a brand-new disposable Supabase project first.
- Use synthetic test data only. Do not import production customer or user records.

A verified clean-install migration baseline is a prerequisite for claiming one-command deployment. Until it is independently validated, database initialization is a manual engineering task.

## Security checklist

- [ ] New private GitHub repository; no Fork relationship
- [ ] Fresh Git history and only the new repository as `origin`
- [ ] No populated `.env`, `.dev.vars`, service-role keys, API tokens, or production secrets committed
- [ ] No original Supabase project identifiers or production data retained in runtime configuration
- [ ] New Supabase project with verified schema and RLS
- [ ] New Cloudflare Worker, R2 bucket, bindings, workflows, and secrets
- [ ] Third-party API keys issued for the new owner
- [ ] CI passes in the new repository
- [ ] Deployment tested against non-production resources first

This package is a source-code handoff guide, not a guarantee that every external service has been provisioned or that the database can yet be recreated automatically.
