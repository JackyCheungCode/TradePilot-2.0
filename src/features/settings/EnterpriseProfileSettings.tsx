import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, TextInput, TextArea, Tag,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Address = { country: string; city: string; street: string };
type EnterpriseProfile = {
  id?: string;
  legal_name: string;
  [key: string]: unknown;
};
type BankAccount = {
  id: string; bank_name: string; bank_branch: string | null; account_name: string;
  account_number: string; iban: string | null; swift_bic: string | null;
  currency_code: string | null; country_code: string | null; is_default: boolean;
  is_active: boolean;
};
type Field = { key: string; label: string; type?: 'textarea'; hint?: string };

const profileFields: Array<{ title: string; description: string; fields: Field[] }> = [
  { title: '法定身份与注册信息', description: '用于合同、报价单、商业发票及出口申报的企业法定身份。', fields: [
    { key: 'legal_name', label: '企业法定名称 *' }, { key: 'trade_name', label: '商业名称 / 对外名称' },
    { key: 'short_name', label: '企业简称' }, { key: 'former_names', label: '曾用名（多个名称用逗号分隔）' },
    { key: 'legal_form', label: '企业法律形式' }, { key: 'registration_country', label: '注册国家 / 地区' },
    { key: 'registration_number', label: '企业注册号' }, { key: 'registration_authority', label: '注册机关' },
    { key: 'established_on', label: '成立日期' }, { key: 'business_status', label: '企业状态' },
    { key: 'tax_number', label: '税务登记号 / TIN' }, { key: 'vat_number', label: 'VAT 税号' },
    { key: 'eori_number', label: 'EORI 编号' }, { key: 'duns_number', label: 'D-U-N-S 编号' },
    { key: 'lei_number', label: 'LEI 法人机构识别编码' }, { key: 'export_license_number', label: '进出口经营 / 出口许可证号' },
    { key: 'customs_registration_number', label: '海关注册编码' },
  ] },
  { title: '办公地址与联系信息', description: '注册地址、总部地址和通信地址分开维护；生成单据时可按用途选取。', fields: [
    { key: 'registered_address.country', label: '注册地址 · 国家 / 地区' },
    { key: 'registered_address.city', label: '注册地址 · 城市' },
    { key: 'registered_address.street', label: '注册地址 · 街道及门牌' },
    { key: 'headquarters_address.country', label: '总部地址 · 国家 / 地区' },
    { key: 'headquarters_address.city', label: '总部地址 · 城市' },
    { key: 'headquarters_address.street', label: '总部地址 · 街道及门牌' },
    { key: 'mailing_address.country', label: '通信地址 · 国家 / 地区' },
    { key: 'mailing_address.city', label: '通信地址 · 城市' },
    { key: 'mailing_address.street', label: '通信地址 · 街道及门牌' },
    { key: 'website', label: '官方网站' }, { key: 'email', label: '企业邮箱' },
    { key: 'phone', label: '企业电话（含国际区号）' }, { key: 'fax', label: '传真' },
    { key: 'contact_name', label: '单据默认联系人' }, { key: 'contact_title', label: '联系人职位' },
  ] },
  { title: '经营与组织信息', description: '用于企业主数据、客户沟通、销售组织和内部业务归属。', fields: [
    { key: 'country_code', label: '企业所在国家 / 地区代码' }, { key: 'industry', label: '所属行业' }, { key: 'business_scope', label: '经营范围', type: 'textarea' },
    { key: 'company_size', label: '企业规模' }, { key: 'employee_count', label: '员工人数' },
    { key: 'annual_revenue', label: '年营业额' }, { key: 'registered_capital', label: '注册资本' },
    { key: 'parent_company', label: '母公司 / 集团名称' }, { key: 'stock_exchange', label: '上市交易所 / 股票代码' },
    { key: 'sales_organization', label: '销售组织' }, { key: 'distribution_channel', label: '分销渠道' },
    { key: 'division', label: '产品事业部' }, { key: 'purchasing_organization', label: '采购组织' },
    { key: 'company_code', label: '企业内部编码' }, { key: 'branch_code', label: '分支机构编码' },
    { key: 'fiscal_year_end', label: '财年截止日（如 12-31）' },
  ] },
  { title: '单据默认信息与品牌', description: '用于报价单、销售订单、形式发票、商业发票和装箱单的卖方抬头及默认商业条件。', fields: [
    { key: 'default_currency', label: '企业本位币 / 默认币种' },
    { key: 'default_payment_terms', label: '默认付款条款' }, { key: 'default_incoterms', label: '默认贸易术语' },
    { key: 'logo_url', label: '企业 Logo 地址' }, { key: 'notes', label: '企业备注', type: 'textarea' },
  ] },
];

