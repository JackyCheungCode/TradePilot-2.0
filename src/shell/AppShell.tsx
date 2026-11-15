import { Content, Header, HeaderName } from '@carbon/react';
import { Outlet } from 'react-router-dom';

/**
 * Shared application frame.
 * Product navigation and page routes are intentionally not defined
 * until the information architecture has been approved.
 */
export function AppShell() {
  return (
    <>
      <Header aria-label="TradePilot">
        <HeaderName href="/" prefix="">
          TradePilot
        </HeaderName>
      </Header>
      <Content className="tp-content">
        <main className="tp-content__main">
          <Outlet />
        </main>
      </Content>
    </>
  );
}
