import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion, AccordionItem, Button, CodeSnippet, Column, CopyButton, Dropdown, Grid,
  InlineNotification, Modal, OverflowMenu, OverflowMenuItem, Pagination, ProgressBar,
  StructuredListBody, StructuredListCell, StructuredListHead, StructuredListRow,
  StructuredListWrapper, Table, TableBatchAction, TableBatchActions, TableBody, TableCell,
  TableHead, TableHeader, TableRow, TableSelectAll, TableSelectRow, TableToolbar, TableToolbarContent,
  TableToolbarSearch, Tag, Tile, CarbonIcons,
} from '@/design-system';

type SourceItem = { id: string; name: string; category?: string };
type ProfileSnapshot = {
  coreNoun: string; buyers: string[]; continent: string; country: string; countryName: string; city: string;
};
type Lead = {
  id: string; name: string; domain: string; country: string; sourceId: string; sourceName: string;
  query: string; employees: string; shield: 'passed' | 'pending'; email: string; phone: string;
  address: string; capturedAt: string;
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
const sampleCompanies = [
  ['SolarTech Deutschland GmbH', 'solartech-de.com', '51–200 人'],
  ['EcoPower Systems GmbH', 'eco-power.de', '11–50 人'],
  ['Nordic Energy Solutions', 'nordic-energy.eu', '50–200 人'],
  ['Bavaria Industrial Supply', 'bavaria-supply.de', '未知'],
  ['GreenVolt Europe GmbH', 'greenvolt-eu.com', '201–500 人'],
  ['Rheinland Power Components', 'rheinland-power.de', '11–50 人'],
  ['Alpine Battery Trading AG', 'alpine-battery.ch', '1–10 人'],
  ['Hanover Smart Energy', 'hanover-energy.de', '50–200 人'],
  ['Westfalen Solarhandel', 'westfalen-solar.de', '未知'],
  ['Berlin Power Distribution', 'berlin-power.eu', '51–200 人'],
  ['EnergieWerk Solutions', 'energiewerk.de', '11–50 人'],
  ['Central Europe Battery GmbH', 'ce-battery.com', '201–500 人'],
  ['BrightGrid Technologies', 'brightgrid.eu', '50–200 人'],
  ['Hansa Renewable Systems', 'hansa-renewable.de', '未知'],
  ['Frankfurt Energy Trading', 'frankfurt-energy.de', '11–50 人'],
  ['VoltHaus Deutschland', 'volthaus.de', '51–200 人'],
];
const seedRows = (channels: Channel[], country: string, query: string): Lead[] => {
  const sourceFallback: Channel[] = channels.length ? channels : [{ id: 'google-maps', name: 'Google Maps' }, { id: 'wlw', name: 'WLW 工业黄页' }, { id: 'google-search', name: 'Google Search' }];
  return Array.from({ length: 128 }, (_, index) => {
    const company = sampleCompanies[index % sampleCompanies.length];
    const source = sourceFallback[index % sourceFallback.length];
    return {
      id: 'lead-' + (index + 1), name: index < sampleCompanies.length ? company[0] : company[0].replace(/(GmbH|AG|Solutions|Systems)/, '$1') + ' ' + (Math.floor(index / sampleCompanies.length) + 1),
      domain: company[1], country: country || 'DE', sourceId: source.id, sourceName: source.name,
      query: query || 'power station portable 5000w', employees: company[2],
      shield: index % 5 === 0 ? 'pending' : 'passed',
      email: index % 5 === 0 ? '' : 'info@' + company[1], phone: '+49 30 ' + String(1000000 + index * 137),
      address: ['Berlin, Germany', 'Munich, Germany', 'Hamburg, Germany', 'Frankfurt, Germany'][index % 4],
      capturedAt: '2026-11-17T05:' + String(20 + (index % 39)).padStart(2, '0') + ':00Z',
    };
  });
};
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

export function ExecutionStep({ profile, sources, onEditStep, onContinueToScoring }: Props) {
  const channels = useMemo<Channel[]>(() => sources.map(source => ({ id: source.id, name: source.name, category: source.category })), [sources]);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Multi-channel execution workspace ready. Waiting for user confirmation.',
    '[CONTEXT] 前序画像、数据源与拦截护盾配置已载入。',
  ]);
  const [confirmStop, setConfirmStop] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [notice, setNotice] = useState('');
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [guardrailCount] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tradepilot.guardrails.frontend.v1') || '{}');
      return Object.values(saved.enabled || {}).filter(Boolean).length;
    } catch { return 0; }
  });
  const rowsRef = useRef<Lead[]>([]);
  const progressRef = useRef(0);
  const sourceList = channels.length ? channels : [{ id: 'google-maps', name: 'Google Maps' }, { id: 'wlw', name: 'WLW 工业黄页' }, { id: 'google-search', name: 'Google Dorks 搜索引擎矩阵' }];
  const allMockRows = useMemo(() => seedRows(sourceList, profile.country || 'DE', profile.coreNoun), [sourceList, profile.country, profile.coreNoun]);

  const appendLog = (message: string) => setLogs(current => [...current.slice(-79), '[' + nowTime() + '] ' + message]);
  const resetTask = () => {
    setStatus('idle'); progressRef.current = 0; setProgress(0); setElapsed(0); setCaptured(0); setBlocked(0);
    setLeads([]); rowsRef.current = []; setSelectedIds([]); setBlockedIds([]);
    setLogs(['[' + nowTime() + '] [SYSTEM] Execution workspace reset. Ready for a new run.']);
  };
  const startTask = () => {
    if (status === 'completed') resetTask();
    setStatus('running');
    progressRef.current = 0; setProgress(0); setElapsed(0); setCaptured(0); setBlocked(0); setLeads([]); rowsRef.current = [];
    setSelectedIds([]); setBlockedIds([]);
    setLogs([
      '[' + nowTime() + '] [SYSTEM] Initializing Multi-Channel Execution Engine...',
      '[' + nowTime() + '] [CONTEXT] Target Market locked: ' + (profile.countryName || 'Germany') + ' (' + (profile.country || 'DE') + ') | Guardrails: Active',
      '[' + nowTime() + '] [SYSTEM] ' + sourceList.length + ' channel workers dispatched. Frontend mock mode enabled.',
    ]);
  };

  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => {
      const next = Math.min(100, progressRef.current + 2);
      progressRef.current = next;
      setProgress(next);
      const targetCount = Math.floor(next / 100 * allMockRows.length);
      if (targetCount > rowsRef.current.length) {
        const additions = allMockRows.slice(rowsRef.current.length, targetCount);
        rowsRef.current = [...rowsRef.current, ...additions];
        setLeads(rowsRef.current);
        setCaptured(targetCount);
        if (targetCount % 8 < additions.length || targetCount === 128) {
          const latest = additions[additions.length - 1];
          if (latest) setLogs(currentLogs => [...currentLogs.slice(-79), '[' + nowTime() + '] [CHANNEL: ' + latest.sourceName + '] Extracted: "' + latest.name + '" (Domain: ' + latest.domain + ')']);
        }
        if (targetCount > 0 && targetCount % 16 < additions.length) {
          setBlocked(value => value + 3);
          setLogs(currentLogs => [...currentLogs.slice(-79), '[' + nowTime() + '] [GUARDRAIL] Blocked 3 invalid URLs (matched configured exclusion rules).']);
        }
      }
      if (next >= 100) {
        setBlocked(42);
        setStatus('completed');
        setLogs(currentLogs => [...currentLogs.slice(-78), '[' + nowTime() + '] [SYSTEM] All channel workers completed. 128 raw leads captured; 42 invalid links blocked.']);
      }
      setElapsed(value => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, allMockRows]);

  const filteredLeads = useMemo(() => leads.filter(lead => {
    const term = search.trim().toLocaleLowerCase();
    const textMatch = !term || lead.name.toLocaleLowerCase().includes(term) || lead.domain.toLocaleLowerCase().includes(term);
    return textMatch && !blockedIds.includes(lead.id) && (sourceFilter === 'all' || lead.sourceId === sourceFilter);
  }), [leads, search, sourceFilter, blockedIds]);
  const selectedRows = leads.filter(lead => selectedIds.includes(lead.id));
  const visibleLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize);
  const elapsedText = '00:' + String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  const remaining = status === 'completed' ? '00:00' : '00:' + String(Math.max(0, Math.ceil((100 - progress) / 2))).padStart(2, '0');
  const progressStatus = status === 'completed' ? 'finished' : status === 'paused' ? 'active' : 'active';
  const channelsForBoard = sourceList.map((channel, index) => {
    const channelProgress = status === 'idle' ? 0 : Math.min(100, progress + (index % 3) * 4);
    const channelLeads = leads.filter(lead => lead.sourceId === channel.id).length;
    return { ...channel, channelProgress, channelLeads, state: status === 'completed' ? '已完成' : status === 'idle' ? '待启动' : status === 'paused' ? '已暂停' : channelProgress >= 100 ? '已完成' : channelProgress > 10 ? '运行中' : '排队中' };
  });

  const toggleOne = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const toggleVisible = () => setSelectedIds(current => visibleLeads.every(lead => current.includes(lead.id)) ? current.filter(id => !visibleLeads.some(lead => lead.id === id)) : [...new Set([...current, ...visibleLeads.map(lead => lead.id)])]);
  const exportCsv = (items: Lead[]) => {
    const columns = ['name','domain','country','sourceName','query','employees','shield','email','phone','address'];
    const escape = (value: string) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const csv = [columns.join(','), ...items.map(row => columns.map(key => escape(String(row[key as keyof Lead] ?? ''))).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'tradepilot-leads-selected.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const sendToScoring = () => {
    const ids = selectedIds.length ? selectedIds : leads.map(lead => lead.id);
    onContinueToScoring(ids);
  };
  const addToBlacklist = () => {
    setBlockedIds(current => [...new Set([...current, ...selectedIds])]);
    setNotice('已将 ' + selectedIds.length + ' 条选中记录加入当前页面的模拟黑名单；未写入后端。');
    setSelectedIds([]);
  };
  const copyLogs = () => { void navigator.clipboard?.writeText(logs.join('\n')); setNotice('日志已复制（若浏览器未授权剪贴板，请手动选择日志文本）。'); };

  return (
    <section className="tp-prospect-discovery__step tp-execution">
      <Accordion className="tp-execution__context">
        <AccordionItem title={'📋 前序搜索条件快照：' + (profile.continent || 'Europe') + ' ➔ ' + (profile.countryName || 'Germany') + ' (' + (profile.country || 'DE') + ') | 核心词：' + (profile.coreNoun || 'power station portable 5000w') + ' | 已选 ' + channels.length + ' 个数据源 | 护盾已启用'}>
          <Grid narrow>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>画像摘要</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(0)}>修改</Button></div>
                <p><strong>{profile.coreNoun || '未填写核心产品词'}</strong></p>
                <div className="tp-execution__tags">{(profile.buyers.length ? profile.buyers : ['importer']).map(item => <Tag key={item} type="blue">{buyerLabels[item] ?? item}</Tag>)}</div>
                <small>目标市场：{profile.countryName || '未选择'} · {profile.city || '未指定城市'}</small>
              </Tile>
            </Column>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>平台路由</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(1)}>修改</Button></div>
                <p>{profile.countryName || '目标国家'} ({profile.country || 'DE'})</p>
                <div className="tp-execution__tags">{sourceList.slice(0, 8).map(item => <Tag key={item.id} type="gray">{item.name}</Tag>)}{sourceList.length > 8 && <Tag type="gray">+{sourceList.length - 8}</Tag>}</div>
                <small>共锁定 {sourceList.length} 个数据源</small>
              </Tile>
            </Column>
            <Column sm={4} md={4} lg={6}>
              <Tile className="tp-execution__summary-tile">
                <div className="tp-execution__tile-heading"><strong>拦截护盾</strong><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Edit} onClick={() => onEditStep(2)}>修改</Button></div>
                <p><Tag type="green">已启用 {guardrailCount || 8} 项规则</Tag></p>
                <small>未知信息进入待核验 · 全局黑名单优先</small>
              </Tile>
            </Column>
          </Grid>
        </AccordionItem>
      </Accordion>

      {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      <Tile className="tp-execution__control">
        <div className="tp-execution__control-heading">
          <div><span className="tp-execution__eyebrow">EXECUTION CONTROL</span><h2>全网搜索任务</h2><p>统一监控多渠道并发执行状态与实时产出</p></div>
          <Tag type={status === 'completed' ? 'green' : status === 'running' ? 'blue' : status === 'paused' ? 'warm-gray' : 'gray'}>{status === 'completed' ? '抓取完成' : status === 'running' ? '全网并发执行中...' : status === 'paused' ? '已暂停' : '待执行'}</Tag>
        </div>
        <div className="tp-execution__progress-row">
          <div className="tp-execution__progress"><ProgressBar label="任务总进度" helperText={status === 'completed' ? '抓取完成' : status === 'paused' ? '任务已暂停，进度保持不变' : status === 'idle' ? '请确认上方搜索条件后启动全网探测' : '正在从已选数据源增量捕获企业线索'} max={100} value={progress} status={progressStatus} /></div>
          <strong className="tp-execution__percent">{progress}%</strong>
        </div>
        {status === 'running' && <p className="tp-execution__timing">已耗时：{elapsedText} · 预计剩余：{remaining}</p>}
        {status === 'completed' && <InlineNotification kind="success" lowContrast title={'共捕获原始线索 ' + captured + ' 条'} subtitle={'护盾已拦截 ' + blocked + ' 条无效链接。当前数据均为前端 Mock，不代表真实抓取结果。'} />}
        <div className="tp-execution__actions">
          {status === 'idle' && <Button kind="primary" renderIcon={CarbonIcons.Play} onClick={startTask}>开始执行全网搜索</Button>}
          {status === 'running' && <><Button kind="secondary" renderIcon={CarbonIcons.Pause} onClick={() => { setStatus('paused'); appendLog('[SYSTEM] Task paused by user.'); }}>暂停任务</Button><Button kind="danger--tertiary" renderIcon={CarbonIcons.Stop} onClick={() => setConfirmStop(true)}>终止任务</Button></>}
          {status === 'paused' && <><Button kind="primary" renderIcon={CarbonIcons.Play} onClick={() => { setStatus('running'); appendLog('[SYSTEM] Task resumed.'); }}>继续执行</Button><Button kind="danger--tertiary" renderIcon={CarbonIcons.Stop} onClick={() => setConfirmStop(true)}>终止任务</Button></>}
          {status === 'completed' && <><Button kind="secondary" renderIcon={CarbonIcons.Reset} onClick={resetTask}>重新执行</Button><Button kind="primary" renderIcon={CarbonIcons.MagicWand} onClick={sendToScoring} disabled={!leads.length}>批量送入第五步：AI 清洗打分</Button></>}
        </div>
      </Tile>

      <Grid narrow className="tp-execution__pipeline-grid">
        <Column sm={4} md={8} lg={10}>
          <Tile className="tp-execution__pipeline">
            <div className="tp-execution__section-heading"><div><h3>多渠道并发流水线</h3><p>每个通道独立推进，结果实时汇入下方线索表</p></div><Tag type="blue">{sourceList.length} 个通道</Tag></div>
            <StructuredListWrapper isCondensed>
              <StructuredListHead><StructuredListRow head><StructuredListCell head>通道名称</StructuredListCell><StructuredListCell head>状态</StructuredListCell><StructuredListCell head>抓取进度</StructuredListCell><StructuredListCell head>捕获企业</StructuredListCell></StructuredListRow></StructuredListHead>
              <StructuredListBody>
                {channelsForBoard.map(channel => <StructuredListRow key={channel.id}>
                  <StructuredListCell>{channel.name}</StructuredListCell>
                  <StructuredListCell><Tag type={channel.state === '已完成' ? 'green' : channel.state === '运行中' ? 'blue' : channel.state === '已暂停' ? 'warm-gray' : 'gray'}>{channel.state}</Tag></StructuredListCell>
                  <StructuredListCell>{channel.channelProgress}% · {Math.floor(channel.channelProgress / 100 * 30)} / 30</StructuredListCell>
                  <StructuredListCell><strong>{channel.channelLeads} 家</strong></StructuredListCell>
                </StructuredListRow>)}
              </StructuredListBody>
            </StructuredListWrapper>
          </Tile>
        </Column>
        <Column sm={4} md={8} lg={6}>
          <Tile className="tp-execution__console">
            <div className="tp-execution__section-heading"><div><h3>实时运行日志</h3><p>前端模拟事件流 · 最近 80 条</p></div><CopyButton aria-label="复制日志" onClick={copyLogs} />
            </div>
            <CodeSnippet type="multi" feedback="已复制" feedbackTimeout={1500} wrapText>
              {logs.join('\n')}
            </CodeSnippet>
          </Tile>
        </Column>
      </Grid>

      <Tile className="tp-execution__results">
        <div className="tp-execution__section-heading"><div><h3>结构化线索结果</h3><p>任务运行期间增量插入 · {leads.length} / 128 条 Mock 线索</p></div><Tag type="blue">{filteredLeads.length} 条匹配</Tag></div>
        <TableToolbar>
          <TableBatchActions shouldShowBatchActions={selectedIds.length > 0} totalSelected={selectedIds.length} onCancel={() => setSelectedIds([])}>
            <TableBatchAction tabIndex={0} renderIcon={CarbonIcons.Delete} onClick={addToBlacklist}>批量移出 / 拉黑</TableBatchAction>
            <TableBatchAction tabIndex={0} renderIcon={CarbonIcons.Download} onClick={() => exportCsv(selectedRows)}>导出选中 (.csv)</TableBatchAction>
            <TableBatchAction tabIndex={0} renderIcon={CarbonIcons.MagicWand} onClick={sendToScoring}>送入第五步 AI 打分</TableBatchAction>
          </TableBatchActions>
          <TableToolbarContent>
            <TableToolbarSearch persistent value={search} onChange={(_event, value) => { setSearch(value ?? ''); setPage(1); }} placeholder="搜索企业名称或域名" />
            <Dropdown id="execution-source-filter" titleText="获客来源" label="全部来源" items={[{ id: 'all', text: '全部来源' }, ...sourceList.map(item => ({ id: item.id, text: item.name }))]} itemToString={item => item?.text ?? ''} selectedItem={[{ id: 'all', text: '全部来源' }, ...sourceList.map(item => ({ id: item.id, text: item.name }))].find(item => item.id === sourceFilter) ?? { id: 'all', text: '全部来源' }} onChange={({ selectedItem }) => { setSourceFilter(selectedItem?.id ?? 'all'); setPage(1); }} />
          </TableToolbarContent>
        </TableToolbar>
        <div className="tp-execution__table-scroll">
          <Table size="lg" useZebraStyles={false}>
            <TableHead><TableRow>
              <TableSelectAll id="execution-select-all" name="execution-select-all" checked={visibleLeads.length > 0 && visibleLeads.every(lead => selectedIds.includes(lead.id))} indeterminate={visibleLeads.some(lead => selectedIds.includes(lead.id)) && !visibleLeads.every(lead => selectedIds.includes(lead.id))} onSelect={toggleVisible} />
              {['企业名称','官方网址','目标国家','获客来源与路径','基础规模','护盾状态','操作'].map(item => <TableHeader key={item}>{item}</TableHeader>)}
            </TableRow></TableHead>
            <TableBody>
              {visibleLeads.map(lead => <TableRow key={lead.id}>
                <TableSelectRow id={'select-' + lead.id} name={'select-' + lead.id} checked={selectedIds.includes(lead.id)} onSelect={() => toggleOne(lead.id)} />
                <TableCell><Button kind="ghost" size="sm" className="tp-execution__company-button" onClick={() => setDetail(lead)}>{lead.name}</Button></TableCell>
                <TableCell><a href={'https://' + lead.domain} target="_blank" rel="noreferrer">{lead.domain} <CarbonIcons.ArrowUpRight size={12}/></a></TableCell>
                <TableCell><Tag type="blue">{lead.country}</Tag></TableCell>
                <TableCell><strong>{lead.sourceName}</strong><small>{lead.query}</small></TableCell>
                <TableCell>{lead.employees}</TableCell>
                <TableCell><Tag type={lead.shield === 'passed' ? 'green' : 'warm-gray'}>{lead.shield === 'passed' ? '校验通过' : '待补充邮箱'}</Tag></TableCell>
                <TableCell><OverflowMenu ariaLabel={'企业操作：' + lead.name} flipped>
                  <OverflowMenuItem itemText="移入黑名单" onClick={() => { setBlockedIds(current => [...new Set([...current, lead.id])]); setNotice('已将 ' + lead.name + ' 加入模拟黑名单。'); }} />
                  <OverflowMenuItem itemText="复制网址" onClick={() => { void navigator.clipboard?.writeText('https://' + lead.domain); setNotice('网址已复制。'); }} />
                  <OverflowMenuItem itemText="查看原始数据" onClick={() => setDetail(lead)} />
                </OverflowMenu></TableCell>
              </TableRow>)}
              {filteredLeads.length === 0 && <TableRow><TableCell colSpan={8}>暂无符合条件的线索。任务开始后将实时显示增量结果。</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="tp-execution__pagination"><Pagination id="execution-leads-pagination" page={page} pageSize={pageSize} pageSizes={[10, 20, 50]} totalItems={filteredLeads.length} onChange={({ page: nextPage, pageSize: nextPageSize }) => { setPage(nextPage); setPageSize(nextPageSize); }} /></div>
        {blockedIds.length > 0 && <p className="tp-execution__helper">当前会话已模拟移出 / 拉黑 {blockedIds.length} 条记录；未写入数据库。</p>}
      </Tile>

      <Modal open={confirmStop} modalHeading="确认终止当前任务？" primaryButtonText="终止任务" secondaryButtonText="继续运行" danger onRequestClose={() => setConfirmStop(false)} onRequestSubmit={() => { setConfirmStop(false); progressRef.current = 0; setProgress(0); setStatus('idle'); appendLog('[SYSTEM] Task terminated by user.'); setNotice('任务已终止，已捕获的 Mock 线索仍保留在当前页面。'); }}>
        <p>终止后将停止前端模拟进度与日志输出。已捕获的线索不会自动删除。</p>
      </Modal>
      <Modal open={Boolean(detail)} modalHeading="企业原始抓取数据" primaryButtonText="关闭" onRequestClose={() => setDetail(null)} onRequestSubmit={() => setDetail(null)} size="lg">
        {detail && <div className="tp-execution__detail"><div><strong>{detail.name}</strong><Tag type={detail.shield === 'passed' ? 'green' : 'warm-gray'}>{detail.shield === 'passed' ? '校验通过' : '待补充邮箱'}</Tag></div><p>{detail.domain} · {detail.country} · {detail.sourceName}</p><CodeSnippet type="multi" wrapText>{JSON.stringify(detail, null, 2)}</CodeSnippet></div>}
      </Modal>
    </section>
  );
}
