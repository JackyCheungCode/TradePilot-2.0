import { useSearchParams } from 'react-router-dom';
import { PageHeader, Button } from '@/design-system';
import { ContainedList, ContainedListItem, Grid, Column, InlineNotification, Tag, Tile, semanticIcons } from '@/design-system';
import '@/design-system/patterns/settings.scss';
import { AgentSettings } from '@/features/settings/AgentSettings';
import { IntegrationsSettings } from '@/features/settings/IntegrationsSettings';
import { ExternalAgentConnections } from './ExternalAgentConnections';
import { AgentTaskMonitor } from './AgentTaskMonitor';
import { AgentSecurityCenter } from './AgentSecurityCenter';
import { SkillsRegistry } from './SkillsRegistry';\nimport { ToolsRegistry } from './ToolsRegistry';

type Section = { id: string; label: string; group: string; ready: boolean };
const sections: Section[] = [
  { id: 'overview', label: 'AI 总览', group: 'AI 平台', ready: true },
  { id: 'models', label: '模型与供应商', group: 'AI 基础配置', ready: true },
  { id: 'agents', label: 'Agent 管理', group: 'Agent 能力', ready: true },
  { id: 'connections', label: '第三方 Agent 接入', group: 'Agent 能力', ready: true },
  { id: 'skills', label: 'Skills 管理', group: 'Agent 能力', ready: true },
  { id: 'tools', label: 'Tools 管理', group: 'Agent 能力', ready: true },
  { id: 'tasks', label: '任务与调度', group: '执行管理', ready: true },
  { id: 'security', label: '权限与安全', group: '执行管理', ready: true },
  { id: 'monitoring', label: '运行监控', group: '执行管理', ready: false },
  { id: 'appearance', label: '小雅形象', group: '小雅', ready: true },
  { id: 'history', label: 'AI 历史记录', group: '小雅', ready: true },
];

