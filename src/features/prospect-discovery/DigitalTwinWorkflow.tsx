import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button, Tag } from '@/design-system';

export type DigitalTwinMetric = {
  status: string;
  detail: string;
  value?: string;
  state?: string;
  progress?: number;
};

type Source = { id: string; name: string; category?: string };
type Props = {
  activeStage: number;
  metrics: DigitalTwinMetric[];
  selectedSources: Source[];
  onStageChange: (stage: number) => void;
};

const stages = [
  { id: 'globe', number: '01', title: '全球企业发现', english: 'GLOBAL DISCOVERY', description: '按已选择的平台扫描企业来源' },
  { id: 'collection', number: '02', title: '数据采集与整合', english: 'DATA COLLECTION', description: '网页抓取、解析、清洗并写入存储' },
  { id: 'intelligence', number: '03', title: 'AI 企业智能分析', english: 'AI INTELLIGENCE', description: '识别企业属性与商业潜力' },
  { id: 'decision', number: '04', title: '决策者识别与验证', english: 'DECISION MAKER', description: '识别联系人并核验关联' },
  { id: 'assets', number: '05', title: '潜客资产沉淀', english: 'LEAD ASSETS', description: '形成档案并进入潜客中心' },
] as const;

const directLogos: Record<string, string> = {
  facebook: 'facebook.svg', 'google-maps': 'google_maps.svg', alibaba: 'alibaba.svg',
  instagram: 'instagram.svg', linkedin: 'linkedin.svg', amazon: 'amazon.svg',
  aliexpress: 'aliexpress.svg', shopify: 'shopify.svg', tiktok: 'tiktok.svg',
  telegram: 'telegram.svg', whatsapp: 'whatsapp.svg', wechat: 'wechat.svg',
};
const spriteLogos: Record<string, { file: string; symbol: string }> = {
  'google-search': { file: 'platform-sprite-search.svg', symbol: 'google' },
  'google-news': { file: 'platform-sprite-search.svg', symbol: 'googlenews' },
  duckduckgo: { file: 'platform-sprite-search.svg', symbol: 'duckduckgo' },
  baidu: { file: 'platform-sprite-search.svg', symbol: 'baidu' },
  'x-twitter': { file: 'platform-sprite-social.svg', symbol: 'x' },
  reddit: { file: 'platform-sprite-social.svg', symbol: 'reddit' },
  pinterest: { file: 'platform-sprite-social.svg', symbol: 'pinterest' },
  threads: { file: 'platform-sprite-social.svg', symbol: 'threads' },
  youtube: { file: 'platform-sprite-media.svg', symbol: 'youtube' },
  vimeo: { file: 'platform-sprite-media.svg', symbol: 'vimeo' },
  twitch: { file: 'platform-sprite-media.svg', symbol: 'twitch' },
  ebay: { file: 'platform-sprite-media.svg', symbol: 'ebay' },
  etsy: { file: 'platform-sprite-social-media.svg', symbol: 'etsy' },
  medium: { file: 'platform-sprite-community.svg', symbol: 'medium' },
  tumblr: { file: 'platform-sprite-community.svg', symbol: 'tumblr' },
  snapchat: { file: 'platform-sprite-community.svg', symbol: 'snapchat' },
  quora: { file: 'platform-sprite-community.svg', symbol: 'quora' },
  wappalyzer: { file: 'platform-sprite-webtech.svg', symbol: 'wappalyzer' },
  similarweb: { file: 'platform-sprite-webtech.svg', symbol: 'similarweb' },
  webflow: { file: 'platform-sprite-webtech.svg', symbol: 'webflow' },
  wix: { file: 'platform-sprite-webtech.svg', symbol: 'wix' },
  crunchbase: { file: 'platform-sprite-business.svg', symbol: 'crunchbase' },
  'product-hunt': { file: 'platform-sprite-business.svg', symbol: 'producthunt' },
  github: { file: 'platform-sprite-business.svg', symbol: 'github' },
  taobao: { file: 'platform-sprite-business.svg', symbol: 'taobao' },
  rakuten: { file: 'platform-sprite-retail.svg', symbol: 'rakuten' },
  target: { file: 'platform-sprite-retail.svg', symbol: 'target' },
  newegg: { file: 'platform-sprite-retail.svg', symbol: 'newegg' },
  shopee: { file: 'platform-sprite-retail.svg', symbol: 'shopee' },
  naver: { file: 'platform-sprite-regional.svg', symbol: 'naver' },
  xing: { file: 'platform-sprite-regional.svg', symbol: 'xing' },
  bilibili: { file: 'platform-sprite-more.svg', symbol: 'bilibili' },
  'yelp-local': { file: 'platform-sprite-more.svg', symbol: 'yelp' },
};

