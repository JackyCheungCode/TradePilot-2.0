# 搜索引擎发现：数字孪生工作流

日期：2026-11-23

## 发布范围

- 搜索引擎发现页面采用四阶段数字孪生工作站：搜索发现、候选网站、AI 深度分析、企业情报。
- 工作站采用 CSS 3D 透视与连接效果；表单、进度、数据和操作继续使用 TradePilot Design System / IBM Carbon。
- 侧边栏移除「Google Maps 任务中心」和「Google Maps 发现客户」两个二级菜单，保留 Google Maps 发现、搜索引擎发现和原页面路由。

## 业务流程

1. 搜索发现只调用搜索 API，不抓取网站，不调用 Browser Run。
2. 候选网站持久保存，支持筛选、全选、反选、多选和移除。
3. 只分析用户勾选的网站；默认每批 10 个，可调整为 1–20 个；单次最多选择 500 个。
4. AI 分析使用现有 `company_analysis` 任务模型，结果保存公司字段、官网判断、可信度、来源 URL 和证据片段。
5. 分析任务支持暂停、继续、取消、失败网站重试；已完成记录默认跳过，明确选择重新分析才会重复调用。
6. 企业情报支持 CSV 导出；结果保留为候选企业资料，不自动创建正式客户。

## 数据与安全

- 复用 `discovery_runs.search_config` 与 `discovery_records.raw_data.website_analysis`，本次不新增生产数据库迁移。
- API 按当前登录账户校验候选记录归属。
- 网站分析前校验 URL、协议、端口、DNS 公网地址及 HTTP 重定向；拒绝本地和私有网络目标。
- Browser Run 只在独立分析任务中调用，不会随搜索任务自动消耗额度。

## 验证

- GitHub Actions CI：`45091126035`，成功。
- 已通过数据库迁移隔离验证、服务端 guardrail 测试、Design System 边界检查、前端 TypeScript/build、Cloudflare Worker dry-run 和部署包打包。
- 生产部署由本提交的 `[production-release]` 标记触发仓库正式发布工作流。
