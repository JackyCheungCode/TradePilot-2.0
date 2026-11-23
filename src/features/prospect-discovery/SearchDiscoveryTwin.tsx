import type { CSSProperties } from 'react';

type Props = {
  activeStep: number;
  onStepChange: (step: number) => void;
  candidateCount: number;
  taskCount: number;
};

const steps = [
  { code: '01', name: '搜索发现', english: 'SEARCH ENGINE', detail: '搜索 API · 市场定位', metric: 'API ONLY', icon: '⌕' },
  { code: '02', name: '候选网站', english: 'PROSPECT POOL', detail: '筛选 · 多选 · 去重', metric: 'CANDIDATES', icon: '◎' },
  { code: '03', name: 'AI 深度分析', english: 'AI INTELLIGENCE', detail: 'Browser Run · AI 抽取', metric: 'ON DEMAND', icon: '✳' },
  { code: '04', name: '企业情报', english: 'COMPANY INTELLIGENCE', detail: '证据 · 档案 · 导出', metric: 'VERIFIED DATA', icon: '▤' },
];

export function SearchDiscoveryTwin({ activeStep, onStepChange, candidateCount, taskCount }: Props) {
  return (
    <section className="tp-search-twin" aria-label="搜索引擎发现数字孪生工作流">
      <div className="tp-search-twin__heading">
        <div>
          <p className="tp-search-twin__eyebrow">DIGITAL TWIN / PROSPECT DISCOVERY</p>
          <h2>全球潜客发现工作流</h2>
          <p>从市场搜索到企业情报沉淀的四个数字工作站</p>
        </div>
        <div className="tp-search-twin__telemetry">
          <span><i className="tp-search-twin__pulse" /> LIVE WORKFLOW</span>
          <strong>{String(activeStep + 1).padStart(2, '0')} <small>/ 04</small></strong>
        </div>
      </div>

      <div className="tp-search-twin__scene">
        <div className="tp-search-twin__ambient tp-search-twin__ambient--one" />
        <div className="tp-search-twin__ambient tp-search-twin__ambient--two" />
        <div className="tp-search-twin__floor" />
        <div className="tp-search-twin__stations">
          {steps.map((step, index) => {
            const active = index === activeStep;
            const complete = index < activeStep;
            const metric = index === 0 ? taskCount + ' TASKS' : index === 1 ? candidateCount + ' SITES' : step.metric;
            return (
              <div className="tp-search-twin__station-wrap" key={step.code}>
                {index > 0 && <div className={'tp-search-twin__link ' + (complete || active ? 'is-lit' : '')} aria-hidden="true"><span /></div>}
                <button
                  type="button"
                  className={'tp-search-twin__station' + (active ? ' is-active' : '') + (complete ? ' is-complete' : '')}
                  onClick={() => onStepChange(index)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={'进入步骤 ' + step.code + '：' + step.name}
                >
                  <span className="tp-search-twin__station-top"><span>{step.code}</span><span className="tp-search-twin__station-state">{complete ? '完成' : active ? '当前' : '待处理'}</span></span>
                  <span className="tp-search-twin__core" aria-hidden="true">
                    <span className="tp-search-twin__core-ring" />
                    <span className="tp-search-twin__core-icon">{step.icon}</span>
                    <span className="tp-search-twin__core-orbit" />
                  </span>
                  <span className="tp-search-twin__station-name">{step.name}</span>
                  <span className="tp-search-twin__station-english">{step.english}</span>
                  <span className="tp-search-twin__station-detail">{step.detail}</span>
                  <span className="tp-search-twin__station-metric">{metric}</span>
                  <span className="tp-search-twin__station-base" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="tp-search-twin__scene-footer">
          <span>TRADEPILOT / INTELLIGENCE PIPELINE</span>
          <span>SELECT A WORKSTATION TO NAVIGATE</span>
        </div>
      </div>
    </section>
  );
}
