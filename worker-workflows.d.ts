declare namespace CloudflareWorkersModule {
  export interface WorkflowEvent<T> {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
    workflowName: string;
    schedule?: { cron: string; scheduledTime: number };
  }
  export interface WorkflowStepConfig {
    retries?: { limit: number; delay: string | number; backoff?: "constant" | "linear" | "exponential" };
    timeout?: string | number;
  }
  export abstract class WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
  }
  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected ctx: unknown;
    protected env: Env;
    constructor(ctx: unknown, env: Env);
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}
declare module "cloudflare:workers" {
  export = CloudflareWorkersModule;
}
