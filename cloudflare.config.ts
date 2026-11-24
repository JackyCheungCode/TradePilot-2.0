import { bindings, defineConfig, exports } from 'cf/config';
import * as entrypoint from './worker/src/index.ts' with { type: 'cf-worker' };

const workerName = 'tradepilot-standalone';
const workflowNames = {
  agentOrchestration: 'tradepilot-standalone-agent-orchestration',
  contactEnrichment: 'tradepilot-standalone-contact-enrichment',
  facebookDiscovery: 'tradepilot-standalone-facebook-discovery',
  instagramDiscovery: 'tradepilot-standalone-instagram-discovery',
  leadDiscovery: 'tradepilot-standalone-lead-discovery',
} as const;

function requiredBuildText(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.CI === 'true') return 'BUILD_ONLY_PLACEHOLDER';
  throw new Error(name + ' must be set before building or running the Worker locally.');
}

/**
 * Standalone build configuration.
 * All account and Supabase identifiers must belong to the operator.
 * No source-installation account or project identifiers are embedded here.
 */
export default defineConfig({
  accountId: requiredBuildText('CLOUDFLARE_ACCOUNT_ID'),
  worker: {
    name: workerName,
    entrypoint,
    compatibilityDate: '2026-11-13',
    compatibilityFlags: ['nodejs_compat'],
    assets: {
      notFoundHandling: 'single-page-application',
      runWorkerFirst: ['/api/*'],
    },
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
        persist: true,
        headSamplingRate: 1,
      },
      traces: {
        enabled: false,
        persist: true,
        headSamplingRate: 1,
      },
    },
    env: {
      ASSETS: bindings.assets(),
      AI: bindings.ai(),
      SUPABASE_URL: bindings.text(requiredBuildText('SUPABASE_URL')),
      SUPABASE_ANON_KEY: bindings.text(requiredBuildText('SUPABASE_ANON_KEY')),
      AGENT_ENCRYPTION_KEY: bindings.secret(),
      AI_PROVIDER_OPENROUTER_API_KEY: bindings.secret(),
      APIFY_API_TOKEN: bindings.secret(),
      ACTOR_GATEWAY_API_TOKEN: bindings.secret(),
      INBOX_SCANNER_URL: bindings.text(process.env.INBOX_SCANNER_URL ?? ''),
      INBOX_SCANNER_HMAC_SECRET: bindings.secret(),
      DHL_API_KEY: bindings.secret(),
      UPS_CLIENT_ID: bindings.secret(),
      UPS_CLIENT_SECRET: bindings.secret(),
      FEDEX_CLIENT_ID: bindings.secret(),
      FEDEX_CLIENT_SECRET: bindings.secret(),
      CLOUDFLARE_WORKER_NAME: bindings.text(workerName),
      OVERPASS_API_URL: bindings.text(process.env.OVERPASS_API_URL ?? ''),
      DEEPL_API_KEY: bindings.secret(),
      GOOGLE_MAPS_API_KEY: bindings.secret(),
      SERPAPI_API_KEY: bindings.secret(),
      SERPER_API_KEY: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      AGENT_ORCHESTRATION_WORKFLOW: bindings.workflow({
        name: workflowNames.agentOrchestration,
        worker: workerName,
        exportName: 'AgentOrchestrationWorkflow',
      }),
      CONTACT_ENRICHMENT_WORKFLOW: bindings.workflow({
        name: workflowNames.contactEnrichment,
        worker: workerName,
        exportName: 'ContactEnrichmentWorkflow',
      }),
      FACEBOOK_DISCOVERY_WORKFLOW: bindings.workflow({
        name: workflowNames.facebookDiscovery,
        worker: workerName,
        exportName: 'FacebookDiscoveryWorkflow',
      }),
      INSTAGRAM_DISCOVERY_WORKFLOW: bindings.workflow({
        name: workflowNames.instagramDiscovery,
        worker: workerName,
        exportName: 'InstagramDiscoveryWorkflow',
      }),
      LEAD_DISCOVERY_WORKFLOW: bindings.workflow({
        name: workflowNames.leadDiscovery,
        worker: workerName,
        exportName: 'LeadDiscoveryWorkflow',
      }),
    },
    exports: {
      AgentOrchestrationWorkflow: exports.workflow({ name: workflowNames.agentOrchestration }),
      ContactEnrichmentWorkflow: exports.workflow({ name: workflowNames.contactEnrichment }),
      FacebookDiscoveryWorkflow: exports.workflow({ name: workflowNames.facebookDiscovery }),
      InstagramDiscoveryWorkflow: exports.workflow({ name: workflowNames.instagramDiscovery }),
      LeadDiscoveryWorkflow: exports.workflow({ name: workflowNames.leadDiscovery }),
    },
  },
});
