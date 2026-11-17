import { useMemo, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import {
  Accordion, AccordionItem, Button, Column, Dropdown, Grid, InlineNotification, OverflowMenu,
  OverflowMenuItem, Pagination, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow, TableSelectAll, TableSelectRow,
  TableToolbar, TableToolbarContent, TableToolbarSearch, Tag, Tile, CarbonIcons,
} from '@/design-system';

type Lead = {
  id: string; name: string; domain: string; country: string; source: string; email: string;
  status: 'pending' | 'scored'; score?: number; fit?: number; persona?: number; scale?: number; intent?: number; comment?: string;
};
type Props = { profile: { coreNoun: string; countryName: string; buyers: string[] }; onContinueToEnrichment: () => void };

const companyNames = [
  ['SolarTech Deutschland GmbH', 'solartech-de.com'], ['EcoPower Systems GmbH', 'eco-power.de'],
  ['Nordic Energy Solutions', 'nordic-energy.eu'], ['Bavaria Industrial Supply', 'bavaria-supply.de'],
  ['GreenVolt Europe GmbH', 'greenvolt-eu.com'], ['Rheinland Power Components', 'rheinland-power.de'],
  ['Alpine Battery Trading AG', 'alpine-battery.ch'], ['Hanover Smart Energy', 'hanover-energy.de'],
  ['Westfalen Solarhandel', 'westfalen-solar.de'], ['Berlin Power Distribution', 'berlin-power.eu'],
  ['EnergieWerk Solutions', 'energiewerk.de'], ['Central Europe Battery GmbH', 'ce-battery.com'],
  ['BrightGrid Technologies', 'brightgrid.eu'], ['Hansa Renewable Systems', 'hansa-renewable.de'],
  ['Frankfurt Energy Trading', 'frankfurt-energy.de'], ['VoltHaus Deutschland', 'volthaus.de'],
];
const sourceNames = ['Google Maps 德国网格', 'WLW 工业黄页', 'SERP 搜索引擎矩阵'];
const seedLeads = (): Lead[] => Array.from({ length: 128 }, (_, index) => {
  const company = companyNames[index % companyNames.length];
  return {
    id: 'lead-' + (index + 1),
    name: index < companyNames.length ? company[0] : company[0] + ' ' + (Math.floor(index / companyNames.length) + 1),
    domain: company[1], country: 'DE', source: sourceNames[index % sourceNames.length],
    email: index % 5 === 0 ? '待补充' : 'info@' + company[1], status: 'pending',
  };
});

export function ScoringStep({ profile, onContinueToEnrichment }: Props) {
  const [rows, setRows] = useState<Lead[]>(() => {
    const data = seedLeads();
    try {
      const queue = JSON.parse(localStorage.getItem('tradepilot.prospect-scoring.queue.v1') || '[]') as string[];
      return queue.length ? data.filter(item => queue.includes(item.id)) : data;
    } catch { return data; }
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notice, setNotice] = useState('');
  const [scoring, setScoring] = useState(false);

  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    return (!term || row.name.toLowerCase().includes(term) || row.domain.toLowerCase().includes(term))
      && (source === 'all' || row.source === source);
  }), [rows, search, source]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const scoredCount = rows.filter(row => row.status === 'scored').length;
  const toggleOne = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const togglePage = () => setSelected(current => visible.every(row => current.includes(row.id))
    ? current.filter(id => !visible.some(row => row.id === id))
    : [...new Set([...current, ...visible.map(row => row.id)])]);
  const scoreRows = (ids: string[]) => {
    if (!ids.length) return;
    setScoring(true);
    window.setTimeout(() => {
      setRows(current => current.map((row, index) => {
        if (!ids.includes(row.id)) return row;
        const fit = 82 + (index * 7 % 18);
        const persona = 76 + (index * 5 % 23);
        const scale = 68 + (index * 9 % 30);
        const intent = 60 + (index * 11 % 38);
        const score = Math.round(fit * .4 + persona * .3 + scale * .2 + intent * .1);
        return { ...row, status: 'scored', fit, persona, scale, intent, score, comment: fit >= 90 ? '产品线与目标品类高度吻合，具备进口或区域分销特征。建议优先核验采购负责人。' : '主营方向与目标产品存在一定关联，建议结合官网产品目录和采购动态进一步人工核验。' };
      }));
      setScoring(false);
      setNotice('已完成 ' + ids.length + ' 条记录的前端演示评分；当前未调用真实 AI 模型或写入后端。');
      setSelected([]);
    }, 900);
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
        <div className="tp-scoring__heading-actions"><Tag type="blue">{rows.length} 条待处理记录</Tag><Button kind="primary" size="md" renderIcon={CarbonIcons.ArrowRight} disabled={!selected.length} onClick={sendToEnrichment}>将已选企业送入第六步</Button></div>
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
          <p className="tp-scoring__method-note">模型名称与评分权重按产品方案展示。当前页面仅运行前端演示评分，尚未连接真实模型调用；实际模型选择、清洗执行与评分解释需由后端 AI 流水线提供。</p>
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
          {selected.length > 0 && <div className="tp-scoring__batch-actions"><span>已勾选 {selected.length} / {rows.length} 条记录</span><div><Button kind="primary" size="md" renderIcon={CarbonIcons.MagicWand} onClick={() => scoreRows(selected)}>AI 清洗与打分</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.TrashCan} onClick={removeSelected}>批量移除</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.Download} onClick={exportSelected}>导出 XLSX</Button><Button kind="ghost" size="md" onClick={() => setSelected([])}>取消选择</Button></div></div>}
          <TableToolbar>
          <TableToolbarContent>
            <div className="tp-scoring__toolbar">
              <TableToolbarSearch persistent value={search} onChange={(_event, value) => { setSearch(value ?? ''); setPage(1); }} placeholder="搜索企业名称或域名" />
              <div className="tp-scoring__source-filter">
                <Dropdown id="tp-scoring-source" titleText="获客来源" label="全部来源" items={[{ id: 'all', text: '全部来源' }, ...sourceNames.map(item => ({ id: item, text: item }))]} itemToString={item => item?.text ?? ''} selectedItem={[{ id: 'all', text: '全部来源' }, ...sourceNames.map(item => ({ id: item, text: item }))].find(item => item.id === source) ?? { id: 'all', text: '全部来源' }} onChange={({ selectedItem }) => { setSource(selectedItem?.id ?? 'all'); setPage(1); }} />
              </div>
            </div>
          </TableToolbarContent>
          </TableToolbar>
        </div>
        {scoring && <InlineNotification kind="info" lowContrast title="AI 清洗与打分进行中" subtitle="正在处理已选记录（前端演示任务）。" />}
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
                <TableCell><a href={'https://' + row.domain} target="_blank" rel="noreferrer">{row.domain}<CarbonIcons.ArrowUpRight size={12} /></a><small>{row.email}</small></TableCell>
                <TableCell><Tag type="blue">{row.source}</Tag></TableCell>
                <TableCell>{row.score === undefined ? <span className="tp-scoring__score-empty">—</span> : <button type="button" className="tp-scoring__score" title={'Fit ' + row.fit + ' · Persona ' + row.persona + ' · Scale ' + row.scale + ' · Intent ' + row.intent} onClick={() => setNotice('评分明细：Fit ' + row.fit + ' · Persona ' + row.persona + ' · Scale ' + row.scale + ' · Intent ' + row.intent)}>{row.score} 分</button>}</TableCell>
                <TableCell><span className="tp-scoring__comment">{row.comment || '等待 AI 清洗与评分后生成企业契合点评。'}</span></TableCell>
                <TableCell><OverflowMenu ariaLabel={'记录操作：' + row.name} flipped><OverflowMenuItem itemText="单条执行 AI 清洗与打分" onClick={() => scoreRows([row.id])} /><OverflowMenuItem itemText="移除记录" onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setSelected(current => current.filter(id => id !== row.id)); setNotice('已移除 ' + row.name + '。'); }} /><OverflowMenuItem itemText="复制网址" onClick={() => { void navigator.clipboard?.writeText('https://' + row.domain); setNotice('网址已复制。'); }} /></OverflowMenu></TableCell>
              </TableRow>)}
              {visible.length === 0 && <TableRow><TableCell colSpan={7}>没有符合当前筛选条件的记录。</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="tp-scoring__pagination"><Pagination id="tp-scoring-pagination" page={page} pageSize={pageSize} pageSizes={[10, 20, 50]} totalItems={filtered.length} onChange={({ page: nextPage, pageSize: nextSize }) => { setPage(nextPage); setPageSize(nextSize); }} /></div>
      </Tile>
    </section>
  );
}
