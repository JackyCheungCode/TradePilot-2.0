import { useMemo, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import {
  Button, Checkbox, CodeSnippet, InlineNotification, OverflowMenu,
  OverflowMenuItem, ProgressBar, RadioButton, RadioButtonGroup, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow, TableSelectAll, TableSelectRow,
  TableToolbar, TableToolbarContent, TableToolbarSearch, Tag, Tile, CarbonIcons,
} from '@/design-system';

type Contact = {
  id: string;
  company: string;
  domain: string;
  tier: 'Tier A' | 'Tier B' | 'Tier C';
  score: number;
  source: string;
  person: string;
  title: string;
  linkedin: string;
  email: string;
  emailStatus: 'valid' | 'pending' | 'unknown';
  enrichment: 'pending' | 'complete';
  crm: 'not-synced' | 'synced' | 'failed';
  crmId?: string;
};

type Props = { profile: { coreNoun: string; countryName: string } };

const positions = [
  { id: 'purchasing', label: 'Purchasing Director / Manager（采购总监/经理）' },
  { id: 'sourcing', label: 'Category / Sourcing Manager（品类/寻源经理）' },
  { id: 'supply', label: 'Supply Chain VP / Director（供应链副总裁/总监）' },
  { id: 'ceo', label: 'CEO / Founder / Managing Director（创始人/总经理）' },
];

const sampleCompanies = [
  ['SolarTech Deutschland GmbH','solartech-de.com','Tier A',94,'WLW 工业黄页'],
  ['EcoPower Systems GmbH','eco-power.de','Tier A',92,'Google Maps 德国网格'],
  ['Nordic Energy Solutions','nordic-energy.eu','Tier B',86,'SERP 搜索引擎矩阵'],
  ['Bavaria Industrial Supply','bavaria-supply.de','Tier A',91,'WLW 工业黄页'],
  ['GreenVolt Europe GmbH','greenvolt-eu.com','Tier B',84,'Google Maps 德国网格'],
  ['Rheinland Power Components','rheinland-power.de','Tier A',90,'SERP 搜索引擎矩阵'],
  ['Alpine Battery Trading AG','alpine-battery.ch','Tier B',83,'WLW 工业黄页'],
  ['Hanover Smart Energy','hanover-energy.de','Tier A',93,'Google Maps 德国网格'],
  ['Westfalen Solarhandel','westfalen-solar.de','Tier C',77,'SERP 搜索引擎矩阵'],
  ['Berlin Power Distribution','berlin-power.eu','Tier A',92,'WLW 工业黄页'],
  ['EnergieWerk Solutions','energiewerk.de','Tier B',85,'Google Maps 德国网格'],
  ['Central Europe Battery GmbH','ce-battery.com','Tier A',91,'SERP 搜索引擎矩阵'],
  ['BrightGrid Technologies','brightgrid.eu','Tier B',87,'WLW 工业黄页'],
  ['Hansa Renewable Systems','hansa-renewable.de','Tier A',90,'Google Maps 德国网格'],
  ['Frankfurt Energy Trading','frankfurt-energy.de','Tier B',82,'SERP 搜索引擎矩阵'],
  ['VoltHaus Deutschland','volthaus.de','Tier A',95,'WLW 工业黄页'],
] as const;

const seedContacts = (): Contact[] => Array.from({ length: 25 }, (_, index) => {
  const company = sampleCompanies[index % sampleCompanies.length];
  const hasPerson = index % 4 !== 0;
  const domain = company[1];
  return {
    id: 'crm-lead-' + (index + 1),
    company: index < sampleCompanies.length ? company[0] : company[0] + ' ' + (Math.floor(index / sampleCompanies.length) + 1),
    domain, tier: company[2] as Contact['tier'], score: Number(company[3]), source: company[4],
    person: hasPerson ? ['Michael Schmidt','Anna Weber','Thomas Müller','Laura Fischer'][index % 4] : '',
    title: hasPerson ? ['Head of Purchasing','Sourcing Manager','Supply Chain Director','Managing Director'][index % 4] : '',
    linkedin: hasPerson ? 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(company[0]) : '',
    email: hasPerson ? ['m.schmidt@','a.weber@','t.mueller@','l.fischer@'][index % 4] + domain : '',
    emailStatus: hasPerson ? (index % 5 === 0 ? 'unknown' : 'valid') : 'pending',
    enrichment: hasPerson ? 'complete' : 'pending',
    crm: 'not-synced',
  };
});

const emailTag = (status: Contact['emailStatus']) => status === 'valid'
  ? <Tag type="green">Valid · SMTP 验证通过</Tag>
  : status === 'pending' ? <Tag type="gray">待验证</Tag> : <Tag type="warm-gray">未确认</Tag>;

const crmTag = (row: Contact) => row.crm === 'synced'
  ? <Tag type="green">已同步至 CRM</Tag>
  : row.crm === 'failed' ? <Tag type="red">同步失败</Tag> : row.enrichment === 'complete'
    ? <Tag type="blue">已穿透 / 待入库</Tag> : <Tag type="gray">待穿透</Tag>;

export function DecisionMakerStep({ profile }: Props) {
  const [rows, setRows] = useState<Contact[]>(() => {
    try {
      const queue = JSON.parse(localStorage.getItem('tradepilot.prospect-discovery.crm-queue.v1') || '[]') as Array<{id?: string; name?: string; domain?: string; source?: string; score?: number}>;
      if (!queue.length) return seedContacts();
      return queue.map((item, index) => {
        const fallback = sampleCompanies[index % sampleCompanies.length];
        return {
          ...seedContacts()[index % 25],
          id: item.id || 'crm-lead-' + (index + 1),
          company: item.name || fallback[0],
          domain: item.domain || fallback[1],
          source: item.source || fallback[4],
          score: item.score ?? Number(fallback[3]),
          tier: item.score && item.score >= 90 ? 'Tier A' : item.score && item.score >= 80 ? 'Tier B' : 'Tier C',
        };
      });
    } catch { return seedContacts(); }
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['purchasing','sourcing','supply']);
  const [emailLevel, setEmailLevel] = useState('verified');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState('[SYSTEM] Decision-maker enrichment workspace ready.\n[CONTEXT] CRM handoff queue loaded. Frontend demonstration mode.');
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    return !term || row.company.toLowerCase().includes(term) || row.person.toLowerCase().includes(term) || row.email.toLowerCase().includes(term);
  }), [rows, search]);
  const toggleOne = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const toggleAll = () => setSelected(current => filtered.length > 0 && filtered.every(row => current.includes(row.id))
    ? current.filter(id => !filtered.some(row => row.id === id))
    : [...new Set([...current, ...filtered.map(row => row.id)])]);

  const startEnrichment = (targetIds: string[] = rows.map(row => row.id)) => {
    const targets = targetIds.filter(id => rows.some(row => row.id === id));
    if (!targets.length || !selectedRoles.length) return;
    setRunning(true);
    setProgress(0);
    setLog('[14:10:01] [ENRICH] Starting organization and decision-maker discovery...\\n[14:10:02] [PREFERENCE] Target roles: ' + selectedRoles.join(', ') + '\\n[14:10:03] [VERIFY] Email policy: ' + emailLevel + '\\n[14:10:04] [MODE] Frontend demonstration; no external enrichment request sent.');
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      const completed = Math.min(targets.length, step);
      const next = Math.round(completed / targets.length * 100);
      const completedIds = new Set(targets.slice(0, completed));
      setProgress(next);
      setRows(current => current.map((row, index) => completedIds.has(row.id) ? {
        ...row,
        enrichment: 'complete',
        person: row.person || ['Michael Schmidt','Anna Weber','Thomas Müller','Laura Fischer'][index % 4],
        title: row.title || ['Head of Purchasing','Sourcing Manager','Supply Chain Director','Managing Director'][index % 4],
        linkedin: row.linkedin || 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(row.company),
        email: row.email || 'procurement@' + row.domain,
        emailStatus: row.emailStatus === 'pending' ? 'valid' : row.emailStatus,
      } : row));
      if (completed % Math.max(1, Math.ceil(targets.length / 5)) === 0 || next === 100) {
        setLog(current => current + '\\n[14:10:' + String(4 + step).padStart(2,'0') + '] [ENRICH] Processed ' + completed + '/' + targets.length + ' companies.');
      }
      if (next >= 100) {
        window.clearInterval(timer);
        setRunning(false);
        setLog(current => current + '\\n[14:11:01] [COMPLETE] Decision-maker discovery finished. ' + targets.length + ' company records updated.');
        setNotice('演示穿透完成。当前姓名、邮箱与验证状态为演示数据，尚未调用真实数据源。');
      }
    }, 180);
  };

  const syncSelected = () => {
    if (!selected.length) return;
    const chosen = [...selected];
    setRows(current => current.map((row, index) => chosen.includes(row.id)
      ? { ...row, crm: index % 7 === 0 ? 'failed' : 'synced', crmId: index % 7 === 0 ? undefined : 'CRM-' + String(10000 + index) }
      : row));
    setNotice('已模拟同步 ' + chosen.length + ' 条记录；当前未写入真实 CRM。失败记录可通过单条操作重试。');
    setSelected([]);
  };

  const retryOne = (id: string) => {
    setRows(current => current.map((row, index) => row.id === id ? { ...row, crm: 'synced', crmId: 'CRM-' + String(10000 + index) } : row));
    setNotice('已模拟重试 CRM 同步。');
  };

  const exportSelected = () => {
    const selectedRows = rows.filter(row => selected.includes(row.id));
    if (!selectedRows.length) return;
    const headers = ['目标企业','AI 分级','AI 综合评分','决策人姓名','职称','LinkedIn','商务邮箱','邮箱验证状态','获客来源','穿透状态','CRM 状态','CRM 关联 ID'];
    const data = selectedRows.map(row => [row.company,row.tier,row.score,row.person,row.title,row.linkedin,row.email,row.emailStatus,row.source,row.enrichment,row.crm,row.crmId ?? '']);
    const escapeXml = (value: unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    const columnName = (index: number) => { let n=index+1, out=''; while(n){const rem=(n-1)%26;out=String.fromCharCode(65+rem)+out;n=Math.floor((n-1)/26);} return out; };
    const sheetRows = [headers,...data].map((values,rowIndex) => '<row r="'+(rowIndex+1)+'">'+values.map((value,colIndex) => '<c r="'+columnName(colIndex)+(rowIndex+1)+'" t="inlineStr"><is><t xml:space="preserve">'+escapeXml(value)+'</t></is></c>').join('')+'</row>').join('');
    const files = {
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="决策人名片" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheetRows+'</sheetData></worksheet>'),
    };
    const workbook = zipSync(files,{level:0});
    const url = URL.createObjectURL(new Blob([workbook],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const anchor = document.createElement('a'); anchor.href=url; anchor.download='tradepilot-decision-maker-cards.xlsx'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url),1000);
    setNotice('已导出 '+selectedRows.length+' 张决策人名片。');
  };

  const copyCard = (row: Contact) => {
    const card = [row.company, row.person, row.title, row.email, row.linkedin, 'https://' + row.domain].filter(Boolean).join('\n');
    void navigator.clipboard?.writeText(card);
    setNotice('完整名片已复制。');
  };

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const allReady = rows.length > 0 && rows.every(row => row.enrichment === 'complete');

  return (
    <section className="tp-prospect-discovery__step tp-decision">
      <div className="tp-decision__heading">
        <div><span className="tp-decision__eyebrow">DECISION-MAKER ENRICHMENT & CRM SYNC</span><h2>决策人穿透与 CRM 同步</h2><p>目标市场：{profile.countryName || '未指定'} · 核心产品：{profile.coreNoun || '未指定'}</p></div>
        <Tag type="blue">{rows.length} 家待处理企业</Tag>
      </div>

      {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <Tile className="tp-decision__preferences">
        <div className="tp-decision__preferences-heading"><div><h3>穿透偏好与全局总控</h3><p>配置优先挖掘的决策人职位与邮箱验证等级</p></div><Tag type="blue">已从第五步接收 {rows.length} 家企业</Tag></div>
        <div className="tp-decision__preference-grid">
          <fieldset className="tp-decision__role-group">
            <legend>决策人目标职位</legend>
            {positions.map(position => <Checkbox key={position.id} id={'tp-decision-role-' + position.id} labelText={position.label} checked={selectedRoles.includes(position.id)} onChange={() => setSelectedRoles(current => current.includes(position.id) ? current.filter(item => item !== position.id) : [...current, position.id])} />)}
          </fieldset>
          <div className="tp-decision__email-policy">
            <span className="tp-decision__field-label">联络方式验证等级</span>
            <RadioButtonGroup legendText="邮箱验证策略" name="tp-decision-email-level" valueSelected={emailLevel} onChange={value => setEmailLevel(String(value))}>
              <RadioButton id="tp-decision-verified" value="verified" labelText="仅抓取高置信度企业商务邮箱" />
            </RadioButtonGroup>
            <p>仅将通过验证策略的商务邮箱标记为可用。</p>
          </div>
        </div>
        <div className="tp-decision__actions">
          <Button kind="primary" renderIcon={CarbonIcons.SearchLocate} disabled={running || !selectedRoles.length || !rows.length} onClick={() => startEnrichment()}>{running ? '正在穿透组织架构…' : '开始执行决策人穿透'}</Button>
          <Button kind="secondary" renderIcon={CarbonIcons.CloudUpload} disabled={!selected.length || !allReady || running} onClick={syncSelected}>一键确认并同步至 CRM（公司 / 联系人 / 线索）</Button>
          <span>需完成穿透并人工勾选后，方可同步入库</span>
        </div>
      </Tile>

      <Tile className="tp-decision__runtime">
        <div className="tp-decision__runtime-heading"><div><h3>穿透执行状态</h3><p>企业组织架构发现、决策人识别与商务邮箱验证日志</p></div><Tag type={running ? 'blue' : allReady ? 'green' : 'gray'}>{running ? '正在深度穿透组织架构…' : allReady ? '穿透已完成' : '等待执行'}</Tag></div>
        <div className="tp-decision__progress-meta"><span>正在穿透企业（{Math.round(progress / 100 * rows.length)} / {rows.length}）</span><strong>已锁定决策人：{rows.filter(row => row.person).length} 位</strong></div>
        <ProgressBar label="决策人穿透进度" value={progress} max={100} helperText={progress + '%'} />
        <CodeSnippet type="multi" feedback="复制日志" className="tp-decision__console">{log}</CodeSnippet>
      </Tile>

      <Tile className="tp-decision__table-panel">
        <div className="tp-decision__table-heading"><div><h3>企业与决策人主表</h3><p>企业资产、AI 评分、决策人名片、邮箱验证及 CRM 状态集中在同一张表格</p></div><Tag type="blue">{filtered.length} 条记录</Tag></div>
        <div className="tp-decision__table-toolbar">
          <TableToolbar>
            {selected.length > 0 && <div className="tp-decision__batch-actions"><span>已勾选 {selected.length} / {rows.length} 条</span><div><Button kind="primary" size="md" renderIcon={CarbonIcons.CloudUpload} disabled={!allReady} onClick={syncSelected}>同步至 CRM</Button><Button kind="tertiary" size="md" renderIcon={CarbonIcons.Download} onClick={exportSelected}>导出名片 XLSX</Button></div></div>}
            <TableToolbarContent><TableToolbarSearch persistent value={search} onChange={(_event, value) => { setSearch(value ?? ''); setPage(1); }} placeholder="搜索公司、决策人或邮箱" /></TableToolbarContent>
          </TableToolbar>
        </div>
        <div className="tp-decision__table-scroll">
          <Table size="lg" useZebraStyles={false}>
            <TableHead><TableRow>
              <TableSelectAll id="decision-select-all" name="decision-select-all" checked={visible.length > 0 && visible.every(row => selected.includes(row.id))} indeterminate={visible.some(row => selected.includes(row.id)) && !visible.every(row => selected.includes(row.id))} onSelect={toggleAll} />
              {['目标企业 / AI 分级','核心决策人与职称','商务邮箱 / 验证状态','获客溯源路径','穿透 / CRM 状态','操作'].map(label => <TableHeader key={label}>{label}</TableHeader>)}
            </TableRow></TableHead>
            <TableBody>
              {visible.map(row => <TableRow key={row.id}>
                <TableSelectRow id={'decision-' + row.id} name={'decision-' + row.id} checked={selected.includes(row.id)} onSelect={() => toggleOne(row.id)} />
                <TableCell><div className="tp-decision__company"><strong>{row.company}</strong><Tag type={row.tier === 'Tier A' ? 'green' : row.tier === 'Tier B' ? 'blue' : 'gray'}>{row.tier} · {row.score}</Tag></div><small>{row.domain}</small></TableCell>
                <TableCell>{row.person ? <div className="tp-decision__person"><strong>{row.person}</strong><span>{row.title}</span><a href={row.linkedin} target="_blank" rel="noreferrer">LinkedIn <CarbonIcons.ArrowUpRight size={12} /></a></div> : <Tag type="gray">待穿透</Tag>}</TableCell>
                <TableCell>{row.email ? <div className="tp-decision__email"><a href={'mailto:' + row.email}>{row.email}</a>{emailTag(row.emailStatus)}</div> : <Tag type="gray">待采集</Tag>}</TableCell>
                <TableCell><Tag type="blue">{row.source}</Tag><small>AI 评分 {row.score}</small></TableCell>
                <TableCell><div className="tp-decision__status">{crmTag(row)}{row.crm === 'synced' && <small title={'CRM 关联 ID：' + row.crmId}>{row.crmId}</small>}{row.crm === 'failed' && <Button kind="ghost" size="sm" onClick={() => retryOne(row.id)}>重试</Button>}</div></TableCell>
                <TableCell><OverflowMenu ariaLabel={'企业操作：' + row.company} flipped><OverflowMenuItem itemText="单条入库 CRM" onClick={() => { setSelected([row.id]); if (row.enrichment === 'complete') retryOne(row.id); else setNotice('请先完成决策人穿透。'); }} /><OverflowMenuItem itemText="重新挖掘决策人" onClick={() => startEnrichment([row.id])} /><OverflowMenuItem itemText="复制完整名片" onClick={() => copyCard(row)} /></OverflowMenu></TableCell>
              </TableRow>)}
              {visible.length === 0 && <TableRow><TableCell colSpan={7}>没有符合当前筛选条件的记录。</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="tp-decision__footer"><span>当前主表共 {rows.length} 家企业 · 已穿透 {rows.filter(row => row.enrichment === 'complete').length} 家 · 已同步 {rows.filter(row => row.crm === 'synced').length} 家</span><Button kind="ghost" size="sm" renderIcon={CarbonIcons.ArrowUp} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>返回顶部</Button></div>
      </Tile>
    </section>
  );
}
