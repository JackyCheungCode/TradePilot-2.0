import { useState } from 'react';
import { Button, Search, Tag, Tile, TextArea, CarbonIcons } from '@/design-system';
import './InboxPage.scss';

const channels = [
  { id: 'whatsapp', label: 'WhatsApp', color: 'green' as const },
  { id: 'line', label: 'LINE', color: 'green' as const },
  { id: 'messenger', label: 'Messenger', color: 'blue' as const },
  { id: 'telegram', label: 'Telegram', color: 'blue' as const },
  { id: 'wecom', label: 'WeCom', color: 'green' as const },
  { id: 'email', label: 'Email', color: 'gray' as const },
];

export function InboxPage() {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');

  return (
    <main className="tp-inbox">
      <header className="tp-inbox__header">
        <div>
          <p className="tp-inbox__eyebrow">CUSTOMER COMMUNICATION</p>
          <h1>消息 <span>Inbox</span></h1>
          <p className="tp-inbox__description">统一查看和处理来自不同渠道的客户沟通。</p>
        </div>
        <div className="tp-inbox__header-actions">
          <Button kind="tertiary" renderIcon={CarbonIcons.Settings}>渠道设置</Button>
        </div>
      </header>

      <section className="tp-inbox__workspace" aria-label="全渠道消息工作台">
        <aside className="tp-inbox__conversations">
          <div className="tp-inbox__list-header">
            <h2>会话 <span>Conversations</span></h2>
            <Button kind="ghost" size="sm" hasIconOnly renderIcon={CarbonIcons.Add} iconDescription="新建会话" />
          </div>
          <Search
            size="lg"
            labelText="搜索会话"
            placeholder="搜索公司、联系人、电话或邮箱"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
          <div className="tp-inbox__filters" aria-label="渠道筛选">
            <Button size="sm" kind={channelFilter === 'all' ? 'primary' : 'tertiary'} onClick={() => setChannelFilter('all')}>全部</Button>
            {channels.map((channel) => (
              <Button key={channel.id} size="sm" kind={channelFilter === channel.id ? 'primary' : 'tertiary'} onClick={() => setChannelFilter(channel.id)}>{channel.label}</Button>
            ))}
          </div>
          <div className="tp-inbox__empty-list">
            <CarbonIcons.Chat size={28} />
            <h3>暂无会话</h3>
            <p>连接沟通渠道后，客户消息会集中显示在这里。</p>
          </div>
        </aside>

        <section className="tp-inbox__thread" aria-label="聊天内容">
          <div className="tp-inbox__thread-empty">
            <CarbonIcons.Chat size={40} />
            <h2>选择一个会话</h2>
            <p>从左侧选择客户，即可查看跨渠道消息时间线并继续沟通。</p>
          </div>
          <div className="tp-inbox__composer" aria-label="消息编辑区">
            <div className="tp-inbox__composer-meta">
              <Tag type="cool-gray">回复渠道：等待选择会话</Tag>
              <span>发送功能将在渠道授权完成后启用</span>
            </div>
            <TextArea
              id="inbox-message-draft"
              labelText="撰写消息"
              hideLabel
              placeholder="选择会话后开始撰写消息…"
              value={draft}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
              rows={3}
              disabled
            />
            <div className="tp-inbox__composer-actions">
              <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Attachment} disabled>添加附件</Button>
              <Button size="md" renderIcon={CarbonIcons.Send} disabled>发送消息</Button>
            </div>
          </div>
        </section>

        <aside className="tp-inbox__insights" aria-label="AI 助手与客户业务数据">
          <section className="tp-inbox__panel">
            <div className="tp-inbox__panel-heading">
              <h2>AI 助手 <span>AI Assist</span></h2>
              <CarbonIcons.Sparkles size={20} />
            </div>
            <p className="tp-inbox__muted">结合客户沟通与 ERP 业务记录，辅助整理客户诉求和跟进建议。</p>
            <Button kind="tertiary" size="sm" renderIcon={CarbonIcons.Summarize} disabled>生成会话总结</Button>
            <div className="tp-inbox__placeholder">选择会话后，将在此显示客户摘要、待确认事项和建议回复。</div>
          </section>
          <section className="tp-inbox__panel">
            <h2>业务概览 <span>Business Overview</span></h2>
            <div className="tp-inbox__metrics">
              <Tile><span>总订单数</span><strong>—</strong></Tile>
              <Tile><span>累计交易额</span><strong>—</strong></Tile>
              <Tile><span>进行中订单</span><strong>—</strong></Tile>
            </div>
            <div className="tp-inbox__placeholder">选择客户后，显示订单趋势及报价、订单、发运和收款单据入口。</div>
          </section>
        </aside>
      </section>
    </main>
  );
}
