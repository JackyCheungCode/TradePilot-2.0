import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion, AccordionItem, Button, CodeSnippet, Column, CopyButton, Grid,
  InlineNotification, ProgressBar, StructuredListBody, StructuredListCell,
  StructuredListHead, StructuredListRow, StructuredListWrapper, Tag, Tile, CarbonIcons,
} from '@/design-system';

type SourceItem = { id: string; name: string; category?: string };
type ProfileSnapshot = {
  coreNoun: string; buyers: string[]; continent: string; country: string; countryName: string; city: string;
};
type Channel = { id: string; name: string; category?: string };
type Props = {
  profile: ProfileSnapshot;
  sources: SourceItem[];
  onEditStep: (step: number) => void;
  onContinueToScoring: (leadIds: string[]) => void;
};

const buyerLabels: Record<string, string> = {
  importer: '进口商', distributor: '分销商 / 批发商', brand: '品牌方', contractor: '工程商 / 零售商',
};
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

export function ExecutionStep({ profile, sources, onEditStep, onContinueToScoring }: Props) {
  const channels = useMemo<Channel[]>(() => sources.length ? sources : [
    { id: 'google-maps', name: 'Google Maps 德国网格' },
    { id: 'wlw', name: 'WLW 工业黄页' },
    { id: 'google-search', name: 'SERP 搜索引擎矩阵' },
  ], [sources]);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Multi-channel execution dashboard ready.',
    '[CONTEXT] 前序画像、数据源与拦截护盾配置已载入。',
  ]);
  const [notice, setNotice] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const progressRef = useRef(0);
  const [guardrailCount] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tradepilot.guardrails.frontend.v1') || '{}');
      return Object.values(saved.enabled || {}).filter(Boolean).length;
    } catch { return 0; }
  });
  const appendLog = (message: string) => setLogs(current => [...current.slice(-79), '[' + nowTime() + '] ' + message]);
  const resetTask = () => {
    setStatus('idle'); progressRef.current = 0; setProgress(0); setElapsed(0); setCaptured(0); setBlocked(0);
    setLogs(['[' + nowTime() + '] [SYSTEM] Dashboard reset. Ready for a new run.']);
  };
  const startTask = () => {
    setStatus('running'); progressRef.current = 0; setProgress(0); setElapsed(0); setCaptured(0); setBlocked(0);
    setLogs([
      '[' + nowTime() + '] [SYSTEM] Initializing multi-channel execution...',
      '[' + nowTime() + '] [CONTEXT] Target: ' + (profile.countryName || 'Germany') + ' (' + (profile.country || 'DE') + ') | Guardrails: active',
      '[' + nowTime() + '] [SYSTEM] ' + channels.length + ' channel workers dispatched. Frontend demonstration mode.',
    ]);
  };

  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => {
      const next = Math.min(100, progressRef.current + 2);
      progressRef.current = next;
      setProgress(next);
      const count = Math.floor(next / 100 * 128);
      setCaptured(count);
      setBlocked(Math.min(42, Math.floor(count / 128 * 42)));
      if (next % 10 === 0) {
        const channel = channels[Math.floor(next / 10) % channels.length];
        setLogs(current => [...current.slice(-79), '[' + nowTime() + '] [CHANNEL: ' + channel.name + '] Throughput updated.']);
      }
      setElapsed(value => value + 1);
      if (next >= 100) {
        setCaptured(128); setBlocked(42); setStatus('completed');
        setLogs(current => [...current.slice(-78), '[' + nowTime() + '] [SYSTEM] All channel workers completed. 128 raw records captured; 42 blocked.']);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, channels]);

  const channelRows = channels.map((channel, index) => {
    const channelProgress = status === 'idle' ? 0 : status === 'completed' ? 100 : Math.min(100, progress + (index % 3) * 4);
    const count = status === 'idle' ? 0 : Math.floor(captured / channels.length) + (index < captured % channels.length ? 1 : 0);
    const state = status === 'completed' ? '已完成' : status === 'idle' ? '待启动' : status === 'paused' ? '已暂停' : channelProgress > 10 ? '运行中' : '排队中';
    return { ...channel, channelProgress, count, state };
  });
  const elapsedText = '00:' + String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  const leadIds = Array.from({ length: 128 }, (_, index) => 'lead-' + (index + 1));

  return (
    <section className="tp-prospect-discovery__step tp-execution">
      <Accordion className="tp-execution__context">
        <AccordionItem
          open
          title={<span className="tp-execution__context-title"><CarbonIcons.Document size={16} aria-hidden="true" /><span>前序搜索条件快照：{profile.continent || 'Europe'} · {profile.countryName || 'Germany'} ({profile.country || 'DE'}) · 核心产品：{profile.coreNoun || '未填写'} · {channels.length} 个数据源</span></span>}
        >
          <Grid narrow>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>目标画像</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(0)}>返回修改</Button></div>
                <p><strong>{profile.coreNoun || '未填写核心产品词'}</strong></p>
                <div className="tp-execution__tags">{(profile.buyers.length ? profile.buyers : ['importer']).map(item => <Tag key={item} type="blue">{buyerLabels[item] ?? item}</Tag>)}</div>
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
                <p><Tag type="green">已启用 {guardrailCount || 8} 项规则</Tag></p>
                <small>未知信息进入待核验 · 全局黑名单优先</small>
              </Tile>
            </Column>
          </Grid>
        </AccordionItem>
      </Accordion>

      {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      <div className="tp-execution__dashboard-heading">
        <div><span className="tp-execution__eyebrow">MULTI-CHANNEL EXECUTION</span><h2>全网搜索大盘</h2><p>监控分布式搜索任务的总体产出、护盾拦截与各渠道吞吐状态</p></div>
        <Tag type={status === 'completed' ? 'green' : status === 'running' ? 'blue' : status === 'paused' ? 'warm-gray' : 'gray'}>{status === 'completed' ? '抓取完成' : status === 'running' ? '全网探测中' : status === 'paused' ? '已暂停' : '待启动'}</Tag>
      </div>

      <Grid narrow className="tp-execution__metrics">
        <Column sm={4} md={4} lg={5}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.DataBase size={20} /><span>已捕获原始线索数</span></div><strong>{captured}</strong><small>条原始记录 · 不展示明细</small></Tile>
        </Column>
        <Column sm={4} md={4} lg={5}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.ShieldCheck size={20} /><span>护盾拦截垃圾数</span></div><strong>{blocked}</strong><small>条无效或命中规则的记录</small></Tile>
        </Column>
        <Column sm={4} md={8} lg={6}>
          <Tile className="tp-execution__metric-tile"><div className="tp-execution__metric-label"><CarbonIcons.Time size={20} /><span>运行耗时与任务状态</span></div><strong className="tp-execution__metric-time">{elapsedText}</strong><small>{status === 'running' ? '全网探测中 · 增量捕获' : status === 'completed' ? '任务已完成' : status === 'paused' ? '任务已暂停' : '等待启动'}</small></Tile>
        </Column>
      </Grid>

      <Tile className="tp-execution__control">
        <div className="tp-execution__control-heading"><div><span className="tp-execution__eyebrow">GLOBAL PROGRESS</span><h2>全局任务进度</h2><p>多渠道并发搜索的汇总进度与运行控制</p></div><strong className="tp-execution__percent">{progress}%</strong></div>
        <ProgressBar label="任务总进度" helperText={status === 'completed' ? '所有已选渠道均已完成本轮搜索' : status === 'paused' ? '任务已暂停，进度保持不变' : status === 'idle' ? '确认前三步配置后启动全网探测' : '正在从已选数据源增量捕获企业线索'} max={100} value={progress} status="active" />
        <div className="tp-execution__actions">
          {status === 'idle' && <Button kind="primary" renderIcon={CarbonIcons.Play} onClick={startTask}>开始执行全网搜索</Button>}
          {status === 'running' && <><Button kind="secondary" renderIcon={CarbonIcons.Pause} onClick={() => { setStatus('paused'); appendLog('[SYSTEM] Task paused by user.'); }}>暂停任务</Button><Button kind="danger--tertiary" renderIcon={CarbonIcons.Stop} onClick={() => setConfirmStop(true)}>终止任务</Button></>}
          {status === 'paused' && <><Button kind="primary" renderIcon={CarbonIcons.Play} onClick={() => { setStatus('running'); appendLog('[SYSTEM] Task resumed.'); }}>继续执行</Button><Button kind="danger--tertiary" renderIcon={CarbonIcons.Stop} onClick={() => setConfirmStop(true)}>终止任务</Button></>}
          {status === 'completed' && <><Button kind="secondary" renderIcon={CarbonIcons.Reset} onClick={resetTask}>重新执行</Button><Button kind="primary" renderIcon={CarbonIcons.ArrowRight} onClick={() => onContinueToScoring(leadIds)}>进入第五步：查看检索结果与 AI 清洗打分</Button></>}
        </div>
        {status === 'completed' && <InlineNotification kind="success" lowContrast title="本轮全网搜索已完成" subtitle="已捕获 128 条原始线索，护盾拦截 42 条。下一步可在 AI 工作台检查、选择并清洗原始记录。当前为前端演示数据。" />}
      </Tile>

      <Grid narrow className="tp-execution__pipeline-grid">
        <Column sm={4} md={8} lg={16}>
          <Tile className="tp-execution__pipeline">
            <div className="tp-execution__section-heading"><div><h3>多渠道并发吞吐看板</h3><p>按已选数据源展示实时抓取数量、处理进度与通道状态</p></div><Tag type="blue">{channels.length} 个通道</Tag></div>
            <StructuredListWrapper isCondensed>
              <StructuredListHead><StructuredListRow head><StructuredListCell head>搜索通道</StructuredListCell><StructuredListCell head>当前状态</StructuredListCell><StructuredListCell head>吞吐进度</StructuredListCell><StructuredListCell head>捕获数量</StructuredListCell></StructuredListRow></StructuredListHead>
              <StructuredListBody>{channelRows.map(channel => <StructuredListRow key={channel.id}>
                <StructuredListCell><strong>{channel.name}</strong></StructuredListCell>
                <StructuredListCell><Tag type={channel.state === '已完成' ? 'green' : channel.state === '运行中' ? 'blue' : channel.state === '已暂停' ? 'warm-gray' : 'gray'}>{channel.state}</Tag></StructuredListCell>
                <StructuredListCell><div className="tp-execution__channel-progress"><span>{channel.channelProgress}%</span><ProgressBar label="通道进度" hideLabel value={channel.channelProgress} max={100} /></div></StructuredListCell>
                <StructuredListCell><strong>{channel.count} 条</strong></StructuredListCell>
              </StructuredListRow>)}</StructuredListBody>
            </StructuredListWrapper>
          </Tile>
        </Column>
        <Column sm={4} md={8} lg={16}>
          <Tile className="tp-execution__console">
            <div className="tp-execution__section-heading"><div><h3>执行事件流</h3><p>前端模拟事件 · 最近 80 条运行记录</p></div><CopyButton aria-label="复制运行日志" onClick={() => { void navigator.clipboard?.writeText(logs.join('\n')); setNotice('运行日志已复制。'); }} /></div>
            <CodeSnippet type="multi" feedback="已复制" feedbackTimeout={1500} wrapText>{logs.join('\n')}</CodeSnippet>
          </Tile>
        </Column>
      </Grid>

      <Modal open={confirmStop} modalHeading="确认终止当前任务？" primaryButtonText="终止任务" secondaryButtonText="继续运行" danger onRequestClose={() => setConfirmStop(false)} onRequestSubmit={() => { setConfirmStop(false); progressRef.current = 0; setProgress(0); setStatus('idle'); appendLog('[SYSTEM] Task terminated by user.'); setNotice('任务已终止。已捕获数量保留在当前大盘。'); }}>
        <p>终止后将停止前端演示进度与日志输出。已捕获数量不会自动清零。</p>
      </Modal>
    </section>
  );
}
