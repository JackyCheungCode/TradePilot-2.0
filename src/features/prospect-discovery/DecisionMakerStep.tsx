import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, CodeSnippet, InlineNotification, Pagination, ProgressBar, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow, TableSelectAll, TableSelectRow,
  TableToolbar, TableToolbarContent, TableToolbarSearch, Link, Tag, Tile, semanticIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type ContactRow = {
  id: string; company: string; domain: string; country: string; source: string;
  person: string; title: string; linkedin: string; email: string; phone: string; whatsapp: string;
  emailStatus: 'valid' | 'pending' | 'unknown'; enrichment: 'pending' | 'complete';
  crm: 'not-synced' | 'synced' | 'failed'; crmId?: string; candidateKeys: string[];
  candidateCount: number; contacts: Array<{ key: string; name: string; title: string; email: string; phone: string; linkedin: string; whatsapp: string }>;
};
type Candidate = Record<string, unknown>;
type ApiPayload = { data?: unknown; error?: { message?: string }; message?: string };

const candidateKey = (candidate: Candidate) => String(candidate.provider ?? '') + '：' + String(candidate.provider_person_id ?? candidate.email ?? candidate.linkedin_url ?? candidate.full_name ?? '');
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

async function tokenOrThrow() {
  const db = await getSupabaseClient();
  const { data } = await db.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  return data.session.access_token;
}
async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => ({})) as ApiPayload;
  if (!response.ok) throw new Error((payload.error?.message || payload.message || '请求失败（HTTP ' + response.status + '）').replace(/Apify/gi, '外部数据采集服务'));
  return payload.data ?? payload;
}
function mapRecord(record: Record<string, unknown>): ContactRow {
  const raw = asObject(record.raw_data);
  const enrichment = asObject(raw.contact_enrichment);
  const intelligence = asObject(raw.contact_intelligence);
  const candidates = Array.isArray(intelligence.candidates) ? intelligence.candidates as Candidate[] : [];
  const candidate = candidates[0] ?? {};
  const social = asObject(enrichment.social);
  const occurrences = Array.isArray(record.discovery_record_occurrences) ? record.discovery_record_occurrences as Array<Record<string, unknown>> : [];
  const website = String(record.website ?? '');
  let domain = website;
  try { domain = website ? new URL(website).hostname.replace(/^www\\./i, '') : ''; } catch { /* Keep the source value for inspection. */ }
  const emails = asStrings(enrichment.emails);
  const phones = asStrings(enrichment.phones);
  const email = String(candidate.email ?? emails[0] ?? '');
  const person = String(candidate.full_name ?? '');
  const isEnriched = Boolean(raw.contact_enrichment || raw.contact_intelligence);
  const contacts = candidates.map(item => ({ key: candidateKey(item), name: String(item.full_name ?? ''), title: String(item.job_title ?? ''), email: String(item.email ?? ''), phone: String(item.phone ?? item.mobile ?? ''), linkedin: String(item.linkedin_url ?? ''), whatsapp: String(item.whatsapp ?? '') }));
  return {
    id: String(record.id), company: String(record.name ?? '未命名企业'), domain,
    country: String(record.country_code ?? ''), source: String(occurrences[0]?.provider ?? record.channel ?? ''),
    person, title: String(candidate.job_title ?? ''), linkedin: String(candidate.linkedin_url ?? asStrings(social.linkedin)[0] ?? ''),
    email, phone: String(candidate.phone ?? phones[0] ?? ''),
    whatsapp: String(candidate.whatsapp ?? asStrings(social.whatsapp)[0] ?? ''),
    emailStatus: email ? 'unknown' : 'pending', enrichment: isEnriched ? 'complete' : 'pending',
    crm: raw.lifecycle_stage === 'converted' || Boolean(record.lead_id) ? 'synced' : 'not-synced',
    crmId: String(asObject(raw.contact_intelligence).crm_account_id ?? '') || undefined,
    candidateKeys: candidates.map(candidateKey).filter(Boolean), candidateCount: candidates.length, contacts,
  };
}

