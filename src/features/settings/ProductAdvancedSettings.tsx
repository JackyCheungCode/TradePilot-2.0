import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Tag, TextArea, TextInput, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type SettingRow = { id: string; name: string; code: string | null; config: Record<string, unknown>; sequence: number; is_active: boolean };
type Field = { key: string; label: string; type?: 'text' | 'number' | 'textarea' | 'select' | 'boolean'; options?: Array<[string, string]>; placeholder?: string };
const yesNo: Array<[string,string]> = [['true','是'],['false','否']];
const schemas: Record<string, Field[]> = {
  templates: [
    {key:'category_code',label:'适用分类编码'}, {key:'attribute_codes',label:'属性编码（逗号分隔）'},
    {key:'required_fields',label:'必填规格字段（逗号分隔）'}, {key:'description',label:'模板说明',type:'textarea'},
    {key:'variant_template',label:'作为变体模板',type:'select',options:yesNo},
  ],
  variants: [
    {key:'sku_prefix',label:'变体 SKU 前缀'}, {key:'separator',label:'SKU 分隔符'}, {key:'sequence_width',label:'流水号位数',type:'number'},
    {key:'combination_limit',label:'最大组合数量',type:'number'}, {key:'auto_generate',label:'自动生成变体',type:'select',options:yesNo},
    {key:'allow_manual_sku',label:'允许手动指定变体 SKU',type:'select',options:yesNo},
  ],
  certifications: [
    {key:'authority',label:'认证机构'}, {key:'region',label:'适用地区'}, {key:'validity_required',label:'需要有效期',type:'select',options:yesNo},
    {key:'description',label:'认证说明',type:'textarea'},
  ],
  units: [
    {key:'symbol',label:'单位符号'}, {key:'category',label:'单位类别',type:'select',options:[['quantity','数量'],['weight','重量'],['length','长度'],['area','面积'],['volume','体积'],['time','时间']]},
    {key:'base_unit',label:'换算基准单位'}, {key:'conversion_factor',label:'换算系数',type:'number'}, {key:'precision',label:'小数精度',type:'number'},
  ],
  packaging: [
    {key:'level',label:'包装层级',type:'select',options:[['inner','内盒'],['carton','外箱'],['pallet','托盘'],['container','集装箱']]},
    {key:'parent_code',label:'上级包装编码'}, {key:'unit_code',label:'计量单位编码'}, {key:'quantity',label:'包含数量',type:'number'},
    {key:'length_unit',label:'尺寸单位'}, {key:'stackable',label:'允许堆叠',type:'select',options:yesNo},
  ],
  customs: [
    {key:'hs_code',label:'HS 编码'}, {key:'customs_name_zh',label:'中文申报品名'}, {key:'customs_name_en',label:'英文申报品名'},
    {key:'duty_rate',label:'关税率（%）',type:'number'}, {key:'vat_rate',label:'增值税率（%）',type:'number'},
    {key:'rebate_rate',label:'出口退税率（%）',type:'number'}, {key:'regulatory_conditions',label:'监管条件'},
    {key:'inspection_mark',label:'检验检疫标记'}, {key:'declaration_elements',label:'申报要素',type:'textarea'},
  ],
  sales: [
    {key:'currency',label:'默认币种'}, {key:'tax_category',label:'税务分类'}, {key:'default_moq',label:'默认 MOQ',type:'number'},
    {key:'order_multiple',label:'订购倍数',type:'number'}, {key:'lead_time_days',label:'默认交期（天）',type:'number'},
    {key:'warranty_period',label:'默认保修期'}, {key:'allow_sale',label:'允许销售',type:'select',options:yesNo},
    {key:'allow_purchase',label:'允许采购',type:'select',options:yesNo},
  ],
  files: [
    {key:'file_type',label:'文件用途',type:'select',options:[['datasheet','规格书'],['certificate','认证证书'],['test_report','检测报告'],['catalog','产品目录'],['image','产品图片'],['other','其他']]},
    {key:'extensions',label:'允许扩展名（逗号分隔）'}, {key:'max_size_mb',label:'最大文件大小（MB）',type:'number'},
    {key:'expiry_required',label:'需要有效期',type:'select',options:yesNo}, {key:'language_code',label:'语言代码'},
    {key:'language_name',label:'语言名称'}, {key:'is_default_language',label:'默认语言',type:'select',options:yesNo},
  ],
  'data-rules': [
    {key:'sku_prefix',label:'SKU 默认前缀'}, {key:'sku_pattern',label:'SKU 校验正则'},
    {key:'duplicate_strategy',label:'重复 SKU 处理',type:'select',options:[['reject','拒绝导入'],['update','按 SKU 更新'],['review','进入人工审核']]},
    {key:'require_hs_code',label:'HS 编码必填',type:'select',options:yesNo},
    {key:'require_english_name',label:'英文品名必填',type:'select',options:yesNo},
    {key:'require_dimensions',label:'尺寸信息必填',type:'select',options:yesNo},
    {key:'approval_below_minimum',label:'低于最低售价需审批',type:'select',options:yesNo},
    {key:'sku_locked_after_reference',label:'被单据引用后锁定 SKU',type:'select',options:yesNo},
  ],
};
const labels: Record<string,string> = {templates:'规格模板',variants:'产品变体规则',certifications:'认证类型',units:'计量单位与换算',packaging:'包装层级',customs:'贸易与报关',sales:'销售与采购',files:'文件与多语言','data-rules':'产品数据规则'};
const blank = (fields: Field[]) => Object.fromEntries(fields.map(f => [f.key, f.type === 'select' ? (f.options?.[0]?.[0] ?? '') : f.type === 'boolean' ? false : '']));