export function AIControlCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section') || 'overview';
  const active = sections.some(item => item.id === requested) ? requested : 'overview';
  const groups = [...new Set(sections.map(item => item.group))].map(group => ({
    group,
    items: sections.filter(item => item.group === group),
  }));
  const selectSection = (id: string) => setSearchParams(id === 'overview' ? {} : { section: id });

  return (
    <main className="tp-settings tp-ai-control">
      <PageHeader className="tp-settings__header">
        <div>
          <p className="tp-settings__eyebrow">TRADEPILOT / AI PLATFORM</p>
          <h1>AI 与 Agent</h1>
          <p>统一管理 AI 模型、专业 Agent、外部能力接入与自动化执行。</p>
        </div>
        <Tag type="blue">AI 能力管理中心</Tag>
      </PageHeader>

      <Grid className="tp-settings__layout">
        <Column sm={4} md={2} lg={4}>
          <aside className="tp-settings__sidebar" aria-label="AI 与 Agent 功能目录">
            {groups.map(({ group, items }) => (
              <ContainedList key={group} kind="on-page" label={group} size="md" className="tp-settings__domain-list">
                {items.map(item => (
                  <ContainedListItem
                    key={item.id}
                    className={'tp-settings__domain-item ' + (active === item.id ? 'is-active' : '')}
                    onClick={() => item.ready && selectSection(item.id)}
                  >
                    <span className="tp-settings__domain-copy"><strong>{item.label}</strong></span>
                    {!item.ready && <Tag type="cool-gray">后续接入</Tag>}
                  </ContainedListItem>
                ))}
              </ContainedList>
            ))}
          </aside>
        </Column>
        <Column sm={4} md={6} lg={12}>
          <section className="tp-settings__workspace">
            <div className="tp-settings__workspace-heading">
              <div>
                <p className="tp-settings__eyebrow">AI CONTROL CENTER</p>
                <h2>{sections.find(item => item.id === active)?.label}</h2>
                <p>配置均复用现有服务接口和数据，不创建重复的模型或 Agent 配置。</p>
              </div>
            </div>
            <div className="tp-settings__content">
              {active === 'overview' && (
                <>
                  <InlineNotification kind="info" lowContrast title="统一管理入口已建立" subtitle="模型、内置 Agent、第三方连接、Skills 注册、Tools 权限策略、任务监控与审批已接入现有服务；隔离执行运行时仍待建设。" />
                  <Grid className="tp-settings__section-layout">
                    <Column sm={4} md={2} lg={4}><Tile className="tp-settings__editor">
                      <semanticIcons.api size={24} />
                      <h3>模型与供应商</h3>
                      <p>配置多个模型供应商，获取模型目录、测试连接并设置默认模型。</p>
                      <Button kind="tertiary" size="md" onClick={() => selectSection('models')}>管理模型</Button>
                    </Tile></Column>
                    <Column sm={4} md={2} lg={4}><Tile className="tp-settings__editor">
                      <semanticIcons.user size={24} />
                      <h3>Agent 管理</h3>
                      <p>管理内置专业 Agent 的启用状态、描述和系统指令。</p>
                      <Button kind="tertiary" size="md" onClick={() => selectSection('agents')}>管理 Agent</Button>
                    </Tile></Column>
                    <Column sm={4} md={2} lg={4}><Tile className="tp-settings__editor">
                      <semanticIcons.chat size={24} />
                      <h3>小雅配置</h3>
                      <p>配置小雅形象和历史对话管理。</p>
                      <Button kind="tertiary" size="md" onClick={() => selectSection('appearance')}>配置小雅</Button>
                    </Tile></Column>
                  </Grid>
                  <div className="tp-settings__editor">
                    <h3>能力接入状态</h3>
                    <p>当前优先复用已存在的模型供应商、Agent Profile、对话历史和执行服务。第三方 Agent / MCP 连接、Skills 完整包导入与初步静态检查、Tools 权限策略均已接入；Skill 执行仍需隔离运行时和人工审核。</p>
                    <div className="tp-settings__section-item"><span>模型供应商配置</span><Tag type="green">已接入</Tag></div>
                    <div className="tp-ai-control__status-row"><span>内置 Agent 配置</span><Tag type="green">已接入</Tag></div>
                    <div className="tp-ai-control__status-row"><span>第三方 Agent / MCP 连接管理</span><Tag type="green">已接入</Tag></div>
                    <div className="tp-ai-control__status-row"><span>Skills 注册中心</span><Tag type="green">已接入</Tag></div>
                    <div className="tp-ai-control__status-row"><span>任务监控与人工审批</span><Tag type="green">已接入</Tag></div>\n                    <div className="tp-ai-control__status-row"><span>Tools 注册中心与显式权限策略</span><Tag type="green">已接入</Tag></div>\n                    <div className="tp-ai-control__status-row"><span>隔离执行运行时与运行指标</span><Tag type="cool-gray">待建设</Tag></div>
                  </div>
                </>
              )}
              {active === 'models' && (
                <>
                  <IntegrationsSettings section="ai" />
                  <div className="tp-ai-control__secondary-config"><AgentSettings section="models" /></div>
                </>
              )}
              {active === 'agents' && <AgentSettings section="profiles" />}
              {active === 'connections' && <ExternalAgentConnections />}
              {active === 'skills' && <SkillsRegistry />}\n              {active === 'tools' && <ToolsRegistry />}
              {active === 'tasks' && <AgentTaskMonitor />}
              {active === 'security' && <AgentSecurityCenter />}
              {active === 'appearance' && <AgentSettings section="appearance" />}
              {active === 'history' && <AgentSettings section="history" />}
              {!sections.find(item => item.id === active)?.ready && (
                <InlineNotification kind="info" lowContrast title="该能力正在整合" subtitle="隔离执行运行时仍在建设中，未开放未经审核的 Skill 代码执行。" />
              )}
            </div>
          </section>
        </Column>
      </Grid>
    </main>
  );
}
