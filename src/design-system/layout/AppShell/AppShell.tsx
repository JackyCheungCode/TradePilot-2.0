import { useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Header, HeaderName, HeaderMenuButton, HeaderGlobalBar, HeaderGlobalAction,
  SideNav, SideNavItems, SideNavLink, Content, CarbonIcons, InlineNotification,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { XiaoyaAvatar } from '@/features/agent/XiaoyaAvatar';

/**
 * Shared Carbon application frame.
 * Xiaoya is a global assistant entry, placed immediately before sign-out.
 */
export function AppShell() {
  const [sideNavExpanded, setSideNavExpanded] = useState(false);
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
        <HeaderName href="/" prefix="">
          TradePilot
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label="打开小雅 Agent 工作空间"
            tooltipAlignment="end"
            isActive={location.pathname.startsWith('/agent')}
            onClick={() => navigate('/agent')}
          >
            <XiaoyaAvatar emotion="idle" size={30} />
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label={signingOut ? '正在退出登录' : '退出登录'}
            tooltipAlignment="end"
            onClick={() => { if (!signingOut) void signOut(); }}
            aria-disabled={signingOut}
          >
            <CarbonIcons.Logout size={20} aria-hidden="true" />
          </HeaderGlobalAction>
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
        <div className="tp-sidenav__brand">
          <img src="/tradepilot-logo.svg" alt="TradePilot" />
        </div>
        <SideNavItems>
          <SideNavLink
            href="/prospect-console"
            isActive={location.pathname === '/prospect-console' || location.pathname === '/prospect-discovery' || location.pathname === '/recent-tasks'}
            title="全网情报"
            renderIcon={CarbonIcons.Globe}
          >
            全网情报
          </SideNavLink>
          <SideNavLink href="/leads" isActive={location.pathname.startsWith('/leads')} title="线索（Lead）" renderIcon={CarbonIcons.UserFollow}>
            线索（Lead）
          </SideNavLink>
          <SideNavLink href="/contacts" isActive={location.pathname.startsWith('/contacts')} title="联系人（Contact）" renderIcon={CarbonIcons.User}>
            联系人（Contact）
          </SideNavLink>
          <SideNavLink href="/accounts" isActive={location.pathname.startsWith('/accounts')} title="客户（Account）" renderIcon={CarbonIcons.Building}>
            客户（Account）
          </SideNavLink>
          <SideNavLink href="/opportunities" isActive={location.pathname.startsWith('/opportunities')} title="商机（Opportunity）" renderIcon={CarbonIcons.ChartLine}>
            商机（Opportunity）
          </SideNavLink>
          <SideNavLink href="/quotes" isActive={location.pathname.startsWith('/quotes')} title="报价单（Quote）" renderIcon={CarbonIcons.Document}>
            报价单（Quote）
          </SideNavLink>
          <SideNavLink href="/sales-orders" isActive={location.pathname.startsWith('/sales-orders')} title="销售订单（Sales Order）" renderIcon={CarbonIcons.Document}>
            销售订单（Sales Order）
          </SideNavLink>
          <SideNavLink href="/shipments" isActive={location.pathname.startsWith('/shipments')} title="发运（Shipment）" renderIcon={CarbonIcons.Delivery}>
            发运（Shipment）
          </SideNavLink>
          <SideNavLink href="/payments" isActive={location.pathname.startsWith('/payments')} title="收款（Payment）" renderIcon={CarbonIcons.Currency}>
            收款（Payment）
          </SideNavLink>
          <SideNavLink href="/products" isActive={location.pathname.startsWith('/products')} title="产品（Product）" renderIcon={CarbonIcons.Product}>
            产品（Product）
          </SideNavLink>
          <SideNavLink href="/settings" isActive={location.pathname.startsWith('/settings')} title="设置中心" renderIcon={CarbonIcons.Settings}>
            设置中心
          </SideNavLink>
        </SideNavItems>
      </SideNav>
      <Content className="tp-content">
        <div className="tp-content__main">
          {signOutError && <InlineNotification kind="error" lowContrast title="退出登录失败" subtitle={signOutError} onCloseButtonClick={() => setSignOutError('')} />}
          <Outlet />
        </div>
      </Content>
    </>
  );
}
