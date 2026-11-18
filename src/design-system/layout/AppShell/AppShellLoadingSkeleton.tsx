import { SkeletonPlaceholder, SkeletonText } from '../../components/Skeleton';
import './app-shell-loading-skeleton.scss';

export function AppShellLoadingSkeleton() {
  return (
    <div className="tp-app-shell-skeleton" aria-busy="true" aria-label="正在加载 TradePilot">
      <header className="tp-app-shell-skeleton__header">
        <SkeletonPlaceholder className="tp-app-shell-skeleton__menu" />
        <SkeletonText width="8rem" />
        <div className="tp-app-shell-skeleton__header-actions">
          <SkeletonPlaceholder className="tp-app-shell-skeleton__icon" />
          <SkeletonPlaceholder className="tp-app-shell-skeleton__icon" />
          <SkeletonPlaceholder className="tp-app-shell-skeleton__avatar" />
        </div>
      </header>
      <div className="tp-app-shell-skeleton__body">
        <aside className="tp-app-shell-skeleton__sidenav">
          <SkeletonText heading width="65%" />
          {Array.from({ length: 8 }, (_, index) => <SkeletonText key={index} width={index % 2 ? '72%' : '88%'} />)}
        </aside>
        <main className="tp-app-shell-skeleton__content">
          <div className="tp-app-shell-skeleton__content-loading">
          <SkeletonText heading width="14rem" />
          <SkeletonText width="28rem" />
          <SkeletonPlaceholder className="tp-app-shell-skeleton__content-placeholder" />
        </div>
        </main>
      </div>
    </div>
  );
}
