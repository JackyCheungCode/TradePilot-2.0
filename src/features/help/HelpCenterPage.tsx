import { useMemo, useState } from 'react';
import { PageHeader, Tile, Tag, TextInput, Link, semanticIcons } from '@/design-system';
import '@/design-system/patterns/help-center.scss';

type HelpSection = { id: string; title: string; summary: string; route: string; steps: string[] };
const sections: HelpSection[] = [
  { id: 'overview', title: '系统概览与推荐业务流程', summary: '从基础配置、潜客发现到客户转化、交易履约和经营复盘的完整业务链路。', route: '/dashboard', steps: ['完成企业档案、产品、业务规则和 API 配置', '发现潜客并检查数据质量', '转入线索与 CRM，建立客户和联系人关系', '跟进销售机会并制作报价单', '客户确认后创建销售订单', '安排发运、登记收款并制作贸易单证', '回到总览检查业务数据和任务状态'] },
  { id: 'dashboard', title: '工作台 · 总览', summary: '查看经营指标、国家市场分布、销售漏斗、物流和 Agent 运行情况。', route: '/dashboard', steps: ['打开总览并等待数据加载', '选择时间范围和国家/市场筛选', '切换市场指标查看不同分布', '结合图表进入相应业务模块核查明细', '金额汇总以币种和基础币快照规则为准'] },
  { id: 'discovery', title: '全球情报与潜客发现', summary: '配置数据源、执行搜索、AI 清洗评分、决策人识别并沉淀潜客。', route: '/prospect-discovery', steps: ['选择数据源与平台', '按动态参数表填写搜索条件', '执行搜索并观察任务状态', '检查 AI 清洗和评分结果', '核对决策人信息后决定是否入库', '到历史任务查看日志，到潜客数据管理结果'] },
  { id: 'leads', title: '线索管理', summary: '查看发现或手动录入的线索，持续跟进并转化为正式客户。', route: '/leads', steps: ['搜索线索或创建新线索', '核对企业、国家、联系方式和来源', '更新跟进状态与资料', '转化前检查是否已有客户档案', '转化后在客户档案和销售机会中继续维护'] },
  { id: 'crm', title: '客户、联系人与销售机会', summary: '维护企业客户主档、关键联系人和销售推进过程。', route: '/accounts', steps: ['建立或查找客户档案', '将联系人关联到正确客户', '创建销售机会并关联客户/联系人', '更新阶段、预计金额、概率和预计成交日期', '成交后进入报价或订单流程'] },
  { id: 'communications', title: '客户沟通与小雅', summary: '集中处理会话，结合 AI 助手辅助信息整理与跟进。', route: '/communications', steps: ['选择客户和会话', '查看上下文并确认沟通对象', '核对渠道和消息内容后发送', '将重要结果同步到客户或商机记录', '小雅生成的内容须人工核验'] },
  { id: 'sales', title: '报价单、销售订单与产品', summary: '管理产品主数据、报价、订单确认和后续履约。', route: '/quotes', steps: ['维护产品分类、SKU 和规格', '创建报价并核对客户、明细、币种和有效期', '保存草稿并复核版本', '客户确认后创建销售订单', '核对订单明细、交期和贸易条款'] },
  { id: 'documents', title: '贸易单证中心', summary: '从业务数据生成专业外贸单据，管理模板、企业资料和历史文件。', route: '/documents', steps: ['选择单据类型或即时单据', '载入订单/发运等业务来源', '核对抬头、客户、商品、金额和运输信息', '编辑版式并保存草稿', '预览确认后按流程生成正式文件', '在已生成单据中追踪文件和版本'] },
  { id: 'fulfillment', title: '物流发运与收款', summary: '跟踪发运节点、异常、收款分配、退款和对账。', route: '/shipments', steps: ['从订单创建发运并填写运输和包装信息', '更新计划/实际发运日期及跟踪节点', '登记异常并关联订单', '创建收款并关联客户/订单', '分配预收余额、登记退款并核对银行流水'] },
  { id: 'tools', title: '贸易工具', summary: '使用外贸辅助工具，输出以服务配置和数据来源为准。', route: '/trade-tools', steps: ['打开工具并阅读输入要求', '核对国家、币种、单位和参数', '确认第三方调用及潜在费用后执行', '检查来源、更新时间和结果完整性'] },
  { id: 'ai', title: 'AI 与 Agent 管理', summary: '管理模型、Agent、第三方连接、Skills、Tools、任务调度和安全边界。', route: '/ai-agents', steps: ['配置模型供应商和凭证', '创建/启用所需 Agent', '接入第三方 Agent 并限制权限', '注册并审查 Skill 来源、版本和契约', '配置 Tool 权限，尤其关注写入和外发操作', '查看任务执行状态与历史记录'] },
  { id: 'settings', title: '系统设置、个人设置与安全', summary: '维护产品、CRM、企业资料、单证、物流收款规则、API 和账号安全。', route: '/settings', steps: ['按业务领域维护产品与 CRM 字典', '维护企业档案和单证抬头', '设置单据类型、模板和业务规则', '维护币种、贸易术语、发运与收款配置', '检查 API 集成和授权', '在安全中心配置 MFA/通行密钥及恢复方式'] },
  { id: 'troubleshooting', title: '常见问题与安全提示', summary: '登录、数据加载、任务执行、消息发送、金额和单证异常的排查建议。', route: '/security', steps: ['先确认登录状态、权限和筛选条件', '查看页面错误提示及任务日志', '核对外部服务连接、额度和授权', '检查记录编号、币种、版本和关联业务', '反馈问题时不要发送密码、验证码或令牌'] },
];


