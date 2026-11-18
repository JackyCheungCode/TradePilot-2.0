import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionItem, Button, CodeSnippet, Column, CopyButton, Grid,
  InlineNotification, ProgressBar, StructuredListBody, StructuredListCell,
  StructuredListHead, StructuredListRow, StructuredListWrapper, Tag, Tile, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type SourceItem = { id: string; name: string; category?: string };
type RunSnapshot = {
  id: string; taskCode?: string; channel: string; status: string; progress: number;
  discoveredCount: number; createdLeadCount: number; message?: string;
  logs?: Array<{ id: string; level: string; message: string; createdAt: string }>;
};
type RunRef = { id: string; sourceId: string; name: string };
type Props = {
  sources: SourceItem[];
  actorParameters?: Record<string, unknown>;
  onEditStep: (step: number) => void;
  onContinueToScoring: (recordIds: string[]) => void;
  planTaskCode: string;
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
  if (!response.ok) throw new Error((payload.error?.message || payload.message || '请求失败（HTTP ' + response.status + '）'));
  return payload.data ?? payload;
}

async function getAccessToken() {
  const db = await getSupabaseClient();
  const { data } = await db.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  return data.session.access_token;
}

export function ExecutionStep({ sources, actorParameters = {}, onEditStep, onContinueToScoring, planTaskCode }: Props) {
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
  const [savingSchema, setSavingSchema] = useState(false);
  const [schemaSaveStatus, setSchemaSaveStatus] = useState<'idle' | 'saved' | 'partial' | 'failed'>('idle');
  const [schemaSaveMessage, setSchemaSaveMessage] = useState('');
  const appendLog = (message: string) => setLogs(current => [...current.slice(-79), '[' + nowTime() + '] ' + message]);
  const runStorageKey = 'tradepilot.prospectDiscovery.runs.' + planTaskCode;
  const actorPlans = Array.isArray(actorParameters.actors) ? actorParameters.actors as Array<Record<string, unknown>> : [];
  const enabledActorPlans = actorPlans.filter(actor =>
    actor.status === 'enabled'
    && typeof actor.actorId === 'string'
    && typeof actor.sourceId === 'string'
    && channels.some(source => source.id === actor.sourceId)
  );

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
    setStatus('idle'); setProgress(0); setElapsed(0); setCaptured(0);
    setRuns([]); setSnapshots({}); setRecordIds([]); setStartedAt(null);
    setLogs(['[' + nowTime() + '] [SYSTEM] 已清空当前页面任务引用；历史后端任务不会被删除。']);
    setNotice('');
  };

  const startTask = async () => {
    if (starting || status === 'running') return;
    setStarting(true); setNotice(''); setSnapshots({}); setRuns([]); setRecordIds([]);
    setProgress(0); setCaptured(0); setElapsed(0); setStartedAt(Date.now());
    setLogs(['[' + nowTime() + '] [SYSTEM] 正在创建所选 Actor Schema 任务…']);
    try {
      const token = await getAccessToken();
      const planSnapshot = {
        planTaskCode,
        selectedSources: channels.map(source => ({ id: source.id, name: source.name, category: source.category ?? null })),
        actorParameters: Object.fromEntries(Object.entries(actorParameters).slice(0, 200)),
        capturedAt: new Date().toISOString(),
      };
      const created: RunRef[] = [];
      const failures: string[] = [];
      const tasks: Array<Promise<void>> = [];
      const addTask = (sourceId: string, name: string, endpoint: string, body: Record<string, unknown>) => {
        tasks.push((async () => {
          try {
            const result = await requestApi(endpoint, token, { method: 'POST', body: JSON.stringify(body) }) as { id?: string; taskCode?: string; channel?: string; rejectedActorCount?: number; rejectedActors?: Array<{ sourceName?: string; errors?: string[] }> };
            if (!result.id) throw new Error('服务端未返回任务 ID');
            if (result.rejectedActorCount) appendLog('[SCHEMA VALIDATION] ' + result.rejectedActorCount + ' 个 Actor 因必填字段或格式问题未启动：' + (result.rejectedActors ?? []).map(item => (item.sourceName || '未知来源') + ' ' + (item.errors ?? []).join('、')).join('；'));
            created.push({ id: result.id, sourceId, name });
            appendLog('[TASK CREATED] ' + name + ' · ' + (result.taskCode || result.id));
          } catch (error) {
            failures.push(name + '：' + (error instanceof Error ? error.message : String(error)));
            appendLog('[TASK CREATE FAILED] ' + name + ' · ' + (error instanceof Error ? error.message : String(error)));
          }
        })());
      };

      if (enabledActorPlans.length) {
        addTask("actor-discovery", "Actor 智能采集（" + enabledActorPlans.length + " 个来源）", "/api/v1/actor-registry/execute", {
          actors: enabledActorPlans,
          planSnapshot,
        });
      }
      await Promise.all(tasks);
      if (!created.length) throw new Error(failures.length ? failures.join('；') : '当前所选渠道没有可执行的后端任务入口。');
      setRuns(created);
      try { localStorage.setItem(runStorageKey, JSON.stringify(created)); } catch { appendLog('[WARNING] 浏览器无法保存任务引用；离开页面后需从任务列表恢复。'); }
      setStatus('running');
      setLogs(current => [...current, '[' + nowTime() + '] [SYSTEM] 已创建 ' + created.length + ' 个真实任务。所选平台参数按各自 Schema 原样提交。' + (failures.length ? '另有 ' + failures.length + ' 个渠道创建失败。' : '')]);
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
    const run = runs.find(item => item.sourceId === channel.id) ?? runs.find(item => item.sourceId === 'actor-discovery');
    const snapshot = run ? snapshots[run.id] : undefined;
    const state = snapshot?.status ?? (run ? 'queued' : 'not_started');
    return {
      ...channel,
      channelProgress: Number(snapshot?.progress) || 0,
      count: Number(snapshot?.discoveredCount) || 0,
      state: run ? statusLabel(state) : '尚未执行',
      statusType: run ? statusTag(state) : 'gray' as const,
    };
  });
  const elapsedText = '00:' + String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  const configuredChannels = enabledActorPlans.map(actor => {
    const source = channels.find(item => item.id === actor.sourceId);
    return { name: String(source?.name || actor.sourceName || actor.sourceId), detail: '使用第二步读取的 Actor Schema 参数' };
  });
  const hasRunnableSource = configuredChannels.length > 0;
  const allFinished = status === 'completed' || status === 'failed';
  const saveSchemas = async () => {
    if (savingSchema || !enabledActorPlans.length) return;
    setSavingSchema(true); setSchemaSaveMessage('');
    try {
      const token = await getAccessToken();
      const results = await Promise.allSettled(enabledActorPlans.map(actor =>
        requestApi('/api/v1/actor-registry/schema/' + encodeURIComponent(String(actor.actorId)) + '/save', token, {
          method: 'POST', body: JSON.stringify({ version: String(actor.schemaVersion || '') }),
        })
      ));
      const saved = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.length - saved;
      setSchemaSaveStatus(failed === 0 ? 'saved' : saved > 0 ? 'partial' : 'failed');
      setSchemaSaveMessage(failed === 0
        ? '已保存 ' + saved + ' 个 Actor Schema。下次选择相同 Actor 时将优先使用已保存版本，不再重复请求 Apify。'
        : '成功保存 ' + saved + ' 个，失败 ' + failed + ' 个。可再次点击重试；本次任务结果不受影响。');
      appendLog('[SCHEMA CACHE] 已保存 ' + saved + ' / ' + results.length + ' 个 Actor Schema。');
    } catch (error) {
      setSchemaSaveStatus('failed');
      setSchemaSaveMessage(error instanceof Error ? error.message : '保存 Schema 失败。');
    } finally { setSavingSchema(false); }
  };

  return (
    <section className="tp-prospect-discovery__step tp-execution">
      {notice && <InlineNotification kind="info" lowContrast title="任务反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <Grid narrow className="tp-execution__metrics">
        <Column sm={4} md={4} lg={5}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.DataBase size={20} /><span>已发现原始线索数</span></div><strong>{captured}</strong><small>来自后端任务状态</small></Tile>
        </Column>
        <Column sm={4} md={4} lg={5}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.Security size={20} /><span>已创建 Actor 任务</span></div><strong>{runs.length}</strong><small>由所选平台 Schema 任务生成</small></Tile>
        </Column>
        <Column sm={4} md={8} lg={4}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.Time size={20} /><span>运行耗时</span></div><strong className="tp-execution__metric-time">{elapsedText}</strong><small>{status === 'running' ? '正在读取后端任务状态' : status === 'completed' ? '所有已创建任务已结束' : status === 'failed' ? '任务创建失败' : '尚未创建后端任务'}</small></Tile>
        </Column>
        <Column sm={4} md={8} lg={4}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.Document size={20} /><span>已取得结果记录</span></div><strong>{recordIds.length}</strong><small>来自后端结果接口</small></Tile>
        </Column>
      </Grid>

      <Tile className="tp-execution__control">
        <div className="tp-execution__control-heading"><div><span className="tp-execution__eyebrow">GLOBAL PROGRESS</span><h2>全局任务进度</h2><p>汇总各渠道后端任务返回的进度（按已创建任务统计）</p></div><strong className="tp-execution__percent">{progress}%</strong></div>
        <ProgressBar label="任务总进度" helperText={status === 'completed' ? '所有已创建渠道任务均已结束' : status === 'failed' ? '没有成功启动可执行渠道任务' : status === 'idle' ? '配置校验通过后可创建真实后端任务' : '每 5 秒同步一次后端任务状态'} max={100} value={progress} status="active" />
        <div className="tp-execution__actions">
          {status === 'idle' && <Button kind="primary" renderIcon={CarbonIcons.Play} disabled={starting || !hasRunnableSource} onClick={startTask}>{starting ? '正在创建任务…' : '开始执行全网搜索'}</Button>}
          
          {allFinished && enabledActorPlans.length > 0 && schemaSaveStatus !== 'saved' && <Button kind="secondary" disabled={savingSchema} onClick={() => void saveSchemas()}>{savingSchema ? '正在保存 Schema…' : '保存本次 Schema'}</Button>}
          {allFinished && <Button kind="secondary" renderIcon={CarbonIcons.Reset} onClick={resetTask}>开始新一轮任务</Button>}
          {status === 'completed' && <Button kind="primary" renderIcon={CarbonIcons.ArrowRight} disabled={!recordIds.length} onClick={() => onContinueToScoring(recordIds)}>进入第四步：处理 {recordIds.length} 条真实检索结果</Button>}
        </div>
        {schemaSaveMessage && <InlineNotification kind={schemaSaveStatus === 'failed' ? 'error' : schemaSaveStatus === 'partial' ? 'warning' : 'success'} lowContrast title="Actor Schema 保存状态" subtitle={schemaSaveMessage} />}
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
