import { useMemo, useState } from 'react';
import '@/design-system/patterns/intelligence-monitoring.scss';
import { PageHeader, Button, TextInput, Dropdown, Select, SelectItem, Tile, Tag, InlineNotification, Grid, Column, Checkbox } from '@/design-system';

type Platform = { id: string; text: string; category: string };
type DraftSource = { id: string; platform: string; url: string; interval: string; createdAt: string };

const platforms: Platform[] = [
  { id: 'facebook', text: 'Facebook', category: '社交网络' },
  { id: 'instagram', text: 'Instagram', category: '社交网络' },
  { id: 'x', text: 'X', category: '社交网络' },
  { id: 'tiktok', text: 'TikTok', category: '社交网络' },
  { id: 'youtube', text: 'YouTube', category: '视频平台' },
  { id: 'reddit', text: 'Reddit', category: '社区' },
  { id: 'google-maps', text: 'Google Maps', category: '本地商业' },
  { id: 'telegram', text: 'Telegram', category: '公开频道' },
  { id: 'linkedin', text: 'LinkedIn', category: '专业网络' },
  { id: 'pinterest', text: 'Pinterest', category: '视觉社区' },
  { id: 'forum', text: '行业论坛', category: '垂直社区' },
];

const cadenceOptions = [
  { id: '60', text: '每 1 小时' },
  { id: '180', text: '每 3 小时' },
  { id: '360', text: '每 6 小时' },
  { id: '720', text: '每 12 小时' },
  { id: '1440', text: '每天一次' },
];

const intentTypes = ['明确采购', '寻找供应商', '询价与报价', '寻找经销商 / 代理', '产品规格咨询', 'OEM / ODM 合作'];
const gradeRows = [
  { grade: 'S', title: '明确采购', detail: '明确购买、数量、规格或采购时间', color: 'green' as const },
  { grade: 'A', title: '高购买意向', detail: '寻找供应商、询价、寻找批发渠道', color: 'blue' as const },
  { grade: 'B', title: '潜在需求', detail: '产品咨询、推荐请求、合作探索', color: 'purple' as const },
  { grade: 'C', title: '持续观察', detail: '相关讨论，尚无清晰采购信号', color: 'gray' as const },
];