const profileSelect = 'id,legal_name,trade_name,short_name,former_names,legal_form,company_code,registration_number,tax_number,vat_number,eori_number,duns_number,lei_number,country_code,registration_country,registration_authority,established_on,business_status,industry,business_scope,website,email,phone,fax,registered_address,headquarters_address,mailing_address,contact_name,contact_title,default_currency,default_payment_terms,default_incoterms,logo_url,company_size,employee_count,annual_revenue,export_license_number,customs_registration_number,notes,custom_fields,is_default,company_code,sales_organization,distribution_channel,division,purchasing_organization,parent_company,registered_capital,stock_exchange,fiscal_year_end,parent_enterprise_id,branch_code,is_branch';

const blankAddress: Address = { country: '', city: '', street: '' };
const blankProfile = (): EnterpriseProfile => ({
  legal_name: '', trade_name: '', short_name: '', former_names: [], legal_form: '',
  registration_number: '', tax_number: '', vat_number: '', eori_number: '', duns_number: '', lei_number: '',
  country_code: '', registration_country: '', registration_authority: '', established_on: '', business_status: '',
  industry: '', business_scope: '', website: '', email: '', phone: '', fax: '',
  registered_address: { ...blankAddress }, headquarters_address: { ...blankAddress }, mailing_address: { ...blankAddress },
  contact_name: '', contact_title: '', default_currency: 'USD', default_payment_terms: '', default_incoterms: '',
  logo_url: '', company_size: '', employee_count: '', annual_revenue: '', export_license_number: '',
  customs_registration_number: '', notes: '', company_code: '', sales_organization: '', distribution_channel: '',
  division: '', purchasing_organization: '', parent_company: '', registered_capital: '', stock_exchange: '',
  fiscal_year_end: '', branch_code: '', is_branch: false,
});

const bankBlank = { bank_name: '', bank_branch: '', account_name: '', account_number: '', swift_bic: '', iban: '', currency_code: 'USD', country_code: '' };

