import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Tag, Tabs, TabList, Tab, CarbonIcons,
} from '@/design-system';
import { PlatformSelectionStep } from './PlatformSelectionStep';
import { ActorSchemaFields } from './ActorSchemaFields';
import { ExecutionStep } from './ExecutionStep';
import { ScoringStep } from './ScoringStep';
import { DecisionMakerStep } from './DecisionMakerStep';
import '@/design-system/patterns/prospect-discovery.scss';

const createPlanTaskCode = () => 'TPD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

const steps = [
  '数据源与平台选择',
  '动态参数配置',
  '执行全网搜索',
  'AI 智能清洗与打分',
  '决策人穿透与入库',
] as const;

const EMPTY_DISCOVERY_SOURCES: Array<{ id: string; name: string; category?: string }> = [];

export function ProspectDiscoveryPage() {
  const navigate = useNavigate();
  const [planTaskCode] = useState(() => createPlanTaskCode());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSourceCount, setSelectedSourceCount] = useState(0);
  const [selectedSources, setSelectedSources] = useState<Array<{ id: string; name: string; category?: string }> | null>(null);
  const [actorParameters, setActorParameters] = useState<Record<string, unknown>>({});
  const [actorSchemaReady, setActorSchemaReady] = useState(false);

  const handleSelectionCountChange = useCallback((count: number) => setSelectedSourceCount(count), []);
  const handleSelectionChange = useCallback((sources: Array<{ id: string; name: string; category?: string }>) => {
    setSelectedSources(sources);
    setActorParameters({});
    setActorSchemaReady(false);
  }, []);
  const handleActorParametersChange = useCallback((parameters: Record<string, unknown>) => {
    setActorParameters(parameters);
    const actors = Array.isArray(parameters.actors) ? parameters.actors as Array<Record<string, unknown>> : [];
    setActorSchemaReady(actors.some(actor => actor.status === 'enabled'));
  }, [selectedSources]);
  const actorSourcesForSchema = selectedSources ?? EMPTY_DISCOVERY_SOURCES;

  return (
    <main className="tp-prospect-discovery">
      <header className="tp-prospect-discovery__page-header">
        <div>
          <p className="tp-prospect-discovery__eyebrow">TRADEPILOT / CRM · PROSPECT DISCOVERY</p>
          <h1>全球外贸智能潜客发现</h1>
          <p>选择平台并按各平台真实 Input Schema 配置参数，随后直接执行。</p>
        </div>
        <div className="tp-prospect-discovery__header-actions">
          <div className="tp-prospect-discovery__header-meta">
            <Tag type="blue">步骤：STEP {String(selectedIndex + 1).padStart(2, '0')} / 05</Tag>
            <strong>{steps[selectedIndex]}</strong>
          </div>
          <div className="tp-prospect-discovery__hub-actions">
            <Button kind="secondary" size="md" renderIcon={CarbonIcons.DocumentMultiple_01} onClick={() => navigate('/prospect-history')}>历史任务</Button>
            <Button kind="tertiary" size="md" renderIcon={CarbonIcons.DataBase} onClick={() => navigate('/prospect-data')}>潜客数据</Button>
          </div>
        </div>
      </header>

      <div className="tp-prospect-discovery__task-code"><strong>任务 ID：{planTaskCode}</strong></div>

      <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex: nextIndex }) => {
        if (nextIndex > 0 && selectedSourceCount === 0) return;
        if (nextIndex > 1 && !actorSchemaReady) return;
        setSelectedIndex(nextIndex);
      }}>
        <TabList aria-label="潜客发现五步流程" contained>
          {steps.map(step => <Tab key={step}>{step}</Tab>)}
        </TabList>
      </Tabs>

      {selectedIndex === 0 ? (
        <PlatformSelectionStep onSelectionCountChange={handleSelectionCountChange} selectedIds={selectedSources?.map(item => item.id)} onSelectionChange={handleSelectionChange} />
      ) : selectedIndex === 1 ? (
        <ActorSchemaFields sources={actorSourcesForSchema} onValuesChange={handleActorParametersChange} />
      ) : selectedIndex === 2 ? (
        <ExecutionStep
          sources={selectedSources ?? []}
          actorParameters={actorParameters}
          planTaskCode={planTaskCode}
          onEditStep={setSelectedIndex}
          onContinueToScoring={ids => {
            try { localStorage.setItem('tradepilot.prospect-scoring.queue.v1', JSON.stringify(ids)); } catch { /* Keep navigation available if local storage is full. */ }
            setSelectedIndex(3);
          }}
        />
      ) : selectedIndex === 3 ? (
        <ScoringStep onContinueToEnrichment={() => setSelectedIndex(4)} />
      ) : selectedIndex === 4 ? (
        <DecisionMakerStep />
      ) : (
        <div className="tp-prospect-discovery__future-step" aria-label="后续步骤暂未开放"><h2>{steps[selectedIndex]}</h2><p>此步骤将在前序配置确认后启用。</p></div>
      )}

      {selectedIndex !== 2 && (
        <div className="tp-prospect-discovery__step-navigation">
          <Button kind="secondary" renderIcon={CarbonIcons.ArrowLeft} onClick={() => setSelectedIndex(index => Math.max(0, index - 1))} disabled={selectedIndex === 0}>上一步</Button>
          <span>第 {selectedIndex + 1} 步，共 5 步</span>
          <Button kind="primary" renderIcon={CarbonIcons.ArrowRight} onClick={() => setSelectedIndex(index => Math.min(4, index + 1))} disabled={selectedIndex === 3 || selectedIndex === 4 || (selectedIndex === 0 && selectedSourceCount === 0) || (selectedIndex === 1 && !actorSchemaReady)}>下一步</Button>
        </div>
      )}
    </main>
  );
}
