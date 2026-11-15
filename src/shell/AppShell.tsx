import { Header, HeaderName } from '../design-system/layout/Header';
import { Content } from '../design-system/layout/Content';
import { Outlet } from 'react-router-dom';

/**
 * Shared application frame.
 * Product navigation and page routes are intentionally not defined
 * until the information architecture has been approved.
 * All Carbon primitives are consumed through local design-system entry points.
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
        <div className="tp-content__main">
          <Outlet />
        </div>
      </Content>
    </>
  );
}
