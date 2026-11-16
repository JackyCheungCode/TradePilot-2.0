import type { SupabaseClient } from '@supabase/supabase-js';

export interface DiscoveryLog {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  createdAt: string;
}
export interface DiscoveryRun {
  id: string;
  taskCode: string;
  channel: string;
  query: string;
  status: string;
  progress: number;
  discoveredCount: number;
  createdLeadCount: number;
  message: string;
  createdAt: string;
  logs: DiscoveryLog[];
  countries?: string[];
  state?: string;
  city?: string;
  searchConfig?: Record<string, unknown>;
  providers?: string[];
}
export interface ContactEnrichmentJob {
  id: string;
  status: string;
  progress: number;
  completedCount: number;
  failedCount: number;
  message: string;
  recordIds: string[];
  createdAt: string;
}
export interface DiscoveryRecord {
  id: string;
  channel: string;
  record_type: string;
  name: string;
  country_code?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  confidence_score?: number;
  raw_data?: Record<string, unknown>;
  discovery_record_occurrences?: Array<{ provider?: string; source_url?: string; keyword?: string }>;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new Error(error?.message ?? String(payload.message ?? `请求失败（${response.status}）`));
  }
  return (payload.data ?? payload.result ?? payload) as T;
}

export async function createDiscoveryRun(
  _client: SupabaseClient,
  token: string,
  channel: 'map' | 'facebook' | 'instagram',
  config: Record<string, unknown>,
): Promise<DiscoveryRun> {
  const endpoints = {
    map: '/api/v1/discovery-runs',
    facebook: '/api/v1/facebook-discovery-runs',
    instagram: '/api/v1/instagram-discovery-runs',
  } as const;
  return request<DiscoveryRun>(endpoints[channel], token, { method: 'POST', body: JSON.stringify(config) });
}

export function getDiscoveryRun(token: string, id: string): Promise<DiscoveryRun> {
  return request<DiscoveryRun>(`/api/v1/discovery-runs/${id}`, token);
}

export function getDiscoveryRuns(token: string): Promise<DiscoveryRun[]> {
  return request<DiscoveryRun[]>('/api/v1/discovery-runs', token);
}

export function getContactEnrichmentJobs(token: string): Promise<ContactEnrichmentJob[]> {
  return request<ContactEnrichmentJob[]>('/api/v1/discovery-contact-enrichments', token);
}

export function getDiscoveryRecords(token: string, runId: string): Promise<DiscoveryRecord[]> {
  return request<DiscoveryRecord[]>(`/api/v1/discovery-records?runId=${encodeURIComponent(runId)}&limit=500`, token);
}


export async function applyDiscoveryRecordAction(
  token: string,
  recordId: string,
  action: 'remove' | 'discard' | 'promote' | 'review',
  runId?: string,
): Promise<{ id: string; status: string; leadId?: string }> {
  return request<{ id: string; status: string; leadId?: string }>(
    `/api/v1/discovery-records/${recordId}/action`,
    token,
    { method: 'POST', body: JSON.stringify({ action, runId }) },
  );
}

export async function retryDiscoveryRun(token: string, run: DiscoveryRun): Promise<DiscoveryRun> {
  const config = run.searchConfig ?? {};
  if (run.channel === 'map_local_businesses' || run.channel === 'map') {
    return createDiscoveryRun({} as SupabaseClient, token, 'map', {
      countries: run.countries ?? [],
      query: run.query,
      limitPerCountry: Number(config.limitPerCountry ?? config.limit_per_country ?? 100),
      providers: (run.providers ?? ['google_maps']) as string[],
      state: run.state,
      city: run.city,
      businessTypes: Array.isArray(config.businessTypes) ? config.businessTypes : [],
      filters: (config.filters ?? {}) as Record<string, unknown>,
      osmTags: Array.isArray(config.osmTags) ? config.osmTags : [],
    });
  }
  if (run.channel === 'facebook') {
    return createDiscoveryRun({} as SupabaseClient, token, 'facebook', {
      country: run.countries?.[0],
      state: run.state,
      city: run.city,
      query: run.query,
      objectTypes: Array.isArray(config.objectTypes) ? config.objectTypes : ['page'],
      limitPerType: Number(config.limitPerType ?? 100),
      enrichPages: config.enrichPages === true,
      enrichGroups: config.enrichGroups === true,
      enrichPosts: config.enrichPosts === true,
      dateFrom: config.dateFrom,
      dateTo: config.dateTo,
    });
  }
  if (run.channel === 'instagram') {
    return createDiscoveryRun({} as SupabaseClient, token, 'instagram', {
      ...config,
      keywords: Array.isArray(config.keywords) ? config.keywords : run.query.split(' · '),
      countries: run.countries ?? [],
    });
  }
  throw new Error('该任务类型暂不支持重试。');
}
