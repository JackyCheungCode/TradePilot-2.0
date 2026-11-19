import { useEffect, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { AgentHistoryManagement } from './AgentHistoryManagement';

type Provider = { id: string; name: string; model: string; protocol: string; configured?: boolean | string; baseUrl?: string; providerKey?: string; secretName?: string };
type AIConfig = { providers?: Provider[]; taskModels?: Record<string,string>; defaultModel?: string };
type SkillOption = { id:string; label:string; enabled:boolean; state:string };
type ToolOption = { toolKey:string; name:string; source:string; enabled?:boolean; status?:string; risk:string; connectionName?:string };
type ToolRegistry = { items:ToolOption[] };
type Profile = { agent_key: string; enabled: boolean; config: { systemPrompt?: string; description?: string; modelRef?: string; skillIds?: string[]; toolKeys?: string[] } };
type Appearance = { shape: string; color: string; styleId: string; variant: string; face: string; eyeColor: string; eyeScale: number };
const agentLabels: Record<string,string> = {
  buyer_development: '全球买家开发 Agent', market_research: '市场研究 Agent',
  company_research: '企业调查 Agent', lead_scoring: '潜客评估 Agent',
  multilingual_sales: '多语言销售 Agent', follow_up: '客户跟进 Agent', trade_compliance: '贸易合规 Agent',
};
async function agentApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  const response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + data.session.access_token, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || !('data' in payload)) throw new Error(payload.error?.message || 'Agent 设置读取失败。');
  return payload.data as T;
}
export function AgentSettings({ section }: { section: string }) {
  const [providers,setProviders] = useState<Provider[]>([]);
  const [selectedModel,setSelectedModel] = useState('');
  const [profiles,setProfiles] = useState<Profile[]>([]);
  const [skills,setSkills] = useState<SkillOption[]>([]);
  const [tools,setTools] = useState<ToolOption[]>([]);
  const [appearance,setAppearance] = useState<Appearance>({shape:'blob',color:'ivory',styleId:'vector',variant:'soft',face:'cute',eyeColor:'#1A1A1A',eyeScale:1});
  const [avatarAgents,setAvatarAgents] = useState<Record<string,Appearance>>({});
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [activeAgent,setActiveAgent] = useState('buyer_development');
  const activeProfile = profiles.find(item => item.agent_key === activeAgent);
  const providerValue = (item:Provider) => item.id + '::' + item.model;
  const selectedProvider = providers.find(item => providerValue(item) === selectedModel || item.model === selectedModel) || providers[0];
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [config, profileRows, avatar, skillRows, toolRegistry] = await Promise.all([
        agentApi<AIConfig>('/api/v1/settings/ai-config'),
        agentApi<Profile[]>('/api/v1/agent/profiles'),
        agentApi<{default?:Appearance;agents?:Record<string,Appearance>}>('/api/v1/agent/appearance'),
        agentApi<SkillOption[]>('/api/v1/agent/skills'),
        agentApi<ToolRegistry>('/api/v1/agent/tools'),
      ]);
      const available = (config.providers || []).filter(item => item.configured !== false && item.configured !== 'false');
      setProviders(available);
      const availableTools=(toolRegistry.items || []).filter(tool => tool.source === 'registered' && tool.enabled !== false && tool.status === 'active' && tool.risk !== 'blocked' && Boolean(tool.toolKey));
      const enabledSkillIds=new Set((skillRows || []).filter(skill=>skill.enabled).map(skill=>skill.id));
      const availableToolKeys=new Set(availableTools.map(tool=>tool.toolKey));
      setSkills(skillRows || []);
      setTools(availableTools);
      const currentValue = config.taskModels?.agent_chat || config.defaultModel || '';
      const legacyProvider = available.find(item => item.model === currentValue);
      const current = currentValue && !currentValue.includes('::') && legacyProvider ? providerValue(legacyProvider) : currentValue || (available[0] ? providerValue(available[0]) : '');
      setSelectedModel(current);
      const knownAgents = Object.keys(agentLabels).map(agent_key => ({ agent_key, enabled:true, config:{} as Profile['config'] }));
      setProfiles(knownAgents.map(base => {
        const row=profileRows?.find(item => item.agent_key === base.agent_key);
        if(!row)return base;
        return {...row,config:{...row.config,skillIds:(row.config.skillIds || []).filter(id=>enabledSkillIds.has(id)),...(row.config.toolKeys===undefined?{}:{toolKeys:row.config.toolKeys.filter(key=>availableToolKeys.has(key))})}};
      }));
      if (avatar.default) setAppearance({...avatar.default,eyeColor:avatar.default.eyeColor || '#1A1A1A',eyeScale:avatar.default.eyeScale ?? 1});
      setAvatarAgents(avatar.agents || {});
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取 Agent 设置失败。'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const saveModel = async () => {
    if (!selectedModel) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const config = await agentApi<AIConfig>('/api/v1/settings/ai-config');
      const taskModels = { ...(config.taskModels || {}), agent_chat:selectedModel, agent_planning:selectedModel };
      await agentApi('/api/v1/settings/ai-config', { method:'PUT', body:JSON.stringify({...config,taskModels,defaultModel:selectedModel}) });
      setNotice('小雅对话与任务规划模型已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '模型设置保存失败。'); }
    finally { setSaving(false); }
  };
  const saveProfile = async (profile: Profile) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await agentApi<Profile>('/api/v1/agent/profiles/' + profile.agent_key, { method:'PUT', body:JSON.stringify({enabled:profile.enabled,config:profile.config}) });
      setProfiles(rows => [...rows.filter(item => item.agent_key !== profile.agent_key),saved]);
      setNotice(agentLabels[profile.agent_key] + ' 设置已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Agent 设置保存失败。'); }
    finally { setSaving(false); }
  };
  const saveAppearance = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await agentApi('/api/v1/agent/appearance', { method:'PUT', body:JSON.stringify({config:{default:appearance,agents:avatarAgents}}) });
      setNotice('小雅默认头像形象设置已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '头像设置保存失败。'); }
    finally { setSaving(false); }
  };
  if (loading) return <InlineLoading description="正在读取 Agent 设置…" />;
  return <div className="tp-settings-agent">
    {error && <InlineNotification kind="error" title="设置失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {notice && <InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
    {section === 'models' && <section className="tp-settings__editor">
      <h4>小雅模型配置</h4>
      <p>从已在「集成与 API」中配置的供应商和模型中选择，不在此处重复保存 API Key。</p>
      <div className="tp-settings__editor-grid">
        <Select id="agent-model-provider" labelText="模型供应商" value={selectedProvider?.id || ''} onChange={event => { const provider = providers.find(item => item.id === event.currentTarget.value); if (provider) setSelectedModel(providerValue(provider)); }}>
          {providers.map(item => <SelectItem key={item.id} value={item.id} text={item.name} />)}
        </Select>
        <Select id="agent-model-choice" labelText="模型选择" value={selectedModel} onChange={event => setSelectedModel(event.currentTarget.value)}>
          {providers.map(item => <SelectItem key={item.id} value={providerValue(item)} text={item.name + ' · ' + item.model} />)}
        </Select>
        <Button kind="primary" disabled={saving || !selectedModel} onClick={() => void saveModel()}>保存模型配置</Button>
      </div>
      {!providers.length && <Tag type="red">尚无已配置的模型，请先在 集成与 API中配置供应商和 API Key。</Tag>}
    </section>}
    {section === 'profiles' && <section className="tp-settings__editor">
      <h4>内置 Agent 管理</h4>
      <p>启用或停用专业 Agent，并维护其专属指令。</p>
      <div className="tp-settings__editor-grid">
        <Select id="agent-profile-select" labelText="选择 Agent" value={activeAgent} onChange={event => setActiveAgent(event.currentTarget.value)}>
          {Object.entries(agentLabels).map(([key,label]) => <SelectItem key={key} value={key} text={label} />)}
        </Select>
        <Button kind="primary" disabled={saving || !activeProfile} onClick={() => activeProfile && void saveProfile(activeProfile)}>保存 Agent 设置</Button>
      </div>
      {activeProfile ? <>
        <Select id="agent-profile-enabled" labelText="启用状态" hideLabel value={activeProfile.enabled ? 'enabled' : 'disabled'} onChange={event => setProfiles(rows => rows.map(item => item.agent_key === activeAgent ? {...item,enabled:event.currentTarget.value === 'enabled'} : item))}>
          <SelectItem value="enabled" text="启用" /><SelectItem value="disabled" text="停用" />
        </Select>
        <div className="tp-settings__editor">
          <h5>分配 Skill 工作方法</h5>
          <p>只加载已启用 Skill 的 SKILL.md 指引；不会执行 Skill 包中的脚本，也不会扩大 Agent 的工具权限。</p>
          {skills.length ? skills.map(skill => {
            const selected = (activeProfile.config.skillIds || []).includes(skill.id);
            return <Checkbox key={skill.id} id={"agent-skill-"+activeAgent+"-"+skill.id} labelText={skill.label+" · "+skill.id+(skill.enabled?"":"（未启用）")} checked={selected} disabled={!skill.enabled && !selected} onChange={event => setProfiles(rows => rows.map(item => item.agent_key === activeAgent ? {...item,config:{...item.config,skillIds:event.currentTarget.checked?[...new Set([...(item.config.skillIds||[]),skill.id])]:(item.config.skillIds||[]).filter(id=>id!==skill.id)}} : item))} />;
          }) : <p>尚未注册 Skill。请先在 Skill 技能中心导入并启用工作方法。</p>}
        </div>
        <div className="tp-settings__editor">
          <h5>分配外部工具权限</h5>
          <p>仅当此 Agent 被明确选为规划任务的主执行角色时生效。只显示当前账户已登记、启用且未被禁止的外部工具；需要审批的工具仍必须经过审批。未设置时沿用账户现有授权范围。</p>
          {tools.length ? tools.map(tool => {
            const currentKeys = activeProfile.config.toolKeys ?? tools.map(item => item.toolKey);
            const selected = currentKeys.includes(tool.toolKey);
            return <Checkbox key={tool.toolKey} id={"agent-tool-"+activeAgent+"-"+tool.toolKey.replace(/[^a-zA-Z0-9_-]/g,"-")} labelText={tool.name+" · "+(tool.connectionName||"外部连接")} checked={selected} onChange={event => setProfiles(rows => rows.map(item => { if(item.agent_key!==activeAgent)return item; const current=item.config.toolKeys??tools.map(entry=>entry.toolKey); const next=event.currentTarget.checked?[...new Set([...current,tool.toolKey])]:current.filter(key=>key!==tool.toolKey); return {...item,config:{...item.config,toolKeys:next}}; }))} />;
          }) : <p>暂无可分配的外部工具。请先在工具目录登记并启用外部工具。</p>}
        </div>
        <Select id="agent-profile-model" labelText="专属模型" value={activeProfile.config.modelRef || ''} onChange={event => setProfiles(rows => rows.map(item => item.agent_key === activeAgent ? {...item,config:{...item.config,modelRef:event.currentTarget.value}} : item))}><SelectItem value="" text="跟随小雅默认模型" />{providers.map(item => <SelectItem key={item.id} value={providerValue(item)} text={item.name + ' · ' + item.model} />)}</Select>
        <TextArea id="agent-profile-description" labelText="Agent 描述" rows={2} value={activeProfile.config.description || ''} onChange={event => setProfiles(rows => rows.map(item => item.agent_key === activeAgent ? {...item,config:{...item.config,description:event.currentTarget.value}} : item))} />
        <TextArea id="agent-profile-prompt" labelText="系统指令" rows={6} value={activeProfile.config.systemPrompt || ''} onChange={event => setProfiles(rows => rows.map(item => item.agent_key === activeAgent ? {...item,config:{...item.config,systemPrompt:event.currentTarget.value}} : item))} />
      </> : <p>尚未保存该 Agent 的自定义配置；首次保存后即可管理启用状态和指令。</p>}
    </section>}
    {section === 'history' && <AgentHistoryManagement />}
    {section === 'appearance' && <section className="tp-settings__editor">
      <h4>小雅头像与形象</h4>
      <p>管理默认头像形状、配色和表情风格。</p>
      <div className="tp-settings__editor-grid">
        <Select id="agent-avatar-shape" labelText="头像形状" value={appearance.shape} onChange={event => setAppearance(item => ({...item,shape:event.currentTarget.value}))}>
          {['blob','wedge','gem'].map(value => <SelectItem key={value} value={value} text={value} />)}
        </Select>
        <Select id="agent-avatar-color" labelText="头像主色" value={appearance.color} onChange={event => setAppearance(item => ({...item,color:event.currentTarget.value}))}>
          {['cream','ivory','black','brown','red','orange','yellow','green','cyan','blue','violet','magenta','pink','gray','sage','clay','navy','mauve','night','cocoa','sky','blush','lilac','butter','meadow'].map(value => <SelectItem key={value} value={value} text={value} />)}
        </Select>
        <TextInput id="agent-avatar-eye-color" labelText="眼睛颜色（HEX）" value={appearance.eyeColor} onChange={event => setAppearance(item => ({...item,eyeColor:event.currentTarget.value}))} />
        <Select id="agent-avatar-eye-scale" labelText="眼睛比例" value={String(appearance.eyeScale)} onChange={event => setAppearance(item => ({...item,eyeScale:Number(event.currentTarget.value)}))}>
          {['0.8','0.9','1','1.1','1.2','1.3','1.4'].map(value => <SelectItem key={value} value={value} text={value} />)}
        </Select>
        <Button kind="primary" disabled={saving} onClick={() => void saveAppearance()}>保存头像设置</Button>
      </div>
    </section>}
  </div>;
}