export function EnterpriseProfileSettings() {
  const [ownerId, setOwnerId] = useState('');
  const [profile, setProfile] = useState<EnterpriseProfile>(blankProfile());
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankForm, setBankForm] = useState(bankBlank);
  const [profileId, setProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const db = await getSupabaseClient();
      const { data: session, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = session.session?.user.id;
      if (!userId) throw new Error('登录状态已失效，请重新登录。');
      setOwnerId(userId);
      const { data, error: profileError } = await db.from('enterprise_profiles').select(profileSelect)
        .eq('owner_id', userId).eq('is_default', true).eq('is_archived', false).maybeSingle();
      if (profileError) throw profileError;
      const next = data ? data as EnterpriseProfile : blankProfile();
      setProfile(next);
      setProfileId(String(data?.id || ''));
      if (data?.id) {
        const { data: bankRows, error: bankError } = await db.from('enterprise_bank_accounts')
          .select('id,bank_name,bank_branch,account_name,account_number,iban,swift_bic,currency_code,country_code,is_default,is_active')
          .eq('owner_id', userId).eq('enterprise_id', data.id).eq('is_archived', false).order('is_default', { ascending: false });
        if (bankError) throw bankError;
        setBanks((bankRows || []) as BankAccount[]);
      } else setBanks([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取企业档案失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setField = (key: string, value: string) => {
    if (key.includes('.')) {
      const [group, child] = key.split('.');
      setProfile(current => ({ ...current, [group]: { ...((current[group] as Address) || blankAddress), [child]: value } }));
    } else setProfile(current => ({ ...current, [key]: value }));
  };

  const getField = (key: string) => {
    if (key.includes('.')) {
      const [group, child] = key.split('.');
      return String(((profile[group] as Address) || blankAddress)[child as keyof Address] || '');
    }
    const value = profile[key];
    return Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value);
  };

  const saveProfile = async () => {
    if (!String(profile.legal_name || '').trim()) { setError('企业法定名称为必填项。'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const payload = {
        ...profile, owner_id: ownerId, legal_name: String(profile.legal_name).trim(),
        former_names: String(getField('former_names')).split(',').map(x => x.trim()).filter(Boolean),
        established_on: profile.established_on ? String(profile.established_on) : null,
        employee_count: profile.employee_count === '' ? null : Number(profile.employee_count),
        annual_revenue: profile.annual_revenue === '' ? null : Number(profile.annual_revenue),
        registered_capital: profile.registered_capital === '' ? null : Number(profile.registered_capital),
        is_default: true,
      };
      delete (payload as Record<string, unknown>).id;
      const result = profileId
        ? await db.from('enterprise_profiles').update(payload).eq('id', profileId).eq('owner_id', ownerId).select('id').single()
        : await db.from('enterprise_profiles').insert(payload).select('id').single();
      if (result.error) throw result.error;
      setProfileId(result.data.id);
      setNotice('企业档案已保存。新建单据可读取最新企业资料；已生成单据应保留创建时的卖方信息快照。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存企业档案失败'); }
    finally { setSaving(false); }
  };

  const addBank = async () => {
    if (!profileId) { setError('请先保存企业基本资料，再添加收款银行账户。'); return; }
    if (!bankForm.bank_name.trim() || !bankForm.account_name.trim() || !bankForm.account_number.trim()) {
      setError('银行名称、账户名称和账号为必填项。'); return;
    }
    setSavingBank(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data, error: insertError } = await db.from('enterprise_bank_accounts').insert({
        ...bankForm, owner_id: ownerId, enterprise_id: profileId, bank_branch: bankForm.bank_branch || null,
        swift_bic: bankForm.swift_bic || null, iban: bankForm.iban || null, country_code: bankForm.country_code || null,
        currency_code: bankForm.currency_code || null, bank_address: {}, intermediary_bank: {},
        is_default: banks.length === 0, is_active: true,
      }).select('id,bank_name,bank_branch,account_name,account_number,iban,swift_bic,currency_code,country_code,is_default,is_active').single();
      if (insertError) throw insertError;
      setBanks(current => [...current, data as BankAccount]);
      setBankForm(bankBlank);
      setNotice('收款银行账户已添加。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '添加银行账户失败'); }
    finally { setSavingBank(false); }
  };

  const makeDefaultBank = async (bank: BankAccount) => {
    setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { error: clearError } = await db.from('enterprise_bank_accounts').update({ is_default: false }).eq('owner_id', ownerId).eq('enterprise_id', profileId);
      if (clearError) throw clearError;
      const { error: setErrorResult } = await db.from('enterprise_bank_accounts').update({ is_default: true }).eq('id', bank.id).eq('owner_id', ownerId);
      if (setErrorResult) throw setErrorResult;
      setBanks(current => current.map(row => ({ ...row, is_default: row.id === bank.id })));
      setNotice('默认收款账户已更新。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '更新默认银行账户失败'); }
  };

  if (loading) return <PageSkeleton variant="form" />;
  return (
    <div className="tp-settings__advanced tp-enterprise-profile">
      <div className="tp-enterprise-profile__intro">
        <div><h3>企业主档</h3><p>维护本企业的统一法定身份、地址、联系资料和单据抬头。资料仅属于当前登录企业，不会与 CRM 客户档案混用。</p></div>
        <Tag type={profileId ? 'green' : 'cool-gray'}>{profileId ? '已建立企业档案' : '待完善'}</Tag>
      </div>
      {error && <InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      {loading ? <InlineLoading description="正在读取企业档案…" /> : (
        <>
          {profileFields.map(group => (
            <section className="tp-enterprise-profile__group" key={group.title}>
              <div className="tp-enterprise-profile__group-head"><h4>{group.title}</h4><p>{group.description}</p></div>
              <div className="tp-enterprise-profile__grid">
                {group.fields.map(field => (
                  <div className={field.type === 'textarea' ? 'tp-enterprise-profile__field tp-enterprise-profile__field--wide' : 'tp-enterprise-profile__field'} key={field.key}>
                    {field.type === 'textarea'
                      ? <TextArea id={`enterprise-${field.key.replaceAll('.', '-')}`} labelText={field.label} rows={3} value={getField(field.key)} onChange={event => setField(field.key, event.currentTarget.value)} />
                      : <TextInput id={`enterprise-${field.key.replaceAll('.', '-')}`} labelText={field.label} value={getField(field.key)} onChange={event => setField(field.key, event.currentTarget.value)} />}
                    {field.hint && <p className="tp-settings__hint">{field.hint}</p>}
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="tp-enterprise-profile__actions">
            <p className="tp-settings__hint">企业资料修改不会追溯覆盖已签发的单据。单据创建时应保存卖方资料快照，避免后续修改企业资料影响历史凭证。</p>
            <Button kind="primary" disabled={saving} onClick={() => void saveProfile()}>{saving ? '正在保存…' : '保存企业档案'}</Button>
          </div>

          <section className="tp-enterprise-profile__group">
            <div className="tp-enterprise-profile__group-head"><h4>收款银行账户</h4><p>银行账户与企业主档关联。可供报价单付款说明、形式发票和商业发票选择收款账户。</p></div>
            {banks.length > 0 ? <Table>
              <TableHead><TableRow><TableHeader>银行</TableHeader><TableHeader>账户名称</TableHeader><TableHeader>账号</TableHeader><TableHeader>币种</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
              <TableBody>{banks.map(bank => <TableRow key={bank.id}>
                <TableCell>{bank.bank_name}{bank.bank_branch ? ` · ${bank.bank_branch}` : ''}</TableCell>
                <TableCell>{bank.account_name}</TableCell>
                <TableCell>{bank.account_number.length > 8 ? `${bank.account_number.slice(0, 4)}••••${bank.account_number.slice(-4)}` : '••••'}</TableCell>
                <TableCell>{bank.currency_code || '—'}</TableCell>
                <TableCell>{bank.is_default ? <Tag type="green">默认账户</Tag> : <Tag type="cool-gray">备用账户</Tag>}</TableCell>
                <TableCell>{!bank.is_default && <Button kind="ghost" size="sm" onClick={() => void makeDefaultBank(bank)}>设为默认</Button>}</TableCell>
              </TableRow>)}</TableBody>
            </Table> : <p className="tp-settings__empty">尚未配置收款银行账户。</p>}
            <div className="tp-enterprise-profile__bank-form">
              <TextInput id="enterprise-bank-name" labelText="银行名称 *" value={bankForm.bank_name} onChange={event => setBankForm(current => ({ ...current, bank_name: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-branch" labelText="开户分行" value={bankForm.bank_branch} onChange={event => setBankForm(current => ({ ...current, bank_branch: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-account-name" labelText="账户名称 *" value={bankForm.account_name} onChange={event => setBankForm(current => ({ ...current, account_name: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-account-number" labelText="银行账号 *" value={bankForm.account_number} onChange={event => setBankForm(current => ({ ...current, account_number: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-swift" labelText="SWIFT / BIC" value={bankForm.swift_bic} onChange={event => setBankForm(current => ({ ...current, swift_bic: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-iban" labelText="IBAN" value={bankForm.iban} onChange={event => setBankForm(current => ({ ...current, iban: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-currency" labelText="账户币种" value={bankForm.currency_code} onChange={event => setBankForm(current => ({ ...current, currency_code: event.currentTarget.value }))} />
              <TextInput id="enterprise-bank-country" labelText="开户国家 / 地区代码" value={bankForm.country_code} onChange={event => setBankForm(current => ({ ...current, country_code: event.currentTarget.value }))} />
              <Button kind="primary" disabled={savingBank || !profileId} onClick={() => void addBank()}>{savingBank ? '正在添加…' : '添加银行账户'}</Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
