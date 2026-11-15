# Prospect Discovery

First approved TradePilot 2.0 feature route: `/prospect-discovery`.

## First rollout

- Google Maps: Google Places API (New), official API route.
- Facebook Pages: existing Apify-backed Facebook discovery workflow.
- Instagram: existing Apify-backed public discovery workflow.

LinkedIn, TikTok, Amazon, Alibaba.com, and AliExpress are visible as planned channels but remain disabled until their individual Actor contracts, field mappings, and live test results are verified. The page must not present untested integrations as operational.

## Runtime behavior

- Authenticates with the existing Supabase Auth account.
- Creates runs through the existing Worker discovery endpoints and database tables.
- Polls run status, persisted logs, and result records every 2.5 seconds.
- Shows backend progress values and periodic Actor heartbeat log entries; no synthetic percentage progress is generated.
- Keeps the run and its source occurrences in the existing discovery schema. No schema migration is required for this page.

## Design constraints

- Carbon React controls are imported only from the local design-system entry point.
- The page-specific workspace composition is implemented as a design-system pattern using Carbon tokens.
- No new top-level application page or navigation group is introduced beyond this approved route.