export function IntelligenceMonitoringPage() {
  const [platform, setPlatform] = useState<Platform | null>(platforms[0]);
  const [url, setUrl] = useState('');
  const [cadence, setCadence] = useState(cadenceOptions[0]);
  const [sourceType, setSourceType] = useState('auto');
  const [drafts, setDrafts] = useState<DraftSource[]>([]);
  const [enabledIntents, setEnabledIntents] = useState<string[]>(intentTypes.slice(0, 5));
  const [minimumGrade, setMinimumGrade] = useState('A');
  const [notice, setNotice] = useState('');

  const canAdd = Boolean(url.trim() && /^https?:\/\//i.test(url.trim()) && platform);
  const platformCount = useMemo(() => new Set(drafts.map((item) => item.platform)).size, [drafts]);

  const addDraft = () => {
    if (!canAdd || !platform) return;
    const duplicate = drafts.some((item) => item.url.toLowerCase() === url.trim().toLowerCase());
    if (duplicate) {
      setNotice('这个链接已经存在于当前页面的草稿列表中。');
      return;
    }
    setDrafts((current) => [{
      id: 'draft-' + Date.now(),
      platform: platform.text,
      url: url.trim(),
      interval: cadence.text,
      createdAt: new Date().toLocaleString('zh-TW', { hour12: false }),
    }, ...current]);
    setUrl('');
    setNotice('已加入本地预览草稿。当前尚未创建后端监听任务，也不会启动采集。');
  };

  const toggleIntent = (intent: string) => {
    setEnabledIntents((current) => current.includes(intent)
      ? current.filter((item) => item !== intent)
      : [...current, intent]);
  };

  return (
    <main className="tp-intelligence-monitoring">
      <PageHeader
        className="tp-intelligence-monitoring__page-header"
        breadcrumb="全球情报 / 公开内容监听"
        title="情报监听"
        description="管理指定公开账号、主页、群组、频道与帖子，持续发现新增内容，并通过 AI 识别采购意向。"
      />
      <div className="tp-intelligence-monitoring__meta">
        <Tag type="blue">PUBLIC DATA ONLY</Tag>
        <Tag type="cool-gray">监听任务控制台</Tag>
      </div>

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="当前版本：页面与交互预览"
        subtitle="此页面已提供监听配置与 AI 规则交互预览。后端监听任务、Apify / Bright Data 凭证调用、增量游标及数据库持久化尚未接入；下方新增内容仅保存在当前页面状态，不会真实启动采集。"
      />

      <Grid fullWidth className="tp-intelligence-monitoring__metrics">
        <Column sm={4} md={4} lg={8}>
          <Tile>
            <p>监听对象草稿</p>
            <h2>{drafts.length}</h2>
            <p>当前页面临时添加</p>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile>
            <p>涉及平台</p>
            <h2>{platformCount}</h2>
            <p>仅统计当前草稿</p>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile>
            <p>计划采集频率</p>
            <h2>60 min</h2>
            <p>可按任务独立设置</p>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile>
            <p>AI 意向过滤</p>
            <h2>{enabledIntents.length}</h2>
            <p>已选择的意向类别</p>
          </Tile>
        </Column>
      </Grid>

      <Grid fullWidth className="tp-intelligence-monitoring__form-grid">
        <Column sm={4} md={8} lg={8}>
          <section className="tp-intelligence-monitoring__section">
            <div className="tp-intelligence-monitoring__section-heading"><span>01</span><div><h2>添加监听对象</h2><p>输入你希望持续观察的公开内容链接。每个对象独立设置采集平台和运行频率。</p></div></div>
            <Grid fullWidth className="tp-intelligence-monitoring__form-grid">
              <Column sm={4} md={4} lg={4}>
                <Dropdown
                  id="intel-platform"
                  titleText="监听平台"
                  label="选择平台"
                  items={platforms}
                  itemToString={(item: Platform | null) => item?.text ?? ''}
                  selectedItem={platform}
                  onChange={({ selectedItem }: { selectedItem: Platform | null }) => setPlatform(selectedItem)}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <Select
                  id="intel-source-type"
                  labelText="对象类型"
                  value={sourceType}
                  onChange={(event) => setSourceType(event.currentTarget.value)}
                >
                  <SelectItem value="auto" text="自动识别" />
                  <SelectItem value="page" text="企业主页 / 账号" />
                  <SelectItem value="person" text="个人公开主页" />
                  <SelectItem value="group" text="公开群组 / 社区" />
                  <SelectItem value="channel" text="公开频道" />
                  <SelectItem value="post" text="指定帖子 / 视频" />
                  <SelectItem value="place" text="商家 / 地点页面" />
                  <SelectItem value="forum" text="论坛主题 / 板块" />
                </Select>
              </Column>
              <Column sm={4} md={8} lg={16}>
                <TextInput
                  id="intel-source-url"
                  labelText="公开链接"
                  placeholder="https://www.facebook.com/..."
                  value={url}
                  onChange={(event) => setUrl(event.currentTarget.value)}
                  helperText="仅支持公开可访问内容；不采集私人消息、私密群组或需要绕过访问控制的内容。"
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <Dropdown
                  id="intel-cadence"
                  titleText="监听频率"
                  label="选择采集间隔"
                  items={cadenceOptions}
                  itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
                  selectedItem={cadence}
                  onChange={({ selectedItem }: { selectedItem: { id: string; text: string } | null }) => selectedItem && setCadence(selectedItem)}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <Button kind="primary" onClick={addDraft} disabled={!canAdd}>加入监听对象草稿</Button>
              </Column>
            </Grid>
            {notice && <InlineNotification kind="info" lowContrast title="操作反馈" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
          </section>

          <section className="tp-intelligence-monitoring__section">
            <div className="tp-intelligence-monitoring__section-heading"><span>02</span><div><h2>监听对象</h2><p>已配置对象及其当前草稿状态</p></div></div>
            {drafts.length === 0 ? (
              <Tile>
                <h4>尚未添加监听对象</h4>
                <p>添加公开主页、账号、群组、频道或帖子链接后，会在这里展示任务配置摘要。</p>
              </Tile>
            ) : drafts.map((item) => (
              <Tile key={item.id} className="tp-intelligence-monitoring__source">
                <div>
                  <Tag type="blue">{item.platform}</Tag>
                  <Tag type="cool-gray">草稿 · 未启动</Tag>
                </div>
                <p>{item.url}</p>
                <p>{item.interval} · {item.createdAt}</p>
                <Button kind="ghost" size="sm" onClick={() => setDrafts((current) => current.filter((row) => row.id !== item.id))}>移除草稿</Button>
              </Tile>
            ))}
          </section>
        </Column>

        <Column sm={4} md={8} lg={6}>
          <section className="tp-intelligence-monitoring__section">
            <div className="tp-intelligence-monitoring__section-heading"><span>03</span><div><h2>AI 购买意向识别</h2><p>对新发现的公开帖子、评论和回复进行语义分析，不只依赖关键词。</p></div></div>
            <Tile>
              <h4>识别目标</h4>
              {intentTypes.map((intent) => (
                <Checkbox
                  key={intent}
                  id={'intel-intent-' + intent}
                  labelText={intent}
                  checked={enabledIntents.includes(intent)}
                  onChange={() => toggleIntent(intent)}
                />
              ))}
              <p>已启用 {enabledIntents.length} / {intentTypes.length} 类意向</p>
            </Tile>
            <Tile>
              <h4>意向分级</h4>
              {gradeRows.map((row) => (
                <div key={row.grade}>
                  <Tag type={row.color}>{row.grade} 级</Tag>
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                </div>
              ))}
              <Select
                id="intel-minimum-grade"
                labelText="进入潜客候选池的最低等级"
                value={minimumGrade}
                onChange={(event) => setMinimumGrade(event.currentTarget.value)}
              >
                <SelectItem value="S" text="仅 S 级" />
                <SelectItem value="A" text="S / A 级" />
                <SelectItem value="B" text="S / A / B 级" />
                <SelectItem value="C" text="全部等级" />
              </Select>
            </Tile>
          </section>

          <section className="tp-intelligence-monitoring__section">
            <div className="tp-intelligence-monitoring__section-heading"><span>04</span><div><h2>采集与数据规则</h2><p>定义内容范围、增量策略和数据服务路由</p></div></div>
            <Tile>
              <p><strong>默认采集内容</strong></p>
              <ul>
                <li>新增公开帖子、评论及可访问的回复</li>
                <li>评论人公开名称、主页链接及平台 ID（可获取时）</li>
                <li>原始发布时间、采集时间及原帖链接</li>
                <li>评论 ID、回复关系与原始数据</li>
              </ul>
              <p><strong>增量机制</strong></p>
              <p>以平台内容 ID、评论 ID、回复 ID 和分页游标去重；保留运行记录、失败重试与断点续跑。</p>
            </Tile>
            <Tile>
              <p><strong>采集服务策略</strong></p>
              <Tag type="green">Apify 优先</Tag>
              <Tag type="blue">Bright Data 备用</Tag>
              <p>统一适配器按平台和对象类型路由；具体可采集字段、评论覆盖率与延迟必须通过 Actor 实测后启用。</p>
            </Tile>
          </section>
        </Column>
      </Grid>
    </main>
  );
}