type HelpRoute = { label: string; route: string };
const routeDirectory: HelpRoute[] = [
  { label: "登录", route: "/login" },
  { label: "工作台总览", route: "/dashboard" },
  { label: "帮助中心", route: "/help" },
  { label: "沟通工作区", route: "/communications" },
  { label: "旧收件箱兼容入口", route: "/inbox" },
  { label: "小雅工作区", route: "/agent" },
  { label: "AI 与 Agent 总览", route: "/ai-agents" },
  { label: "AI 模型与供应商", route: "/ai-agents?section=models" },
  { label: "Agent 管理", route: "/ai-agents?section=agents" },
  { label: "第三方 Agent 接入", route: "/ai-agents?section=connections" },
  { label: "Skills 管理", route: "/ai-agents?section=skills" },
  { label: "Tools 管理", route: "/ai-agents?section=tools" },
  { label: "任务与调度", route: "/ai-agents?section=tasks" },
  { label: "权限与安全", route: "/ai-agents?section=security" },
  { label: "运行监控（后续接入）", route: "/ai-agents?section=monitoring" },
  { label: "小雅形象", route: "/ai-agents?section=appearance" },
  { label: "AI 历史记录", route: "/ai-agents?section=history" },
  { label: "潜客发现", route: "/prospect-discovery" },
  { label: "历史任务列表", route: "/prospect-history" },
  { label: "历史任务详情", route: "/prospect-history/:runId" },
  { label: "潜客数据", route: "/prospect-data" },
  { label: "线索列表", route: "/leads" },
  { label: "新建线索", route: "/leads/new" },
  { label: "客户列表", route: "/accounts" },
  { label: "新建客户", route: "/accounts/new" },
  { label: "客户详情", route: "/accounts/:id" },
  { label: "编辑客户", route: "/accounts/:id/edit" },
  { label: "联系人列表", route: "/contacts" },
  { label: "新建联系人", route: "/contacts/new" },
  { label: "联系人详情", route: "/contacts/:id" },
  { label: "编辑联系人", route: "/contacts/:id/edit" },
  { label: "销售机会列表", route: "/opportunities" },
  { label: "新建销售机会", route: "/opportunities/new" },
  { label: "销售机会详情", route: "/opportunities/:id" },
  { label: "编辑销售机会", route: "/opportunities/:id/edit" },
  { label: "报价单列表", route: "/quotes" },
  { label: "新建报价单", route: "/quotes/new" },
  { label: "报价单详情", route: "/quotes/:id" },
  { label: "编辑报价单", route: "/quotes/:id/edit" },
  { label: "销售订单列表", route: "/sales-orders" },
  { label: "新建销售订单", route: "/sales-orders/new" },
  { label: "销售订单详情", route: "/sales-orders/:id" },
  { label: "编辑销售订单", route: "/sales-orders/:id/edit" },
  { label: "产品列表", route: "/products" },
  { label: "新建产品", route: "/products/new" },
  { label: "产品详情", route: "/products/:id" },
  { label: "编辑产品", route: "/products/:id/edit" },
  { label: "贸易单证中心", route: "/documents" },
  { label: "单证工作台", route: "/documents/studio" },
  { label: "模板中心", route: "/documents/templates" },
  { label: "企业单证资料", route: "/documents/company-profile" },
  { label: "已生成单据", route: "/documents/generated" },
  { label: "单据预览/详情", route: "/documents/:id" },
  { label: "发运列表", route: "/shipments" },
  { label: "新建发运", route: "/shipments/new" },
  { label: "发运详情", route: "/shipments/:id" },
  { label: "编辑发运", route: "/shipments/:id/edit" },
  { label: "收款列表", route: "/payments" },
  { label: "新建收款", route: "/payments/new" },
  { label: "收款详情", route: "/payments/:id" },
  { label: "收款分配", route: "/payments/:id/allocate" },
  { label: "编辑收款", route: "/payments/:id/edit" },
  { label: "贸易工具中心", route: "/trade-tools" },
  { label: "旧版贸易工具兼容入口", route: "/trade-tools/legacy" },
  { label: "系统设置", route: "/settings" },
  { label: "个人设置", route: "/personal-settings" },
  { label: "安全中心", route: "/security" },
];


