# TradePilot Prospect Discovery — Production Release

Date: 2026-11-23
Target branch: develop
Repository: JackyCheungCode/TradePilot-2.0

## Included

- Added Bright Data SERP, QuanticData SERP, SerpKite and SerpApi integration cards under Settings → API Integrations.
- API credentials remain in the encrypted integration vault; prospect-discovery screens contain no API key, secret or endpoint configuration.
- Search source selection lists only providers whose credentials are configured.
- QuanticData checks remaining monthly free allowance before each page request.
- SerpKite requires a Free plan and a per-key monthly hard limit no greater than 1,000 credits; checks remaining monthly credits before each page request.
- SerpApi checks that the account is on the $0 Free plan and has monthly searches remaining before each request.
- Bright Data integration uses the no-card Free tier (5,000 monthly requests); free-tier enforcement remains provider-side.
- Serper's one-time promotional credits are excluded from monthly-free search mode.
- Search result country is not persisted as a verified company country. Target market is stored separately until website analysis confirms a match.
- Lead promotion requires a verified target-country match; mismatch and unknown country are blocked.
- Corrected third-party B2B directory detection and added regression tests.
- Removed redundant instructional copy from the prospect-discovery workflow.
- No production database schema migration is included.

## External dependency not included

ForgeSEO (forgeseo.io) is not wired into the search provider chain in this release. Its public website lists API access under the Agency plan, but no public API endpoint contract was available to validate. Do not substitute SEOForge or reverse-engineer undocumented endpoints. Integration can proceed when the official ForgeSEO API documentation and an authorized API credential are available.

## Validation

- CI: successful, including SQL lifecycle checks, private scanner checks, discovery guardrail tests, design-system boundary, TypeScript build and Cloudflare Worker dry-run bundle validation.
- Production release is executed only through the repository's approved GitHub deployment workflow.
