import type { CSSProperties, ReactNode } from 'react';
import './page-skeleton.scss';
import { DataTableSkeleton } from '../DataTableSkeleton';
import { SkeletonPlaceholder, SkeletonText } from '../Skeleton';

export type PageSkeletonVariant = 'table' | 'dashboard' | 'form' | 'detail' | 'chart' | 'analytics-table' | 'settings' | 'workspace' | 'document-preview';


export type PageSkeletonLayoutNode =
  | { type: 'text'; width?: string; heading?: boolean; className?: string }
  | { type: 'placeholder'; width?: string; height?: string; minHeight?: string; aspectRatio?: string; className?: string }
  | { type: 'group'; direction?: 'row' | 'column' | 'grid'; columns?: number; gap?: string; className?: string; children: PageSkeletonLayoutNode[] }
  | { type: 'table'; columns?: number; rows?: number; className?: string };

function renderLayoutNode(node: PageSkeletonLayoutNode, key: string): ReactNode {
  if (node.type === 'text') return <SkeletonText key={key} heading={node.heading} width={node.width} className={node.className} />;
  if (node.type === 'placeholder') return <SkeletonPlaceholder key={key} className={node.className} style={{ width: node.width, height: node.height, minHeight: node.minHeight, aspectRatio: node.aspectRatio }} />;
  if (node.type === 'table') return <div key={key} className={node.className}><DataTableSkeleton columnCount={node.columns ?? 6} rowCount={node.rows ?? 6} showHeader showToolbar={false} /></div>;
  const style: CSSProperties = node.className ? {} : node.direction === 'grid'
    ? { display: 'grid', gridTemplateColumns: `repeat(${node.columns ?? 2}, minmax(0, 1fr))`, gap: node.gap }
    : { display: 'flex', flexDirection: node.direction === 'row' ? 'row' : 'column', gap: node.gap };
  return <div key={key} className={node.className} style={style}>{node.children.map((child, index) => renderLayoutNode(child, `${key}-${index}`))}</div>;
}


export function pageSkeletonHeader(headerClassName: string, actionsClassName: string, actionCount = 2): PageSkeletonLayoutNode {
  return {
    type: 'group', direction: 'row', gap: 'var(--cds-spacing-05)', className: headerClassName, children: [
      { type: 'group', direction: 'column', gap: 'var(--cds-spacing-03)', children: [
        { type: 'text', width: '9rem' }, { type: 'text', heading: true, width: '14rem' }, { type: 'text', width: '26rem' },
      ] },
      { type: 'group', direction: 'row', gap: 'var(--cds-spacing-03)', className: actionsClassName, children:
        Array.from({ length: actionCount }, () => ({ type: 'placeholder' as const, width: '7rem', height: '2.5rem' })),
      },
    ],
  };
}

export function pageSkeletonFormSection(
  sectionClassName: string,
  gridClassName: string,
  columns: number,
  fieldCount: number,
  fieldClassName?: string,
  headingWidth = '12rem',
): PageSkeletonLayoutNode {
  return {
    type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: sectionClassName, children: [
      { type: 'text', heading: true, width: headingWidth },
      {
        type: 'group', direction: 'grid', columns, gap: 'var(--cds-spacing-04)', className: gridClassName,
        children: Array.from({ length: fieldCount }, () => ({
          type: 'group' as const, direction: 'column' as const, gap: 'var(--cds-spacing-02)' as const, className: fieldClassName,
          children: [{ type: 'text' as const, width: '6rem' }, { type: 'placeholder' as const, height: '2.5rem' }],
        })),
      },
    ],
  };
}

export function pageSkeletonPanel(sectionClassName: string, contentHeight = '16rem', headingWidth = '12rem'): PageSkeletonLayoutNode {
  return {
    type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: sectionClassName, children: [
      { type: 'text', heading: true, width: headingWidth },
      { type: 'placeholder', minHeight: contentHeight },
    ],
  };
}

export interface PageSkeletonProps {
  /** Explicit page-owned layout. Prefer this over a guessed generic variant. */
  layout?: PageSkeletonLayoutNode[];
  /** Apply the same root layout class as the real page when using an explicit layout. */
  className?: string;
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
  layout,
  className,
  columns = 6,
  rows = 8,
  metricCount = 4,
  chartCount = 2,
  showMap = false,
  showActions,
  showToolbar,
}: PageSkeletonProps) {
  if (layout) {
    return <div className={className} aria-busy="true" aria-label="正在加载页面内容">
      {layout.map((node, index) => renderLayoutNode(node, `layout-${index}`))}
    </div>;
  }

  const hasActions = showActions ?? ['table', 'dashboard', 'analytics-table', 'document-preview'].includes(variant);
  const hasToolbar = showToolbar ?? ['table', 'analytics-table'].includes(variant);
  const hasTable = variant === 'table' || variant === 'analytics-table';
  const hasMetrics = ['detail', 'analytics-table'].includes(variant) && metricCount > 0;
  const hasCharts = ['chart', 'analytics-table'].includes(variant);

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

      {variant === 'dashboard' && (
        <div className="tp-page-skeleton__dashboard">
          <div className="tp-page-skeleton__dashboard-filters">
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-filter" />
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-filter" />
            <SkeletonText width="8rem" />
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-reset" />
          </div>
          <SkeletonPlaceholder className="tp-page-skeleton__dashboard-map" />
          <div className="tp-page-skeleton__dashboard-intelligence">
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-panel" />
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-panel" />
          </div>
          <div className="tp-page-skeleton__dashboard-metrics" style={{ '--tp-skeleton-metric-count': metricCount } as CSSProperties}>
            {Array.from({ length: metricCount }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__metric" />)}
          </div>
          <SkeletonPlaceholder className="tp-page-skeleton__dashboard-wide-panel" />
          <div className="tp-page-skeleton__dashboard-tabs">
            <SkeletonText heading width="14rem" />
            <div className="tp-page-skeleton__dashboard-tabbar">
              {Array.from({ length: 5 }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__dashboard-tab" />)}
            </div>
            <div className="tp-page-skeleton__dashboard-tab-grid">
              {Array.from({ length: 4 }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__dashboard-panel" />)}
            </div>
          </div>
          <div className="tp-page-skeleton__dashboard-bottom">
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-panel" />
            <SkeletonPlaceholder className="tp-page-skeleton__dashboard-panel" />
          </div>
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

      {variant === 'workspace' && (
        <div className="tp-page-skeleton__workspace">
          <div className="tp-page-skeleton__workspace-sidebar">
            <SkeletonPlaceholder className="tp-page-skeleton__workspace-control" />
            {Array.from({ length: 6 }, (_, index) => <SkeletonPlaceholder key={index} className="tp-page-skeleton__workspace-history" />)}
          </div>
          <div className="tp-page-skeleton__workspace-main">
            <SkeletonPlaceholder className="tp-page-skeleton__workspace-conversation" />
            <div className="tp-page-skeleton__workspace-composer">
              <SkeletonPlaceholder className="tp-page-skeleton__workspace-input" />
              <SkeletonPlaceholder className="tp-page-skeleton__workspace-send" />
            </div>
          </div>
        </div>
      )}

      {variant === 'document-preview' && (
        <div className="tp-page-skeleton__document-preview">
          <div className="tp-page-skeleton__document-paper">
            <SkeletonText heading width="38%" />
            <SkeletonText width="76%" />
            <SkeletonText width="92%" />
            <SkeletonText width="68%" />
            <SkeletonPlaceholder className="tp-page-skeleton__document-table" />
            <SkeletonText width="84%" />
            <SkeletonText width="54%" />
          </div>
        </div>
      )}

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
