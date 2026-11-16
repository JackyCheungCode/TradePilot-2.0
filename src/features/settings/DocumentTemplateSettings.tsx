import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput, TextArea } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type TemplateRow = { id: string; name: string; document_type: string; locale: string; description: string; is_default: boolean; is_active: boolean; template_config: Record<string, unknown> };
const types = [
  ['quotation','报价单'],['request_for_quotation','采购询价单'],['proforma_invoice','形式发票（PI）'],['sales_contract','销售合同'],['sales_confirmation','销售订单确认书'],['purchase_order','采购订单（PO）'],['purchase_confirmation','采购订单确认书'],['tax_invoice','税务发票'],['credit_note','贷项通知单'],['debit_note','借项通知单'],['commercial_invoice','商业发票'],['packing_list','装箱单'],['shipping_instructions','装运指示'],['shipper_letter_instruction','托运人指示书'],['vgm_declaration','VGM 声明'],['packing_declaration','包装声明'],['origin_declaration','原产地声明'],['origin_certificate_application','原产地证申请资料'],['non_asbestos_declaration','非石棉声明'],['bill_of_exchange','汇票'],
] as const;
const locales = [{value:'en',text:'English'},{value:'zh-CN',text:'简体中文'},{value:'zh-TW',text:'繁體中文'},{value:'en-zh',text:'中英双语'},{value:'es',text:'Español'},{value:'fr',text:'Français'},{value:'de',text:'Deutsch'}];
const defaultConfig = { pageSize:'A4', orientation:'portrait', showLogo:true, showPrices:true, showBankDetails:true, showHsCode:true, showOrigin:true, showNotes:true, headerText:'', footerText:'' };
const asConfig = (value: unknown) => ({ ...defaultConfig, ...(value && typeof value === 'object' ? value as Record<string, unknown> : {}) });

