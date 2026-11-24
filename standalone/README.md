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

## Create a repository with fresh Git history

1. Download the source ZIP from the source repository's `main` branch, or clone it locally.
2. Create a new empty repository under your own GitHub account. Do not use GitHub's Fork button.
3. Extract the source ZIP, excluding any existing `.git` directory if you used a clone.
4. Review and replace environment-specific configuration as described below.
5. Initialize and push a new repository:

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
```

Copy the environment templates and fill in credentials belonging to your own services:

```bash
cp .dev.vars.example .dev.vars
```

If the application requires frontend build-time variables, use the repository's `.env.example` as the authoritative variable-name reference. Never commit populated `.env` or `.dev.vars` files.

Review the root `package.json` scripts before running migrations or deploying. Typical validation commands used by this repository include:

```bash
npm run build
npm run test:guardrails
npm run check:design-system
npm run worker:validate
```

## Supabase setup — important migration limitation

The source repository contains migration, deferred-migration, rollback, and test directories. However, its recorded migration history has previously been found not to match the live production database history. Therefore:

- Do not connect a fresh installation to somebody else's production Supabase project.
- Do not assume that running every SQL file in filename order recreates the production schema.
- Do not blindly run `supabase db reset` or apply deferred migrations without reviewing dependencies.
- Validate the complete schema, RLS policies, grants, triggers, functions/RPCs, extensions, and seed data in a brand-new disposable Supabase project first.
- Use synthetic test data only. Do not import production customer or user records.

A verified clean-install migration baseline is a prerequisite for claiming one-command deployment. Until it is independently validated, database initialization is a manual engineering task.

## Cloudflare setup

Start from `standalone/wrangler.template.jsonc`. Give the installation its own:

- Worker name
- Supabase URL and publishable/anon key
- Cloudflare account and deployment token
- R2 bucket(s)
- Workflow bindings and any required resources
- Cron triggers and custom domains/routes

Create the required Cloudflare resources in the friend's account before deploying. Set private values with Wrangler secrets or GitHub Actions repository secrets; do not put them in committed JSONC files.

The original production workflow is not a standalone deployment recipe. Review and replace account-specific IDs, secret names, environments, approval rules, and deployment targets before enabling any deployment workflow.

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
