import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionItem, Button, Checkbox, CodeSnippet, Column, CopyButton, Grid,
  InlineNotification, ProgressBar, StructuredListBody, StructuredListCell,
  StructuredListHead, StructuredListRow, StructuredListWrapper, Tag, TextInput, Tile, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type SourceItem = { id: string; name: string; category?: string };
type ProfileSnapshot = {
  coreNoun: string; buyers: string[]; continent: string; country: string; countryName: string; city: string;
};
type RunSnapshot = {
  id: string; taskCode?: string; channel: string; status: string; progress: number;
  discoveredCount: number; createdLeadCount: number; message?: string;
  logs?: Array<{ id: string; level: string; message: string; createdAt: string }>;
};
type RunRef = { id: string; sourceId: string; name: string };
type Props = {
  profile: ProfileSnapshot;
  sources: SourceItem[];
  onEditStep: (step: number) => void;
  onContinueToScoring: (recordIds: string[]) => void;
  planTaskCode: string;
};

const clampLimit = (value: string, fallback: number) => { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : fallback; };
const buyerLabels: Record<string, string> = {
  importer: '进口商', distributor: '分销商 / 批发商', brand: '品牌方', contractor: '工程商 / 零售商',
};
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour12: false });
const terminalStatuses = new Set(['completed', 'partial', 'partially_completed', 'failed', 'cancelled', 'timed_out']);
const statusLabel = (status: string) => ({
  queued: '排队中', running: '运行中', completed: '已完成', partial: '部分完成',
  partially_completed: '部分完成', failed: '执行失败', cancelled: '已取消', timed_out: '已超时',
}[status] ?? status ?? '等待状态');
const statusTag = (status: string): 'green' | 'blue' | 'red' | 'warm-gray' | 'gray' =>
  status === 'completed' ? 'green' : status === 'running' ? 'blue'
    : status === 'failed' || status === 'timed_out' ? 'red'
      : status === 'partial' || status === 'partially_completed' ? 'warm-gray' : 'gray';

async function requestApi(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: { message?: string }; message?: string };
  if (!response.ok) throw new Error((payload.error?.message || payload.message || '请求失败（HTTP ' + response.status + '）').replace(/Apify/gi, '外部数据采集服务'));
  return payload.data ?? payload;
}

async function getAccessToken() {
  const db = await getSupabaseClient();
  const { data } = await db.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  return data.session.access_token;
}

