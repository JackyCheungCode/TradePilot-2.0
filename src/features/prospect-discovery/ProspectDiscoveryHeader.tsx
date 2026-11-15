import { useNavigate } from 'react-router-dom';
import { Button, CarbonIcons } from '@/design-system';
import type { ReactNode } from 'react';

interface ProspectDiscoveryHeaderProps {
  title: string;
  description: string;
  children?: ReactNode;
  showRecentTasks?: boolean;
}

/** Header actions scoped to the Prospect Discovery module. */
export function ProspectDiscoveryHeader({
  title,
  description,
  children,
  showRecentTasks = true,
}: ProspectDiscoveryHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="tp-discovery__heading">
      <div>
        <p className="tp-discovery__eyebrow">TRADEPILOT / PROSPECTING</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="tp-discovery__heading-actions">
        {children}
        {title === '潜客控制台' ? (
          <>
            <Button kind="primary" size="sm" onClick={() => navigate('/prospect-discovery')}>
              <CarbonIcons.Add size={16} aria-hidden="true" />
              新建发现任务
            </Button>
            <Button kind="tertiary" size="sm" onClick={() => navigate('/recent-tasks')}>
              <CarbonIcons.Time size={16} aria-hidden="true" />
              最近任务
            </Button>
          </>
        ) : (
          <Button kind="ghost" size="sm" onClick={() => navigate('/prospect-console')}>
            <CarbonIcons.ChartLine size={16} aria-hidden="true" />
            潜客控制台
          </Button>
        )}
        {showRecentTasks && (
          <Button kind="ghost" size="sm" onClick={() => navigate('/recent-tasks')}>
            <CarbonIcons.Time size={16} aria-hidden="true" />
            最近任务
          </Button>
        )}
      </div>
    </header>
  );
}
