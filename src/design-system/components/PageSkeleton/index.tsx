import type { CSSProperties } from 'react';
import './page-skeleton.scss';
import { DataTableSkeleton } from '../DataTableSkeleton';
import { SkeletonPlaceholder, SkeletonText } from '../Skeleton';

export type PageSkeletonVariant = 'table' | 'dashboard' | 'form' | 'detail' | 'chart' | 'analytics-table' | 'settings';

export interface PageSkeletonProps {
  variant?: PageSkeletonVariant;
  columns?: number;
  rows?: number;
  metricCount?: number;
  chartCount?: number;
  showMap?: boolean;
  showActions?: boolean;
  showToolbar?: boolean;
}

export function PageSkeleton({
  variant = 'table',
  columns = 6,
  rows = 8,
  metricCount = 4,
  chartCount = 2,
  showMap = false,
  showActions,
  showToolbar,
}: PageSkeletonProps) {
  const hasActions = showActions ?? ['table', 'dashboard', 'analytics-table'].includes(variant);
  const hasToolbar = showToolbar ?? ['table', 'dashboard', 'analytics-table'].includes(variant);
  const hasTable = variant === 'table' || variant === 'analytics-table';
  const hasMetrics = ['dashboard', 'detail', 'analytics-table'].includes(variant) && metricCount > 0;
  const hasCharts = ['dashboard', 'chart', 'analytics-table'].includes(variant);

  return (
    <section className={`tp-page-skeleton tp-page-skeleton--${variant}`} aria-busy="true" aria-label="正在加载页面内容">
      <div className="tp-page-skeleton__header">
        <div className="tp-page-skeleton__heading">
          <SkeletonText heading width="38%" />
          <SkeletonText width="62%" />
        </div>
        {hasActions && (
          <div className="tp-page-skeleton__actions">
            <SkeletonPlaceholder className="tp-page-skeleton__action" />
            <SkeletonPlaceholder className="tp-page-skeleton__action tp-page-skeleton__action--primary" />
          </div>
        )}
      </div>

      {hasToolbar && (
        <div className="tp-page-skeleton__toolbar">
          <SkeletonPlaceholder className="tp-page-skeleton__search" />
          <SkeletonPlaceholder className="tp-page-skeleton__filter" />
          <SkeletonPlaceholder className="tp-page-skeleton__filter" />
        </div>
      )}

      {hasMetrics && (
        <div className="tp-page-skeleton__metrics" style={{ '--tp-skeleton-metric-count': metricCount } as CSSProperties}>
          {Array.from({ length: metricCount }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__metric" />)}
        </div>
      )}

      {hasCharts && chartCount > 0 && (
        <div className="tp-page-skeleton__charts" style={{ '--tp-skeleton-chart-count': chartCount } as CSSProperties}>
          {Array.from({ length: chartCount }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__chart" />)}
        </div>
      )}

      {showMap && <SkeletonPlaceholder className="tp-page-skeleton__map" />}

      {variant === 'form' && (
        <div className="tp-page-skeleton__form">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="tp-page-skeleton__form-field" key={index}>
              <SkeletonText width={index % 3 === 0 ? '42%' : '30%'} />
              <SkeletonPlaceholder className="tp-page-skeleton__field" />
            </div>
          ))}
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
              {Array.from({ length: 5 }, (_, index) => (
                <div className="tp-page-skeleton__form-field" key={index}>
                  <SkeletonText width="32%" />
                  <SkeletonPlaceholder className="tp-page-skeleton__field" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {variant === 'detail' && (
        <div className="tp-page-skeleton__detail">
          <SkeletonPlaceholder className="tp-page-skeleton__detail-panel" />
          <SkeletonPlaceholder className="tp-page-skeleton__detail-panel" />
        </div>
      )}

      {hasTable && (
        <div className="tp-page-skeleton__table">
          <div className="tp-page-skeleton__section-heading">
            <SkeletonText heading width="12rem" />
            <SkeletonText width="7rem" />
          </div>
          <DataTableSkeleton columnCount={columns} rowCount={rows} showHeader showToolbar={false} />
        </div>
      )}
    </section>
  );
}