function PlatformLogo({ source }: { source: Source }) {
  if (directLogos[source.id]) return <img src={'/platform-logos/' + directLogos[source.id]} alt="" />;
  const sprite = spriteLogos[source.id];
  if (sprite) return <svg viewBox="0 0 24 24" aria-hidden="true"><use href={'/platform-logos/' + sprite.file + '#' + sprite.symbol} /></svg>;
  return <b>{source.name.slice(0, 2).toUpperCase()}</b>;
}

function Scene({ id, sources }: { id: string; sources: Source[] }) {
  if (id === 'globe') return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--globe" aria-hidden="true">
      <div className="tp-digital-twin__orbit tp-digital-twin__orbit--one" />
      <div className="tp-digital-twin__globe"><span /></div>
      <div className="tp-digital-twin__scan" />
      <div className="tp-digital-twin__source-orbit">
        {sources.slice(0, 8).map((source, index) => (
          <span className={`tp-digital-twin__source-logo tp-digital-twin__source-logo--${index + 1}`} key={source.id}>
            <PlatformLogo source={source} />
          </span>
        ))}
      </div>
      <i className="tp-digital-twin__signal tp-digital-twin__signal--a" />
      <i className="tp-digital-twin__signal tp-digital-twin__signal--b" />
      <i className="tp-digital-twin__signal tp-digital-twin__signal--c" />
    </div>
  );
  if (id === 'collection') return (
    <div className="tp-digital-twin__scene tp-digital-twin__scene--collection" aria-hidden="true">
      <div className="tp-digital-twin__browser">
        <div className="tp-digital-twin__browser-bar"><i /><i /><i /><span>source page / parser</span></div>
        <div className="tp-digital-twin__browser-content"><b /><i /><i /><i /><span /></div>
      </div>
      <div className="tp-digital-twin__scrape-beam" />
      <div className="tp-digital-twin__machine"><i /><i /><i /></div>
      <div className="tp-digital-twin__conveyor"><i /><i /><i /></div>
      <div className="tp-digital-twin__server"><i /><i /><i /></div>
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

export function DigitalTwinWorkflow({ activeStage, metrics, selectedSources, onStageChange }: Props) {
  const activeNodeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [rotation, setRotation] = useState({ x: 2, y: -3 });
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    activeNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeStage]);

  const beginRotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const rotateScene = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setRotation(current => ({ x: Math.max(-2, Math.min(6, current.x - Math.round(dy / 18))), y: Math.max(-6, Math.min(6, current.y + Math.round(dx / 18))) }));
  };
  const endRotate = () => { dragRef.current = null; };

  return (
    <section className="tp-digital-twin" aria-label="五个工作节点数字孪生流程">
      <div className="tp-digital-twin__heading">
        <div>
          <p className="tp-digital-twin__eyebrow">GLOBAL TRADE INTELLIGENCE / DIGITAL TWIN</p>
          <h2>全球潜客发现工作流</h2>
          <p>任务状态驱动节点流转 · 横向流水线 · 可旋转与缩放的 3D 场景</p>
        </div>
        <div className="tp-digital-twin__legend">
          <Tag type="blue">5 个工作节点</Tag>
          <span><i />当前工作节点</span>
          <span><b />已完成</span>
        </div>
      </div>
      <div className="tp-digital-twin__rail-hint"><span>01</span><span className="tp-digital-twin__rail-line" /><span>05</span><small>左右滑动浏览全部节点</small></div>
      <div className="tp-digital-twin__nodes" aria-label="横向工作节点流水线">
        {stages.map((stage, index) => {
          const metric = metrics[index] ?? { status: '待开始', detail: '等待前序工作' };
          const active = activeStage === index;
          return (
            <div className="tp-digital-twin__node-wrap" key={stage.id} ref={active ? activeNodeRef : undefined}>
              <Button
                kind={active ? 'primary' : 'ghost'}
                size="lg"
                className={`tp-digital-twin__node ${active ? 'tp-digital-twin__node--active' : ''} ${metric.state === 'complete' ? 'tp-digital-twin__node--complete' : ''} ${metric.state === 'warning' ? 'tp-digital-twin__node--warning' : ''}`}
                onClick={() => onStageChange(index)}
                aria-pressed={active}
              >
                <span className="tp-digital-twin__node-top">
                  <span className="tp-digital-twin__node-number">{stage.number}</span>
                  <span className="tp-digital-twin__node-state">{metric.status}</span>
                </span>
                <Scene id={stage.id} sources={selectedSources} />
                <span className="tp-digital-twin__node-copy">
                  <strong>{stage.title}</strong>
                  <small>{stage.english}</small>
                  <span>{stage.description}</span>
                </span>
                {metric.value && <span className="tp-digital-twin__node-value">{metric.value}</span>}
                {typeof metric.progress === 'number' && metric.state === 'active' && (
                  <span className={`tp-digital-twin__node-progress tp-digital-twin__node-progress--${Math.round(metric.progress / 10) * 10}`} aria-label={`真实任务进度 ${metric.progress}%`}><i /></span>
                )}
                <span className="tp-digital-twin__node-detail">{metric.detail}</span>
              </Button>
              {index < stages.length - 1 && <span className={`tp-digital-twin__connector ${metric.state === 'complete' ? 'tp-digital-twin__connector--passed' : ''}`} aria-hidden="true"><i /></span>}
            </div>
          );
        })}
      </div>
      <div className="tp-digital-twin__viewport">
        <div className="tp-digital-twin__viewport-heading">
          <div><strong>3D 数字孪生视角</strong><span>拖动旋转场景 · 缩放观察设备结构</span></div>
          <div className="tp-digital-twin__viewport-controls">
            <Button kind="ghost" size="sm" onClick={() => setZoom(value => Math.max(75, value - 10))} aria-label="缩小 3D 场景">−</Button>
            <span>{zoom}%</span>
            <Button kind="ghost" size="sm" onClick={() => setZoom(value => Math.min(150, value + 10))} aria-label="放大 3D 场景">+</Button>
            <Button kind="ghost" size="sm" onClick={() => { setRotation({ x: 2, y: -3 }); setZoom(100); }}>重置视角</Button>
          </div>
        </div>
        <div className="tp-digital-twin__viewport-canvas" onPointerDown={beginRotate} onPointerMove={rotateScene} onPointerUp={endRotate} onPointerCancel={endRotate}>
          <div className="tp-digital-twin__viewport-grid" />
          <div className="tp-digital-twin__viewport-model"><div className="tp-digital-twin__viewport-rotate-x" style={{ transform: `rotateX(${rotation.x}deg)` }}><div className="tp-digital-twin__viewport-rotate-y" style={{ transform: `rotateY(${rotation.y}deg)` }}><div className={`tp-digital-twin__viewport-model-scale tp-digital-twin__viewport-model-scale--zoom-${zoom}`}>
            <div className="tp-digital-twin__viewport-platforms">
              {selectedSources.length ? selectedSources.map(source => (
                <span key={source.id}><PlatformLogo source={source} />{source.name}</span>
              )) : <span className="tp-digital-twin__empty-source">选择平台后，已选来源将在这里接入流水线</span>}
            </div>
            {stages.map((stage, index) => (
              <div className={`tp-digital-twin__machine-stage tp-digital-twin__machine-stage--${index + 1} ${index === activeStage ? 'is-active' : ''} ${metrics[index]?.state === 'complete' ? 'is-complete' : ''}`} key={stage.id}>
                <div className="tp-digital-twin__machine-platform"><i /><i /><i /></div>
                <strong>{stage.number}</strong><small>{stage.title}</small>
                {index === 1 && <div className="tp-digital-twin__machine-server"><i /><i /><i /></div>}
                {index < 4 && <span className="tp-digital-twin__machine-flow" />}
              </div>
            ))}
            <div className="tp-digital-twin__machine-ground" />
          </div></div></div></div>
        </div>
        <div className="tp-digital-twin__viewport-footnote">当前聚焦：{stages[activeStage]?.title} · 场景节点与上方任务状态同步；动画不代替真实任务执行。</div>
      </div>
    </section>
  );
}
