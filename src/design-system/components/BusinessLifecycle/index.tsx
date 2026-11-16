import { InlineNotification, ProgressIndicator, ProgressStep } from '@carbon/react';
import type { ReactNode } from 'react';
import './business-lifecycle.scss';

export type BusinessLifecycleStep = { value: string; label: string };
type Props = {
  title: string; steps: BusinessLifecycleStep[]; current: string; description?: string;
  terminal?: boolean; terminalKind?: 'success' | 'warning' | 'error' | 'info';
  terminalTitle?: string; statusOnly?: boolean; children?: ReactNode;
};
export function BusinessLifecycle({title,steps,current,description,terminal=false,terminalKind='info',terminalTitle,statusOnly=false,children}:Props) {
  const currentIndex=Math.max(0,steps.findIndex(step=>step.value===current));
  const currentStep=steps.find(step=>step.value===current);
  return <section className="tp-business-lifecycle" aria-label={title}>
    <div className="tp-business-lifecycle__heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{currentStep&&<span className="tp-business-lifecycle__current">{currentStep.label}</span>}</div>
    {terminal||statusOnly?<InlineNotification kind={terminalKind} title={terminalTitle||currentStep?.label||current} hideCloseButton lowContrast/>:
      <div className="tp-business-lifecycle__viewport" role="region" aria-label={title+'阶段进度'} tabIndex={0}><div className="tp-business-lifecycle__track"><ProgressIndicator currentIndex={currentIndex} spaceEqually>{steps.map((step,index)=><ProgressStep key={step.value} label={step.label} description={index===currentIndex?'当前阶段':index<currentIndex?'已完成':'待处理'}/>)}</ProgressIndicator></div></div>}
    {children&&<div className="tp-business-lifecycle__footer">{children}</div>}
  </section>;
}
