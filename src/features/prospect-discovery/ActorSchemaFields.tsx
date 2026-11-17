import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Source = { id: string; name: string; category?: string };
type SchemaField = {
  type?: string; title?: string; description?: string; titleZh?: string; descriptionZh?: string; usageZh?: string;
  enum?: unknown[]; default?: unknown; minimum?: number; maximum?: number; required?: boolean;
};
type ActorSchema = { properties?: Record<string, SchemaField>; required?: string[]; translatedProperties?: Record<string, { titleZh?: string; descriptionZh?: string; usageZh?: string; translationStatus?: string }> };
type LoadedSchema = { source: Source; actorId: string; actorTitle: string; schema: ActorSchema };
type Props = { sources: Source[]; onValuesChange: (values: Record<string, unknown>) => void };

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

export function ActorSchemaFields({ sources, onValuesChange }: Props) {
  const [items, setItems] = useState<LoadedSchema[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sourceKey = useMemo(() => sources.map(source => source.id + ':' + source.name).sort().join('|'), [sources]);

  useEffect(() => {
    let active = true;
    if (!sources.length) { setItems([]); setValues({}); setExpandedHelp({}); setError(''); setLoading(false); onValuesChange({ fields: {}, actors: [] }); return; }
    setLoading(true); setError(''); setItems([]); setValues({}); setExpandedHelp({});
    void (async () => {
      try {
        const token = await accessToken();
        const loaded = await Promise.all(sources.map(async source => {
          const discovery = await api('/api/v1/actor-registry/discover', token, { method: 'POST', body: JSON.stringify({ platform: source.id, query: source.name }) }) as { items?: Array<Record<string, unknown>> };
          const candidates = (discovery.items ?? []).filter(actor => typeof actor.actor_id === 'string');
          candidates.sort((a, b) => suitability(b, source) - suitability(a, source));
          const actor = candidates[0];
          if (!actor) return null;
          const actorId = String(actor.actor_id);
          const result = await api('/api/v1/actor-registry/schema/' + encodeURIComponent(actorId), token) as { schema?: ActorSchema };
          if (!result.schema) return null;
          return { source, actorId, actorTitle: String(actor.title || actor.actor_name || actorId), schema: result.schema } as LoadedSchema;
        }));
        if (active) setItems(loaded.filter((item): item is LoadedSchema => Boolean(item)));
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
      const input: Record<string, unknown> = {};
      for (const [fieldKey, field] of Object.entries(item.schema.properties ?? {})) {
        const valueKey = item.source.id + ':' + item.actorId + ':' + fieldKey;
        const value = values[valueKey] ?? field.default;
        if (value !== undefined && value !== '') {
          if ((field.type === 'object' || field.type === 'array') && typeof value === 'string') {
            try { input[fieldKey] = JSON.parse(value); } catch { input[fieldKey] = value; }
          } else input[fieldKey] = value;
        }
      }
      return { sourceId: item.source.id, sourceName: item.source.name, actorId: item.actorId, actorTitle: item.actorTitle, input };
    }),
  }), [values, items]);
  useEffect(() => { onValuesChange(actorParameters); }, [actorParameters, onValuesChange]);

  const setField = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
  if (!sources.length) return null;
  return <section className="tp-prospect-discovery__section tp-prospect-discovery__actor-schema" aria-label="数据源动态参数">
    <div className="tp-prospect-discovery__section-heading">
      <div><span className="tp-prospect-discovery__section-index">DS</span><div><h2>数据源动态参数</h2><p>根据已选平台匹配候选 Actor，并读取其真实输入 Schema</p></div></div>
    </div>
    {loading && <InlineLoading description="正在匹配数据源并读取输入字段…" />}
    {error && <InlineNotification kind="error" title="动态参数读取失败" subtitle={error} />}
    {!loading && !error && !items.length && <InlineNotification kind="info" title="暂无可用参数 Schema" subtitle="当前平台没有找到可访问且返回输入结构的 Actor；现有搜索渠道仍按原流程执行。" />}
    {items.map(item => {
      const properties = item.schema.properties ?? {};
      const required = new Set(item.schema.required ?? []);
      return <div className="tp-prospect-discovery__actor-schema-group" key={item.source.id + ':' + item.actorId}>
        <div className="tp-prospect-discovery__actor-schema-heading">
          <div><strong>{item.source.name}</strong><span>{item.actorTitle}</span></div>
          <Tag type="green">已读取 Schema</Tag>
        </div>
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
