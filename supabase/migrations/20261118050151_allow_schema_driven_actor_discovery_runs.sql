-- Actor discovery runs are driven exclusively by each Actor's Input Schema.
-- Keep the legacy query/country requirements for all non-Actor discovery channels.
ALTER TABLE public.discovery_runs
  DROP CONSTRAINT IF EXISTS discovery_runs_query_check,
  DROP CONSTRAINT IF EXISTS discovery_runs_countries_check;

ALTER TABLE public.discovery_runs
  ADD CONSTRAINT discovery_runs_query_check
    CHECK (channel = 'actor_discovery' OR length(trim(query)) > 0),
  ADD CONSTRAINT discovery_runs_countries_check
    CHECK (channel = 'actor_discovery' OR cardinality(countries) > 0);

COMMENT ON CONSTRAINT discovery_runs_query_check ON public.discovery_runs
  IS 'Actor discovery is Schema-driven and does not require a preset query.';
COMMENT ON CONSTRAINT discovery_runs_countries_check ON public.discovery_runs
  IS 'Actor discovery is Schema-driven and does not require preset countries.';
