import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useState } from 'react';
import { Button, Link, Tag, semanticIcons } from '@/design-system';
import { PlatformSelectionStep } from './PlatformSelectionStep';
import { ActorSchemaFields } from './ActorSchemaFields';
import { ExecutionStep } from './ExecutionStep';
import { ScoringStep } from './ScoringStep';
import { DecisionMakerStep } from './DecisionMakerStep';
import { DigitalTwinWorkflow, type DigitalTwinMetric } from './DigitalTwinWorkflow';
import '@/design-system/patterns/prospect-discovery.scss';
import '@/design-system/patterns/digital-twin-workflow.scss';

const createPlanTaskCode = () => 'TPD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
const EMPTY_DISCOVERY_SOURCES: Array<{ id: string; name: string; category?: string }> = [];

type ExecutionTelemetry = { status: 'idle' | 'running' | 'completed' | 'failed'; progress: number; captured: number; runCount: number; recordCount: number };
type ScoringTelemetry = { total: number; scored: number; loading: boolean };
type DecisionTelemetry = { total: number; enriched: number; synced: number; running: boolean; progress: number };

export function ProspectDiscoveryPage() {
  const [planTaskCode] = useState(() => createPlanTaskCode());
  const [activeStage, setActiveStage] = useState(0);
  const [configSubstep, setConfigSubstep] = useState(0);
  const [selectedSourceCount, setSelectedSourceCount] = useState(0);
  const [selectedSources, setSelectedSources] = useState<Array<{ id: string; name: string; category?: string }> | null>(null);
  const [actorParameters, setActorParameters] = useState<Record<string, unknown>>({});
  const [actorSchemaReady, setActorSchemaReady] = useState(false);
  const [execution, setExecution] = useState<ExecutionTelemetry>({ status: 'idle', progress: 0, captured: 0, runCount: 0, recordCount: 0 });
  const [scoring, setScoring] = useState<ScoringTelemetry>({ total: 0, scored: 0, loading: true });
  const [decision, setDecision] = useState<DecisionTelemetry>({ total: 0, enriched: 0, synced: 0, running: false, progress: 0 });

  const handleSelectionCountChange = useCallback((count: number) => setSelectedSourceCount(count), []);
  const handleSelectionChange = useCallback((sources: Array<{ id: string; name: string; category?: string }>) => {
    setSelectedSources(sources);
    setActorParameters({});
    setActorSchemaReady(false);
    setConfigSubstep(0);
  }, []);
  const handleActorParametersChange = useCallback((parameters: Record<string, unknown>) => {
    setActorParameters(parameters);
    const actors = Array.isArray(parameters.actors) ? parameters.actors as Array<Record<string, unknown>> : [];
    setActorSchemaReady(actors.some(actor => actor.status === 'enabled'));
  }, []);
  const handleExecutionTelemetry = useCallback((snapshot: ExecutionTelemetry) => setExecution(snapshot), []);
  const handleScoringTelemetry = useCallback((snapshot: ScoringTelemetry) => setScoring(snapshot), []);
  const handleDecisionTelemetry = useCallback((snapshot: DecisionTelemetry) => setDecision(snapshot), []);
  const actorSourcesForSchema = selectedSources ?? EMPTY_DISCOVERY_SOURCES;

  const metrics: DigitalTwinMetric[] = [
    {
      status: actorSchemaReady ? '配置完成' : selectedSourceCount > 0 ? '待完成参数' : '待选择数据源',
      detail: selectedSourceCount + ' 个数据源 · ' + (actorSchemaReady ? '已启用可执行 Actor' : '需要完成 Schema 配置'),
      value: selectedSourceCount ? selectedSourceCount + ' SOURCES' : 'CONFIG',
      state: actorSchemaReady ? 'complete' : 'active',
    },
    {
      status: execution.status === 'running' ? '执行中' : execution.status === 'completed' ? '执行结束' : execution.status === 'failed' ? '执行异常' : '等待启动',
      detail: execution.runCount + ' 个真实任务 · 已发现 ' + execution.captured + ' 条企业记录',
      value: execution.recordCount ? execution.recordCount + ' RECORDS' : execution.captured + ' FOUND',
      state: execution.status === 'completed' ? 'complete' : execution.status === 'running' ? 'active' : execution.status === 'failed' ? 'warning' : 'pending',
      progress: execution.progress,
    },
    {
      status: scoring.loading ? '读取分析队列' : scoring.total > 0 && scoring.scored === scoring.total ? '分析完成' : scoring.total > 0 ? '待完成评分' : '等待分析数据',
      detail: scoring.total + ' 条企业记录 · 已完成 ' + scoring.scored + ' 条 AI 评分',
      value: scoring.total ? scoring.scored + '/' + scoring.total + ' SCORED' : 'AI SCORE',
      state: scoring.total > 0 && scoring.scored === scoring.total ? 'complete' : scoring.total > 0 ? 'active' : 'pending',
    },
    {
      status: decision.running ? '联系人补全中' : decision.synced > 0 ? '已同步 CRM' : decision.enriched > 0 ? '已识别候选' : '等待识别',
      detail: decision.total + ' 家企业 · ' + decision.enriched + ' 家已完成补全 · ' + decision.synced + ' 家已同步',
      value: decision.enriched + ' ENRICHED',
      state: decision.synced > 0 ? 'complete' : decision.running ? 'active' : decision.enriched > 0 ? 'active' : 'pending',
      progress: decision.progress,
    },
    {
      status: decision.synced > 0 ? '资产已沉淀' : '等待人工确认入库',
      detail: decision.synced + ' 家企业已通过人工确认同步至 CRM',
      value: decision.synced + ' CRM ASSETS',
      state: decision.synced > 0 ? 'complete' : 'pending',
    },
  ];

  // Follow the newest real task signal while preserving manual navigation between telemetry updates.
  useEffect(() => {
    if (decision.synced > 0) setActiveStage(4);
    else if (decision.running || decision.enriched > 0) setActiveStage(3);
    else if (!scoring.loading && scoring.total > 0) setActiveStage(2);
    else if (execution.status !== 'idle' || actorSchemaReady) setActiveStage(1);
  }, [
    actorSchemaReady,
    decision.enriched,
    decision.running,
    decision.synced,
    execution.status,
    scoring.loading,
    scoring.total,
  ]);

  const goToStage = (stage: number) => {
    setActiveStage(stage);
    if (stage === 0 && configSubstep === 1 && !selectedSourceCount) setConfigSubstep(0);
  };

  return (
    <main className="tp-prospect-discovery tp-prospect-discovery--digital-twin">
      <PageHeader className="tp-prospect-discovery__page-header">
        <div>
          <p className="tp-prospect-discovery__eyebrow">HARMONIA / GLOBAL TRADE INTELLIGENCE</p>
          <h1>全球外贸智能潜客发现</h1>
          <p>从全球企业发现、数据采集到 AI 分析与潜客资产沉淀的五节点工作流。</p>
        </div>
        <div className="tp-prospect-discovery__header-actions">
          <div className="tp-prospect-discovery__header-meta">
            <Tag type="blue">NODE {String(activeStage + 1).padStart(2, '0')} / 05</Tag>
            <strong>{['全球企业发现','数据采集与整合','AI 企业智能分析','决策者识别与验证','潜客资产沉淀'][activeStage]}</strong>
          </div>
          <div className="tp-prospect-discovery__hub-actions">
            <Link href="/prospect-history" renderIcon={semanticIcons.documents}>历史任务</Link>
            <Link href="/prospect-data" renderIcon={semanticIcons.database}>潜客数据</Link>
          </div>
        </div>
      </PageHeader>

      <div className="tp-prospect-discovery__task-code">
        <strong>任务方案 ID：{planTaskCode}</strong>
        <span>工作节点状态由实际任务与后端返回数据驱动，不生成模拟进度。</span>
      </div>

      <DigitalTwinWorkflow activeStage={activeStage} metrics={metrics} selectedSources={selectedSources ?? []} onStageChange={goToStage} />

      <section className="tp-prospect-discovery__work-panel">
        <div className="tp-prospect-discovery__work-panel-heading">
          <div>
            <p className="tp-prospect-discovery__eyebrow">WORK NODE {String(activeStage + 1).padStart(2, '0')}</p>
            <h2>{['全球企业发现','数据采集与整合','AI 企业智能分析','决策者识别与验证','潜客资产沉淀'][activeStage]}</h2>
            <p>{['选择企业发现渠道，并按各平台真实 Input Schema 配置采集参数。','执行已配置的真实采集任务，查看后端状态、数量与运行日志。','读取真实企业记录，调用已配置任务模型进行 AI 评分。','补全企业联系人信息，并由人工确认后同步至 CRM。','查看已经沉淀的企业数据资产与 CRM 客户记录。'][activeStage]}</p>
          </div>
          <Tag type={metrics[activeStage].state === 'complete' ? 'green' : metrics[activeStage].state === 'warning' ? 'red' : 'blue'}>{metrics[activeStage].status}</Tag>
        </div>

        {activeStage === 0 && (
          <div className="tp-prospect-discovery__configuration">
            <div className="tp-prospect-discovery__configuration-nav" aria-label="企业发现配置阶段">
              <Button kind={configSubstep === 0 ? 'primary' : 'tertiary'} onClick={() => setConfigSubstep(0)}>01 选择发现渠道</Button>
              <Button kind={configSubstep === 1 ? 'primary' : 'tertiary'} onClick={() => setConfigSubstep(1)} disabled={selectedSourceCount === 0}>02 配置采集参数</Button>
            </div>
            {configSubstep === 0
              ? <PlatformSelectionStep onSelectionCountChange={handleSelectionCountChange} selectedIds={selectedSources?.map(item => item.id)} onSelectionChange={handleSelectionChange} />
              : <ActorSchemaFields sources={actorSourcesForSchema} onValuesChange={handleActorParametersChange} />}
            <div className="tp-prospect-discovery__stage-actions">
              {configSubstep === 0
                ? <Button kind="primary" renderIcon={semanticIcons.next} onClick={() => setConfigSubstep(1)} disabled={selectedSourceCount === 0}>下一步：配置采集参数</Button>
                : <Button kind="primary" renderIcon={semanticIcons.next} onClick={() => setActiveStage(1)} disabled={!actorSchemaReady}>完成配置，进入数据采集</Button>}
            </div>
          </div>
        )}

        {activeStage === 1 && (
          <>
            <ExecutionStep
              sources={selectedSources ?? []}
              actorParameters={actorParameters}
              planTaskCode={planTaskCode}
              onEditStep={() => { setActiveStage(0); setConfigSubstep(1); }}
              onTelemetry={handleExecutionTelemetry}
              onContinueToScoring={ids => {
                try { localStorage.setItem('tradepilot.prospect-scoring.queue.v1', JSON.stringify(ids)); } catch { /* Preserve backend task history if browser storage is unavailable. */ }
                setActiveStage(2);
              }}
            />
            <div className="tp-prospect-discovery__stage-actions">
              <Button kind="secondary" onClick={() => { setActiveStage(0); setConfigSubstep(1); }}>返回采集配置</Button>
            </div>
          </>
        )}

        {activeStage === 2 && (
          <>
            <ScoringStep onContinueToEnrichment={() => setActiveStage(3)} onTelemetry={handleScoringTelemetry} />
            <div className="tp-prospect-discovery__stage-actions">
              <Button kind="secondary" onClick={() => setActiveStage(1)}>返回数据采集</Button>
            </div>
          </>
        )}

        {activeStage === 3 && (
          <>
            <DecisionMakerStep onTelemetry={handleDecisionTelemetry} />
            <div className="tp-prospect-discovery__stage-actions">
              <Button kind="secondary" onClick={() => setActiveStage(2)}>返回 AI 企业分析</Button>
              <Button kind="primary" renderIcon={semanticIcons.next} onClick={() => setActiveStage(4)}>查看潜客资产</Button>
            </div>
          </>
        )}

        {activeStage === 4 && (
          <div className="tp-prospect-discovery__asset-center">
            <div className="tp-prospect-discovery__asset-icon" aria-hidden="true"><span /></div>
            <div>
              <p className="tp-prospect-discovery__eyebrow">VERIFIED BUSINESS ASSETS</p>
              <h3>企业档案与客户资产</h3>
              <p>这里汇集已经发现、分析、补全并经过人工确认的企业记录。企业原始来源、采集记录和历史任务仍保留在潜客数据中心。</p>
            </div>
            <div className="tp-prospect-discovery__asset-metrics">
              <div><strong>{decision.synced}</strong><span>已同步至 CRM</span></div>
              <div><strong>{decision.enriched}</strong><span>已完成联系人补全</span></div>
              <div><strong>{scoring.scored}</strong><span>已完成 AI 评分</span></div>
            </div>
            <div className="tp-prospect-discovery__asset-links">
              <Link href="/prospect-data" renderIcon={semanticIcons.database}>打开潜客数据中心</Link>
              <Link href="/leads" renderIcon={semanticIcons.documents}>打开 CRM 潜客管理</Link>
              <Link href="/prospect-history" renderIcon={semanticIcons.time}>查看发现任务历史</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
