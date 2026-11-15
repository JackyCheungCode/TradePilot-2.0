import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Tag, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Item = { id:string; name:string; code:string|null; config:Record<string,unknown>; sequence:number; is_active:boolean };
type Field = {key:string;label:string;type?:'text'|'number'|'select';options?:Array<[string,string]>};
const yesNo:Array<[string,string]>=[['true','是'],['false','否']];
const definitions:Record<string,Field[]> = {
  stages:[{key:'probability',label:'默认赢率（%）',type:'number'},{key:'forecast_category',label:'预测类别',type:'select',options:[['pipeline','销售管道'],['best_case','最佳情况'],['commit','承诺成交'],['won','已赢单'],['lost','已输单']]},{key:'terminal_status',label:'终结阶段',type:'select',options:[['open','进行中'],['won','已赢单'],['lost','已输单']]}],
  types:[{key:'description',label:'类型说明'}],
  priorities:[{key:'level',label:'优先级数值',type:'number'},{key:'color',label:'标签颜色',type:'select',options:[['red','红色'],['magenta','洋红'],['purple','紫色'],['blue','蓝色'],['cyan','青色'],['teal','蓝绿'],['green','绿色'],['gray','灰色']]}],
  'win-loss-reasons':[{key:'result',label:'归属结果',type:'select',options:[['won','赢单原因'],['lost','输单原因']]},{key:'description',label:'原因说明'},{key:'require_note',label:'备注必填',type:'select',options:yesNo}],
  teams:[{key:'manager',label:'团队负责人'},{key:'description',label:'团队说明'}],
  sources:[{key:'source_group',label:'来源渠道分组'},{key:'description',label:'来源说明'}],
  qualification:[{key:'required',label:'是否必评',type:'select',options:yesNo},{key:'description',label:'评估说明'},{key:'sequence',label:'评估顺序',type:'number'}],
  activities:[{key:'reminder_minutes',label:'默认提前提醒（分钟）',type:'number'},{key:'description',label:'活动说明'}],
  'follow-up':[{key:'first_contact_hours',label:'首次联系时限（小时）',type:'number'},{key:'follow_up_days',label:'默认跟进间隔（天）',type:'number'},{key:'overdue_days',label:'逾期提醒（天）',type:'number'},{key:'stale_days',label:'长期未跟进阈值（天）',type:'number'}],
  forecast:[{key:'forecast_category',label:'预测类别',type:'select',options:[['pipeline','销售管道'],['best_case','最佳情况'],['commit','承诺成交'],['won','已赢单'],['lost','已输单']]},{key:'include_weighted',label:'纳入加权预测',type:'select',options:yesNo},{key:'horizon_days',label:'预测周期（天）',type:'number'}],
  rules:[{key:'require_loss_reason',label:'输单原因必填',type:'select',options:yesNo},{key:'require_win_reason',label:'赢单原因必填',type:'select',options:yesNo},{key:'require_expected_close',label:'预计成交日期必填',type:'select',options:yesNo},{key:'prevent_delete_referenced',label:'关联报价/订单后禁止删除',type:'select',options:yesNo},{key:'duplicate_check',label:'启用重复商机检查',type:'select',options:yesNo},{key:'probability_from_stage',label:'阶段变化时自动更新赢率',type:'select',options:yesNo}],
};
export const opportunitySettingSections = [
  {id:'stages',label:'销售阶段与赢率',group:'销售流程',description:'阶段顺序、默认赢率及预测类别'},
  {id:'types',label:'商机类型',group:'销售流程',description:'新客户、现有客户、复购及渠道合作类型'},
  {id:'priorities',label:'优先级',group:'销售流程',description:'优先级等级、颜色及默认值'},
  {id:'win-loss-reasons',label:'赢单与输单原因',group:'销售流程',description:'维护赢单和输单分析原因'},
  {id:'teams',label:'销售团队',group:'销售组织',description:'维护销售团队及团队负责人'},
  {id:'sources',label:'商机来源',group:'销售组织',description:'维护官网、展会、社媒、转介绍等来源'},
  {id:'qualification',label:'资格评估',group:'销售组织',description:'维护资格评估状态和评估要求'},
  {id:'activities',label:'活动类型',group:'销售活动',description:'维护电话、邮件、会议、拜访等活动类型'},
  {id:'follow-up',label:'跟进规则',group:'销售活动',description:'首次联系、跟进间隔和逾期提醒规则'},
  {id:'forecast',label:'销售预测',group:'预测与规则',description:'维护预测类别、周期和加权规则'},
  {id:'rules',label:'商机管理规则',group:'预测与规则',description:'维护必填、阶段、删除及重复检查规则'},
];
const defaults:Record<string,Array<[string,string,Record<string,unknown>]>> = {
 stages:[['prospecting','新商机',{probability:10,forecast_category:'pipeline',terminal_status:'open'}],['qualification','资格评估',{probability:20,forecast_category:'pipeline',terminal_status:'open'}],['needs_analysis','需求分析',{probability:35,forecast_category:'pipeline',terminal_status:'open'}],['proposal','方案 / 报价',{probability:55,forecast_category:'best_case',terminal_status:'open'}],['negotiation','商务谈判',{probability:80,forecast_category:'commit',terminal_status:'open'}],['won','已赢单',{probability:100,forecast_category:'won',terminal_status:'won'}],['lost','已输单',{probability:0,forecast_category:'lost',terminal_status:'lost'}]],
 types:[['new_business','新客户',{}],['existing_customer','现有客户',{}],['repeat','复购',{}],['channel_partner','渠道合作',{}]],
 priorities:[['low','低',{level:1,color:'gray'}],['normal','普通',{level:2,color:'blue'}],['high','高',{level:3,color:'orange'}],['urgent','紧急',{level:4,color:'red'}]],
 'win-loss-reasons':[['price','价格因素',{result:'lost'}],['competitor','竞争对手胜出',{result:'lost'}],['no_budget','预算不足',{result:'lost'}],['product_fit','产品不匹配',{result:'lost'}],['timing','采购时机不合适',{result:'lost'}],['project_cancelled','项目取消',{result:'lost'}],['relationship','客户关系与服务',{result:'won'}],['product_value','产品价值与匹配',{result:'won'}],['delivery','交付能力',{result:'won'}],['price_win','价格优势',{result:'won'}]],
 sources:[['website','官网询盘',{}],['search','搜索引擎',{}],['social','社交媒体',{}],['exhibition','展会',{}],['referral','客户推荐',{}],['prospect_conversion','全网情报 / 线索转换',{}],['manual','手动录入',{}],['other','其他',{}]],
 qualification:[['pending','待评估',{required:true}],['qualified','合格',{required:true}],['disqualified','不合格',{required:true}]],
 activities:[['call','电话',{}],['email','邮件',{}],['whatsapp','WhatsApp',{}],['meeting','会议',{}],['video','视频会议',{}],['visit','客户拜访',{}],['task','任务',{}]],
 forecast:[['pipeline','销售管道',{forecast_category:'pipeline',include_weighted:true,horizon_days:90}],['best_case','最佳情况',{forecast_category:'best_case',include_weighted:true,horizon_days:90}],['commit','承诺成交',{forecast_category:'commit',include_weighted:true,horizon_days:90}]],
 rules:[['default','默认商机规则',{require_loss_reason:true,require_win_reason:false,require_expected_close:false,prevent_delete_referenced:true,duplicate_check:true,probability_from_stage:true}]],
 'follow-up':[['default','默认跟进规则',{first_contact_hours:24,follow_up_days:7,overdue_days:2,stale_days:30}]],
};
const defaultsBySection = (section:string)=>defaults[section]||[];
export function OpportunitySettings({section}:{section:string}) {
 const meta=opportunitySettingSections.find(x=>x.id===section)||opportunitySettingSections[0];
 const fields=definitions[section]||[];
 const [rows,setRows]=useState<Item[]>([]);const [name,setName]=useState('');const [code,setCode]=useState('');const [config,setConfig]=useState<Record<string,unknown>>({});const [editing,setEditing]=useState<string|null>(null);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const db=await getSupabaseClient();const r=await db.from('crm_opportunity_setting_items').select('id,name,code,config,sequence,is_active').eq('setting_type',section).order('sequence').order('name');if(r.error)throw r.error;setRows((r.data||[]) as Item[])}catch(e){setError(e instanceof Error?e.message:'读取商机设置失败')}finally{setLoading(false)}},[section]);
 useEffect(()=>{setName('');setCode('');setConfig({});setEditing(null);void load()},[load]);
 const values=useMemo(()=>{const base=defaultsBySection(section).map(([code,name,config],i)=>({id:'default-'+code,code,name,config,sequence:(i+1)*10,is_active:true}));const byCode=new Map(base.map(item=>[item.code,item]));rows.forEach(item=>byCode.set(item.code||item.name,item));return [...byCode.values()].sort((a,b)=>a.sequence-b.sequence||a.name.localeCompare(b.name));},[rows,section]);
 const reset=()=>{setName('');setCode('');setConfig({});setEditing(null)};
 const save=async()=>{if(!name.trim()){setError('名称不能为空。');return}setSaving(true);setError('');setNotice('');try{const db=await getSupabaseClient();const {data:s}=await db.auth.getSession();const owner=s.session?.user.id;if(!owner)throw new Error('登录状态已失效，请重新登录。');const payload={name:name.trim(),code:code.trim()||null,config,updated_at:new Date().toISOString()};const r=editing?await db.from('crm_opportunity_setting_items').update(payload).eq('id',editing).select('id,name,code,config,sequence,is_active').single():await db.from('crm_opportunity_setting_items').insert({...payload,owner_id:owner,setting_type:section,sequence:(rows.length+1)*10,is_active:true}).select('id,name,code,config,sequence,is_active').single();if(r.error)throw r.error;if(editing)setRows(old=>old.map(x=>x.id===editing?r.data as Item:x));else setRows(old=>[...old,r.data as Item]);reset();setNotice('设置已保存；商机表单将读取启用配置。')}catch(e){setError(e instanceof Error?e.message:'保存设置失败')}finally{setSaving(false)}};
 const edit=(item:Item)=>{if(item.id.startsWith('default-')){setName(item.name);setCode(item.code||'');setConfig({...item.config});setEditing(null);setNotice('这是系统默认值，保存将创建一条自定义配置。');return}setName(item.name);setCode(item.code||'');setConfig({...item.config});setEditing(item.id);setNotice('')};
 const toggle=async(item:Item)=>{if(item.id.startsWith('default-')){setError('请先保存为自定义配置后再停用系统默认项。');return}const db=await getSupabaseClient();const r=await db.from('crm_opportunity_setting_items').update({is_active:!item.is_active,updated_at:new Date().toISOString()}).eq('id',item.id);if(r.error){setError(r.error.message);return}setRows(old=>old.map(x=>x.id===item.id?{...x,is_active:!item.is_active}:x))};
 const display=(f:Field,v:unknown)=>f.options?.find(x=>x[0]===String(v))?.[1]??(v===true?'是':v===false?'否':String(v??'—'));
 return <div className="tp-settings__advanced">
 {error&&<InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
 {notice&&<InlineNotification kind="info" title="提示" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
 <div className="tp-settings__editor"><div className="tp-settings__editor-title"><h4>{editing?'编辑':'新增'}{meta.label}</h4>{editing&&<Button kind="ghost" size="sm" onClick={reset}>取消编辑</Button>}</div>
 <div className="tp-settings__editor-grid"><TextInput id={'opp-setting-name-'+section} labelText="名称" value={name} onChange={e=>setName(e.currentTarget.value)}/><TextInput id={'opp-setting-code-'+section} labelText="编码" value={code} onChange={e=>setCode(e.currentTarget.value)}/>
 {fields.map(f=>{const v=config[f.key]??(f.type==='select'?(f.options?.[0]?.[0]??''):'');if(f.type==='select')return <Select key={f.key} id={'opp-setting-'+section+'-'+f.key} labelText={f.label} value={String(v)} onChange={e=>setConfig(c=>({...c,[f.key]:e.currentTarget.value}))}>{(f.options||[]).map(([value,label])=><SelectItem key={value} value={value} text={label}/>)}</Select>;return <TextInput key={f.key} id={'opp-setting-'+section+'-'+f.key} labelText={f.label} type={f.type==='number'?'number':'text'} value={String(v)} onChange={e=>setConfig(c=>({...c,[f.key]:f.type==='number'?Number(e.currentTarget.value):e.currentTarget.value}))}/>})}
 <Button kind="primary" disabled={saving||!name.trim()} onClick={()=>void save()}>{saving?'保存中…':editing?'保存修改':'新增配置'}</Button></div></div>
 <div className="tp-settings__table-wrap"><Table><TableHead><TableRow><TableHeader>名称</TableHeader><TableHeader>编码</TableHeader>{fields.slice(0,2).map(f=><TableHeader key={f.key}>{f.label}</TableHeader>)}<TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead><TableBody>{values.map(item=><TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.code||'—'}</TableCell>{fields.slice(0,2).map(f=><TableCell key={f.key}>{display(f,item.config?.[f.key])}</TableCell>)}<TableCell><Tag type={item.is_active?'green':'cool-gray'}>{item.is_active?'启用':'停用'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>edit(item)}>编辑</Button><Button kind="ghost" size="sm" onClick={()=>void toggle(item)}>{item.id.startsWith('default-')?'自定义':item.is_active?'停用':'启用'}</Button></TableCell></TableRow>)}</TableBody></Table>{loading&&<InlineLoading description="正在读取商机设置…"/>}{!loading&&!values.length&&<p className="tp-settings__empty">暂无配置。</p>}</div>
 <p className="tp-settings__hint">停用不删除历史配置。已有商机保留原值；更新配置只影响后续新建或更新的商机。</p>
 </div>
}
