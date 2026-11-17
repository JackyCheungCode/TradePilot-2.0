import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Source = { id: string; name: string; category?: string };
type SchemaField = {
  type?: string; title?: string; description?: string; titleZh?: string; descriptionZh?: string; usageZh?: string;
  enum?: unknown[]; default?: unknown; minimum?: number; maximum?: number; required?: boolean;
};
type ActorSchema = { properties?: Record<string, SchemaField>; required?: string[]; translatedProperties?: Record<string, { titleZh?: string; descriptionZh?: string; usageZh?: string; translationStatus?: string }> };
type LoadedSchema = { source: Source; actorId: string; actorTitle: string; actorStatus?: string; actorQualityScore?: number | null; actorInputFingerprint?: string; schema: ActorSchema };
type Props = { sources: Source[]; profile: { coreNoun: string; country: string; countryName: string; city: string }; onValuesChange: (values: Record<string, unknown>) => void };

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || '请求失败（HTTP ' + response.status + '）');
  return payload.data ?? payload;
}
async function accessToken() {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  return data.session.access_token;
}
function suitability(actor: Record<string, unknown>, source: Source) {
  const stats = actor.stats && typeof actor.stats === 'object' ? actor.stats as Record<string, unknown> : {};
  const users = Number(stats.totalUsers ?? stats.userCount ?? 0);
  const runs = Number(stats.monthlyRuns ?? stats.totalRuns ?? 0);
  const rating = Number(stats.rating ?? 0);
  const text = [actor.name, actor.title, actor.description].filter(Boolean).join(' ').toLowerCase();
  const terms = (source.name + ' ' + source.id).toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2);
  const match = new Set(terms).size ? [...new Set(terms)].filter(term => text.includes(term)).length : 0;
  return match * 40 + Math.log10(Math.max(0, users) + 1) * 12 + Math.log10(Math.max(0, runs) + 1) * 16 + rating * 8;
}
function buildActorInput(item: LoadedSchema, values: Record<string, unknown>, profile: Props['profile']) {
  const input: Record<string, unknown> = {};
  const intent: Record<string, unknown> = {
    query: profile.coreNoun, searchQuery: profile.coreNoun, keyword: profile.coreNoun, keywords: profile.coreNoun ? [profile.coreNoun] : [],
    country: profile.country, countryCode: profile.country, country_code: profile.country, countryName: profile.countryName,
    city: profile.city, location: profile.city || profile.countryName,
  };
  for (const [fieldKey, field] of Object.entries(item.schema.properties ?? {})) {
    const valueKey = item.source.id + ':' + item.actorId + ':' + fieldKey;
    const value = values[valueKey] ?? field.default ?? intent[fieldKey];
    if (value !== undefined && value !== '') {
      if ((field.type === 'object' || field.type === 'array') && typeof value === 'string') {
        try { input[fieldKey] = JSON.parse(value); } catch { input[fieldKey] = value; }
      } else input[fieldKey] = value;
    }
  }
  return input;
}
function fingerprint(input: Record<string, unknown>) {
  const normalized = { ...input };
  for (const key of ['maxItems', 'maxResults', 'maxResultsPerQuery', 'resultsLimit', 'maxItemsPerRun', 'limit']) if (key in normalized) normalized[key] = 1;
  const serialized = JSON.stringify(normalized);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) { hash ^= serialized.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

export function ActorSchemaFields({ sources, profile, onValuesChange }: Props) {
  const [items, setItems] = useState<LoadedSchema[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});
  const [testingActor, setTestingActor] = useState('');
  const [testResults, setTestResults] = useState<Record<string, { passed: boolean; message: string; qualityScore?: number; inputFingerprint?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sourceKey = useMemo(() => sources.map(source => source.id + ':' + source.name).sort().join('|'), [sources]);

  useEffect(() => {
    let active = true;
    if (!sources.length) { setItems([]); setValues({}); setExpandedHelp({}); setTestResults({}); setError(''); setLoading(false); onValuesChange({ fields: {}, actors: [] }); return; }
    setLoading(true); setError(''); setItems([]); setValues({}); setExpandedHelp({}); setTestResults({});
    void (async () => {
      try {
        const token = await accessToken();
        const failures: string[] = [];
        const loaded = await mapLimit(sources, 4, async source => {
          try {
            const discovery = await api('/api/v1/actor-registry/discover', token, { method: 'POST', body: JSON.stringify({ platform: source.id, query: source.name }) }) as { items?: Array<Record<string, unknown>> };
            const candidates = (discovery.items ?? []).filter(actor => typeof actor.actor_id === 'string');
            candidates.sort((a, b) => suitability(b, source) - suitability(a, source));
            const actor = candidates[0];
            if (!actor) return null;
            const actorId = String(actor.actor_id);
            const result = await api('/api/v1/actor-registry/schema/' + encodeURIComponent(actorId), token) as { schema?: ActorSchema; actor?: { status?: string; quality_score?: number | null; last_test_input_fingerprint?: string } };
            if (!result.schema) return null;
            return { source, actorId, actorTitle: String(actor.title || actor.actor_name || actorId), actorStatus: result.actor?.status, actorQualityScore: result.actor?.quality_score, actorInputFingerprint: result.actor?.last_test_input_fingerprint, schema: result.schema } as LoadedSchema;
          } catch (sourceError) {
            failures.push(source.name + '：' + (sourceError instanceof Error ? sourceError.message : String(sourceError)));
            return null;
          }
        });
        if (active) {
          const available = loaded.filter((item): item is LoadedSchema => Boolean(item));
          setItems(available);
          if (failures.length) setError(available.length ? failures.length + ' 个平台未能读取 Schema；已成功加载的平台仍可配置。' : failures[0]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : '读取数据源参数失败。');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sourceKey]);

  const actorParameters = useMemo(() => ({
    fields: values,
    actors: items.map(item => {
      const input = buildActorInput(item, values, profile);
      const currentFingerprint = fingerprint(input);
      const key = item.source.id + ':' + item.actorId;
      const test = testResults[key];
      const localTestPassed = test?.passed === true && test.inputFingerprint === currentFingerprint;
      const persistedTestPassed = item.actorStatus === 'enabled' && item.actorInputFingerprint === currentFingerprint;
      const status = localTestPassed || persistedTestPassed ? 'enabled' : test || item.actorStatus === 'enabled' ? 'needs_retest' : item.actorStatus;
      return { sourceId: item.source.id, sourceName: item.source.name, actorId: item.actorId, actorTitle: item.actorTitle, status, schemaKeys: Object.keys(item.schema.properties ?? {}), input, inputFingerprint: currentFingerprint };
    }),
  }), [values, items, testResults, profile]);
  useEffect(() => { onValuesChange(actorParameters); }, [actorParameters, onValuesChange]);

  const setField = (key: string, value: unknown) => {
    setValues(current => ({ ...current, [key]: value }));
    const actorKey = key.split(':').slice(0, 2).join(':');
    setTestResults(current => ({ ...current, [actorKey]: { passed: false, message: '参数已修改，请重新测试后再执行。' } }));
  };
  useEffect(() => {
    setTestResults(current => {
      const next = { ...current };
      for (const item of items) {
        const key = item.source.id + ':' + item.actorId;
        if (next[key]?.passed || item.actorStatus === 'enabled') next[key] = { passed: false, message: '目标画像已变化，请重新测试。' };
      }
      return next;
    });
  }, [profile.coreNoun, profile.country, profile.countryName, profile.city]);
  const runActorTest = async (item: LoadedSchema) => {
    const testKey = item.source.id + ':' + item.actorId;
    setTestingActor(testKey);
    try {
      const token = await accessToken();
      const input = buildActorInput(item, values, profile);
      const requiredFields = new Set(item.schema.required ?? []);
      const missingFields = Object.entries(item.schema.properties ?? {}).filter(([fieldKey, field]) => {
        const value = input[fieldKey];
        return (requiredFields.has(fieldKey) || field.required === true) && (value === undefined || value === null || value === '');
      }).map(([fieldKey, field]) => (field.titleZh || field.title || fieldKey));
      if (missingFields.length) throw new Error('请先填写必填字段：' + missingFields.join('、'));
      const currentFingerprint = fingerprint(input);
      const result = await api('/api/v1/actor-registry/test', token, {
        method: 'POST',
        body: JSON.stringify({ actorId: item.actorId, input, profile, expectedFieldCount: Object.keys(item.schema.properties ?? {}).length }),
      }) as { passed?: boolean; qualityScore?: number; inputFingerprint?: string; message?: string };
      setTestResults(current => ({ ...current, [testKey]: { passed: result.passed === true, qualityScore: result.qualityScore, inputFingerprint: result.inputFingerprint || currentFingerprint, message: result.message || '测试完成' } }));
    } catch (e) {
      setTestResults(current => ({ ...current, [testKey]: { passed: false, message: e instanceof Error ? e.message : '测试失败' } }));
    } finally {
      setTestingActor('');
    }
  };
  if (!sources.length) return null;
  return <section className="tp-prospect-discovery__section tp-prospect-discovery__actor-schema" aria-label="数据源动态参数">
    <div className="tp-prospect-discovery__section-heading">
      <div><span className="tp-prospect-discovery__section-index">DS</span><div><h2>数据源动态参数</h2><p>根据已选平台匹配候选 Actor，并读取其真实输入 Schema</p><p>参数将纳入方案快照；来源通过运行测试与质量门禁后才会正式执行。</p></div></div>
    </div>
    {loading && <InlineLoading description="正在匹配数据源并读取输入字段…" />}
    {error && <InlineNotification kind="error" title="动态参数读取失败" subtitle={error} />}
    {!loading && !error && !items.length && <InlineNotification kind="info" title="暂无可用参数 Schema" subtitle="当前平台没有找到可访问且返回输入结构的 Actor；现有搜索渠道仍按原流程执行。" />}
    {items.map(item => {
      const properties = item.schema.properties ?? {};
      const required = new Set(item.schema.required ?? []);
      const testKey = item.source.id + ':' + item.actorId;
      const localTest = testResults[testKey];
      const currentFingerprint = fingerprint(buildActorInput(item, values, profile));
      const isEnabled = (localTest?.passed === true && localTest.inputFingerprint === currentFingerprint)
        || (item.actorStatus === 'enabled' && item.actorInputFingerprint === currentFingerprint);
      const needsRetest = Boolean(localTest && (!localTest.passed || localTest.inputFingerprint !== currentFingerprint))
        || (item.actorStatus === 'enabled' && !isEnabled);
      return <div className="tp-prospect-discovery__actor-schema-group" key={item.source.id + ':' + item.actorId}>
        <div className="tp-prospect-discovery__actor-schema-heading">
          <div><strong>{item.source.name}</strong><span>{item.actorTitle}</span></div>
          <div className="tp-prospect-discovery__actor-schema-actions">
            <Tag type={isEnabled ? 'green' : needsRetest || item.actorStatus === 'failed' ? 'red' : 'blue'}>
              {isEnabled ? '已通过门禁' : needsRetest || item.actorStatus === 'failed' ? '需要重新测试' : '已读取 Schema'}
            </Tag>
            <Button kind="secondary" size="sm" disabled={testingActor === item.source.id + ':' + item.actorId} onClick={() => void runActorTest(item)}>
              {testingActor === item.source.id + ':' + item.actorId ? '正在测试…' : '最小化测试并启用'}
            </Button>
          </div>
        </div>
        {testResults[item.source.id + ':' + item.actorId] && <InlineNotification kind={testResults[item.source.id + ':' + item.actorId].passed ? 'success' : 'warning'} lowContrast title={testResults[item.source.id + ':' + item.actorId].passed ? '质量门禁通过' : '质量门禁未通过'} subtitle={testResults[item.source.id + ':' + item.actorId].message + (typeof testResults[item.source.id + ':' + item.actorId].qualityScore === 'number' ? ' · 质量评分 ' + testResults[item.source.id + ':' + item.actorId].qualityScore : '')} />}
        <div className="tp-prospect-discovery__actor-schema-fields">
          {Object.entries(properties).map(([fieldKey, field]) => {
            const translated = item.schema.translatedProperties?.[fieldKey];
            const title = translated?.titleZh || field.titleZh || field.title || fieldKey;
            const description = translated?.descriptionZh || field.descriptionZh || field.description || '原始 Schema 未提供说明。';
            const usage = translated?.usageZh || field.usageZh || '请结合字段要求填写；不确定时保留默认值。';
            const valueKey = item.source.id + ':' + item.actorId + ':' + fieldKey;
            const value = values[valueKey] ?? field.default ?? '';
            const enumValues = Array.isArray(field.enum) ? field.enum : [];
            const isRequired = required.has(fieldKey) || field.required === true;
            return <div className="tp-prospect-discovery__actor-schema-field" key={valueKey}>
              <div className="tp-prospect-discovery__actor-schema-label">
                <span>{title}{isRequired ? ' *' : ''}</span>
                <Button kind="ghost" size="sm" onClick={() => setExpandedHelp(current => ({ ...current, [valueKey]: !current[valueKey] }))} aria-expanded={Boolean(expandedHelp[valueKey])} aria-label={'解释字段 ' + title}>!</Button>
                <code>{fieldKey}</code>
              </div>
              {expandedHelp[valueKey] && <div className="tp-prospect-discovery__actor-schema-help"><p>{description}</p><p>{usage}</p><span>原始类型：{field.type || '未声明'} · {isRequired ? '必填字段' : '选填字段'}</span></div>}
              {enumValues.length > 0 ? <Select id={'actor-field-' + valueKey} labelText={title} hideLabel value={String(value)} onChange={event => setField(valueKey, event.currentTarget.value)}>
                <SelectItem value="" text="请选择" />
                {enumValues.map(option => <SelectItem key={String(option)} value={String(option)} text={String(option)} />)}
              </Select> : field.type === 'boolean' ? <Checkbox id={'actor-field-' + valueKey} labelText={title} checked={Boolean(value)} onChange={event => setField(valueKey, event.currentTarget.checked)} /> : field.type === 'number' || field.type === 'integer' ? <TextInput id={'actor-field-' + valueKey} labelText={title} type="number" value={String(value)} onChange={event => setField(valueKey, event.currentTarget.value === '' ? '' : Number(event.currentTarget.value))} /> : field.type === 'object' || field.type === 'array' ? <TextArea id={'actor-field-' + valueKey} labelText={title} rows={3} value={typeof value === 'string' ? value : JSON.stringify(value)} onChange={event => setField(valueKey, event.currentTarget.value)} /> : <TextInput id={'actor-field-' + valueKey} labelText={title} value={String(value)} onChange={event => setField(valueKey, event.currentTarget.value)} />}
            </div>;
          })}
        </div>
      </div>;
    })}
  </section>;
}
