import { InlineNotification, ProgressIndicator, ProgressStep } from '@carbon/react';
import { useEffect, useRef, type ReactNode } from 'react';
import './business-lifecycle.scss';

export type BusinessLifecycleStep = { value: string; label: string };
export type BusinessLifecycleEvent = { id:string; event_type:string; from_status:string|null; to_status:string|null; note:string|null; created_at:string };
type Props = {
  title: string; steps: BusinessLifecycleStep[]; current: string; description?: string;
  terminal?: boolean; terminalKind?: 'success' | 'warning' | 'error' | 'info';
  terminalTitle?: string; statusOnly?: boolean; children?: ReactNode; events?: BusinessLifecycleEvent[];
};
export function BusinessLifecycle({title,steps,current,description,terminal=false,terminalKind='info',terminalTitle,statusOnly=false,children,events=[]}:Props) {
  const viewportRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const currentStep=viewportRef.current?.querySelector<HTMLElement>('[aria-current="step"], .cds--progress-step--current');currentStep?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});},[current]);
  const currentIndex=Math.max(0,steps.findIndex(step=>step.value===current));
  const currentStep=steps.find(step=>step.value===current);
  return <section className="tp-business-lifecycle" aria-label={title}>
    <div className="tp-business-lifecycle__heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{currentStep&&<span className="tp-business-lifecycle__current">{currentStep.label}</span>}</div>
    {terminal||statusOnly?<InlineNotification kind={terminalKind} title={terminalTitle||currentStep?.label||current} hideCloseButton lowContrast/>:
      <div ref={viewportRef} className="tp-business-lifecycle__viewport" role="region" aria-label={title+'阶段进度'} tabIndex={0}><div className="tp-business-lifecycle__track"><ProgressIndicator currentIndex={currentIndex} spaceEqually>{steps.map((step,index)=><ProgressStep key={step.value} label={step.label} description={index===currentIndex?'当前阶段':index<currentIndex?'已完成':'待处理'}/>)}</ProgressIndicator></div></div>}
    {children&&<div className="tp-business-lifecycle__footer">{children}</div>}
    {events.length>0&&<section className="tp-business-lifecycle__history" aria-label={title+'变更记录'}>
      <h3>生命周期记录</h3>
      <ol>{events.slice(0,10).map(event=><li key={event.id}>
        <div><strong>{event.from_status?event.from_status+' → '+(event.to_status||'—'):(event.to_status||event.event_type)}</strong><time>{new Date(event.created_at).toLocaleString()}</time></div>
        <p>{event.note||event.event_type}</p>
      </li>)}</ol>
    </section>}
  </section>;
}
