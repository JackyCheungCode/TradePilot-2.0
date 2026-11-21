import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Header, HeaderName, HeaderMenuButton, HeaderGlobalBar, HeaderGlobalAction, SkipToContent,
  SideNav, SideNavItems, SideNavLink, Content, semanticIcons, InlineNotification, OverflowMenu, OverflowMenuItem, useThemePreference,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { XiaoyaAvatar } from '@/features/agent/XiaoyaAvatar';
import { XiaoyaSidePanel } from '@/features/agent/XiaoyaSidePanel';
import { RecordActivityPanel } from '@/features/activity/RecordActivityPanel';

/**
 * Shared application frame.
 * Customer communication is a first-class destination in the side navigation.
 * Xiaoya remains a separate, clearly identified AI assistant.
 */
export function AppShell() {
  const [sideNavExpanded, setSideNavExpanded] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1055px)').matches
  );
  const [xiaoyaOpen, setXiaoyaOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { preference, setPreference } = useThemePreference();
  const navigate = useNavigate();
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const recordRoute = pathParts.length === 2 && /^[0-9a-f-]{36}$/i.test(pathParts[1]) ? pathParts : null;
  const recordTypeByRoute: Record<string,string> = { accounts: 'crm_accounts', contacts: 'crm_contacts', opportunities: 'crm_opportunities', quotes: 'trade_documents', 'sales-orders': 'trade_orders', shipments: 'trade_shipments', payments: 'trade_payments', products: 'trade_products' };
  const activityRecordType = recordRoute ? recordTypeByRoute[recordRoute[0]] : undefined;

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
      setSignOutError(cause instanceof Error ? cause.message : 'Sign out failed.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <SkipToContent href="#main-content" />
      <Header aria-label="Harmonia" className="cds--g100">
        <HeaderMenuButton
          aria-label={sideNavExpanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={sideNavExpanded}
          isActive={sideNavExpanded}
          onClick={() => setSideNavExpanded((expanded) => !expanded)}
        />
        <HeaderName href="/" prefix="" className="tp-header__brand" style={{ marginLeft: "0.5rem" }} aria-label="Harmonia home">
          Harmonia
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label="帮助中心"
            tooltipAlignment="end"
            onClick={() => navigate('/help')}
          >
            <semanticIcons.information size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label={xiaoyaOpen ? 'Close Xiaoya AI assistant' : 'Open Xiaoya AI assistant'}
            tooltipAlignment="end"
            isActive={xiaoyaOpen}
            aria-expanded={xiaoyaOpen}
            onClick={() => setXiaoyaOpen((open) => !open)}
          >
            <XiaoyaAvatar emotion="idle" size={20} />
          </HeaderGlobalAction>
          <OverflowMenu
            ariaLabel="Theme settings"
            iconDescription="Theme settings"
            renderIcon={semanticIcons.asleep}
            flipped
            size="lg"
            className="tp-theme-menu"
          >
            <OverflowMenuItem
              itemText={preference === 'system' ? <><semanticIcons.check size={16} /> 跟随系统</> : '跟随系统'}
              onClick={() => setPreference('system')}
            />
            <OverflowMenuItem
              itemText={preference === 'white' ? <><semanticIcons.check size={16} /> 白色</> : '白色'}
              onClick={() => setPreference('white')}
            />
            <OverflowMenuItem
              itemText={preference === 'g10' ? <><semanticIcons.check size={16} /> 浅灰</> : '浅灰'}
              onClick={() => setPreference('g10')}
            />
            <OverflowMenuItem
              itemText={preference === 'g90' ? <><semanticIcons.check size={16} /> 深灰</> : '深灰'}
              onClick={() => setPreference('g90')}
            />
            <OverflowMenuItem
              itemText={preference === 'dark' ? <><semanticIcons.check size={16} /> 深色</> : '深色'}
              onClick={() => setPreference('dark')}
            />
          </OverflowMenu>
          <OverflowMenu
            ariaLabel="Account menu"
            iconDescription="Account menu"
            renderIcon={() => avatarUrl ? <img className="tp-account-menu__avatar" src={avatarUrl} alt="" /> : <semanticIcons.avatar size={20} />}
            flipped
            size="lg"
            className="tp-account-menu"
          >
            <OverflowMenuItem itemText="个人设置" onClick={() => navigate('/personal-settings')} />
            <OverflowMenuItem
              itemText={signingOut ? '正在退出…' : '退出登录'}
              disabled={signingOut}
              onClick={() => { if (!signingOut) void signOut(); }}
            />
          </OverflowMenu>
        </HeaderGlobalBar>
      </Header>
      <SideNav
        aria-label="Primary navigation"
        className={`cds--g100 ${sideNavExpanded ? 'tp-sidenav--expanded' : 'tp-sidenav--rail'}`}
        expanded={sideNavExpanded}
        isPersistent={!isCompactViewport}
        isRail={!isCompactViewport && !sideNavExpanded}
        onOverlayClick={() => setSideNavExpanded(false)}
      >
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">工作台</div>
          <SideNavItems>
            <SideNavLink href="/dashboard" isActive={location.pathname === '/dashboard' || location.pathname === '/'} title="总览" renderIcon={semanticIcons.dashboard}>总览</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">情报与商机</div>
          <SideNavItems>
            <SideNavLink href="/prospect-data" isActive={location.pathname.startsWith('/prospect-data') || location.pathname.startsWith('/prospect-history')} title="线索数据" renderIcon={semanticIcons.database}>线索数据</SideNavLink>
            <SideNavLink href="/leads" isActive={location.pathname.startsWith('/leads')} title="商机" renderIcon={semanticIcons.userFollow}>商机</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">客户管理</div>
          <SideNavItems>
            <SideNavLink href="/contacts" isActive={location.pathname.startsWith('/contacts')} title="联系人" renderIcon={semanticIcons.user}>联系人</SideNavLink>
            <SideNavLink href="/accounts" isActive={location.pathname.startsWith('/accounts')} title="客户档案" renderIcon={semanticIcons.building}>客户档案</SideNavLink>
            <SideNavLink href="/opportunities" isActive={location.pathname.startsWith('/opportunities')} title="销售机会" renderIcon={semanticIcons.chart}>销售机会</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">客户沟通</div>
          <SideNavItems>
            <SideNavLink href="/communications" isActive={location.pathname.startsWith('/communications') || location.pathname.startsWith('/inbox')} title="沟通" renderIcon={semanticIcons.chat}>沟通</SideNavLink>
            <SideNavLink href="/activities" isActive={location.pathname.startsWith('/activities')} title="活动与审计" renderIcon={semanticIcons.calendar}>活动与审计</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">贸易业务</div>
          <SideNavItems>
            <SideNavLink href="/quotes" isActive={location.pathname.startsWith('/quotes')} title="报价单" renderIcon={semanticIcons.document}>报价单</SideNavLink>
            <SideNavLink href="/sales-orders" isActive={location.pathname.startsWith('/sales-orders')} title="销售订单" renderIcon={semanticIcons.tasks}>销售订单</SideNavLink>
            <SideNavLink href="/documents" isActive={location.pathname.startsWith('/documents')} title="贸易单证" renderIcon={semanticIcons.documents}>贸易单证</SideNavLink>
            <SideNavLink href="/shipments" isActive={location.pathname.startsWith('/shipments')} title="物流发货" renderIcon={semanticIcons.delivery}>物流发货</SideNavLink>
            <SideNavLink href="/payments" isActive={location.pathname.startsWith('/payments')} title="收款管理" renderIcon={semanticIcons.currency}>收款管理</SideNavLink>
            <SideNavLink href="/products" isActive={location.pathname.startsWith('/products')} title="产品管理" renderIcon={semanticIcons.product}>产品管理</SideNavLink>
            <SideNavLink href="/wheel-fitment" isActive={location.pathname.startsWith('/wheel-fitment')} title="轮毂与轮胎适配" renderIcon={semanticIcons.calculator}>轮毂与轮胎适配</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">设置与系统</div>
          <SideNavItems>
            <SideNavLink href="/trade-tools" isActive={location.pathname.startsWith('/trade-tools')} title="贸易工具" renderIcon={semanticIcons.calculator}>贸易工具</SideNavLink>
            <SideNavLink href="/ai-agents" isActive={location.pathname.startsWith('/ai-agents')} title="AI 与 Agent" renderIcon={semanticIcons.api}>AI 与 Agent</SideNavLink>
            <SideNavLink href="/settings" isActive={location.pathname.startsWith('/settings')} title="系统设置" renderIcon={semanticIcons.settings}>系统设置</SideNavLink>
            <SideNavLink href="/security" isActive={location.pathname.startsWith('/security')} title="安全中心" renderIcon={semanticIcons.security}>安全中心</SideNavLink>
          </SideNavItems>
        </div>
        
      </SideNav>
      <Content id="main-content" tabIndex={-1} className="tp-content">
        <div className="tp-content__main">
          {signOutError && <InlineNotification kind="error" lowContrast title="Sign out failed" subtitle={signOutError} onCloseButtonClick={() => setSignOutError('')} />}
          <Outlet />
          {activityRecordType && recordRoute && <RecordActivityPanel recordType={activityRecordType} recordId={recordRoute[1]} />}
        </div>
      </Content>
      <XiaoyaSidePanel isOpen={xiaoyaOpen} onClose={() => setXiaoyaOpen(false)} pathname={location.pathname} />
    </>
  );
}
