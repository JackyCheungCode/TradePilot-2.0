import { bindings, defineConfig, exports } from 'cf/config';
import * as entrypoint from './worker/src/index.ts' with { type: 'cf-worker' };

const workerName = 'tradepilot';
const workflowNames = {
  agentOrchestration: 'tradepilot-agent-orchestration',
  contactEnrichment: 'tradepilot-contact-enrichment',
  facebookDiscovery: 'tradepilot-facebook-discovery',
  instagramDiscovery: 'tradepilot-instagram-discovery',
  leadDiscovery: 'tradepilot-lead-discovery',
} as const;

function requiredBuildText(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.CI === 'true') return 'BUILD_ONLY_PLACEHOLDER';
  throw new Error(name + ' must be set before building or running the Worker locally.');
}

/**
 * Reconciled from the existing production tradepilot Worker.
 * This file configures builds only; no deploy command is wired into CI.
 */
export default defineConfig({
  accountId: 'ea4e98dce9c478d7dd5c07f10e5c722d',
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
      SUPABASE_URL: bindings.text('https://nlklnkkcwapwerkahoyb.supabase.co'),
      SUPABASE_ANON_KEY: bindings.text(requiredBuildText('SUPABASE_ANON_KEY')),
      AGENT_ENCRYPTION_KEY: bindings.secret(),
      AI_PROVIDER_OPENROUTER_API_KEY: bindings.secret(),
      APIFY_API_TOKEN: bindings.secret(),
      CLOUDFLARE_API_TOKEN: bindings.secret(),
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
