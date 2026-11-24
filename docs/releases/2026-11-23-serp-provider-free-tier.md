# SERP provider free-tier release

## Scope
- Enable Bright Data, SerpKite, and SerpApi from the search-discovery task API using credentials stored in the encrypted integration Vault.
- Keep one-time Serper and currently unconfigured QuanticData out of the monthly-free discovery entry point.
- Validate provider credentials before creating a search task.
- Check provider free-plan or no-funded-balance conditions before each billable search request; fail closed when quota status cannot be verified.
- Make the Bright Data integration test read-only: verify account balance and the configured SERP zone without issuing a billable search.
- Verify SerpKite using its current `/v1/account` contract, including free plan, per-key monthly cap, monthly usage, and remaining balance.
- Add regression tests for provider selection, Vault-backed credentials, and no-charge provider connection tests.

## Safety
- No production database schema changes or migrations.
- No API credentials or secret values committed.
- No paid SERP search is performed as part of deployment validation.
- Country verification and lead-promotion safeguards remain unchanged.
