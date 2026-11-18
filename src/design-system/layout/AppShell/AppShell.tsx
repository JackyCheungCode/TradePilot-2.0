import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Header, HeaderName, HeaderMenuButton, HeaderGlobalBar, HeaderGlobalAction, SkipToContent,
  SideNav, SideNavItems, SideNavLink, Content, semanticIcons, InlineNotification, OverflowMenu, OverflowMenuItem, useThemePreference,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { XiaoyaAvatar } from '@/features/agent/XiaoyaAvatar';
import { XiaoyaSidePanel } from '@/features/agent/XiaoyaSidePanel';

/**
 * Shared Carbon application frame.
 * Xiaoya is a global assistant entry, placed immediately before sign-out.
 */
export function AppShell() {
  const [sideNavExpanded, setSideNavExpanded] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1055px)').matches
  );
  const [xiaoyaOpen, setXiaoyaOpen] = useState(false);
  const [communicationsUnreadCount, setCommunicationsUnreadCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { preference, setPreference } = useThemePreference();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    void getSupabaseClient().then(async (client) => {
      const syncAvatar = (user: { user_metadata?: Record<string, unknown> } | null) => {
        if (active) setAvatarUrl(typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null);
      };
      const listener = client.auth.onAuthStateChange((_event, session) => syncAvatar(session?.user ?? null));
      subscription = listener.data.subscription;
      const { data } = await client.auth.getSession();
      syncAvatar(data.session?.user ?? null);
    }).catch(() => { if (active) setAvatarUrl(null); });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const loadUnreadCount = async () => {
      try {
        const client = await getSupabaseClient();
        const { data, error } = await client.from('inbox_conversations').select('unread_count');
        if (error) throw error;
        if (active) setCommunicationsUnreadCount((data ?? []).reduce((total, row) => total + Math.max(0, Number(row.unread_count ?? 0)), 0));
      } catch {
        if (active) setCommunicationsUnreadCount(0);
      }
    };
    void loadUnreadCount();
    timer = window.setInterval(() => { void loadUnreadCount(); }, 30_000);
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1055px)');
    const updateViewport = () => setIsCompactViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (isCompactViewport) setSideNavExpanded(false);
  }, [location.pathname, isCompactViewport]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const client = await getSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : '退出登录失败');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <SkipToContent href="#main-content" />
      <Header aria-label="TradePilot" className="cds--g100">
        <HeaderMenuButton
          aria-label={sideNavExpanded ? '收起导航菜单' : '展开导航菜单'}
          aria-expanded={sideNavExpanded}
          isActive={sideNavExpanded}
          onClick={() => setSideNavExpanded((expanded) => !expanded)}
        />
        <HeaderName href="/" prefix="" className="tp-header__brand" aria-label="TradePilot 首页">
          TradePilot
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={communicationsUnreadCount > 0 ? `全渠道消息中心，${communicationsUnreadCount} 条未读消息` : '全渠道消息中心'}
            tooltipAlignment="end"
            className="tp-header-communications"
            isActive={location.pathname.startsWith('/inbox')}
            aria-expanded={location.pathname.startsWith('/inbox')}
            onClick={() => navigate('/inbox')}
          >
            <semanticIcons.chat size={20} />
            {communicationsUnreadCount > 0 && <span className="tp-header-unread-badge" aria-label={`${communicationsUnreadCount} 条未读消息`} aria-live="polite">{communicationsUnreadCount > 99 ? '99+' : communicationsUnreadCount}</span>}
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label={xiaoyaOpen ? "关闭小雅 AI 助手" : "打开小雅 AI 助手"}
            tooltipAlignment="end"
            isActive={xiaoyaOpen}
            aria-expanded={xiaoyaOpen}
            onClick={() => setXiaoyaOpen((open) => !open)}
          >
            <XiaoyaAvatar emotion="idle" size={30} />
          </HeaderGlobalAction>
          <OverflowMenu
            ariaLabel="主题设置"
            iconDescription="主题设置"
            renderIcon={semanticIcons.asleep}
            flipped
            size="lg"
            className="tp-theme-menu"
          >
            <OverflowMenuItem
              itemText={preference === 'system' ? <><semanticIcons.check size={16} /> 跟随设备系统</> : '跟随设备系统'}
              onClick={() => setPreference('system')}
            />
            <OverflowMenuItem
              itemText={preference === 'white' ? <><semanticIcons.check size={16} /> 白色</> : '白色'}
              onClick={() => setPreference('white')}
            />
            <OverflowMenuItem
              itemText={preference === 'g10' ? <><semanticIcons.check size={16} /> 浅灰色</> : '浅灰色'}
              onClick={() => setPreference('g10')}
            />
            <OverflowMenuItem
              itemText={preference === 'g90' ? <><semanticIcons.check size={16} /> 深灰色</> : '深灰色'}
              onClick={() => setPreference('g90')}
            />
            <OverflowMenuItem
              itemText={preference === 'dark' ? <><semanticIcons.check size={16} /> 深色</> : '深色'}
              onClick={() => setPreference('dark')}
            />
          </OverflowMenu>
          <OverflowMenu
            ariaLabel="账户菜单"
            iconDescription="账户菜单"
            renderIcon={() => avatarUrl ? <img className="tp-account-menu__avatar" src={avatarUrl} alt="" /> : <semanticIcons.avatar size={20} />}
            flipped
            size="lg"
            className="tp-account-menu"
          >
            <OverflowMenuItem itemText="个人设置" onClick={() => navigate('/personal-settings')} />
            <OverflowMenuItem
              itemText={signingOut ? '正在退出系统…' : '退出系统'}
              disabled={signingOut}
              onClick={() => { if (!signingOut) void signOut(); }}
            />
          </OverflowMenu>
        </HeaderGlobalBar>
      </Header>
      <SideNav
        aria-label="TradePilot 主导航"
        className={`cds--g100 ${sideNavExpanded ? 'tp-sidenav--expanded' : 'tp-sidenav--rail'}`}
        expanded={sideNavExpanded}
        isPersistent={!isCompactViewport}
        isRail={!isCompactViewport && !sideNavExpanded}
        onOverlayClick={() => setSideNavExpanded(false)}
      >
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">工作台（Workspace）</div>
          <SideNavItems>
            <SideNavLink href="/dashboard" isActive={location.pathname === '/dashboard' || location.pathname === '/'} title="概览（Overview）" renderIcon={semanticIcons.dashboard}>概览（Overview）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">情报与线索</div>
          <SideNavItems>
            <SideNavLink href="/prospect-data" isActive={location.pathname.startsWith('/prospect-data') || location.pathname.startsWith('/prospect-history')} title="潜客数据（Prospect Data）" renderIcon={semanticIcons.database}>潜客数据（Prospect Data）</SideNavLink>
            <SideNavLink href="/leads" isActive={location.pathname.startsWith('/leads')} title="线索（Lead）" renderIcon={semanticIcons.userFollow}>线索（Lead）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">客户管理</div>
          <SideNavItems>
            <SideNavLink href="/contacts" isActive={location.pathname.startsWith('/contacts')} title="联系人（Contact）" renderIcon={semanticIcons.user}>联系人（Contact）</SideNavLink>
            <SideNavLink href="/accounts" isActive={location.pathname.startsWith('/accounts')} title="客户（Account）" renderIcon={semanticIcons.building}>客户（Account）</SideNavLink>
            <SideNavLink href="/opportunities" isActive={location.pathname.startsWith('/opportunities')} title="商机（Opportunity）" renderIcon={semanticIcons.chart}>商机（Opportunity）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">贸易业务</div>
          <SideNavItems>
            <SideNavLink href="/quotes" isActive={location.pathname.startsWith('/quotes')} title="报价单（Quote）" renderIcon={semanticIcons.document}>报价单（Quote）</SideNavLink>
            <SideNavLink href="/sales-orders" isActive={location.pathname.startsWith('/sales-orders')} title="销售订单（Sales Order）" renderIcon={semanticIcons.documentTasks}>销售订单（Sales Order）</SideNavLink>
            <SideNavLink href="/documents" isActive={location.pathname.startsWith('/documents')} title="外贸单据智能制作中心（Trade Document Studio）" renderIcon={semanticIcons.documentMultiple_01}>外贸单据智能制作中心</SideNavLink>
            <SideNavLink href="/shipments" isActive={location.pathname.startsWith('/shipments')} title="发运（Shipment）" renderIcon={semanticIcons.delivery}>发运（Shipment）</SideNavLink>
            <SideNavLink href="/payments" isActive={location.pathname.startsWith('/payments')} title="收款（Payment）" renderIcon={semanticIcons.currency}>收款（Payment）</SideNavLink>
            <SideNavLink href="/products" isActive={location.pathname.startsWith('/products')} title="产品（Product）" renderIcon={semanticIcons.product}>产品（Product）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">工具与系统</div>
          <SideNavItems>
            <SideNavLink href="/trade-tools" isActive={location.pathname.startsWith('/trade-tools')} title="外贸工具（Trade tools）" renderIcon={semanticIcons.calculator}>外贸工具（Trade tools）</SideNavLink>
            <SideNavLink href="/settings" isActive={location.pathname.startsWith('/settings')} title="设置（Setting）" renderIcon={semanticIcons.settings}>设置（Setting）</SideNavLink>
            <SideNavLink href="/security" isActive={location.pathname.startsWith('/security')} title="安全与身份认证（Security）" renderIcon={semanticIcons.security}>安全与身份认证（Security）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__footer">
          <div className="tp-sidenav__contact">联系：xg.y@icloud.com</div>
          <div className="tp-sidenav__copyright">
            <span>© {new Date().getFullYear()}</span>
            <img src="/tradepilot-mark.svg" alt="TradePilot" />
          </div>
        </div>
      </SideNav>
      <Content id="main-content" tabIndex={-1} className="tp-content">
        <div className="tp-content__main">
          {signOutError && <InlineNotification kind="error" lowContrast title="退出登录失败" subtitle={signOutError} onCloseButtonClick={() => setSignOutError('')} />}
          <Outlet />
        </div>
      </Content>
      <XiaoyaSidePanel isOpen={xiaoyaOpen} onClose={() => setXiaoyaOpen(false)} pathname={location.pathname} />
    </>
  );
}
