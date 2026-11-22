# 情报监听控制台 UI 发布记录

- 日期：2026-11-22
- 分支：develop
- 路由：/intelligence-monitoring
- 导航：情报与商机 → 情报监听
- UI：复用 TradePilot IBM Carbon Design System 白色主题、Carbon Grid、Carbon Dropdown / Select / Checkbox / TextInput / Tile / Tag / Notification / Button。
- 交付范围：监听对象配置页面、公开数据范围提示、采集频率选项、AI 购买意向规则与 S/A/B/C 分级、采集服务策略说明。
- 预览部署：GitHub Actions workflow 44992598015 成功；Cloudflare Worker tradepilot-prospect-preview 已更新。
- 重要边界：本次是页面 UI 交付。监听任务 API、Apify / Bright Data 实际采集、增量游标、事件持久化和 AI 后端分析尚未接入。页面明确标注本地草稿，不会伪装成真实运行任务。
- 验收路径：/intelligence-monitoring
