import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Source = { id: string; name: string; category?: string };
type SchemaField = {
  type?: string; title?: string; description?: string; titleZh?: string; descriptionZh?: string; usageZh?: string;
  enum?: unknown[]; default?: unknown; minimum?: number; maximum?: number; required?: boolean;
};
type ActorSchema = { properties?: Record<string, SchemaField>; required?: string[]; translatedProperties?: Record<string, { titleZh?: string; descriptionZh?: string; usageZh?: string; translationStatus?: string }> };
type LoadedSchema = { source: Source; actorId: string; actorTitle: string; schemaVersion: string; actorStatus?: string; actorQualityScore?: number | null; actorInputFingerprint?: string; schema: ActorSchema };
type Props = { sources: Source[]; onValuesChange: (values: Record<string, unknown>) => void };

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: { code?: string; message?: string } };
  if (!response.ok) {
    const code = payload.error?.code ? '[' + payload.error.code + '] ' : '';
    throw new Error(code + (payload.error?.message || '请求失败（HTTP ' + response.status + '）'));
  }
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
  const quality = Number(actor.quality_score ?? 0);
  const stability = Number(actor.stability_score ?? 0);
  const status = String(actor.status ?? 'discovered');
  const text = [actor.name, actor.title, actor.description].filter(Boolean).join(' ').toLowerCase();
  const terms = (source.name + ' ' + source.id).toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2);
  const match = new Set(terms).size ? [...new Set(terms)].filter(term => text.includes(term)).length : 0;
  return match * 40 + quality * 0.5 + stability * 0.25 + (status === 'enabled' ? 30 : status === 'failed' ? -20 : 0)
    + Math.log10(Math.max(0, users) + 1) * 12 + Math.log10(Math.max(0, runs) + 1) * 16 + rating * 8;
}
function buildActorInput(item: LoadedSchema, values: Record<string, unknown>) {
  const input: Record<string, unknown> = {};
  for (const [fieldKey, field] of Object.entries(item.schema.properties ?? {})) {
    const valueKey = item.source.id + ':' + item.actorId + ':' + fieldKey;
    const value = values[valueKey] ?? field.default ?? '';
    if (value !== undefined && value !== '') {
      if ((field.type === 'object' || field.type === 'array') && typeof value === 'string') {
        try { input[fieldKey] = JSON.parse(value); } catch { input[fieldKey] = value; }
      } else input[fieldKey] = value;
    }
  }
  return input;
}
function validateActorInput(item: LoadedSchema, input: Record<string, unknown>) {
  const required = new Set(item.schema.required ?? []);
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const [key, field] of Object.entries(item.schema.properties ?? {})) {
    const value = input[key];
    const label = item.schema.translatedProperties?.[key]?.titleZh || field.titleZh || field.title || key;
    if ((required.has(key) || field.required === true) && (value === undefined || value === null || value === '' || (typeof value === 'string' && !value.trim()))) {
      missing.push(label);
      continue;
    }
    if (value === undefined || value === null || value === '') continue;
    const type = field.type;
    const valid = type === 'string' ? typeof value === 'string'
      : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
      : type === 'boolean' ? typeof value === 'boolean'
      : type === 'array' ? Array.isArray(value)
      : type === 'object' ? typeof value === 'object' && !Array.isArray(value)
      : true;
    if (!valid) invalid.push(label + '（应为 ' + type + '）');
    if (Array.isArray(field.enum) && !field.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) invalid.push(label + '（不在允许选项内）');
    if (typeof value === 'number' && ((typeof field.minimum === 'number' && value < field.minimum) || (typeof field.maximum === 'number' && value > field.maximum))) invalid.push(label + '（超出允许范围）');
  }
  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
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