export function ProductAdvancedSettings({ section }: { section: string }) {
  const fields = schemas[section] ?? [];
  const [rows,setRows] = useState<SettingRow[]>([]);
  const [name,setName] = useState('');
  const [code,setCode] = useState('');
  const [config,setConfig] = useState<Record<string,unknown>>({});
  const [editing,setEditing] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const db = await getSupabaseClient();
      const result = await db.from('trade_product_setting_items').select('id,name,code,config,sequence,is_active').eq('setting_type',section).order('sequence').order('name');
      if(result.error) throw result.error;
      setRows((result.data ?? []) as SettingRow[]);
    } catch(e) { setError(e instanceof Error ? e.message : '读取配置失败'); }
    finally { setLoading(false); }
  },[section]);
  useEffect(()=>{setRows([]);setName('');setCode('');setConfig(blank(fields));setEditing(null);void load();},[section,load]);
  const filtered = useMemo(()=>rows,[rows]);
  const reset = ()=>{setName('');setCode('');setConfig(blank(fields));setEditing(null);};
  const save = async()=>{
    if(!name.trim()) return;
    setSaving(true);setError('');setNotice('');
    try{
      const db=await getSupabaseClient();const {data:auth}=await db.auth.getSession();const owner=auth.session?.user.id;
      if(!owner) throw new Error('登录状态已失效，请重新登录。');
      const payload={name:name.trim(),code:code.trim()||null,config,updated_at:new Date().toISOString()};
      const result=editing
        ? await db.from('trade_product_setting_items').update(payload).eq('id',editing).select('id,name,code,config,sequence,is_active').single()
        : await db.from('trade_product_setting_items').insert({...payload,owner_id:owner,setting_type:section,sequence:(rows.length+1)*10,is_active:true}).select('id,name,code,config,sequence,is_active').single();
      if(result.error) throw result.error;
      if(editing) setRows(current=>current.map(row=>row.id===editing?result.data as SettingRow:row));
      else setRows(current=>[...current,result.data as SettingRow]);
      reset();setNotice('配置已保存，可在产品建档时使用。');
    }catch(e){setError(e instanceof Error?e.message:'保存配置失败');}
    finally{setSaving(false);}
  };
  const edit=(row:SettingRow)=>{setEditing(row.id);setName(row.name);setCode(row.code||'');setConfig({...blank(fields),...(row.config||{})});setNotice('');};
  const toggle=async(row:SettingRow)=>{
    setError('');setNotice('');
    const db=await getSupabaseClient();const result=await db.from('trade_product_setting_items').update({is_active:!row.is_active,updated_at:new Date().toISOString()}).eq('id',row.id);
    if(result.error){setError(result.error.message);return;}
    setRows(current=>current.map(item=>item.id===row.id?{...item,is_active:!row.is_active}:item));
  };
  const display=(field:Field,value:unknown)=>field.options?.find(x=>x[0]===String(value))?.[1] ?? (value===true?'是':value===false?'否':String(value??'—'));
  return <div className="tp-settings__advanced">
    {error&&<InlineNotification kind="error" title="配置操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    {notice&&<InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
    <div className="tp-settings__editor">
      <div className="tp-settings__editor-title"><h4>{editing?'编辑':'新增'}{labels[section]||'产品设置'}</h4>{editing&&<Button kind="ghost" size="sm" onClick={reset}>取消编辑</Button>}</div>
      <div className="tp-settings__editor-grid">
        <TextInput id={'advanced-name-'+section} labelText="名称" value={name} onChange={e=>setName(e.currentTarget.value)}/>
        <TextInput id={'advanced-code-'+section} labelText="编码（建议唯一）" value={code} onChange={e=>setCode(e.currentTarget.value)}/>
        {fields.map(field=>{
          const value=config[field.key]??(field.type==='select'?(field.options?.[0]?.[0]??''):'');
          if(field.type==='textarea') return <div className="tp-settings__field--wide" key={field.key}><TextArea id={'advanced-'+section+'-'+field.key} labelText={field.label} rows={3} value={String(value)} onChange={e=>setConfig(c=>({...c,[field.key]:e.currentTarget.value}))}/></div>;
          if(field.type==='select') return <Select key={field.key} id={'advanced-'+section+'-'+field.key} labelText={field.label} value={String(value)} onChange={e=>setConfig(c=>({...c,[field.key]:e.currentTarget.value}))}>{(field.options||[]).map(([v,t])=><SelectItem key={v} value={v} text={t}/>)}</Select>;
          if(field.type==='boolean') return <Checkbox key={field.key} id={'advanced-'+section+'-'+field.key} labelText={field.label} checked={Boolean(value)} onChange={e=>setConfig(c=>({...c,[field.key]:e.currentTarget.checked}))}/>;
          return <TextInput key={field.key} id={'advanced-'+section+'-'+field.key} labelText={field.label} type={field.type==='number'?'number':'text'} value={String(value)} placeholder={field.placeholder} onChange={e=>setConfig(c=>({...c,[field.key]:e.currentTarget.value}))}/>;
        })}
        <Button kind="primary" disabled={saving||!name.trim()} onClick={()=>void save()}>{saving?'保存中…':editing?'保存修改':'新增配置'}<semanticIcons.add size={16}/></Button>
      </div>
    </div>
    <div className="tp-settings__table-wrap"><Table><TableHead><TableRow><TableHeader>名称</TableHeader><TableHeader>编码</TableHeader>{fields.slice(0,3).map(f=><TableHeader key={f.key}>{f.label}</TableHeader>)}<TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
      <TableBody>{filtered.map(row=><TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.code||'—'}</TableCell>{fields.slice(0,3).map(f=><TableCell key={f.key}>{display(f,row.config?.[f.key])}</TableCell>)}<TableCell><Tag type={row.is_active?'green':'cool-gray'}>{row.is_active?'启用':'停用'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>edit(row)}>编辑</Button><Button kind="ghost" size="sm" onClick={()=>void toggle(row)}>{row.is_active?'停用':'启用'}</Button></TableCell></TableRow>)}</TableBody>
    </Table>{!loading&&!filtered.length&&<p className="tp-settings__empty">暂无配置，请先新增。</p>}{loading&&<InlineLoading description="正在读取配置…"/>}</div>
    <p className="tp-settings__hint">配置以独立记录保存；停用不会删除历史数据。修改配置仅影响后续新建或更新的产品，不自动覆盖已有产品和历史单据快照。</p>
  </div>;
}
