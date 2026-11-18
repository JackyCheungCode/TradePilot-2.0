import type { CSSProperties } from 'react';
import './page-skeleton.scss';
import { DataTableSkeleton } from '../DataTableSkeleton';
import { SkeletonPlaceholder, SkeletonText } from '../Skeleton';

export type PageSkeletonVariant = 'table' | 'dashboard' | 'form' | 'detail' | 'chart';

export interface PageSkeletonProps {
  variant?: PageSkeletonVariant;
  columns?: number;
  rows?: number;
}

export function PageSkeleton({ variant = 'table', columns = 6, rows = 8 }: PageSkeletonProps) {
  return (
    <section className="tp-page-skeleton" aria-busy="true" aria-label="正在加载页面内容">
      <div className="tp-page-skeleton__header">
        <div className="tp-page-skeleton__heading">
          <SkeletonText heading width="42%" />
          <SkeletonText width="68%" />
        </div>
        <div className="tp-page-skeleton__actions">
          <SkeletonPlaceholder className="tp-page-skeleton__action" />
          <SkeletonPlaceholder className="tp-page-skeleton__action tp-page-skeleton__action--primary" />
        </div>
      </div>
      {variant !== 'form' && (
        <div className="tp-page-skeleton__toolbar">
          <SkeletonPlaceholder className="tp-page-skeleton__search" />
          <SkeletonPlaceholder className="tp-page-skeleton__filter" />
          <SkeletonPlaceholder className="tp-page-skeleton__filter" />
        </div>
      )}
      {variant === 'table' && (
        <DataTableSkeleton columnCount={columns} rowCount={rows} showHeader showToolbar={false} />
      )}
      {variant === 'dashboard' && (
        <>
          <div className="tp-page-skeleton__metrics">
            {Array.from({ length: 4 }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__metric" />)}
          </div>
          <div className="tp-page-skeleton__charts">
            <SkeletonPlaceholder className="tp-page-skeleton__chart" />
            <SkeletonPlaceholder className="tp-page-skeleton__chart" />
          </div>
        </>
      )}
      {variant === 'chart' && (
        <div className="tp-page-skeleton__charts">
          <SkeletonPlaceholder className="tp-page-skeleton__chart tp-page-skeleton__chart--wide" />
          <SkeletonPlaceholder className="tp-page-skeleton__chart" />
        </div>
      )}
      {variant === 'settings' && (
        <div className="tp-page-skeleton__settings">
          <div className="tp-page-skeleton__settings-nav">
            {Array.from({ length: 7 }, (_, index) => <SkeletonText key={index} width={index % 2 ? '72%' : '88%'} />)}
          </div>
          <div className="tp-page-skeleton__settings-main">
            <SkeletonText heading width="34%" />
            <SkeletonText width="58%" />
            <div className="tp-page-skeleton__settings-panel">
              {Array.from({ length: 5 }, (_, index) => <div className="tp-page-skeleton__form-field" key={index}><SkeletonText width="32%" /><SkeletonPlaceholder className="tp-page-skeleton__field" /></div>)}
            </div>
          </div>
        </div>
      )}

      {variant === 'form' && (
        <div className="tp-page-skeleton__form">
          {Array.from({ length: 6 }, (_, index) => <div key={index}><SkeletonText width="34%" /><SkeletonPlaceholder className="tp-page-skeleton__field" /></div>)}
        </div>
      )}
      {variant === 'detail' && (
        <>
          <div className="tp-page-skeleton__metrics">
            {Array.from({ length: 3 }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__metric" />)}
          </div>
          <div className="tp-page-skeleton__detail">
            <SkeletonPlaceholder className="tp-page-skeleton__detail-panel" />
            <SkeletonPlaceholder className="tp-page-skeleton__detail-panel" />
          </div>
        </>
      )}
    </section>
  );
}