const routeSummaries: Record<string, string> = {
  "/login": "登录账号并完成当前账号要求的身份验证。",
  "/dashboard": "查看经营总览、市场分布、销售漏斗、物流与任务概况。",
  "/help": "搜索中文帮助内容，按板块查看操作说明并跳转业务页面。",
  "/communications": "选择客户会话、查看消息上下文并按已连接渠道处理沟通。",
  "/inbox": "兼容入口，自动跳转到沟通工作区。",
  "/agent": "向小雅描述任务目标，检查任务状态与生成结果。",
  "/ai-agents": "查看 AI 与 Agent 中心，并进入模型、Agent、Skills、Tools 等配置分区。",
  "/ai-agents?section=models": "配置模型供应商、模型标识和可用凭证，使用前先测试连接。",
  "/ai-agents?section=agents": "管理内置 Agent 的角色、模型和能力绑定。",
  "/ai-agents?section=connections": "登记 MCP、REST API/OpenAPI 或 Webhook 第三方 Agent 并测试连接。",
  "/ai-agents?section=skills": "从 GitHub、ZIP 或手动方式注册 Skill，检查后再决定是否启用。",
  "/ai-agents?section=tools": "查看系统与扩展工具，并配置只读、人工审批或禁止调用策略。",
  "/ai-agents?section=tasks": "查看任务执行、审批等待、结果和失败原因。",
  "/ai-agents?section=security": "检查 Agent、Skill 与 Tool 的权限边界和安全策略。",
  "/ai-agents?section=monitoring": "运行监控当前标记为后续接入，暂不可视为已开放能力。",
  "/ai-agents?section=appearance": "配置小雅形象相关展示选项。",
  "/ai-agents?section=history": "查阅 AI 历史交互与任务记录。",
  "/prospect-discovery": "按五步流程选择平台、填写参数、执行发现、评分并核验决策人。",
  "/prospect-history": "搜索和查看潜客发现历史任务及执行状态。",
  "/prospect-history/:runId": "查看单次发现任务的条件、执行日志和结果；从历史任务列表进入。",
  "/prospect-data": "筛选潜客记录，核对来源与质量后送入 CRM 或排除。",
  "/leads": "查看线索趋势与分布，按名称、编号、国家、联系方式、状态和来源筛选。",
  "/leads/new": "分组录入公司/个人、联系人、地区、来源、需求、跟进和合规信息。",
  "/accounts": "管理公司级客户主档，按名称、编号、国家、邮箱、税号和客户状态查找。",
  "/accounts/new": "创建客户主档，核对客户名称、国家/地区和唯一主联系人等要求。",
  "/accounts/:id": "查看客户资料、状态、预收款余额、联系人和业务关联；从客户列表进入。",
  "/accounts/:id/edit": "更新客户主数据、地址、交易规则、财务、业务画像与风险信息。",
  "/contacts": "按姓名、客户和联系方式查找联系人并维护客户人员关系。",
  "/contacts/new": "创建联系人并关联正确客户，维护职位、联系方式与沟通偏好。",
  "/contacts/:id": "查看联系人资料、客户归属、职位和联系信息；从联系人列表进入。",
  "/contacts/:id/edit": "更新联系人资料、角色、联系方式和联系许可信息。",
  "/opportunities": "查看销售机会阶段、金额、概率、预计成交日期和负责人。",
  "/opportunities/new": "创建销售机会并关联客户、联系人及初始销售预测。",
  "/opportunities/:id": "查看销售机会详情、推进状态并记录下一步跟进。",
  "/opportunities/:id/edit": "修改销售机会的阶段、金额、概率、日期和销售资料。",
  "/quotes": "搜索报价单，查看客户、报价金额、有效期和当前状态。",
  "/quotes/new": "创建报价，维护客户、产品行、费用、币种、贸易与付款条件。",
  "/quotes/:id": "查看报价概览、产品明细、贸易付款、发送记录和版本历史。",
  "/quotes/:id/edit": "编辑允许修改的报价草稿并保存版本；已发送记录按状态处理。",
  "/sales-orders": "查看订单金额、状态、履约、收款和开票等分析与列表。",
  "/sales-orders/new": "创建订单或从已接受报价继承客户、产品和商业条款。",
  "/sales-orders/:id": "查看订单承诺、价格锁定、付款计划、发运和单证关联。",
  "/sales-orders/:id/edit": "更新当前状态允许变更的订单字段和履约安排。",
  "/documents": "选择当前开放的单证类型并进入单证制作流程。",
  "/documents/studio": "选择业务来源和模板，核对字段、编辑版式并预览单据。",
  "/documents/templates": "管理单据模板、语言和版本；修改模板不改写历史文件。",
  "/documents/company-profile": "维护单据使用的卖方企业抬头、地址、联系方式和账户。",
  "/documents/generated": "查找已生成单据、查看文件状态和历史版本。",
  "/documents/:id": "预览单据内容、状态和版本；从已生成单据列表进入。",
  "/shipments": "按订单和运输状态查看发运批次及履约进度。",
  "/shipments/new": "关联销售订单并填写运输、包装、重量和计划日期。",
  "/shipments/:id": "查看发运详情、运输节点、提单、清关和异常记录。",
  "/shipments/:id/edit": "更新当前发运状态允许修改的运输与包装资料。",
  "/payments": "切换收款/应收视图，查看到账、余额、核销与账龄。",
  "/payments/new": "登记真实到账，填写付款方、金额、币种、方式和银行资料。",
  "/payments/:id": "查看收款状态、分配、退款和银行对账信息。",
  "/payments/:id/allocate": "把可分配收款余额分配到订单或付款计划节点。",
  "/payments/:id/edit": "编辑草稿或登记允许修改的银行对账资料。",
  "/products": "搜索 SKU、名称、品牌、型号或条码，导入/导出产品目录。",
  "/products/new": "创建产品主数据，填写 SKU、名称、分类及规格包装信息。",
  "/products/:id": "查看产品规格、贸易合规、价格、附件、变体和状态。",
  "/products/:id/edit": "更新产品资料；被交易明细引用的 SKU 可能锁定。",
  "/trade-tools": "打开 HS 归类、关税估算、制裁筛查、裁决检索和网站背调工具。",
  "/trade-tools/legacy": "旧版贸易工具兼容入口。",
  "/settings": "按产品、CRM、企业、单证、发运收款和集成领域维护系统配置。",
  "/personal-settings": "设置个人资料、显示、通知和工作偏好。",
  "/security": "管理账号 MFA、通行密钥和恢复方式。",
};

