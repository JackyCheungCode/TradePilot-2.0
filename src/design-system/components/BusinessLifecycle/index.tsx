import { InlineNotification, ProgressIndicator, ProgressStep } from '@carbon/react';
import { useEffect, useRef, type ReactNode } from 'react';
import './business-lifecycle.scss';

export type BusinessLifecycleStep = { value: string; label: string };
export type BusinessLifecycleEvent = { id:string; event_type:string; from_status:string|null; to_status:string|null; note:string|null; actor_id?:string|null; created_at:string };
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
  const eventLabel=(value:string)=>({
    prospect_discovered:'发现潜客',prospect_reviewed:'审核通过',prospect_collected:'联系人采集完成',prospect_collection_empty:'本次未找到可用联系方式',prospect_converted:'转化为 CRM 线索',prospect_discarded:'排除潜客',prospect_removed:'移除潜客',
    customer_created:'创建客户档案',customer_status_changed:'客户状态变更',contact_created:'创建联系人档案',contact_status_changed:'联系人有效状态变更',contact_contact_preference_changed:'联系人联系许可变更',contact_employment_status_changed:'联系人任职状态变更',contact_method_verification_changed:'联系方式验证状态变更',
    opportunity_stage_changed:'商机阶段变更',quote_created:'创建报价单',quote_status_changed:'报价状态变更',sales_order_created:'创建销售订单',sales_order_status_changed:'订单状态变更',
    payment_created:'创建收款记录',payment_status_changed:'收款状态变更',shipment_created:'创建发运单',shipment_status_changed:'发运状态变更'
  } as Record<string,string>)[value]||value;
  const statusLabel=(value:string)=>steps.find(step=>step.value===value)?.label||({
    active:'活跃',inactive:'停用',dormant:'休眠',lost:'流失',blacklist:'黑名单',do_not_contact:'拒绝联系',contact_allowed:'允许联系',departed:'已离职',unknown:'未设置',
    verified:'已验证',unverified:'未验证',pending_verification:'待核实',valid:'有效',invalid:'无效',
    draft:'草稿',sent:'已发送',viewed:'已查看',accepted:'已接受',rejected:'已拒绝',expired:'已过期',cancelled:'已取消',
    confirmed:'已确认',preparing:'备货中',partially_shipped:'部分发货',shipped:'已发货',completed:'已完成',
    pending_confirmation:'待确认',partially_reconciled:'部分核销',reconciled:'已核销',returned:'已退回',voided:'已作废',
    pending_booking:'待订舱',booked:'已订舱',loaded:'已装柜',customs_cleared:'已报关',departed:'已开船',in_transit:'在途',arrived:'已到港',import_cleared:'已清关',delivered:'已签收'
  } as Record<string,string>)[value]||value;
  return <section className="tp-business-lifecycle" aria-label={title}>
    <div className="tp-business-lifecycle__heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{currentStep&&<span className="tp-business-lifecycle__current">{currentStep.label}</span>}</div>
    {terminal||statusOnly?<InlineNotification kind={terminalKind} title={terminalTitle||currentStep?.label||current} hideCloseButton lowContrast/>:
      <div ref={viewportRef} className="tp-business-lifecycle__viewport" role="region" aria-label={title+'阶段进度'} tabIndex={0}><div className="tp-business-lifecycle__track"><ProgressIndicator currentIndex={currentIndex} spaceEqually>{steps.map((step,index)=><ProgressStep key={step.value} label={step.label} description={index===currentIndex?'当前阶段':index<currentIndex?'已完成':'待处理'}/>)}</ProgressIndicator></div></div>}
    {children&&<div className="tp-business-lifecycle__footer">{children}</div>}
    {events.length>0&&<section className="tp-business-lifecycle__history" aria-label={title+'变更记录'}>
      <h3>生命周期记录</h3>
      <ol>{events.slice(0,10).map(event=><li key={event.id}>
        <div><strong>{event.from_status?statusLabel(event.from_status)+' → '+statusLabel(event.to_status||'—'):statusLabel(event.to_status||eventLabel(event.event_type))}</strong><time>{new Date(event.created_at).toLocaleString()}</time></div>
        <p>{event.note||eventLabel(event.event_type)}{event.actor_id&&<span className="tp-business-lifecycle__actor"> · 操作账户 ID {event.actor_id.slice(0,8)}</span>}</p>
      </li>)}</ol>
    </section>}
  </section>;
}
