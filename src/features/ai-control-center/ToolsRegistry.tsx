import { useEffect, useState } from 'react';
import { Button, ContainedList, ContainedListItem, TPSkeleton, InlineNotification, Select, SelectItem, Tag, ComposedModal, ModalHeader, ModalBody, ModalFooter, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Risk='read_only'|'approval_required'|'blocked';
type Tool={
 id:string;source:'native'|'external'|'registered';name:string;description:string;risk:Risk;policySource:'system'|'default'|'user';
 connectionId?:string;connectionName?:string;protocol?:string;endpointUrl?:string;connectionStatus?:string;method?:string;path?:string;enabled?:boolean;status?:string;
};
type Registry={items:Tool[];nativeCount:number;externalCount:number;registeredCount?:number};
async function toolRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const client=await getSupabaseClient();const {data}=await client.auth.getSession();
 if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
 const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const payload=await response.json() as {data?:T;error?:{message?:string}};
 if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'Tools 注册中心请求失败。');
 return payload.data as T;
}
const riskLabels:Record<Risk,string>={read_only:'只读自动执行',approval_required:'执行前人工审批',blocked:'禁止调用'};
function riskTag(risk:Risk){
 if(risk==='read_only')return <Tag type="green">只读自动执行</Tag>;
 if(risk==='blocked')return <Tag type="red">禁止调用</Tag>;
 return <Tag type="warm-gray">人工审批</Tag>;
}
export function ToolsRegistry(){
 const [registry,setRegistry]=useState<Registry>({items:[],nativeCount:0,externalCount:0});
 const [drafts,setDrafts]=useState<Record<string,Risk>>({});
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [removeConfirm,setRemoveConfirm]=useState<Tool|null>(null);
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const result=await toolRequest<Registry>('/api/v1/agent/tools');setRegistry(result);
   setDrafts(Object.fromEntries(result.items.map(tool=>[tool.id,tool.risk])));
  }catch(cause){setError(cause instanceof Error?cause.message:'读取 Tools 注册表失败。');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 const save=async(tool:Tool)=>{
  if(!tool.connectionId)return;
  const risk=drafts[tool.id]??tool.risk;
  setBusy(tool.id);setError('');setNotice('');
  try{
   await toolRequest('/api/v1/agent/connections/'+tool.connectionId+'/tool-policy',{method:'PUT',body:JSON.stringify({toolName:tool.name,risk})});
   setNotice(tool.name+' 的调用策略已更新为「'+riskLabels[risk]+'」。');
   await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'保存工具权限失败。');}
  finally{setBusy('');}
 };
 const native=registry.items.filter(tool=>tool.source==='native');
 const external=registry.items.filter(tool=>tool.source==='external');
 const registered=registry.items.filter(tool=>tool.source==='registered');
 const register=async(tool:Tool)=>{if(!tool.connectionId)return;setBusy(tool.id);setError('');setNotice('');try{await toolRequest('/api/v1/agent/tools',{method:'POST',body:JSON.stringify({connectionId:tool.connectionId,toolName:tool.name,name:tool.name,description:tool.description,category:'external_integration'})});setNotice(tool.name+' 已登记到工具注册中心。');await load();}catch(cause){setError(cause instanceof Error?cause.message:'工具登记失败。');}finally{setBusy('');}};
 const removeRegistered=async(tool:Tool)=>{setBusy(tool.id);setError('');try{await toolRequest('/api/v1/agent/tools/'+tool.id,{method:'DELETE'});setNotice(tool.name+' 已从个人工具注册表移除。');await load();}catch(cause){setError(cause instanceof Error?cause.message:'移除工具失败。');}finally{setBusy('');setRemoveConfirm(null);}};
 const toggleRegistered=async(tool:Tool)=>{setBusy(tool.id);setError('');try{await toolRequest('/api/v1/agent/tools/'+tool.id,{method:'PUT',body:JSON.stringify({enabled:tool.enabled===false})});setNotice(tool.name+(tool.enabled===false?' 已启用。':' 已停用。'));await load();}catch(cause){setError(cause instanceof Error?cause.message:'更新工具状态失败。');}finally{setBusy('');}};
 const groups=[...new Map(external.map(tool=>[tool.connectionId??'',{id:tool.connectionId??'',name:tool.connectionName??'外部连接',protocol:tool.protocol??'',status:tool.connectionStatus??'',tools:external.filter(item=>item.connectionId===tool.connectionId)}])).values()];
 return <div className="tp-settings-agent">
  <InlineNotification kind="info" lowContrast title="工具权限按显式策略控制" subtitle="内置业务查询工具由系统固定为只读。所有外部 MCP、REST API 和 Webhook 工具默认要求人工审批；只有经过确认的工具才可设置为只读自动执行。禁止调用的工具不会进入 Agent 规划候选。修改策略会使旧审批快照失效。" />
  {error&&<InlineNotification kind="error" title="Tools 操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="success" title="权限已更新" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <div className="tp-settings__editor">
   <div className="tp-ai-control__skill-heading"><div><h3>工具目录</h3><p>系统工具 {registry.nativeCount} 项 · 已登记扩展 {registry.registeredCount??registered.length} 项 · 外部已发现 {registry.externalCount} 项</p></div><Button kind="tertiary" size="sm" renderIcon={semanticIcons.refresh} disabled={loading||busy!==''} onClick={()=>void load()}>刷新目录</Button></div>
   {loading?<TPSkeleton variant="table" rows={5}/>:<>
    <h4>TradePilot 内置工具</h4>
    <p>这些工具仅查询当前账户拥有权的数据，不提供写入、删除或外部发送能力。</p>
    {!native.length?<p>暂无内置工具。</p>:<ContainedList kind="on-page" label="内置只读工具" size="md">
     {native.map(tool=><ContainedListItem key={tool.id}><div className="tp-ai-control__skill-heading"><div><strong>{tool.name}</strong><p>{tool.description}</p></div>{riskTag('read_only')}</div></ContainedListItem>)}
    </ContainedList>}
    <h4>已登记的扩展工具</h4>
    {!registered.length?<p>尚未登记个人扩展工具。可在下方发现的外部工具中选择“登记工具”。</p>:<ContainedList kind="on-page" label="已登记扩展工具" size="md">
     {registered.map(tool=><ContainedListItem key={tool.id}><div className="tp-ai-control__skill-heading"><div><strong>{tool.name}</strong><p>{tool.description||'外部扩展工具'} · {tool.risk==='blocked'?'禁止调用':tool.risk==='read_only'?'只读自动执行':'执行前人工审批'}</p></div><div><Tag type={tool.enabled===false?'cool-gray':'green'}>{tool.enabled===false?'已停用':'已启用'}</Tag> <Button kind="tertiary" size="sm" renderIcon={tool.enabled===false?semanticIcons.play:semanticIcons.pause} disabled={busy!==''} onClick={()=>void toggleRegistered(tool)}>{tool.enabled===false?'启用':'停用'}</Button> <Button kind="danger--tertiary" size="sm" renderIcon={semanticIcons.delete} disabled={busy!==''} onClick={()=>setRemoveConfirm(tool)}>移除登记</Button></div></div></ContainedListItem>)}
    </ContainedList>}
    <h4>外部 MCP / REST / Webhook 工具</h4>
    {!groups.length?<p>尚未发现外部工具。先到「第三方 Agent 接入」登记连接并发现能力。</p>:groups.map(group=><section className="tp-settings__editor" key={group.id}>
     <div className="tp-ai-control__skill-heading"><div><h4>{group.name}</h4><p>{group.protocol.toUpperCase()} · {group.status==='active'?'连接有效':'连接状态：'+group.status}</p></div><Tag type={group.status==='active'?'green':'cool-gray'}>{group.status==='active'?'已验证':'待验证'}</Tag></div>
     <ContainedList kind="on-page" label={group.name+' 工具'} size="md">
      {group.tools.map(tool=><ContainedListItem key={tool.id}>
       <div className="tp-settings-agent__tool-row">
        <div><strong>{tool.name}</strong><p>{tool.description||'暂无工具描述'}</p>{tool.method&&<p><code>{tool.method} {tool.path}</code></p>}{riskTag(tool.risk)} {tool.policySource==='user'?<Tag type="blue">人工设置</Tag>:<Tag type="cool-gray">安全默认值</Tag>}<div><Button kind="tertiary" size="sm" renderIcon={semanticIcons.add} disabled={busy!==''||!tool.connectionId} onClick={()=>void register(tool)}>登记到工具中心</Button></div></div>
        <div className="tp-settings-agent__tool-policy">
         <Select id={'tool-risk-'+tool.id} labelText="调用权限" size="sm" value={drafts[tool.id]??tool.risk} onChange={event=>setDrafts(current=>({...current,[tool.id]:event.currentTarget.value as Risk}))}>
          <SelectItem value="approval_required" text="执行前人工审批"/>
          <SelectItem value="read_only" text="只读自动执行"/>
          <SelectItem value="blocked" text="禁止调用"/>
         </Select>
         <Button kind="tertiary" size="sm" renderIcon={semanticIcons.save} disabled={busy!==''||!tool.connectionId||drafts[tool.id]===tool.risk} onClick={()=>void save(tool)}>{busy===tool.id?'保存中…':'保存策略'}</Button>
        </div>
       </div>
      </ContainedListItem>)}
     </ContainedList>
    </section>)}
   </>}
  </div>
  <ComposedModal open={Boolean(removeConfirm)} onClose={()=>setRemoveConfirm(null)} size="sm">
   <ModalHeader title="移除已登记工具？" />
   <ModalBody><p>确定从个人工具注册表移除以下扩展工具吗？移除后 Agent 将不再从该注册项发现此工具，但不会删除外部连接本身。</p><p><strong>{removeConfirm?.name}</strong></p></ModalBody>
   <ModalFooter>
    <Button kind="secondary" onClick={()=>setRemoveConfirm(null)}>保留工具</Button>
    <Button kind="danger" renderIcon={semanticIcons.delete} disabled={busy!==''} onClick={()=>{const item=removeConfirm;if(item)void removeRegistered(item);}}>确认移除</Button>
   </ModalFooter>
  </ComposedModal>
 </div>;
}
