import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Button, ButtonSet, Heading } from '../components';
import './page-header.scss';

export type PageHeaderAction = {
  id: string;
  label: string;
  kind?: 'primary' | 'tertiary' | 'ghost';
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export type PageHeaderProps = {
  breadcrumb?: string;
  title?: string;
  description?: string;
  actions?: PageHeaderAction[];
  className?: string;
  children?: ReactNode;
};

function isActionElement(node: ReactNode): node is ReactElement<Record<string, unknown>> {
  if (!isValidElement(node)) return false;
  const typeName = typeof node.type === 'string' ? node.type : (node.type as { displayName?: string; name?: string }).displayName || (node.type as { name?: string }).name || '';
  return typeName === 'Button' || typeName === 'Link' || node.props.kind !== undefined;
}

function normalizeLegacyActions(node: ReactNode, primaryAssigned: { current: boolean }): ReactNode {
  if (Array.isArray(node)) return node.map((child) => normalizeLegacyActions(child, primaryAssigned));
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const children = props.children as ReactNode;
  if (isActionElement(node)) {
    const label = typeof children === 'string' ? children : '';
    const inferredPrimary = /^(新建|创建|新增|添加|导入|保存|生成|开始)/.test(label.trim());
    const requestedPrimary = props.kind === 'primary';
    const primary = !primaryAssigned.current && (requestedPrimary || inferredPrimary);
    if (primary) primaryAssigned.current = true;
    const isButton = (node.type as { name?: string }).name === 'Button' || props.kind !== undefined;
    return isButton
      ? cloneElement(node, { kind: primary ? 'primary' : (props.kind === 'danger' || String(props.kind || '').startsWith('danger') ? props.kind : 'tertiary'), size: 'lg', className: [String(props.className || ''), 'tp-page-header__action'].filter(Boolean).join(' ') } as Record<string, unknown>)
      : cloneElement(node, { className: [String(props.className || ''), 'tp-page-header__action-link'].filter(Boolean).join(' ') } as Record<string, unknown>);
  }
  if (children === undefined) return node;
  return cloneElement(node, { children: normalizeLegacyActions(children, primaryAssigned) } as Record<string, unknown>);
}

function markActionContainers(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const props = child.props as Record<string, unknown>;
    const className = typeof props.className === 'string' ? props.className : '';
    const hasActionClass = /(?:^|[-_])actions?(?:$|[-_])|header-actions/.test(className);
    const nested = props.children as ReactNode;
    const nextChildren = nested === undefined ? nested : markActionContainers(nested);
    return cloneElement(child, {
      ...(hasActionClass ? { className: [className, 'tp-page-header__actions'].filter(Boolean).join(' ') } : {}),
      ...(nextChildren === undefined ? {} : { children: nextChildren }),
    } as Record<string, unknown>);
  });
}

export function PageHeader({ breadcrumb, title, description, actions, className = '', children }: PageHeaderProps) {
  const classes = ['tp-page-header', className].filter(Boolean).join(' ');
  if (children !== undefined) {
    const primaryAssigned = { current: false };
    const normalized = normalizeLegacyActions(children, primaryAssigned);
    return <header className={classes}>{markActionContainers(normalized)}</header>;
  }

  const primaryCount = (actions || []).filter((action) => action.kind === 'primary').length;
  if (import.meta.env.DEV && primaryCount > 1) console.warn('PageHeader accepts at most one primary action.');
  const normalizedActions = (actions || []).map((action, index) => ({
    ...action,
    kind: action.kind === 'primary' && index === (actions || []).findIndex((item) => item.kind === 'primary') ? 'primary' as const : 'tertiary' as const,
  }));
  return (
    <header className={classes}>
      <div className="tp-page-header__content">
        {breadcrumb && <p className="tp-page-header__breadcrumb">{breadcrumb}</p>}
        {title && <Heading className="tp-page-header__title">{title}</Heading>}
        {description && <p className="tp-page-header__description">{description}</p>}
      </div>
      {normalizedActions.length > 0 && (
        <ButtonSet className="tp-page-header__actions">
          {normalizedActions.map((action) => (
            <Button key={action.id} kind={action.kind} size="lg" renderIcon={action.icon as never} href={action.href} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </Button>
          ))}
        </ButtonSet>
      )}
    </header>
  );
}
