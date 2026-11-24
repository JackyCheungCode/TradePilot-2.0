import { Loading } from '../Loading';
import type { ReactNode } from 'react';

export interface TPLoadingProps {
  description?: string;
  withOverlay?: boolean;
  small?: boolean;
  active?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Shared Carbon loading indicator for page- or region-level work. */
export function TPLoading({
  description = '正在加载…',
  withOverlay = false,
  small = false,
  active = true,
  className = '',
  children,
}: TPLoadingProps) {
  if (!active) return children ? <>{children}</> : null;
  return (
    <div className={['tp-loading', withOverlay ? 'tp-loading--overlay' : '', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      {children}
      <Loading active withOverlay={withOverlay} small={small} description={description} />
    </div>
  );
}