type DecisionMakerTelemetry = { total: number; enriched: number; synced: number; running: boolean; progress: number };

export function DecisionMakerStep({ onTelemetry }: { onTelemetry?: (snapshot: DecisionMakerTelemetry) => void }) {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [providers, setProviders] = useState<string[]>(['website']);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState('');
  const [progress, setProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState('');
  const [log, setLog] = useState('[SYSTEM] 联系人穿透工作台已就绪。\n[CONTEXT] 等待加载已审核的真实潜客记录。');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queueSignature = (() => {
    try {
      const queue = JSON.parse(localStorage.getItem('tradepilot.prospect-discovery.crm-queue.v1') || '[]') as Array<{ id?: string }>;
      const ids = queue.map(item => String(item.id ?? '')).filter(Boolean).sort();
      let hash = 2166136261;
      for (const char of ids.join('|')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      return ids.length + '-' + (hash >>> 0).toString(36);
    } catch { return 'unavailable'; }
  })();
  const jobStorageKey = 'tradepilot.prospect-discovery.contact-enrichment-job.' + queueSignature;

  useEffect(() => {
    setJobId(''); setRunning(false); setProgress(0);
    try {
      const savedJobId = localStorage.getItem(jobStorageKey);
      if (savedJobId) {
        setJobId(savedJobId);
        setRunning(true);
        setJobMessage('正在恢复联系人补全任务状态…');
        setLog('[SYSTEM] 已恢复联系人补全任务引用，正在同步后端状态。');
      }
    } catch { /* The persisted backend job remains available even if browser storage is unavailable. */ }
  }, [jobStorageKey]);

  const loadRecords = async () => {
    const queue = JSON.parse(localStorage.getItem('tradepilot.prospect-discovery.crm-queue.v1') || '[]') as Array<{ id?: string }>;
    const ids = queue.map(item => item.id).filter((id): id is string => Boolean(id));
    if (!ids.length) { setRows([]); setSelected([]); return; }
    const token = await tokenOrThrow();
    const records = await api('/api/v1/discovery-records?limit=500', token) as Array<Record<string, unknown>>;
    const mapped = records.filter(record => ids.includes(String(record.id))).map(mapRecord);
    setRows(mapped);
    setSelected(mapped.filter(row => row.enrichment === 'complete' && row.candidateCount > 0).map(row => row.id));
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try { await loadRecords(); }
      catch (error) { if (active) setNotice(error instanceof Error ? error.message : '读取潜客记录失败'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!running || !jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const token = await tokenOrThrow();
        const job = await api('/api/v1/discovery-contact-enrichments/' + jobId, token) as {
          status: string; progress: number; completedCount: number; failedCount: number; message: string;
        };
        if (!active) return;
        setProgress(Number(job.progress) || 0);
        setJobMessage(job.message || job.status);
        setLog(current => current + '\n[' + new Date().toLocaleTimeString('en-GB') + '] ' + (job.message || job.status));
        if (['completed', 'partial', 'failed', 'cancelled', 'timed_out'].includes(job.status)) {
          setRunning(false);
          try { localStorage.removeItem(jobStorageKey); } catch { /* Keep the completed backend job untouched. */ }
          await loadRecords();
          setNotice('联系人采集任务已结束：完成 ' + job.completedCount + ' 条，失败 ' + job.failedCount + ' 条。');
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : '读取联系人采集状态失败');
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [running, jobId]);

  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    return !term || row.company.toLowerCase().includes(term) || row.person.toLowerCase().includes(term) || row.email.toLowerCase().includes(term);
  }), [rows, search]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const enrichedCount = rows.filter(row => row.enrichment === 'complete').length;
  const candidateCount = rows.reduce((sum, row) => sum + row.candidateCount, 0);
  const toggleOne = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const toggleAll = () => setSelected(current => visible.length > 0 && visible.every(row => current.includes(row.id))
    ? current.filter(id => !visible.some(row => row.id === id))
    : [...new Set([...current, ...visible.map(row => row.id)])]);

  const startEnrichment = async () => {
    const target = selected.length ? selectedRows : rows;
    if (!target.length || running) return;
    if (target.length > 50) { setNotice('现有联系人补全接口每批最多处理 50 家企业，请分批选择。'); return; }
    setRunning(true); setProgress(0); setNotice(''); setSelectedCandidateKeys({});
    setLog('[SYSTEM] 正在创建真实联系人补全任务…\n[TARGET] ' + target.length + ' 家企业');
    try {
      const token = await tokenOrThrow();
      const result = await api('/api/v1/discovery-contact-enrichments', token, {
        method: 'POST', body: JSON.stringify({ recordIds: target.map(row => row.id), providers }),
      }) as { id: string; status: string; message?: string };
      if (!result.id) throw new Error('服务端未返回联系人补全任务 ID');
      setJobId(result.id); setJobMessage(result.message ?? '联系人补全任务已排队');
      try { localStorage.setItem(jobStorageKey, result.id); } catch { setNotice('任务已创建，但浏览器无法保存任务引用；请勿关闭页面，任务仍在后端运行。'); }
      setLog(current => current + '\n[TASK CREATED] ' + result.id);
    } catch (error) {
      setRunning(false);
      setNotice(error instanceof Error ? error.message : '联系人补全任务启动失败');
    }
  };

  const syncSelected = async () => {
    const candidates = selectedRows.map(row => ({ ...row, candidateKeys: selectedCandidateKeys[row.id] ?? [] })).filter(row => row.enrichment === 'complete' && row.candidateKeys.length > 0);
    if (!candidates.length) { setNotice('所选企业尚无可转换的真实联系人候选。请先执行联系人穿透。'); return; }
    try {
      setNotice('正在逐家企业提交已勾选的联系人，成功与失败结果将分别保留。');
      const token = await tokenOrThrow();
    const results = await Promise.all(candidates.map(async row => {
      try {
        const result = await api('/api/v1/discovery-contact-candidates/convert', token, {
          method: 'POST', body: JSON.stringify({ recordId: row.id, candidateKeys: row.candidateKeys }),
        }) as { leadId?: string; accountId?: string; accountName?: string; createdContacts?: number; linkedContacts?: number };
        return { id: row.id, ok: true, crmId: result.accountId ?? result.leadId ?? '' };
      } catch (error) {
        return { id: row.id, ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }));
    setRows(current => current.map(row => {
      const result = results.find(item => item.id === row.id);
      return result ? { ...row, crm: result.ok ? 'synced' : 'failed', crmId: result.ok ? result.crmId : undefined } : row;
    }));
    const success = results.filter(item => item.ok).length;
    const failed = results.length - success;
    setNotice('CRM 转换完成：成功 ' + success + ' 家，失败 ' + failed + ' 家。失败原因已写入下方日志。');
    setLog(current => current + results.filter(item => !item.ok).map(item => '\n[CRM FAILED] ' + item.id + ' · ' + item.message).join(''));
      setSelected([]);
      setSelectedCandidateKeys(current => { const next = { ...current }; results.filter(item => item.ok).forEach(item => { delete next[item.id]; }); return next; });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'CRM 转换失败');
    }
  };

  const selectedCandidateCount = selectedRows.reduce((sum, row) => sum + (selectedCandidateKeys[row.id] ?? []).length, 0);
  const syncedCount = rows.filter(row => row.crm === 'synced').length;
  useEffect(() => { onTelemetry?.({ total: rows.length, enriched: enrichedCount, synced: syncedCount, running, progress }); }, [rows.length, enrichedCount, syncedCount, running, progress, onTelemetry]);
  const allReady = rows.some(row => row.enrichment === 'complete' && row.candidateCount > 0);
  const emailTag = (row: ContactRow) => row.email
    ? <Tag type={row.emailStatus === 'valid' ? 'green' : 'warm-gray'}>{row.emailStatus === 'valid' ? '已验证' : '待核验'}</Tag>
    : <Tag type="gray">待采集</Tag>;
  const crmTag = (row: ContactRow) => row.crm === 'synced'
    ? <Tag type="green">已同步至 CRM</Tag>
    : row.crm === 'failed' ? <Tag type="red">转换失败</Tag>
      : row.candidateCount > 0 ? <Tag type="blue">待人工确认</Tag> : row.enrichment === 'complete' ? <Tag type="warm-gray">未发现候选</Tag> : <Tag type="gray">待穿透</Tag>;

  return (
    <section className="tp-prospect-discovery__step tp-decision">
      {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      {loading && <InlineNotification kind="info" lowContrast title="正在读取真实潜客记录" subtitle="读取第四步已交接的企业。" />}

      <Tile className="tp-decision__preferences">
        <div className="tp-decision__preferences-heading"><div><h3>联系方式采集配置</h3><p>仅调用已配置的现有补全服务；当前批次最多 50 家企业</p></div><Tag type="blue">已选 {selected.length} 家</Tag></div>
        <div className="tp-decision__preference-grid">
          <fieldset className="tp-decision__role-group">
            <legend>补全数据源</legend>
            {[
              { id: 'website', label: '企业官网公开信息' },
              { id: 'apollo', label: 'Apollo（需配置服务凭证）' },
              { id: 'zoominfo', label: 'ZoomInfo（需配置服务凭证）' },
            ].map(item => <Checkbox key={item.id} id={'tp-contact-provider-' + item.id} labelText={item.label} checked={providers.includes(item.id)} onChange={() => setProviders(current => current.includes(item.id) ? current.filter(value => value !== item.id) : [...current, item.id])} />)}
          </fieldset>
          <div className="tp-decision__email-policy"><span className="tp-decision__field-label">数据使用规则</span><p>联系人候选来自后端补全工作流；姓名、职位、邮箱和社交资料保留来源与核验信息。CRM 写入必须由你勾选确认。</p></div>
        </div>
        <div className="tp-decision__actions">
          <Button kind="primary" renderIcon={semanticIcons.locateSearch} disabled={running || loading || !rows.length || !providers.length} onClick={startEnrichment}>{running ? '正在穿透组织架构…' : '开始执行联系人穿透'}</Button>
          <Button kind="tertiary" renderIcon={semanticIcons.cloudUpload} disabled={!selected.length || !allReady || selectedCandidateCount === 0 || running} onClick={syncSelected}>确认所选联系人并同步至 CRM</Button>
          <span>先执行补全，再人工确认联系人候选</span>
        </div>
      </Tile>

      <Tile className="tp-decision__runtime">
        <div className="tp-decision__runtime-heading"><div><h3>穿透执行状态</h3><p>真实任务状态、完成数量与服务端返回信息</p></div><Tag type={running ? 'blue' : allReady ? 'green' : 'gray'}>{running ? '正在执行' : allReady ? '已获取联系人候选' : '等待执行'}</Tag></div>
        <div className="tp-decision__progress-meta"><span>已补全企业（{enrichedCount} / {rows.length}）</span><strong>发现联系人候选：{candidateCount} 位</strong></div>
        <ProgressBar label="联系人补全进度" value={progress} max={100} helperText={jobMessage || (progress + '%')} />
        <CodeSnippet type="multi" feedback="复制日志" className="tp-decision__console">{log}</CodeSnippet>
      </Tile>

      <Tile className="tp-decision__table-panel">
        <div className="tp-decision__table-heading"><div><h3>企业与决策人主表</h3><p>真实企业记录、联系人候选及 CRM 转换状态</p></div><Tag type="blue">{filtered.length} 条记录</Tag></div>
        <div className="tp-decision__table-toolbar">
          <TableToolbar><TableToolbarContent><TableToolbarSearch persistent value={search} onChange={(_event, value) => { setSearch(value ?? ''); setPage(1); }} placeholder="搜索公司、决策人或邮箱" /></TableToolbarContent></TableToolbar>
        </div>
        <div className="tp-decision__table-scroll">
          <Table size="lg" useZebraStyles={false}>
            <TableHead><TableRow>
              <TableSelectAll id="decision-select-all" name="decision-select-all" checked={visible.length > 0 && visible.every(row => selected.includes(row.id))} indeterminate={visible.some(row => selected.includes(row.id)) && !visible.every(row => selected.includes(row.id))} onSelect={toggleAll} />
              {['目标企业 / 来源','核心决策人 / 职位','商务邮箱 / 电话','社交账号','穿透 / CRM 状态'].map(label => <TableHeader key={label}>{label}</TableHeader>)}
            </TableRow></TableHead>
            <TableBody>
              {visible.map(row => <TableRow key={row.id}>
                <TableSelectRow id={'decision-' + row.id} name={'decision-' + row.id} checked={selected.includes(row.id)} onSelect={() => toggleOne(row.id)} />
                <TableCell><div className="tp-decision__company"><strong>{row.company}</strong><Tag type="blue">{row.source || row.country}</Tag></div><small>{row.domain || '暂无官网'}</small></TableCell>
                <TableCell>{row.contacts.length ? <div className="tp-decision__person">{row.contacts.map((contact, index) => <div key={contact.key || index}><Checkbox id={'tp-contact-candidate-' + row.id + '-' + index} labelText={contact.name || '姓名待核验'} checked={(selectedCandidateKeys[row.id] ?? []).includes(contact.key)} onChange={event => { const checked = event.currentTarget.checked; setSelectedCandidateKeys(current => ({ ...current, [row.id]: checked ? [...new Set([...(current[row.id] ?? []), contact.key])] : (current[row.id] ?? []).filter(key => key !== contact.key) })); setSelected(current => checked ? [...new Set([...current, row.id])] : current); }} /><span>{contact.title || '职位待核验'}</span>{contact.email && <small>{contact.email}</small>}</div>)}</div> : row.person ? <div className="tp-decision__person"><strong>{row.person}</strong><span>{row.title || '职位待核验'}</span></div> : <Tag type="gray">暂无候选</Tag>}</TableCell>
                <TableCell><div className="tp-decision__email">{row.email ? <Link href={'mailto:' + row.email}>{row.email}</Link> : <Tag type="gray">待采集</Tag>}{emailTag(row)}{row.phone && <small>{row.phone}</small>}{row.whatsapp && <small>WhatsApp：{row.whatsapp}</small>}</div></TableCell>
                <TableCell>{row.linkedin ? <Link href={row.linkedin} target="_blank" rel="noreferrer">LinkedIn <semanticIcons.externalLink size={12} /></Link> : <Tag type="gray">暂无公开账号</Tag>}</TableCell>
                <TableCell><div className="tp-decision__status">{crmTag(row)}{row.crmId && <small>{row.crmId}</small>}</div></TableCell>
              </TableRow>)}
              {visible.length === 0 && <TableRow><TableCell colSpan={6}>{loading ? '正在加载…' : '没有可显示的真实企业记录。'}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="tp-decision__pagination"><Pagination id="tp-decision-pagination" page={page} pageSize={pageSize} pageSizes={[10, 20, 50]} totalItems={filtered.length} onChange={({ page: nextPage, pageSize: nextSize }) => { setPage(nextPage); setPageSize(nextSize); }} /></div>
        <div className="tp-decision__footer"><span>当前 {rows.length} 家企业 · 已补全 {enrichedCount} 家 · 联系人候选 {candidateCount} 位 · 已同步 {rows.filter(row => row.crm === 'synced').length} 家</span><Button kind="ghost" size="sm" renderIcon={semanticIcons.arrowUp} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>返回顶部</Button></div>
      </Tile>
    </section>
  );
}
