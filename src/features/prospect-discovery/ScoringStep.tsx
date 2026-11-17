import { useEffect, useMemo, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import {
  Button, Column, Dropdown, Grid, InlineNotification, Link, OverflowMenu,
  OverflowMenuItem, Pagination, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow, TableSelectAll, TableSelectRow,
  TextInput, Tag, Tile, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

type Lead = {
  id: string; name: string; domain: string; country: string; source: string; email: string;
  address?: string; phone?: string; runId?: string; confidence?: number; reviewed?: boolean; guardrailReview?: boolean; duplicateReview?: boolean;
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
  const [scoring, setScoring] = useState(false);

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
            reviewed: ['reviewed', 'collected', 'converted'].includes(String(asObject(record.raw_data).lifecycle_stage ?? '')),
            guardrailReview: asObject(record.raw_data).guardrail_review_required === true,
            duplicateReview: asObject(record.raw_data).duplicate_review_required === true,
            status: asObject(record.raw_data).ai_scoring ? 'scored' as const : 'pending' as const,
            score: typeof asObject(asObject(record.raw_data).ai_scoring).score === 'number' ? Number(asObject(asObject(record.raw_data).ai_scoring).score) : undefined,
            fit: Number(asObject(asObject(asObject(record.raw_data).ai_scoring).dimensions).fit) || undefined,
            persona: Number(asObject(asObject(asObject(record.raw_data).ai_scoring).dimensions).persona) || undefined,
            scale: Number(asObject(asObject(asObject(record.raw_data).ai_scoring).dimensions).scale) || undefined,
            intent: Number(asObject(asObject(asObject(record.raw_data).ai_scoring).dimensions).intent) || undefined,
            comment: String(asObject(asObject(record.raw_data).ai_scoring).summary ?? '已读取真实检索记录，等待 AI 评分。'),
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
  const scoreRows = async (ids: string[]) => {
    if (!ids.length || scoring) return;
    setScoring(true); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data } = await db.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('登录状态已失效，请重新登录。');
      let updated: Array<Record<string, unknown>> = [];
      for (let index = 0; index < ids.length; index += 20) {
        const batch = ids.slice(index, index + 20);
        const response = await fetch('/api/v1/discovery-records/score', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ recordIds: batch, profile }),
        });
        const payload = await response.json() as { data?: { scores?: Array<Record<string, unknown>> }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || 'AI 评分失败（HTTP ' + response.status + '）');
        updated = [...updated, ...(payload.data?.scores ?? [])];
      }
      setRows(current => current.map(row => {
        const score = updated.find(item => item.id === row.id);
        if (!score) return row;
        const dimensions = asObject(score.dimensions);
        return { ...row, status: 'scored', score: Number(score.score), fit: Number(dimensions.fit), persona: Number(dimensions.persona), scale: Number(dimensions.scale), intent: Number(dimensions.intent), comment: String(score.summary ?? '') };
      }));
      setNotice('已完成并保存 ' + updated.length + ' 条真实 AI 评分；评分模型与证据已写入潜客记录。');
      setSelected([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI 评分失败');
    } finally { setScoring(false); }
  };
  const removeSelected = async () => {
    if (!selected.length) return;
    try {
      const db = await getSupabaseClient();
      const { data } = await db.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('登录状态已失效，请重新登录。');
      const results = await Promise.all(selected.map(async id => {
        const response = await fetch('/api/v1/discovery-records/' + id + '/action', {
          method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action: 'remove' }),
        });
        if (!response.ok) throw new Error('移除记录失败（HTTP ' + response.status + '）');
        return id;
      }));
      setRows(current => current.filter(row => !results.includes(row.id)));
      setNotice('已从潜客发现结果中移除 ' + results.length + ' 条记录（软移除，原始数据仍保留）。');
      setSelected([]);
    } catch (error) { setNotice(error instanceof Error ? error.message : '移除记录失败'); }
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
  const sendToEnrichment = async () => {
    if (!selectedRows.length) return;
    try {
      const db = await getSupabaseClient();
      const { data } = await db.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('登录状态已失效，请重新登录。');
      const outcomes = await Promise.all(selectedRows.map(async row => {
        if (row.reviewed) return { row, ok: true as const };
        try {
          const response = await fetch('/api/v1/discovery-records/' + row.id + '/action', {
            method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ action: 'review' }),
          });
          const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
          if (!response.ok) throw new Error(payload.error?.message || '审核未通过');
          return { row: { ...row, reviewed: true }, ok: true as const };
        } catch (error) {
          return { row, ok: false as const, message: row.name + '：' + (error instanceof Error ? error.message : String(error)) };
        }
      }));
      const approved = outcomes.filter(item => item.ok).map(item => item.row);
      const failed = outcomes.filter(item => !item.ok);
      if (!approved.length) throw new Error(failed.map(item => item.message).join('；') || '没有记录通过审核。');
      localStorage.setItem('tradepilot.prospect-discovery.crm-queue.v1', JSON.stringify(approved));
      setNotice('已审核通过 ' + approved.length + ' 条记录' + (failed.length ? '；另有 ' + failed.length + ' 条未通过，已保留在第五步' : '') + '，正在进入联系人穿透步骤。');
      onContinueToEnrichment();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '潜客审核失败；未进入联系人穿透步骤。');
    }
  };
  const scoreTag = (score?: number) => score === undefined ? <Tag type="gray">待清洗</Tag> : <Tag type={score >= 90 ? 'green' : score >= 80 ? 'blue' : 'warm-gray'}>{score >= 90 ? 'Tier A' : score >= 80 ? 'Tier B' : 'Tier C'}</Tag>;

  return (
    <section className="tp-prospect-discovery__step tp-scoring">
      <div className="tp-scoring__heading">
        <div><span className="tp-execution__eyebrow">AI FILTERING & SCORING</span><h2>AI 智能清洗与打分工作台</h2><p>目标市场：{profile.countryName || '未指定'} · 核心产品：{profile.coreNoun || '未指定'} · 目标买家：{profile.buyers.length} 类</p></div>
        <div className="tp-scoring__heading-actions"><Tag type="blue">{rows.length} 条待处理记录</Tag><Button kind="primary" size="md" renderIcon={CarbonIcons.ArrowRight} disabled={!selected.length || loading || !rows.length} onClick={sendToEnrichment}>将已选企业送入第六步</Button></div>
      </div>

      {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <Tile className="tp-scoring__snapshot">
        <div className="tp-scoring__method-heading"><CarbonIcons.DocumentView size={18} /><strong>前序搜索条件快照 / Previous Search Snapshot</strong></div>
        <div className="tp-scoring__snapshot-grid">
          <div><span>目标市场 / Target Market</span><strong>{profile.countryName || '未指定'}</strong></div>
          <div><span>核心产品 / Core Product</span><strong>{profile.coreNoun || '未指定'}</strong></div>
          <div><span>目标买家 / Target Buyers</span><strong>{profile.buyers.length ? profile.buyers.map(id => ({ importer: '进口商', distributor: '分销商 / 批发商', brand: '品牌方', contractor: '工程商 / 零售商' }[id] ?? id)).join('、') : '未指定'}</strong></div>
          <div><span>检索记录 / Retrieved Records</span><strong>{rows.length} 条 · {sourceOptions.length} 个来源</strong></div>
        </div>
      </Tile>

      <Tile className="tp-scoring__methodology">
        <div className="tp-scoring__method-heading"><CarbonIcons.MachineLearningModel size={18} /><strong>AI 模型、清洗方法与评分依据 / AI Model, Cleaning & Scoring</strong></div>
        <Grid narrow>
          <Column sm={4} md={4} lg={5}>
            <Tile className="tp-scoring__info-tile"><div className="tp-scoring__info-title"><CarbonIcons.ModelBuilder size={18} /><strong>所用清洗与大模型</strong></div>
              <dl><dt>评分模型</dt><dd>由 AI 与 API 集成中的 prospect_scoring 任务配置决定</dd><dt>向量模型</dt><dd>当前评分链路未调用向量检索</dd></dl>
              <p>模型根据目标画像、企业基础字段、公开资料摘要和来源证据生成结构化评分。</p>
            </Tile>
          </Column>
          <Column sm={4} md={4} lg={5}>
            <Tile className="tp-scoring__info-tile"><div className="tp-scoring__info-title"><CarbonIcons.Filter size={18} /><strong>清洗与过滤方法</strong></div>
              <ul><li><strong>真实记录：</strong>读取后端持久化的企业与渠道来源记录</li><li><strong>证据输入：</strong>提交企业字段、公开资料摘要及来源出现记录</li><li><strong>结构化输出：</strong>保存四项维度分数、证据、风险和模型信息</li></ul>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={6}>
            <Tile className="tp-scoring__info-tile"><div className="tp-scoring__info-title"><CarbonIcons.ChartLine size={18} /><strong>综合评分公式</strong></div>
              <div className="tp-scoring__formula">Score = (Fit × 40%) + (Persona × 30%) + (Scale × 20%) + (Intent × 10%)</div>
              <ul className="tp-scoring__weights"><li><span>Fit · 产品契合度</span><strong>40%</strong></li><li><span>Persona · 身位匹配度</span><strong>30%</strong></li><li><span>Scale · 规模实力</span><strong>20%</strong></li><li><span>Intent · 采购意图</span><strong>10%</strong></li></ul>
            </Tile>
          </Column>
        </Grid>
        <p className="tp-scoring__method-note">模型名称与评分权重按产品方案展示。使用 AI 与 API 集成中为潜客评分配置的模型。评分维度、证据、风险、模型版本与评分时间会持久化到潜客记录。</p>
      </Tile>

      <div className="tp-scoring__summary">
        <div><span>当前原始记录</span><strong>{rows.length}</strong></div>
        <div><span>已完成评分</span><strong>{scoredCount}</strong></div>
        <div><span>待清洗记录</span><strong>{rows.length - scoredCount}</strong></div>
        <div><span>已勾选</span><strong>{selected.length} / {rows.length}</strong></div>
      </div>

      <Tile className="tp-scoring__table-panel">
        <div className="tp-execution__section-heading"><div><h3>原始检索结果</h3><p>人工复核企业主体、官网与来源，再决定是否纳入 AI 清洗打分</p></div><Tag type="blue">{filtered.length} 条匹配</Tag></div>
        <div className="tp-scoring__table-controls">
          {selected.length > 0 && <div className="tp-scoring__batch-actions"><span>已勾选 {selected.length} / {rows.length} 条记录</span><div><Button kind="primary" size="md" renderIcon={CarbonIcons.MagicWand} onClick={() => scoreRows(selected)}>AI 清洗与打分</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.TrashCan} onClick={removeSelected}>批量移除</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.Download} onClick={exportSelected}>导出 XLSX</Button><Button kind="ghost" size="md" onClick={() => setSelected([])}>取消选择</Button></div></div>}
          <div className="tp-scoring__toolbar">
            <TextInput
              id="tp-scoring-search"
              labelText="搜索企业"
              placeholder="搜索企业名称或域名"
              value={search}
              onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }}
            />
            <div className="tp-scoring__source-filter">
              <Dropdown id="tp-scoring-source" titleText="获客来源" label="全部来源" items={[{ id: 'all', text: '全部来源' }, ...sourceOptions.map(item => ({ id: item, text: item }))]} itemToString={item => item?.text ?? ''} selectedItem={[{ id: 'all', text: '全部来源' }, ...sourceOptions.map(item => ({ id: item, text: item }))].find(item => item.id === source) ?? { id: 'all', text: '全部来源' }} onChange={({ selectedItem }) => { setSource(selectedItem?.id ?? 'all'); setPage(1); }} />
            </div>
          </div>
        </div>
        {loading && <InlineNotification kind="info" lowContrast title="正在读取真实检索记录" subtitle="从潜客发现结果接口加载本轮任务的记录。" />}
        {loadError && <InlineNotification kind="error" lowContrast title="检索结果读取失败" subtitle={loadError} />}
        {scoring && <InlineNotification kind="info" lowContrast title="AI 清洗与评分进行中" subtitle="正在调用已配置的评分模型并保存评分依据。" />}
        <div className="tp-scoring__table-scroll">
          <Table size="lg" useZebraStyles={false}>
            <TableHead><TableRow>
              <TableSelectAll id="scoring-select-all" name="scoring-select-all" checked={visible.length > 0 && visible.every(row => selected.includes(row.id))} indeterminate={visible.some(row => selected.includes(row.id)) && !visible.every(row => selected.includes(row.id))} onSelect={togglePage} />
              {['企业名称 / 状态', '官方网站 / 邮箱', '获客来源', 'AI 综合评分', 'AI 核心评语', '操作'].map(label => <TableHeader key={label}>{label}</TableHeader>)}
            </TableRow></TableHead>
            <TableBody>
              {visible.map(row => <TableRow key={row.id}>
                <TableSelectRow id={'scoring-' + row.id} name={'scoring-' + row.id} checked={selected.includes(row.id)} onSelect={() => toggleOne(row.id)} />
                <TableCell><div className="tp-scoring__company"><strong>{row.name}</strong>{scoreTag(row.score)}{row.guardrailReview && <Tag type="warm-gray">护盾待审核</Tag>}{row.duplicateReview && <Tag type="warm-gray">重复待复核</Tag>}</div></TableCell>
                <TableCell>{row.domain ? <Link href={row.domain.startsWith('http') ? row.domain : 'https://' + row.domain} target="_blank" rel="noreferrer">{row.domain}<CarbonIcons.ArrowUpRight size={12} /></Link> : <span>暂无官网</span>}<small>{row.email}</small></TableCell>
                <TableCell><Tag type="blue">{row.source}</Tag></TableCell>
                <TableCell>{row.score === undefined ? <span className="tp-scoring__score-empty">—</span> : <Button kind="ghost" size="sm" className="tp-scoring__score" title={'Fit ' + row.fit + ' · Persona ' + row.persona + ' · Scale ' + row.scale + ' · Intent ' + row.intent} onClick={() => setNotice('评分明细：Fit ' + row.fit + ' · Persona ' + row.persona + ' · Scale ' + row.scale + ' · Intent ' + row.intent)}>{row.score} 分</Button>}</TableCell>
                <TableCell><span className="tp-scoring__comment">{row.comment || '尚未评分；选择记录后可调用已配置的评分模型。'}</span></TableCell>
                <TableCell><OverflowMenu ariaLabel={'记录操作：' + row.name} flipped><OverflowMenuItem itemText="单条执行 AI 清洗与打分" onClick={() => scoreRows([row.id])} /><OverflowMenuItem itemText="移除记录" onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setSelected(current => current.filter(id => id !== row.id)); setNotice('已移除 ' + row.name + '。'); }} /><OverflowMenuItem itemText="复制网址" onClick={() => { void navigator.clipboard?.writeText('https://' + row.domain); setNotice('网址已复制。'); }} /></OverflowMenu></TableCell>
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
