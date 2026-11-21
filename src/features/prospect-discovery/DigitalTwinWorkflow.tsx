import { Button, Tag } from '@/design-system';

export type DigitalTwinMetric = {
  status: string;
  detail: string;
  value?: string;
  state?: 'complete' | 'active' | 'warning' | 'pending';
  progress?: number;
};

type Props = {
  activeStage: number;
  metrics: DigitalTwinMetric[];
  onStageChange: (stage: number) => void;
};

const stages = [
  { id: 'globe', number: '01', title: '全球企业发现', english: 'GLOBAL DISCOVERY', description: '扫描国家、市场与企业来源' },
  { id: 'collection', number: '02', title: '数据采集与整合', english: 'DATA COLLECTION', description: '调度采集、清洗并标准化' },
  { id: 'intelligence', number: '03', title: 'AI 企业智能分析', english: 'AI INTELLIGENCE', description: '识别企业属性与商业潜力' },
  { id: 'decision', number: '04', title: '决策者识别与验证', english: 'DECISION MAKER', description: '识别联系人并核验关联' },
  { id: 'assets', number: '05', title: '潜客资产沉淀', english: 'LEAD ASSETS', description: '形成档案并进入潜客中心' },
] as const;

function Scene({ id }: { id: string }) {
  if (id === 'globe') return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--globe" aria-hidden="true">
      <div className="tp-digital-twin__orbit tp-digital-twin__orbit--one" />
      <div className="tp-digital-twin__globe"><span /></div>
      <div className="tp-digital-twin__scan" />
      <i className="tp-digital-twin__signal tp-digital-twin__signal--a" />
      <i className="tp-digital-twin__signal tp-digital-twin__signal--b" />
      <i className="tp-digital-twin__signal tp-digital-twin__signal--c" />
    </div>
  );
  if (id === 'collection') return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--collection" aria-hidden="true">
      <div className="tp-digital-twin__machine"><i /><i /><i /></div>
      <div className="tp-digital-twin__conveyor"><i /><i /><i /></div>
      <div className="tp-digital-twin__data-chip tp-digital-twin__data-chip--one" />
      <div className="tp-digital-twin__data-chip tp-digital-twin__data-chip--two" />
    </div>
  );
  if (id === 'intelligence') return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--intelligence" aria-hidden="true">
      <div className="tp-digital-twin__ai-ring tp-digital-twin__ai-ring--one" />
      <div className="tp-digital-twin__ai-ring tp-digital-twin__ai-ring--two" />
      <div className="tp-digital-twin__ai-core"><span>AI</span></div>
      <i className="tp-digital-twin__ai-node tp-digital-twin__ai-node--one" />
      <i className="tp-digital-twin__ai-node tp-digital-twin__ai-node--two" />
      <i className="tp-digital-twin__ai-node tp-digital-twin__ai-node--three" />
    </div>
  );
  if (id === 'decision') return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--decision" aria-hidden="true">
      <div className="tp-digital-twin__relationship-line tp-digital-twin__relationship-line--one" />
      <div className="tp-digital-twin__relationship-line tp-digital-twin__relationship-line--two" />
      <div className="tp-digital-twin__person tp-digital-twin__person--main"><span /></div>
      <div className="tp-digital-twin__person tp-digital-twin__person--left"><span /></div>
      <div className="tp-digital-twin__person tp-digital-twin__person--right"><span /></div>
      <div className="tp-digital-twin__person tp-digital-twin__person--top"><span /></div>
    </div>
  );
  return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--assets" aria-hidden="true">
      <div className="tp-digital-twin__vault"><i /><i /><i /></div>
      <div className="tp-digital-twin__asset-cube tp-digital-twin__asset-cube--one" />
      <div className="tp-digital-twin__asset-cube tp-digital-twin__asset-cube--two" />
    </div>
  );
}

export function DigitalTwinWorkflow({ activeStage, metrics, onStageChange }: Props) {
  return (
    <section className="tp-digital-twin" aria-label="五个工作节点数字孪生流程">
      <div className="tp-digital-twin__heading">
        <div>
          <p className="tp-digital-twin__eyebrow">GLOBAL TRADE INTELLIGENCE / DIGITAL TWIN</p>
          <h2>全球潜客发现工作流</h2>
          <p>五个真实业务节点 · 状态与数量来自当前任务执行数据</p>
        </div>
        <div className="tp-digital-twin__legend">
          <Tag type="blue">5 个工作节点</Tag>
          <span><i />当前工作节点</span>
          <span><b />已完成</span>
        </div>
      </div>
      <div className="tp-digital-twin__nodes">
        {stages.map((stage, index) => {
          const metric = metrics[index] ?? { status: '待开始', detail: '等待前序工作' };
          const active = activeStage === index;
          return (
            <div className="tp-digital-twin__node-wrap" key={stage.id}>
              <Button
                kind={active ? 'primary' : 'ghost'}
                size="lg"
                className={`tp-digital-twin__node ${active ? 'tp-digital-twin__node--active' : ''} ${metric.state === 'complete' ? 'tp-digital-twin__node--complete' : ''}`}
                onClick={() => onStageChange(index)}
                aria-pressed={active}
              >
                <span className="tp-digital-twin__node-top">
                  <span className="tp-digital-twin__node-number">{stage.number}</span>
                  <span className="tp-digital-twin__node-state">{metric.status}</span>
                </span>
                <Scene id={stage.id} />
                <span className="tp-digital-twin__node-copy">
                  <strong>{stage.title}</strong>
                  <small>{stage.english}</small>
                  <span>{stage.description}</span>
                </span>
                {metric.value && <span className="tp-digital-twin__node-value">{metric.value}</span>}
                {typeof metric.progress === 'number' && metric.state === 'active' && (
                  <span className="tp-digital-twin__node-progress" aria-label={`真实任务进度 ${metric.progress}%`}>真实任务进度 {metric.progress}%</span>
                )}
                <span className="tp-digital-twin__node-detail">{metric.detail}</span>
              </Button>
              {/* A connector is highlighted only when the upstream task reports completion. */}
              {index < stages.length - 1 && <span className={`tp-digital-twin__connector ${metric.state === 'complete' ? 'tp-digital-twin__connector--passed' : ''}`} aria-hidden="true"><i /></span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
