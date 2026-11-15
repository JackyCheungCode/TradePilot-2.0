import { Content, Header, HeaderName } from '@carbon/react';
import { Outlet } from 'react-router-dom';

/**
 * Shared application frame.
 * Navigation items are deliberately omitted until the product page map is approved.
 */
export function AppShell() {
  return (
    <>
      <Header aria-label="TradePilot">
        <HeaderName href="/" prefix="">
          TradePilot
        </HeaderName>
      </Header>
      <Content>
        <main className="tp-app-content">
          <Outlet />
        </main>
      </Content>
    </>
  );
}
