import type { ReactNode } from 'react';
import { SkeletonPlaceholder } from '../SkeletonPlaceholder';
import { DataTableSkeleton } from '../DataTableSkeleton';
import { SkeletonText } from '../SkeletonText';

export type TPSkeletonVariant = 'text' | 'card' | 'conversation' | 'profile' | 'table';

export interface TPSkeletonProps {
  variant?: TPSkeletonVariant;
  rows?: number;
  className?: string;
  children?: ReactNode;
  label?: string;
}

/** Carbon skeleton patterns sized for common TradePilot content regions. */
export function TPSkeleton({ variant = 'text', rows = 3, className = '', children, label = '正在加载内容…' }: TPSkeletonProps) {
  const count = Math.max(1, Math.min(12, rows));
  return (
    <div className={['tp-skeleton', 'tp-skeleton--' + variant, className].filter(Boolean).join(' ')} aria-busy="true" aria-live="polite" aria-label={label}>
      {variant === 'text' && <SkeletonText paragraph lineCount={count} />}
      {variant === 'card' && (
        <div className="tp-skeleton__card">
          <SkeletonText heading width="45%" />
          <SkeletonText paragraph lineCount={count} />
        </div>
      )}
      {variant === 'conversation' && Array.from({ length: count }, (_, index) => (
        <div className="tp-skeleton__message" key={index}>
          <SkeletonPlaceholder className="tp-skeleton__avatar" />
          <div className="tp-skeleton__message-copy"><SkeletonText heading width="28%" /><SkeletonText paragraph lineCount={2} /></div>
        </div>
      ))}
      {variant === 'profile' && (
        <div className="tp-skeleton__profile">
          <SkeletonPlaceholder className="tp-skeleton__profile-avatar" />
          <SkeletonText heading width="55%" />
          <SkeletonText paragraph lineCount={count} />
        </div>
      )}
      {variant === 'table' && <DataTableSkeleton columnCount={4} rowCount={count} showToolbar />}
      {children}
    </div>
  );
}
