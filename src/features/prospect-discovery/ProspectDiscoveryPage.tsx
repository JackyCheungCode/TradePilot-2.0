import { useState } from 'react';
import { Tabs, TabList, Tab } from '@/design-system';

const steps = [
  '意图与画像锚定（Target Profiling）',
  '数据源与平台选择（Platform & Source Selection）',
  '拦截护盾配置（Filtering & Guardrails Config）',
  '执行全网搜索（Multi-Channel Execution）',
  'AI智能清洗与打分（AI Filtering & Scoring）',
  '决策人穿透与入库（Decision-Maker Enrichment & CRM Sync）',
] as const;

export function ProspectDiscoveryPage() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <main className="tp-prospect-discovery">
      <Tabs
        selectedIndex={selectedIndex}
        onChange={({ selectedIndex: nextIndex }) => setSelectedIndex(nextIndex)}
      >
        <TabList aria-label="潜客发现六步流程" contained>
          {steps.map((step) => (
            <Tab key={step}>{step}</Tab>
          ))}
        </TabList>
      </Tabs>
    </main>
  );
}
