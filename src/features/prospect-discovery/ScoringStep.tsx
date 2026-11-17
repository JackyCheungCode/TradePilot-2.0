import { useEffect, useMemo, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import {
  Accordion, AccordionItem, Button, Column, Dropdown, Grid, InlineNotification, OverflowMenu,
  OverflowMenuItem, Pagination, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow, TableSelectAll, TableSelectRow,
  TableToolbar, TableToolbarContent, TableToolbarSearch, Tag, Tile, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Lead = {
  id: string; name: string; domain: string; country: string; source: string; email: string;
  address?: string; phone?: string; runId?: string; confidence?: number;
  status: 'pending' | 'scored'; score?: number; fit?: number; persona?: number; scale?: number; intent?: number; comment?: string;
};
type Props = { profile: { coreNoun: string; countryName: string; buyers: string[] }; onContinueToEnrichment: () => void };


export function ScoringStep({ profile, onContinueToEnrichment }: Props) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const loadRecords = async () => {
      setLoading(true); setLoadError('');
      try {
        const queue = JSON.parse(localStorage.getItem('tradepilot.prospect-scoring.queue.v1') || '[]') as string[];
        if (!queue.length) { setRows([]); return; }
        const db = await getSupabaseClient();
        const { data } = await db.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('登录状态已失效，请重新登录。');
        const response = await fetch('/api/v1/discovery-records?limit=500', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        });
        const payload = await response.json() as { data?: Array<Record<string, unknown>>; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || '无法读取真实检索结果');
        const records = (payload.data ?? []).filter(record => queue.includes(String(record.id)));
        const mapped = records.map(record => {
          const occurrences = Array.isArray(record.discovery_record_occurrences) ? record.discovery_record_occurrences as Array<Record<string, unknown>> : [];
          const occurrence = occurrences[0] ?? {};
          const website = typeof record.website === 'string' ? record.website : '';
          let domain = '';
          try { domain = website ? new URL(website).hostname.replace(/^www\\./i, '') : ''; } catch { domain = website; }
          const channel = String(record.channel ?? '');
          const sourceLabels: Record<string, string> = {
            map_local_businesses: '地图与本地商家', search_engine: '搜索引擎',
            facebook: 'Facebook', instagram: 'Instagram',
          };
          return {
            id: String(record.id), name: String(record.name ?? '未命名企业'), domain,
            country: String(record.country_code ?? ''), source: sourceLabels[channel] ?? channel,
            email: String(record.email ?? '') || '待补充', address: String(record.address ?? ''),
            phone: String(record.phone ?? ''), runId: String(occurrence.run_id ?? ''),
            confidence: typeof record.confidence_score === 'number' ? record.confidence_score : undefined,
            status: 'pending' as const, comment: '已读取真实检索记录，等待后端 AI 评分服务。',
          };
        });
        if (active) setRows(mapped);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : '读取检索结果失败');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadRecords();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    return (!term || row.name.toLowerCase().includes(term) || row.domain.toLowerCase().includes(term))
      && (source === 'all' || row.source === source);
  }), [rows, search, source]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const sourceOptions = useMemo(() => [...new Set(rows.map(row => row.source).filter(Boolean))], [rows]);
  const scoredCount = rows.filter(row => row.status === 'scored').length;
  const toggleOne = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const togglePage = () => setSelected(current => visible.every(row => current.includes(row.id))
    ? current.filter(id => !visible.some(row => row.id === id))
    : [...new Set([...current, ...visible.map(row => row.id)])]);
  const scoreRows = (_ids: string[]) => {
    setNotice('当前版本已切换为真实检索记录，但后端 AI 评分接口尚未接入；为避免虚假评分，本步骤暂不生成分数。');
  };
  const removeSelected = () => {
    setRows(current => current.filter(row => !selected.includes(row.id)));
    setNotice('已从当前工作台移除 ' + selected.length + ' 条记录；未写入全局黑名单。');
    setSelected([]);
  };
  const exportSelected = () => {
    const headers = ['企业名称', '官方网站', '国家', '获客来源', '邮箱', '清洗状态', 'AI 综合评分', 'AI 评语'];
    const data = selectedRows.map(row => [row.name, row.domain, row.country, row.source, row.email, row.status, row.score ?? '', row.comment ?? '']);
    const xmlEscape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const columnName = (index: number) => String.fromCharCode(65 + index);
    const sheetRows = [headers, ...data].map((values, rowIndex) => '<row r="' + (rowIndex + 1) + '">' + values.map((value, colIndex) => {
      const ref = columnName(colIndex) + (rowIndex + 1);
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
    }).join('') + '</row>').join('');
    const files = {
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="原始线索" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows + '</sheetData></worksheet>'),
    };
    const workbook = zipSync(files, { level: 0 });
    const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'tradepilot-raw-leads.xlsx'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const sendToEnrichment = () => {
    if (!selectedRows.length) return;
    try { localStorage.setItem('tradepilot.prospect-discovery.crm-queue.v1', JSON.stringify(selectedRows)); } catch { /* Keep the current workbench available if browser storage is full. */ }
    onContinueToEnrichment();
  };
  const scoreTag = (score?: number) => score === undefined ? <Tag type="gray">待清洗</Tag> : <Tag type={score >= 90 ? 'green' : score >= 80 ? 'blue' : 'warm-gray'}>{score >= 90 ? 'Tier A' : score >= 80 ? 'Tier B' : 'Tier C'}</Tag>;

  return (
    <section className="tp-prospect-discovery__step tp-scoring">
      <div className="tp-scoring__heading">
        <div><span className="tp-execution__eyebrow">AI FILTERING & SCORING</span><h2>AI 智能清洗与打分工作台</h2><p>目标市场：{profile.countryName || '未指定'} · 核心产品：{profile.coreNoun || '未指定'} · 目标买家：{profile.buyers.length} 类</p></div>
        <div className="tp-scoring__heading-actions"><Tag type="blue">{rows.length} 条待处理记录</Tag><Button kind="primary" size="md" renderIcon={CarbonIcons.ArrowRight} disabled={!selected.length || loading || !rows.length} onClick={sendToEnrichment}>将已选企业送入第六步</Button></div>
      </div>

      {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <Accordion className="tp-scoring__methodology">
        <AccordionItem open title={<span className="tp-scoring__accordion-title"><CarbonIcons.MachineLearningModel size={16} />AI 模型、清洗方法与评分依据</span>}>
          <Grid narrow>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-scoring__info-tile"><div className="tp-scoring__info-title"><CarbonIcons.ModelBuilder size={18} /><strong>所用清洗与大模型</strong></div>
                <dl><dt>主模型候选</dt><dd>GPT-4o / Claude 3.5 Sonnet</dd><dt>向量模型</dt><dd>text-embedding-3-small</dd></dl>
                <p>用于多语言语义解析、企业官网内容理解，以及主营业务与 ICP 的向量相似度计算。</p>
              </Tile>
            </Column>
            <Column sm={4} md={4} lg={5}>
              <Tile className="tp-scoring__info-tile"><div className="tp-scoring__info-title"><CarbonIcons.Filter size={18} /><strong>清洗与过滤方法</strong></div>
                <ul><li><strong>URL 归一化：</strong>剔除无效二级路由，提取根域名</li><li><strong>内容同构去重：</strong>企业名称与官网域名双重哈希</li><li><strong>语义降噪：</strong>过滤伪企业描述、空壳博客及经销商重定向</li></ul>
              </Tile>
            </Column>
            <Column sm={4} md={8} lg={6}>
              <Tile className="tp-scoring__info-tile"><div className="tp-scoring__info-title"><CarbonIcons.ChartLine size={18} /><strong>综合评分公式</strong></div>
                <div className="tp-scoring__formula">Score = (Fit × 40%) + (Persona × 30%) + (Scale × 20%) + (Intent × 10%)</div>
                <ul className="tp-scoring__weights"><li><span>Fit · 产品契合度</span><strong>40%</strong></li><li><span>Persona · 身位匹配度</span><strong>30%</strong></li><li><span>Scale · 规模实力</span><strong>20%</strong></li><li><span>Intent · 采购意图</span><strong>10%</strong></li></ul>
              </Tile>
            </Column>
          </Grid>
          <p className="tp-scoring__method-note">模型名称与评分权重按产品方案展示。当前展示真实检索记录。AI 模型选择、清洗执行、评分依据与结果持久化尚待后端评分流水线接入；接口完成前不会生成模拟分数。</p>
        </AccordionItem>
      </Accordion>

      <div className="tp-scoring__summary">
        <div><span>当前原始记录</span><strong>{rows.length}</strong></div>
        <div><span>已完成评分</span><strong>{scoredCount}</strong></div>
        <div><span>待清洗记录</span><strong>{rows.length - scoredCount}</strong></div>
        <div><span>已勾选</span><strong>{selected.length} / {rows.length}</strong></div>
      </div>

      <Tile className="tp-scoring__table-panel">
        <div className="tp-execution__section-heading"><div><h3>原始检索结果</h3><p>人工复核企业主体、官网与来源，再决定是否纳入 AI 清洗打分</p></div><Tag type="blue">{filtered.length} 条匹配</Tag></div>
        <div className="tp-scoring__table-controls">
          {selected.length > 0 && <div className="tp-scoring__batch-actions"><span>已勾选 {selected.length} / {rows.length} 条记录</span><div><Button kind="primary" size="md" renderIcon={CarbonIcons.MagicWand} onClick={() => scoreRows(selected)}>检查 AI 评分接入状态</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.TrashCan} onClick={removeSelected}>批量移除</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.Download} onClick={exportSelected}>导出 XLSX</Button><Button kind="ghost" size="md" onClick={() => setSelected([])}>取消选择</Button></div></div>}
          <TableToolbar>
          <TableToolbarContent>
            <div className="tp-scoring__toolbar">
              <TableToolbarSearch persistent value={search} onChange={(_event, value) => { setSearch(value ?? ''); setPage(1); }} placeholder="搜索企业名称或域名" />
              <div className="tp-scoring__source-filter">
                <Dropdown id="tp-scoring-source" titleText="获客来源" label="全部来源" items={[{ id: 'all', text: '全部来源' }, ...sourceOptions.map(item => ({ id: item, text: item }))]} itemToString={item => item?.text ?? ''} selectedItem={[{ id: 'all', text: '全部来源' }, ...sourceNames.map(item => ({ id: item, text: item }))].find(item => item.id === source) ?? { id: 'all', text: '全部来源' }} onChange={({ selectedItem }) => { setSource(selectedItem?.id ?? 'all'); setPage(1); }} />
              </div>
            </div>
          </TableToolbarContent>
          </TableToolbar>
        </div>
        {loading && <InlineNotification kind="info" lowContrast title="正在读取真实检索记录" subtitle="从潜客发现结果接口加载本轮任务的记录。" />}
        {loadError && <InlineNotification kind="error" lowContrast title="检索结果读取失败" subtitle={loadError} />}
        <div className="tp-scoring__table-scroll">
          <Table size="lg" useZebraStyles={false}>
            <TableHead><TableRow>
              <TableSelectAll id="scoring-select-all" name="scoring-select-all" checked={visible.length > 0 && visible.every(row => selected.includes(row.id))} indeterminate={visible.some(row => selected.includes(row.id)) && !visible.every(row => selected.includes(row.id))} onSelect={togglePage} />
              {['企业名称 / 状态', '官方网站 / 邮箱', '获客来源', 'AI 综合评分', 'AI 核心评语', '操作'].map(label => <TableHeader key={label}>{label}</TableHeader>)}
            </TableRow></TableHead>
            <TableBody>
              {visible.map(row => <TableRow key={row.id}>
                <TableSelectRow id={'scoring-' + row.id} name={'scoring-' + row.id} checked={selected.includes(row.id)} onSelect={() => toggleOne(row.id)} />
                <TableCell><div className="tp-scoring__company"><strong>{row.name}</strong>{scoreTag(row.score)}</div></TableCell>
                <TableCell>{row.domain ? <a href={row.domain.startsWith('http') ? row.domain : 'https://' + row.domain} target="_blank" rel="noreferrer">{row.domain}<CarbonIcons.ArrowUpRight size={12} /></a> : <span>暂无官网</span>}<small>{row.email}</small></TableCell>
                <TableCell><Tag type="blue">{row.source}</Tag></TableCell>
                <TableCell>{row.score === undefined ? <span className="tp-scoring__score-empty">—</span> : <button type="button" className="tp-scoring__score" title={'Fit ' + row.fit + ' · Persona ' + row.persona + ' · Scale ' + row.scale + ' · Intent ' + row.intent} onClick={() => setNotice('评分明细：Fit ' + row.fit + ' · Persona ' + row.persona + ' · Scale ' + row.scale + ' · Intent ' + row.intent)}>{row.score} 分</button>}</TableCell>
                <TableCell><span className="tp-scoring__comment">{row.comment || '等待后端 AI 评分服务接入。'}</span></TableCell>
                <TableCell><OverflowMenu ariaLabel={'记录操作：' + row.name} flipped><OverflowMenuItem itemText="查看 AI 评分接入状态" onClick={() => scoreRows([row.id])} /><OverflowMenuItem itemText="移除记录" onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setSelected(current => current.filter(id => id !== row.id)); setNotice('已移除 ' + row.name + '。'); }} /><OverflowMenuItem itemText="复制网址" onClick={() => { void navigator.clipboard?.writeText('https://' + row.domain); setNotice('网址已复制。'); }} /></OverflowMenu></TableCell>
              </TableRow>)}
              {visible.length === 0 && <TableRow><TableCell colSpan={7}>没有符合当前筛选条件的真实记录。</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="tp-scoring__pagination"><Pagination id="tp-scoring-pagination" page={page} pageSize={pageSize} pageSizes={[10, 20, 50]} totalItems={filtered.length} onChange={({ page: nextPage, pageSize: nextSize }) => { setPage(nextPage); setPageSize(nextSize); }} /></div>
      </Tile>
    </section>
  );
}
