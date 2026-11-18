import { Children, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Button, ButtonSet, Heading, Link } from '../components';
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
  return isValidElement(node) && (node.type === Button || node.type === Link);
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (isValidElement(node)) return nodeText((node.props as Record<string, unknown>).children as ReactNode);
  return '';
}

function normalizeLegacyActions(node: ReactNode, primaryAssigned: { current: boolean }): ReactNode {
  if (Array.isArray(node)) return node.map((child) => normalizeLegacyActions(child, primaryAssigned));
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const children = props.children as ReactNode;

  if (isActionElement(node)) {
    const label = nodeText(children);
    const inferredPrimary = /^(新建|创建|新增|添加|导入|保存|生成|开始)/.test(label.trim());
    const primary = !primaryAssigned.current && (props.kind === 'primary' || inferredPrimary);
    if (primary) primaryAssigned.current = true;
    const kind = primary ? 'primary' : 'tertiary';
    const className = [String(props.className || ''), 'tp-page-header__action'].filter(Boolean).join(' ');

    // Carbon renderIcon expects a component type, never a rendered React element.
    // Keep legacy inline SVG/icon elements as ordinary button children to avoid React #130.
    const renderIcon = isValidElement(props.renderIcon) ? undefined : props.renderIcon;
    if (node.type === Button) {
      return cloneElement(node, { kind, size: 'lg', className, ...(renderIcon === undefined ? {} : { renderIcon }) } as Record<string, unknown>);
    }
    return createElement(Button, {
      ...(props as Record<string, unknown>),
      kind,
      size: 'lg',
      className,
      ...(renderIcon === undefined ? {} : { renderIcon }),
    } as never, children);
  }

  if (children === undefined) return node;
  let normalizedChildren = normalizeLegacyActions(children, primaryAssigned);
  const className = typeof props.className === 'string' ? props.className : '';
  if (/(?:^|[-_])actions?(?:$|[-_])|header-actions/.test(className)) {
    const items = Children.toArray(normalizedChildren).flatMap((item) => {
      if (isValidElement(item) && /secondary/.test(String((item.props as Record<string, unknown>).className || ''))) {
        const nested = Children.toArray((item.props as Record<string, unknown>).children as ReactNode);
        if (nested.length > 0 && nested.every(isActionElement)) return nested;
      }
      return [item];
    });
    if (items.length > 0 && items.every(isActionElement)) {
      normalizedChildren = [...items].sort((a, b) => Number((a as ReactElement).props.kind === 'primary') - Number((b as ReactElement).props.kind === 'primary'));
    }
  }
  return cloneElement(node, { children: normalizedChildren } as Record<string, unknown>);
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
  if (primaryCount > 1) console.warn('PageHeader accepts at most one primary action.');
  const explicitPrimary = (actions || []).findIndex((action) => action.kind === 'primary');
  const inferredPrimary = (actions || []).findIndex((action) => /^(新建|创建|新增|添加|导入|保存|生成|开始|create|add|import)/i.test(action.label.trim()));
  const primaryIndex = explicitPrimary >= 0 ? explicitPrimary : inferredPrimary;
  const normalizedActions = (actions || []).map((action, index) => ({
    ...action,
    kind: index === primaryIndex ? 'primary' as const : 'tertiary' as const,
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
            <Button key={action.id} kind={action.kind} size="lg" renderIcon={action.icon && !isValidElement(action.icon) ? action.icon as never : undefined} href={action.href} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </Button>
          ))}
        </ButtonSet>
      )}
    </header>
  );
}