export function DocumentTemplateSettings() {
  const [rows,setRows]=useState<TemplateRow[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [draft,setDraft]=useState<TemplateRow|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const request=useCallback(async(path:string,init?:RequestInit)=>{
    const db=await getSupabaseClient();const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)throw new Error('登录状态已失效，请重新登录。');
    const response=await fetch('/api/v1/trade/'+path,{...init,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,...(init?.headers??{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.error?.message??payload?.message??'模板服务请求失败。');
    return payload?.data??payload?.result??payload;
  },[]);
  const load=useCallback(async(preferredId?:string)=>{
    setLoading(true);setError('');
    try{
      const data=await request('templates');
      const next=(Array.isArray(data)?data:[]) as TemplateRow[];setRows(next);
      const active=next.find(row=>row.id===preferredId)??next[0];
      setSelectedId(active?.id??'');setDraft(active?{...active,template_config:asConfig(active.template_config)}:null);
    }catch(cause){setError(cause instanceof Error?cause.message:'读取模板失败。');}
    finally{setLoading(false);}
  },[request]);
  useEffect(()=>{void load();},[load]);
  const update=(patch:Partial<TemplateRow>)=>setDraft(current=>current?{...current,...patch}:current);
  const updateConfig=(key:string,value:unknown)=>setDraft(current=>current?{...current,template_config:{...asConfig(current.template_config),[key]:value}}:current);
  const create=()=>{const row:TemplateRow={id:'',name:'新单据模板',document_type:'proforma_invoice',locale:'en',description:'',is_default:false,is_active:true,template_config:{...defaultConfig}};setDraft(row);setSelectedId('');setError('');setNotice('');};
  const save=async()=>{
    if(!draft?.name.trim())return setError('请填写模板名称。');
    setSaving(true);setError('');setNotice('');
    try{
      const payload={name:draft.name.trim(),document_type:draft.document_type,locale:draft.locale,description:draft.description,is_default:draft.is_default,is_active:draft.is_active,template_config:asConfig(draft.template_config)};
      const result=await request(draft.id?'templates/'+encodeURIComponent(draft.id):'templates',{method:draft.id?'PATCH':'POST',body:JSON.stringify(payload)});
      const id=String(result?.id??draft.id);
      setNotice('模板已保存。新生成单据会保存该模板快照，历史单据不会被追溯修改。');
      await load(id);
    }catch(cause){setError(cause instanceof Error?cause.message:'保存模板失败。');}
    finally{setSaving(false);}
  };
  const deactivate=async()=>{
    if(!draft?.id)return;
    setSaving(true);setError('');
    try{
      await request('templates/'+encodeURIComponent(draft.id),{method:'PATCH',body:JSON.stringify({is_active:false,is_default:false})});
      setNotice('模板已停用，历史单据快照不受影响。');await load(draft.id);
    }catch(cause){setError(cause instanceof Error?cause.message:'停用模板失败。');}
    finally{setSaving(false);}
  };
  return <section className="tp-settings__advanced tp-document-template-settings">
    <div className="tp-trade-document-settings__intro"><div><h4>单据模板管理</h4><p>模板按单据类型和语言区分。模板只控制版式与展示项，业务字段仍由订单、发运记录或空白草稿提供。</p></div><Tag type="blue">模板与数据分离</Tag></div>
    {error&&<InlineNotification kind="error" title="模板操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    {notice&&<InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
    {loading?<InlineLoading description="正在读取单据模板…"/>:<>
      <div className="tp-document-template-settings__toolbar">
        <Select id="tp-document-template-select" labelText="已有模板" value={selectedId} onChange={e=>{const row=rows.find(item=>item.id===e.currentTarget.value);setSelectedId(e.currentTarget.value);setDraft(row?{...row,template_config:asConfig(row.template_config)}:null);setError('');}}>
          <SelectItem value="" text="选择模板"/>
          {rows.map(row=><SelectItem key={row.id} value={row.id} text={row.name+' · '+(types.find(([id])=>id===row.document_type)?.[1]??row.document_type)+' · '+row.locale+(row.is_active?'':' · 已停用')}/>)}
        </Select>
        <Button kind="secondary" onClick={create}>新建模板</Button>
      </div>
      {draft&&<div className="tp-document-template-settings__editor">
        <div className="tp-document-template-settings__grid">
          <TextInput id="tp-template-name" labelText="模板名称" value={draft.name} onChange={e=>update({name:e.currentTarget.value})}/>
          <Select id="tp-template-type" labelText="适用单据类型" value={draft.document_type} onChange={e=>update({document_type:e.currentTarget.value})}>{types.map(([id,label])=><SelectItem key={id} value={id} text={label}/>)}</Select>
          <Select id="tp-template-locale" labelText="模板语言" value={draft.locale} onChange={e=>update({locale:e.currentTarget.value})}>{locales.map(item=><SelectItem key={item.value} value={item.value} text={item.text}/>)}</Select>
          <Select id="tp-template-page-size" labelText="纸张尺寸" value={String(draft.template_config.pageSize)} onChange={e=>updateConfig('pageSize',e.currentTarget.value)}><SelectItem value="A4" text="A4"/><SelectItem value="Letter" text="US Letter"/></Select>
          <Select id="tp-template-orientation" labelText="页面方向" value={String(draft.template_config.orientation)} onChange={e=>updateConfig('orientation',e.currentTarget.value)}><SelectItem value="portrait" text="纵向"/><SelectItem value="landscape" text="横向"/></Select>
          <TextArea id="tp-template-description" labelText="模板说明" rows={2} value={draft.description} onChange={e=>update({description:e.currentTarget.value})}/>
          <TextInput id="tp-template-header" labelText="页眉文字" value={String(draft.template_config.headerText??'')} onChange={e=>updateConfig('headerText',e.currentTarget.value)}/>
          <TextInput id="tp-template-footer" labelText="页脚文字" value={String(draft.template_config.footerText??'')} onChange={e=>updateConfig('footerText',e.currentTarget.value)}/>
        </div>
        <div className="tp-document-template-settings__options">
          {([['showLogo','显示企业 Logo'],['showPrices','显示价格与金额'],['showBankDetails','显示银行账户'],['showHsCode','显示 HS Code'],['showOrigin','显示原产国'],['showNotes','显示单据备注']] as const).map(([key,label])=><Checkbox key={key} id={'tp-template-'+key} labelText={label} checked={draft.template_config[key]!==false} onChange={(_,data)=>updateConfig(key,data.checked)}/>)}
        </div>
        <div className="tp-document-template-settings__options">
          <Checkbox id="tp-template-default" labelText="设为该单据类型默认模板" checked={draft.is_default} onChange={(_,data)=>update({is_default:data.checked})}/>
          <Checkbox id="tp-template-active" labelText="启用模板" checked={draft.is_active} onChange={(_,data)=>update({is_active:data.checked})}/>
        </div>
        <div className="tp-document-template-settings__actions"><Button kind="primary" disabled={saving} onClick={()=>void save()}>{saving?'正在保存…':'保存模板'}</Button>{draft.id&&draft.is_active&&<Button kind="danger--tertiary" disabled={saving} onClick={()=>void deactivate()}>停用模板</Button>}</div>
      </div>}
      {!rows.length&&!draft&&<p className="tp-settings__empty">尚无自定义模板。可以新建模板，或在单据中心使用系统默认版式。</p>}
      <div className="tp-document-template-settings__list"><h5>模板清单</h5>{rows.map(row=><div key={row.id}><span>{row.name}</span><small>{row.document_type} · {row.locale} · {row.is_default?'默认':'自定义'} · {row.is_active?'启用':'停用'}</small></div>)}</div>
    </>}
  </section>;
}