export function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string>('overview');
  const filteredRoutes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return routeDirectory;
    return routeDirectory.filter(item => (item.label + ' ' + item.route + ' ' + (routeSummaries[item.route] ?? '')).toLocaleLowerCase().includes(normalized));
  }, [query]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sections;
    return sections.filter(section => [section.title, section.summary, ...section.steps].join(' ').toLocaleLowerCase().includes(normalized));
  }, [query]);

  return (
    <main className="tp-help">
      <PageHeader className="tp-help__header">
        <div>
          <p className="tp-help__eyebrow">TRADEPILOT / USER GUIDE</p>
          <h1>帮助中心</h1>
          <p>TradePilot 中文系统操作手册 · 按业务板块了解页面用途、操作步骤与业务衔接。</p>
        </div>
        <Tag type="blue">中文操作手册</Tag>
      </PageHeader>
      <section className="tp-help__intro">
        <div className="tp-help__intro-icon"><semanticIcons.notebook size={28} /></div>
        <div>
          <h2>从业务流程开始</h2>
          <p>建议先完成企业和系统基础配置，再按“潜客发现 → CRM → 销售 → 订单履约 → 单证与收款 → 经营复盘”的顺序使用系统。每个板块均提供入口和关键操作说明。</p>
          <Link href="/dashboard" renderIcon={semanticIcons.dashboard}>返回工作台</Link>
        </div>
      </section>
      <div className="tp-help__search">
        <TextInput id="help-search" labelText="搜索帮助内容" placeholder="输入页面名称、操作或关键词" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)} />
        <span>{filtered.length} 个板块 · {filteredRoutes.length} 个页面</span>
      </div>
      <section className="tp-help__route-directory" aria-label="全站页面索引">
        <div className="tp-help__route-heading">
          <h2>全站页面索引</h2>
          <span>{filteredRoutes.length} 个页面入口</span>
        </div>
        <ul>
          {filteredRoutes.map(item => (
            <li key={item.route}>
              <div className="tp-help__route-copy">
                <span>{item.label}</span>
                <small className="tp-help__route-summary">{routeSummaries[item.route] ?? '查看该页面当前可用的资料、操作和状态；实际入口受账号权限控制。'}</small>
              </div>
              {item.route.includes(':') ? (
                <span className="tp-help__route-pattern">{item.route}（从对应列表打开具体记录）</span>
              ) : (
                <Link href={item.route} renderIcon={semanticIcons.externalLink}>{item.route}</Link>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="tp-help__sections" aria-label="帮助文档目录">
        {filtered.map((section, index) => (
          <Tile className={'tp-help__section ' + (expanded === section.id ? 'is-expanded' : '')} key={section.id}>
            <button className="tp-help__section-toggle" type="button" aria-expanded={expanded === section.id} onClick={() => setExpanded(expanded === section.id ? '' : section.id)}>
              <span className="tp-help__section-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="tp-help__section-title"><strong>{section.title}</strong><small>{section.summary}</small></span>
              <semanticIcons.chevronDown size={20} />
            </button>
            {expanded === section.id && (
              <div className="tp-help__section-body">
                <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>
                <Link href={section.route} renderIcon={semanticIcons.externalLink}>打开相关页面</Link>
              </div>
            )}
          </Tile>
        ))}
        {filtered.length === 0 && <Tile className="tp-help__empty"><semanticIcons.search size={24} /><p>没有找到匹配内容，请尝试其他关键词。</p></Tile>}
      </section>
      <footer className="tp-help__footer">
        <strong>使用提醒</strong>
        <p>AI 结果需要人工核验；正式报价、订单、发运、收款和对外单证提交前，请复核客户、金额、币种、数量、日期及条款。功能可用性以账号权限和实际服务连接状态为准。</p>
        <Link href="/documents">前往贸易单证中心</Link>
      </footer>
    </main>
  );
}
