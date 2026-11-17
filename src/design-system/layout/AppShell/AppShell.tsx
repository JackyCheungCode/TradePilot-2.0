import { useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Header, HeaderName, HeaderMenuButton, HeaderGlobalBar, HeaderGlobalAction,
  SideNav, SideNavItems, SideNavLink, Content, CarbonIcons, InlineNotification, OverflowMenu, OverflowMenuItem,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { XiaoyaAvatar } from '@/features/agent/XiaoyaAvatar';
import { XiaoyaSidePanel } from '@/features/agent/XiaoyaSidePanel';
import { CustomerCommunicationsWidget } from '@/features/customer-communications/CustomerCommunicationsWidget';

/**
 * Shared Carbon application frame.
 * Xiaoya is a global assistant entry, placed immediately before sign-out.
 */
export function AppShell() {
  const [sideNavExpanded, setSideNavExpanded] = useState(false);
  const [xiaoyaOpen, setXiaoyaOpen] = useState(false);
  const [communicationsOpen, setCommunicationsOpen] = useState(false);
  const [communicationsMinimized, setCommunicationsMinimized] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

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
      <Header aria-label="TradePilot">
        <HeaderMenuButton
          aria-label={sideNavExpanded ? '收起导航菜单' : '展开导航菜单'}
          aria-expanded={sideNavExpanded}
          isActive={sideNavExpanded}
          onClick={() => setSideNavExpanded((expanded) => !expanded)}
        />
        <HeaderName href="/" prefix="" className="tp-header__brand" aria-label="TradePilot 首页">
          <img src="/tradepilot-wordmark.svg" alt="TradePilot" />
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label="客户沟通"
            tooltipAlignment="end"
            isActive={communicationsOpen && !communicationsMinimized}
            aria-expanded={communicationsOpen && !communicationsMinimized}
            onClick={() => { setCommunicationsOpen(true); setCommunicationsMinimized(false); }}
          >
            <CarbonIcons.Chat size={20} />
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
            ariaLabel="账户菜单"
            iconDescription="账户菜单"
            renderIcon={CarbonIcons.User}
            flipped
            size="lg"
            className="tp-account-menu"
          >
            <OverflowMenuItem itemText="个人设置" disabled />
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
        className={sideNavExpanded ? 'tp-sidenav--expanded' : 'tp-sidenav--rail'}
        expanded={sideNavExpanded}
        isPersistent
        isRail={!sideNavExpanded}
        onOverlayClick={() => setSideNavExpanded(false)}
      >
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">工作台（Workspace）</div>
          <SideNavItems>
            <SideNavLink href="/dashboard" isActive={location.pathname === '/dashboard' || location.pathname === '/'} title="概览（Overview）" renderIcon={CarbonIcons.Dashboard}>概览（Overview）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">情报与线索</div>
          <SideNavItems>
            <SideNavLink href="/prospect-discovery" isActive={location.pathname === '/prospect-discovery'} title="潜客发现（Prospect Discovery）" renderIcon={CarbonIcons.Search}>潜客发现（Prospect Discovery）</SideNavLink>
            <SideNavLink href="/leads" isActive={location.pathname.startsWith('/leads')} title="线索（Lead）" renderIcon={CarbonIcons.UserFollow}>线索（Lead）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">客户管理</div>
          <SideNavItems>
            <SideNavLink href="/contacts" isActive={location.pathname.startsWith('/contacts')} title="联系人（Contact）" renderIcon={CarbonIcons.User}>联系人（Contact）</SideNavLink>
            <SideNavLink href="/accounts" isActive={location.pathname.startsWith('/accounts')} title="客户（Account）" renderIcon={CarbonIcons.Building}>客户（Account）</SideNavLink>
            <SideNavLink href="/opportunities" isActive={location.pathname.startsWith('/opportunities')} title="商机（Opportunity）" renderIcon={CarbonIcons.ChartLine}>商机（Opportunity）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">贸易业务</div>
          <SideNavItems>
            <SideNavLink href="/quotes" isActive={location.pathname.startsWith('/quotes')} title="报价单（Quote）" renderIcon={CarbonIcons.Document}>报价单（Quote）</SideNavLink>
            <SideNavLink href="/sales-orders" isActive={location.pathname.startsWith('/sales-orders')} title="销售订单（Sales Order）" renderIcon={CarbonIcons.DocumentTasks}>销售订单（Sales Order）</SideNavLink>
            <SideNavLink href="/documents" isActive={location.pathname.startsWith('/documents')} title="单据中心（Documents）" renderIcon={CarbonIcons.DocumentMultiple_01}>单据中心（Documents）</SideNavLink>
            <SideNavLink href="/shipments" isActive={location.pathname.startsWith('/shipments')} title="发运（Shipment）" renderIcon={CarbonIcons.Delivery}>发运（Shipment）</SideNavLink>
            <SideNavLink href="/payments" isActive={location.pathname.startsWith('/payments')} title="收款（Payment）" renderIcon={CarbonIcons.Currency}>收款（Payment）</SideNavLink>
            <SideNavLink href="/products" isActive={location.pathname.startsWith('/products')} title="产品（Product）" renderIcon={CarbonIcons.Product}>产品（Product）</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">工具与系统</div>
          <SideNavItems>
            <SideNavLink href="/trade-tools" isActive={location.pathname.startsWith('/trade-tools')} title="外贸工具（Trade tools）" renderIcon={CarbonIcons.Calculator}>外贸工具（Trade tools）</SideNavLink>
            <SideNavLink href="/settings" isActive={location.pathname.startsWith('/settings')} title="设置（Setting）" renderIcon={CarbonIcons.Settings}>设置（Setting）</SideNavLink>
            <SideNavLink href="/security" isActive={location.pathname.startsWith('/security')} title="安全与身份认证（Security）" renderIcon={CarbonIcons.Security}>安全与身份认证（Security）</SideNavLink>
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
      <Content className="tp-content">
        <div className="tp-content__main">
          {signOutError && <InlineNotification kind="error" lowContrast title="退出登录失败" subtitle={signOutError} onCloseButtonClick={() => setSignOutError('')} />}
          <Outlet />
        </div>
      </Content>
      <XiaoyaSidePanel isOpen={xiaoyaOpen} onClose={() => setXiaoyaOpen(false)} pathname={location.pathname} />
      <CustomerCommunicationsWidget
        open={communicationsOpen}
        minimized={communicationsMinimized}
        onClose={() => { setCommunicationsOpen(false); setCommunicationsMinimized(false); }}
        onMinimize={() => setCommunicationsMinimized(true)}
        onRestore={() => setCommunicationsMinimized(false)}
      />
    </>
  );
}
