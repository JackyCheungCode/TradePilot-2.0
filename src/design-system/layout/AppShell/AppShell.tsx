import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Header, HeaderName, HeaderMenuButton,
  SideNav, SideNavItems, SideNavLink, Content, CarbonIcons,
} from '@/design-system';

/**
 * Shared Carbon application frame.
 * Carbon's native rail variant keeps primary navigation available while collapsed.
 */
export function AppShell() {
  const [sideNavExpanded, setSideNavExpanded] = useState(false);

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
            href="/prospect-discovery"
            isActive
            title="潜客发现"
            renderIcon={CarbonIcons.Search}
          >
            潜客发现
          </SideNavLink>
        </SideNavItems>
      </SideNav>
      <Content className="tp-content">
        <div className="tp-content__main">
          <Outlet />
        </div>
      </Content>
    </>
  );
}