export function ExecutionStep({ profile, sources, onEditStep, onContinueToScoring, planTaskCode }: Props) {
  const channels = useMemo(() => sources, [sources]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState(0);
  const [runs, setRuns] = useState<RunRef[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, RunSnapshot>>({});
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] 真实任务执行控制台已就绪。',
    '[CONTEXT] 等待创建后端任务；进度、数量和日志仅显示服务端返回值。',
  ]);
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [mapLimit, setMapLimit] = useState('2');
  const [webLimit, setWebLimit] = useState('5');
  const [facebookLimit, setFacebookLimit] = useState('5');
  const [instagramLimit, setInstagramLimit] = useState('5');
  const [confirmedExecution, setConfirmedExecution] = useState(false);
  const [guardrailCount] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tradepilot.guardrails.frontend.v1') || '{}');
      return Object.values(saved.enabled || {}).filter(Boolean).length;
    } catch { return 0; }
  });
  const appendLog = (message: string) => setLogs(current => [...current.slice(-79), '[' + nowTime() + '] ' + message]);
  const runStorageKey = 'tradepilot.prospectDiscovery.runs.' + planTaskCode;

  useEffect(() => {
    setRuns([]); setSnapshots({}); setRecordIds([]); setStatus('idle'); setStartedAt(null);
    try {
      const saved = localStorage.getItem(runStorageKey);
      if (!saved) return;
      const restored = JSON.parse(saved) as RunRef[];
      if (!Array.isArray(restored) || !restored.length || restored.some(item => !item || typeof item.id !== 'string' || typeof item.sourceId !== 'string' || typeof item.name !== 'string')) return;
      setRuns(restored);
      setStatus('running');
      setStartedAt(Date.now());
      setLogs(['[' + nowTime() + '] [SYSTEM] 已恢复当前方案的后端任务引用，正在同步真实任务状态。']);
    } catch {
      try { localStorage.removeItem(runStorageKey); } catch { /* Storage can be unavailable in restricted browser contexts. */ }
    }
  }, [runStorageKey]);

  const resetTask = () => {
    try { localStorage.removeItem(runStorageKey); } catch { /* Backend history remains untouched. */ }
    setStatus('idle'); setProgress(0); setElapsed(0); setCaptured(0); setConfirmedExecution(false);
    setRuns([]); setSnapshots({}); setRecordIds([]); setStartedAt(null);
    setLogs(['[' + nowTime() + '] [SYSTEM] 已清空当前页面任务引用；历史后端任务不会被删除。']);
    setNotice('');
  };

  const startTask = async () => {
    if (starting || status === 'running') return;
    if (!confirmedExecution) { setNotice('请先核对本次渠道和数量上限，并勾选执行确认。'); return; }
    setStarting(true); setNotice(''); setSnapshots({}); setRuns([]); setRecordIds([]);
    setProgress(0); setCaptured(0); setElapsed(0); setStartedAt(Date.now());
    setLogs(['[' + nowTime() + '] [SYSTEM] 正在校验渠道并创建真实后端任务…']);
    try {
      if (!profile.country || !profile.coreNoun.trim()) throw new Error('请先完成目标国家和核心产品画像。');
      const token = await getAccessToken();
      let guardrailsSnapshot: Record<string, unknown> = {};
      try {
        const savedGuardrails = localStorage.getItem('tradepilot.guardrails.frontend.v1');
        if (savedGuardrails) guardrailsSnapshot = JSON.parse(savedGuardrails) as Record<string, unknown>;
      } catch { /* Preserve task execution even if an older browser snapshot is malformed. */ }
      const guardrailScope = guardrailsSnapshot.scope === 'global' || guardrailsSnapshot.scope === 'both' ? guardrailsSnapshot.scope : 'task';
      if (guardrailScope === 'global' || guardrailScope === 'both') {
        const savedGlobal = await requestApi('/api/v1/settings/prospect-guardrails', token) as { config?: Record<string, unknown> | null };
        const globalConfig = savedGlobal.config;
        if (guardrailScope === 'global' && !globalConfig) throw new Error('尚未保存全局护盾配置。请先在第三步保存全局规则。');
        if (globalConfig) {
          const taskConfig = guardrailsSnapshot;
          guardrailsSnapshot = guardrailScope === 'global' ? globalConfig : {
            ...globalConfig,
            ...taskConfig,
            enabled: { ...(globalConfig.enabled as Record<string, boolean> ?? {}), ...(taskConfig.enabled as Record<string, boolean> ?? {}) },
            rules: { ...(globalConfig.rules as Record<string, string> ?? {}), ...(taskConfig.rules as Record<string, string> ?? {}) },
            contactEntries: { ...(globalConfig.contactEntries as Record<string, string> ?? {}), ...(taskConfig.contactEntries as Record<string, string> ?? {}) },
            websiteRows: [...(Array.isArray(globalConfig.websiteRows) ? globalConfig.websiteRows : []), ...(Array.isArray(taskConfig.websiteRows) ? taskConfig.websiteRows : [])],
            excludedCountries: [...(Array.isArray(globalConfig.excludedCountries) ? globalConfig.excludedCountries : []), ...(Array.isArray(taskConfig.excludedCountries) ? taskConfig.excludedCountries : [])],
          };
        }
      }
      const planSnapshot = {
        planTaskCode,
        profile: { ...profile },
        selectedSources: channels.map(source => ({ id: source.id, name: source.name, category: source.category ?? null })),
        capturedAt: new Date().toISOString(),
      };
      const created: RunRef[] = [];
      const failures: string[] = [];
      const tasks: Array<Promise<void>> = [];
      const addTask = (sourceId: string, name: string, endpoint: string, body: Record<string, unknown>) => {
        tasks.push((async () => {
          try {
            const result = await requestApi(endpoint, token, { method: 'POST', body: JSON.stringify(body) }) as { id?: string; taskCode?: string; channel?: string };
            if (!result.id) throw new Error('服务端未返回任务 ID');
            created.push({ id: result.id, sourceId, name });
            appendLog('[TASK CREATED] ' + name + ' · ' + (result.taskCode || result.id));
          } catch (error) {
            failures.push(name + '：' + (error instanceof Error ? error.message : String(error)));
            appendLog('[TASK CREATE FAILED] ' + name + ' · ' + (error instanceof Error ? error.message : String(error)));
          }
        })());
      };

      if (channels.some(item => item.id === 'google-maps')) {
        addTask('google-maps', 'Google Maps', '/api/v1/discovery-runs', {
          countries: [profile.country], query: profile.coreNoun.trim(), limitPerCountry: mapLimitValue, osmTags: [
            { key: 'shop', value: 'electronics' }, { key: 'shop', value: 'computer' },
            { key: 'shop', value: 'mobile_phone' }, { key: 'shop', value: 'telecommunication' },
            { key: 'shop', value: 'trade' }, { key: 'shop', value: 'wholesale' },
            { key: 'office', value: 'company' },
          ],
          providers: ['google_maps', 'openstreetmap'], city: profile.city || undefined,
          businessTypes: [], filters: {}, planSnapshot, guardrailsSnapshot,
        });
      }
      if (channels.some(item => item.id === 'google-search')) {
        addTask('google-search', 'Google Search', '/api/v1/search-discovery-runs', {
          country: profile.country, city: profile.city || undefined, query: profile.coreNoun.trim(),
          advancedQuery: '"' + profile.coreNoun.trim() + '"', limitPerCountry: webLimitValue,
          searchEngines: ['serper'], searchTypes: ['web'], searchLanguage: 'en', planSnapshot, guardrailsSnapshot,
        });
      }
      if (channels.some(item => item.id === 'facebook')) {
        addTask('facebook', 'Facebook', '/api/v1/facebook-discovery-runs', {
          country: profile.country, city: profile.city || undefined, query: profile.coreNoun.trim(),
          objectTypes: ['page'], limitPerType: facebookLimitValue, planSnapshot, guardrailsSnapshot,
        });
      }
      if (channels.some(item => item.id === 'instagram')) {
        addTask('instagram', 'Instagram', '/api/v1/instagram-discovery-runs', {
          countries: [profile.country], keywords: [profile.coreNoun.trim()], accountTypes: ['business', 'creator'],
          minFollowers: 0, maxFollowers: 100000000, recentDays: 365, requireContact: true, limit: instagramLimitValue, planSnapshot, guardrailsSnapshot,
        });
      }
      await Promise.all(tasks);
      if (!created.length) throw new Error(failures.length ? failures.join('；') : '当前所选渠道没有可执行的后端任务入口。');
      setRuns(created);
      try { localStorage.setItem(runStorageKey, JSON.stringify(created)); } catch { appendLog('[WARNING] 浏览器无法保存任务引用；离开页面后需从任务列表恢复。'); }
      setStatus('running');
      setLogs(current => [...current, '[' + nowTime() + '] [SYSTEM] 已创建 ' + created.length + ' 个真实任务。画像与护盾配置快照已写入各任务。' + (failures.length ? '另有 ' + failures.length + ' 个渠道创建失败。' : '')]);
      if (failures.length) setNotice('部分渠道创建失败，已成功启动的任务会继续运行：' + failures.join('；'));
    } catch (error) {
      setStatus('failed');
      setNotice(error instanceof Error ? error.message : '任务启动失败。');
      appendLog('[SYSTEM ERROR] ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (status !== 'running' || !runs.length) return;
    let active = true;
    const poll = async () => {
      try {
        const token = await getAccessToken();
        const results = await Promise.all(runs.map(async run => {
          const snapshot = await requestApi('/api/v1/discovery-runs/' + run.id, token) as RunSnapshot;
          return { run, snapshot };
        }));
        if (!active) return;
        const next: Record<string, RunSnapshot> = {};
        for (const { run, snapshot } of results) next[run.id] = snapshot;
        setSnapshots(next);
        const totalProgress = results.reduce((sum, item) => sum + (Number(item.snapshot.progress) || 0), 0);
        setProgress(Math.round(totalProgress / Math.max(1, results.length)));
        setCaptured(results.reduce((sum, item) => sum + (Number(item.snapshot.discoveredCount) || 0), 0));
        const logLines = results.flatMap(({ run, snapshot }) => (snapshot.logs ?? []).map(item => '[' + run.name + '] ' + item.message));
        if (logLines.length) setLogs(current => { const existing = new Set(current); const additions = logLines.filter(line => !existing.has(line)); return [...current, ...additions].slice(-80); });
        if (results.every(item => terminalStatuses.has(item.snapshot.status))) {
          const successful = results.some(item => item.snapshot.status === 'completed' || item.snapshot.status === 'partial' || item.snapshot.status === 'partially_completed');
          setStatus(successful ? 'completed' : 'failed');
          const ids: string[] = [];
          for (const { run, snapshot } of results) {
            if (snapshot.status === 'completed' || snapshot.status === 'partial' || snapshot.status === 'partially_completed') {
              const records = await requestApi('/api/v1/discovery-records?runId=' + encodeURIComponent(run.id) + '&limit=500', token) as Array<{ id?: string }>;
              ids.push(...records.map(record => record.id).filter((id): id is string => Boolean(id)));
            }
          }
          if (!active) return;
          setRecordIds([...new Set(ids)]);
          appendLog('[SYSTEM] 所有渠道任务已结束。实际结果记录：' + new Set(ids).size + ' 条。');
          if (!ids.length) setNotice('任务已结束，但没有返回可进入评分步骤的有效记录。请检查各渠道日志。');
        }
      } catch (error) {
        if (active) appendLog('[POLL ERROR] ' + (error instanceof Error ? error.message : String(error)));
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [status, runs]);

  useEffect(() => {
    if (status !== 'running' || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [status, startedAt]);

  const channelRows = channels.map(channel => {
    const run = runs.find(item => item.sourceId === channel.id);
    const snapshot = run ? snapshots[run.id] : undefined;
    const state = snapshot?.status ?? (run ? 'queued' : 'not_started');
    return {
      ...channel,
      channelProgress: Number(snapshot?.progress) || 0,
      count: Number(snapshot?.discoveredCount) || 0,
      state: run ? statusLabel(state) : '未执行 / 未接入',
      statusType: run ? statusTag(state) : 'gray' as const,
    };
  });
  const elapsedText = '00:' + String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  const hasRunnableSource = channels.some(item => ['google-maps', 'google-search', 'facebook', 'instagram'].includes(item.id));
  const mapLimitValue = clampLimit(mapLimit, 2);
  const webLimitValue = clampLimit(webLimit, 5);
  const facebookLimitValue = clampLimit(facebookLimit, 5);
  const instagramLimitValue = clampLimit(instagramLimit, 5);
  const configuredChannels = [
    ...(channels.some(item => item.id === 'google-maps') ? [{ name: 'Google Maps + OpenStreetMap', limit: mapLimitValue, detail: '每个数据源上限' }] : []),
    ...(channels.some(item => item.id === 'google-search') ? [{ name: 'Web Search', limit: webLimitValue, detail: '结果上限' }] : []),
    ...(channels.some(item => item.id === 'facebook') ? [{ name: 'Facebook 主页', limit: facebookLimitValue, detail: '主页结果上限' }] : []),
    ...(channels.some(item => item.id === 'instagram') ? [{ name: 'Instagram 公开商业账号', limit: instagramLimitValue, detail: '账号结果上限' }] : []),
  ];
  const allFinished = status === 'completed' || status === 'failed';

  return (
    <section className="tp-prospect-discovery__step tp-execution">
      <Accordion className="tp-execution__context">
        <AccordionItem
          open
          title={<span className="tp-execution__context-title"><CarbonIcons.Document size={16} aria-hidden="true" /><span>前序搜索条件快照：{profile.continent || '未选择大洲'} · {profile.countryName || profile.country} ({profile.country}) · 核心产品：{profile.coreNoun || '未填写'} · {channels.length} 个数据源</span></span>}
        >
          <Grid narrow>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>目标画像</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(0)}>返回修改</Button></div>
                <p><strong>{profile.coreNoun || '未填写核心产品词'}</strong></p>
                <div className="tp-execution__tags">{(profile.buyers.length ? profile.buyers : []).map(item => <Tag key={item} type="blue">{buyerLabels[item] ?? item}</Tag>)}</div>
                <small>{profile.countryName || '未选择国家'} · {profile.city || '未指定城市'}</small>
              </Tile>
            </Column>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>数据源路由</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(1)}>返回修改</Button></div>
                <div className="tp-execution__tags">{channels.slice(0, 6).map(item => <Tag key={item.id} type="gray">{item.name}</Tag>)}{channels.length > 6 && <Tag type="gray">+{channels.length - 6}</Tag>}</div>
                <small>已选 {channels.length} 个搜索通道</small>
              </Tile>
            </Column>
            <Column sm={4} md={8} lg={6}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>拦截护盾</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(2)}>返回修改</Button></div>
                <p><Tag type="green">已配置 {guardrailCount} 项规则</Tag></p>
                <small>任务配置快照已提交；已接入渠道在结果入库前执行服务端护盾。</small>
              </Tile>
            </Column>
          </Grid>
        </AccordionItem>
      </Accordion>

      {notice && <InlineNotification kind="info" lowContrast title="任务反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      <Tile className="tp-execution__configuration">
        <div className="tp-execution__section-heading"><div><h3>执行参数</h3><p>只配置当前已接入的真实渠道；数量为每个目标国家或渠道的结果上限。</p></div><Tag type="blue">{configuredChannels.length} 个可执行渠道</Tag></div>
        <div className="tp-execution__configuration-grid">
          {channels.some(item => item.id === 'google-maps') && <div><TextInput id="tp-execution-map-limit" type="number" min={1} max={100} labelText="Google Maps + OSM：每个数据源结果上限" helperText="Google Maps 与 OSM 分别使用此上限。" value={mapLimit} onChange={event => { setMapLimit(event.currentTarget.value); setConfirmedExecution(false); }} /></div>}
          {channels.some(item => item.id === 'google-search') && <div><TextInput id="tp-execution-web-limit" type="number" min={1} max={100} labelText="Web Search：结果上限" value={webLimit} onChange={event => { setWebLimit(event.currentTarget.value); setConfirmedExecution(false); }} /></div>}
          {channels.some(item => item.id === 'facebook') && <div><TextInput id="tp-execution-facebook-limit" type="number" min={1} max={100} labelText="Facebook：主页结果上限" helperText="本轮仅执行公开主页，不启动个人或帖子检索。" value={facebookLimit} onChange={event => { setFacebookLimit(event.currentTarget.value); setConfirmedExecution(false); }} /></div>}
          {channels.some(item => item.id === 'instagram') && <div><TextInput id="tp-execution-instagram-limit" type="number" min={1} max={100} labelText="Instagram：公开商业账号结果上限" helperText="仅检索公开商业 / 创作者账号。" value={instagramLimit} onChange={event => { setInstagramLimit(event.currentTarget.value); setConfirmedExecution(false); }} /></div>}
        </div>
        <div className="tp-execution__confirmation-summary"><strong>本次执行预览</strong>{configuredChannels.length ? configuredChannels.map(item => <span key={item.name}>{item.name}：{item.limit} 条（{item.detail}）</span>) : <span>尚未选择可执行渠道。</span>}</div>
        <Checkbox id="tp-execution-confirm" labelText="我已核对本次执行渠道、目标市场和数量上限，确认创建真实采集任务。" checked={confirmedExecution} disabled={!hasRunnableSource || status !== 'idle'} onChange={event => setConfirmedExecution(event.currentTarget.checked)} />
      </Tile>
      <div className="tp-execution__dashboard-heading">
        <div><span className="tp-execution__eyebrow">MULTI-CHANNEL EXECUTION</span><h2>全网搜索大盘</h2><p>显示后端任务真实状态、进度、结果数量与运行日志</p></div>
        <Tag type={status === 'completed' ? 'green' : status === 'running' ? 'blue' : status === 'failed' ? 'red' : 'gray'}>{status === 'completed' ? '任务已结束' : status === 'running' ? '后端任务运行中' : status === 'failed' ? '任务启动失败' : '待启动'}</Tag>
      </div>

      <Grid narrow className="tp-execution__metrics">
        <Column sm={4} md={4} lg={5}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.DataBase size={20} /><span>已发现原始线索数</span></div><strong>{captured}</strong><small>来自后端任务状态</small></Tile>
        </Column>
        <Column sm={4} md={4} lg={5}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.Security size={20} /><span>护盾拦截数量</span></div><strong>—</strong><small>当前接口尚未返回统一拦截计数</small></Tile>
        </Column>
        <Column sm={4} md={8} lg={6}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.Time size={20} /><span>运行耗时与任务状态</span></div><strong className="tp-execution__metric-time">{elapsedText}</strong><small>{status === 'running' ? '正在读取后端任务状态' : status === 'completed' ? '所有已创建任务已结束' : status === 'failed' ? '任务创建失败' : '等待启动'}</small></Tile>
        </Column>
      </Grid>

      <Tile className="tp-execution__control">
        <div className="tp-execution__control-heading"><div><span className="tp-execution__eyebrow">GLOBAL PROGRESS</span><h2>全局任务进度</h2><p>汇总各渠道后端任务返回的进度（未接入渠道不计入）</p></div><strong className="tp-execution__percent">{progress}%</strong></div>
        <ProgressBar label="任务总进度" helperText={status === 'completed' ? '所有已创建渠道任务均已结束' : status === 'failed' ? '没有成功启动可执行渠道任务' : status === 'idle' ? '确认配置后启动真实后端任务' : '每 5 秒同步一次后端任务状态'} max={100} value={progress} status="active" />
        <div className="tp-execution__actions">
          {status === 'idle' && <Button kind="primary" renderIcon={CarbonIcons.Play} disabled={starting || !hasRunnableSource || !confirmedExecution} onClick={startTask}>{starting ? '正在创建任务…' : '开始执行全网搜索'}</Button>}
          {status === 'running' && <Button kind="secondary" renderIcon={CarbonIcons.Reset} onClick={() => appendLog('[SYSTEM] 状态将在下一次轮询时刷新。')}>刷新状态（自动轮询中）</Button>}
          {allFinished && <Button kind="secondary" renderIcon={CarbonIcons.Reset} onClick={resetTask}>开始新一轮任务</Button>}
          {status === 'completed' && <Button kind="primary" renderIcon={CarbonIcons.ArrowRight} disabled={!recordIds.length} onClick={() => onContinueToScoring(recordIds)}>进入第五步：处理 {recordIds.length} 条真实检索结果</Button>}
        </div>
        {status === 'completed' && <InlineNotification kind="success" lowContrast title="后端任务已结束" subtitle={'已获取 ' + recordIds.length + ' 条真实结果记录。'} />}
        {status === 'failed' && <InlineNotification kind="error" lowContrast title="任务未能启动" subtitle="请检查上方任务反馈与渠道凭证配置。历史任务不会因此被删除。" />}
      </Tile>

      <Grid narrow className="tp-execution__pipeline-grid">
        <Column sm={4} md={8} lg={16}>
          <Tile className="tp-execution__pipeline">
            <div className="tp-execution__section-heading"><div><h3>多渠道任务状态</h3><p>仅展示服务端实际返回的状态、进度和发现数量</p></div><Tag type="blue">{runs.length} 个后端任务 / {channels.length} 个已选渠道</Tag></div>
            <StructuredListWrapper isCondensed>
              <StructuredListHead><StructuredListRow head><StructuredListCell head>搜索通道</StructuredListCell><StructuredListCell head>当前状态</StructuredListCell><StructuredListCell head>任务进度</StructuredListCell><StructuredListCell head>发现数量</StructuredListCell></StructuredListRow></StructuredListHead>
              <StructuredListBody>{channelRows.map(channel => <StructuredListRow key={channel.id}>
                <StructuredListCell><strong>{channel.name}</strong></StructuredListCell>
                <StructuredListCell><Tag type={channel.statusType}>{channel.state}</Tag></StructuredListCell>
                <StructuredListCell><div className="tp-execution__channel-progress"><span>{channel.channelProgress}%</span><ProgressBar label="通道进度" hideLabel value={channel.channelProgress} max={100} /></div></StructuredListCell>
                <StructuredListCell><strong>{channel.count} 条</strong></StructuredListCell>
              </StructuredListRow>)}</StructuredListBody>
            </StructuredListWrapper>
          </Tile>
        </Column>
        <Column sm={4} md={8} lg={16}>
          <Tile className="tp-execution__console">
            <div className="tp-execution__section-heading"><div><h3>执行事件流</h3><p>来自后端任务的运行日志 · 最近 80 条</p></div><CopyButton aria-label="复制运行日志" onClick={() => { void navigator.clipboard?.writeText(logs.join('\n')); setNotice('运行日志已复制。'); }} /></div>
            <CodeSnippet type="multi" feedback="已复制" feedbackTimeout={1500} wrapText>{logs.join('\n')}</CodeSnippet>
          </Tile>
        </Column>
      </Grid>
    </section>
  );
}