export function ActorSchemaFields({ sources, onValuesChange }: Props) {
  const actorSources = useMemo(() => sources, [sources]);
  const [items, setItems] = useState<LoadedSchema[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sourceKey = useMemo(() => sources.map(source => source.id + ':' + source.name).sort().join('|'), [sources]);

  useEffect(() => {
    let active = true;
    if (!actorSources.length) { setItems([]); setValues({}); setExpandedHelp({}); setError(''); setLoading(false); onValuesChange({ fields: {}, actors: [] }); return; }
    setLoading(true); setError(''); setItems([]); setValues({}); setExpandedHelp({});
    void (async () => {
      try {
        const token = await accessToken();
        const failures: string[] = [];
        const loaded = await mapLimit(actorSources, 4, async source => {
          try {
            const discovery = await api('/api/v1/actor-registry/discover', token, { method: 'POST', body: JSON.stringify({ platform: source.id, query: source.name }) }) as { items?: Array<Record<string, unknown>>; warnings?: string[] };
            for (const warning of discovery.warnings ?? []) failures.push(source.name + '：' + warning);
            const candidates = (discovery.items ?? []).filter(actor => typeof actor.actor_id === 'string');
            candidates.sort((a, b) => suitability(b, source) - suitability(a, source));
            if (!candidates.length) { failures.push(source.name + '：暂未发现可用的数据源。'); return null; }
            const schemaFailures: string[] = [];
            for (const actor of candidates.slice(0, 5)) {
              const actorId = String(actor.actor_id);
              try {
                const result = await api('/api/v1/actor-registry/schema/' + encodeURIComponent(actorId), token) as { version?: string; schema?: ActorSchema; actor?: { status?: string; quality_score?: number | null; last_test_input_fingerprint?: string } };
                if (!result.schema || !Object.keys(result.schema.properties ?? {}).length) {
                  schemaFailures.push(String(actor.title || actor.actor_name || actorId) + '：接口未返回 properties 字段');
                  continue;
                }
                return { source, actorId, actorTitle: String(actor.title || actor.actor_name || '平台专用采集器'), schemaVersion: String(result.version || 'latest'), actorStatus: result.actor?.status, actorQualityScore: result.actor?.quality_score, actorInputFingerprint: result.actor?.last_test_input_fingerprint, schema: result.schema } as LoadedSchema;
              } catch (schemaError) {
                schemaFailures.push(String(actor.title || actor.actor_name || actorId) + '：' + (schemaError instanceof Error ? schemaError.message : String(schemaError)));
              }
            }
            failures.push(source.name + '：候选数据源均未提供可用输入结构。' + (schemaFailures.length ? ' 最近失败：' + schemaFailures.slice(0, 2).join('；') : ''));
            return null;
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
      const input = buildActorInput(item, values);
      const validation = validateActorInput(item, input);
      return {
        sourceId: item.source.id, sourceName: item.source.name, actorId: item.actorId,
        actorTitle: item.actorTitle, schemaVersion: item.schemaVersion,
        status: validation.valid ? 'enabled' : 'needs_input',
        validationErrors: [...validation.missing.map(field => '必填：' + field), ...validation.invalid],
        schemaKeys: Object.keys(item.schema.properties ?? {}), input,
      };
    }),
  }), [values, items]);
  useEffect(() => { onValuesChange(actorParameters); }, [actorParameters, onValuesChange]);

  const setField = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
  if (!sources.length) return null;
  return <section className="tp-prospect-discovery__section tp-prospect-discovery__actor-schema" aria-label="数据源动态参数">
    <div className="tp-prospect-discovery__section-heading">
      <div><span className="tp-prospect-discovery__section-index">DS</span><div><h2>数据源动态参数</h2><p>根据已选平台匹配候选 Actor，并读取其真实输入 Schema</p><p>根据 Schema 自动标记必填字段；填写完成并通过本地格式校验后即可执行，无需运行测试。</p></div></div>
    </div>
    {loading && <InlineLoading description="正在匹配数据源并读取输入字段…" />}
    {error && <InlineNotification kind="error" title="动态参数读取失败" subtitle={error} />}
    {!loading && !error && !items.length && <InlineNotification kind="info" title="暂无可用参数 Schema" subtitle="当前所选平台尚未找到可读取的 Actor Schema；请检查数据源目录和 API 凭证。" />}
    {items.map(item => {
      const properties = item.schema.properties ?? {};
      const required = new Set(item.schema.required ?? []);
      const validation = validateActorInput(item, buildActorInput(item, values));
      const isEnabled = validation.valid;
      return <div className="tp-prospect-discovery__actor-schema-group" key={item.source.id + ':' + item.actorId}>
        <div className="tp-prospect-discovery__actor-schema-heading">
          <div><strong>{item.source.name}</strong><span>{item.actorTitle}</span></div>
          <div className="tp-prospect-discovery__actor-schema-actions">
            <Tag type={isEnabled ? 'green' : 'blue'}>{isEnabled ? '参数完整 · 可执行' : '待补充必填项'}</Tag>
          </div>
        </div>
        {!validation.valid && <InlineNotification kind="warning" lowContrast title="请补全 Schema 参数" subtitle={[...(validation.missing.length ? ['必填：' + validation.missing.join('、')] : []), ...(validation.invalid.length ? ['格式：' + validation.invalid.join('、')] : [])].join('；')} />}
        {validation.valid && <InlineNotification kind="success" lowContrast title="参数校验完成" subtitle="Schema 必填字段与字段类型均符合要求，可以进入执行步骤；不会发起 Actor 测试任务。" />}
        <div className="tp-prospect-discovery__actor-schema-fields">
          {Object.entries(properties).map(([fieldKey, field]) => {
            const translated = item.schema.translatedProperties?.[fieldKey];
            const title = translated?.titleZh || field.titleZh || field.title || fieldKey;
            const description = translated?.descriptionZh || field.descriptionZh || field.description || '原始 Schema 未提供说明。';
            const usage = translated?.usageZh || field.usageZh || '请结合字段要求填写；不确定时保留默认值。';
            const valueKey = item.source.id + ':' + item.actorId + ':' + fieldKey;
            const value = values[valueKey] ?? field.default ?? '';
            const isMissingRequired = isRequired && (value === undefined || value === null || (typeof value === 'string' && !value.trim()));
            const enumValues = Array.isArray(field.enum) ? field.enum : [];
            const isRequired = required.has(fieldKey) || field.required === true;
            return <div className="tp-prospect-discovery__actor-schema-field" key={valueKey}>
              <div className="tp-prospect-discovery__actor-schema-label">
                <span>{title}</span>
                {isRequired && <Tag type="red">必填</Tag>}
                <Button kind="ghost" size="sm" onClick={() => setExpandedHelp(current => ({ ...current, [valueKey]: !current[valueKey] }))} aria-expanded={Boolean(expandedHelp[valueKey])} aria-label={'解释字段 ' + title}>!</Button>
                <code>{fieldKey}</code>
              </div>
              {expandedHelp[valueKey] && <div className="tp-prospect-discovery__actor-schema-help"><p>{description}</p><p>{usage}</p><span>原始类型：{field.type || '未声明'} · {isRequired ? '必填字段' : '选填字段'}</span></div>}
              {enumValues.length > 0 ? <Select id={'actor-field-' + valueKey} labelText={title} hideLabel value={String(value)} onChange={event => {
                const raw = event.currentTarget.value;
                const parsed = raw === '' ? '' : field.type === 'number' || field.type === 'integer' ? Number(raw) : field.type === 'boolean' ? raw === 'true' : field.type === 'object' || field.type === 'array' ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
                setField(valueKey, parsed);
              }}>
                <SelectItem value="" text="请选择" />
                {enumValues.map(option => <SelectItem key={String(option)} value={String(option)} text={String(option)} />)}
              </Select> : field.type === 'boolean' ? <Checkbox id={'actor-field-' + valueKey} labelText={title} checked={Boolean(value)} onChange={event => setField(valueKey, event.currentTarget.checked)} /> : field.type === 'number' || field.type === 'integer' ? <TextInput id={'actor-field-' + valueKey} labelText={title} type="number" value={String(value)} onChange={event => setField(valueKey, event.currentTarget.value === '' ? '' : Number(event.currentTarget.value))} /> : field.type === 'object' || field.type === 'array' ? <TextArea id={'actor-field-' + valueKey} labelText={title} rows={3} value={typeof value === 'string' ? value : JSON.stringify(value)} onChange={event => setField(valueKey, event.currentTarget.value)} /> : <TextInput id={'actor-field-' + valueKey} labelText={title} value={String(value)} onChange={event => setField(valueKey, event.currentTarget.value)} />}
            {isMissingRequired && <InlineNotification kind="error" lowContrast title="此字段为必填项" />}
            </div>;
          })}
        </div>
      </div>;
    })}
  </section>;
}
