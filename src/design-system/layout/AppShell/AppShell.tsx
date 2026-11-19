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
      <Header aria-label="TradePilot" className="cds--g100">
        <HeaderMenuButton
          aria-label={sideNavExpanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={sideNavExpanded}
          isActive={sideNavExpanded}
          onClick={() => setSideNavExpanded((expanded) => !expanded)}
        />
        <HeaderName href="/" prefix="" className="tp-header__brand" aria-label="TradePilot home">
          TradePilot
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={xiaoyaOpen ? 'Close Xiaoya AI assistant' : 'Open Xiaoya AI assistant'}
            tooltipAlignment="end"
            isActive={xiaoyaOpen}
            aria-expanded={xiaoyaOpen}
            onClick={() => setXiaoyaOpen((open) => !open)}
          >
            <XiaoyaAvatar emotion="idle" size={30} />
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
              itemText={preference === 'system' ? <><semanticIcons.check size={16} /> System</> : 'System'}
              onClick={() => setPreference('system')}
            />
            <OverflowMenuItem
              itemText={preference === 'white' ? <><semanticIcons.check size={16} /> White</> : 'White'}
              onClick={() => setPreference('white')}
            />
            <OverflowMenuItem
              itemText={preference === 'g10' ? <><semanticIcons.check size={16} /> Light gray</> : 'Light gray'}
              onClick={() => setPreference('g10')}
            />
            <OverflowMenuItem
              itemText={preference === 'g90' ? <><semanticIcons.check size={16} /> Dark gray</> : 'Dark gray'}
              onClick={() => setPreference('g90')}
            />
            <OverflowMenuItem
              itemText={preference === 'dark' ? <><semanticIcons.check size={16} /> Dark</> : 'Dark'}
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
            <OverflowMenuItem itemText="Personal settings" onClick={() => navigate('/personal-settings')} />
            <OverflowMenuItem
              itemText={signingOut ? 'Signing out…' : 'Sign out'}
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
          <div className="tp-sidenav__group-label">Workspace</div>
          <SideNavItems>
            <SideNavLink href="/dashboard" isActive={location.pathname === '/dashboard' || location.pathname === '/'} title="Overview" renderIcon={semanticIcons.dashboard}>Overview</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">Intelligence &amp; Leads</div>
          <SideNavItems>
            <SideNavLink href="/prospect-data" isActive={location.pathname.startsWith('/prospect-data') || location.pathname.startsWith('/prospect-history')} title="Prospect Data" renderIcon={semanticIcons.database}>Prospect Data</SideNavLink>
            <SideNavLink href="/leads" isActive={location.pathname.startsWith('/leads')} title="Leads" renderIcon={semanticIcons.userFollow}>Leads</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">Customers</div>
          <SideNavItems>
            <SideNavLink href="/contacts" isActive={location.pathname.startsWith('/contacts')} title="Contacts" renderIcon={semanticIcons.user}>Contacts</SideNavLink>
            <SideNavLink href="/accounts" isActive={location.pathname.startsWith('/accounts')} title="Accounts" renderIcon={semanticIcons.building}>Accounts</SideNavLink>
            <SideNavLink href="/opportunities" isActive={location.pathname.startsWith('/opportunities')} title="Opportunities" renderIcon={semanticIcons.chart}>Opportunities</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">Customer Engagement</div>
          <SideNavItems>
            <SideNavLink href="/inbox" isActive={location.pathname.startsWith('/inbox')} title="Customer Communication" renderIcon={semanticIcons.chat}>Customer Communication</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">Trade Operations</div>
          <SideNavItems>
            <SideNavLink href="/quotes" isActive={location.pathname.startsWith('/quotes')} title="Quotes" renderIcon={semanticIcons.document}>Quotes</SideNavLink>
            <SideNavLink href="/sales-orders" isActive={location.pathname.startsWith('/sales-orders')} title="Sales Orders" renderIcon={semanticIcons.tasks}>Sales Orders</SideNavLink>
            <SideNavLink href="/documents" isActive={location.pathname.startsWith('/documents')} title="Trade Documents" renderIcon={semanticIcons.documents}>Trade Documents</SideNavLink>
            <SideNavLink href="/shipments" isActive={location.pathname.startsWith('/shipments')} title="Shipments" renderIcon={semanticIcons.delivery}>Shipments</SideNavLink>
            <SideNavLink href="/payments" isActive={location.pathname.startsWith('/payments')} title="Payments" renderIcon={semanticIcons.currency}>Payments</SideNavLink>
            <SideNavLink href="/products" isActive={location.pathname.startsWith('/products')} title="Products" renderIcon={semanticIcons.product}>Products</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__group">
          <div className="tp-sidenav__group-label">System</div>
          <SideNavItems>
            <SideNavLink href="/trade-tools" isActive={location.pathname.startsWith('/trade-tools')} title="Trade Tools" renderIcon={semanticIcons.calculator}>Trade Tools</SideNavLink>
            <SideNavLink href="/ai-agents" isActive={location.pathname.startsWith('/ai-agents')} title="AI &amp; Agents" renderIcon={semanticIcons.api}>AI &amp; Agents</SideNavLink>
            <SideNavLink href="/settings" isActive={location.pathname.startsWith('/settings')} title="Settings" renderIcon={semanticIcons.settings}>Settings</SideNavLink>
            <SideNavLink href="/security" isActive={location.pathname.startsWith('/security')} title="Security" renderIcon={semanticIcons.security}>Security</SideNavLink>
          </SideNavItems>
        </div>
        <div className="tp-sidenav__footer">
          <div className="tp-sidenav__contact">Support: xg.y@icloud.com</div>
          <div className="tp-sidenav__copyright">
            <span>© {new Date().getFullYear()}</span>
            <img src="/tradepilot-mark.svg" alt="TradePilot" />
          </div>
        </div>
      </SideNav>
      <Content id="main-content" tabIndex={-1} className="tp-content">
        <div className="tp-content__main">
          {signOutError && <InlineNotification kind="error" lowContrast title="Sign out failed" subtitle={signOutError} onCloseButtonClick={() => setSignOutError('')} />}
          <Outlet />
        </div>
      </Content>
      <XiaoyaSidePanel isOpen={xiaoyaOpen} onClose={() => setXiaoyaOpen(false)} pathname={location.pathname} />
    </>
  );
}
