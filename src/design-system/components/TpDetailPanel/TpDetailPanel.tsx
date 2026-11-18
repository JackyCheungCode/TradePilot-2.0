import { SidePanel } from '@carbon/ibm-products';
import type { ReactNode, RefObject } from 'react';

export interface TpDetailPanelProps {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  labelText?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  onRequestClose: () => void;
  children: ReactNode;
  actions?: React.ComponentProps<typeof SidePanel>['actions'];
  launcherButtonRef?: RefObject<HTMLElement>;
  className?: string;
}

export function TpDetailPanel({
  open,
  title,
  subtitle,
  labelText = '记录详情',
  size = 'lg',
  onRequestClose,
  children,
  actions,
  launcherButtonRef,
  className,
}: TpDetailPanelProps) {
  return (
    <SidePanel
      open={open}
      title={title}
      subtitle={subtitle}
      labelText={labelText}
      size={size}
      placement="right"
      includeOverlay={false}
      slideIn={false}
      onRequestClose={onRequestClose}
      launcherButtonRef={launcherButtonRef}
      actions={actions}
      className={className}
    >
      {children}
    </SidePanel>
  );
}
