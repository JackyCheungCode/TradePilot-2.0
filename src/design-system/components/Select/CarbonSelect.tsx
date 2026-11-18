import React, { useMemo, type ReactNode } from 'react';
import { Dropdown, type DropdownProps } from '@carbon/react';
import { SelectItem, type SelectItemProps } from '../SelectItem';

type Option = {
  value: string;
  text: string;
  disabled?: boolean;
};

type SelectChangeEvent = {
  currentTarget: {
    value: string;
  };
};

type SelectProps = Omit<
  DropdownProps<Option>,
  | 'items'
  | 'label'
  | 'titleText'
  | 'onChange'
  | 'selectedItem'
  | 'initialSelectedItem'
  | 'itemToString'
  | 'children'
  | 'hideLabel'
> & {
  labelText: ReactNode;
  value: string | number;
  hideLabel?: boolean;
  children?: ReactNode;
  onChange?: (event: SelectChangeEvent) => void;
};

/**
 * Backward-compatible TradePilot Select API implemented with Carbon Dropdown.
 *
 * Carbon's Select renders the browser's native select/option control. This
 * adapter deliberately uses Carbon Dropdown's ListBox implementation instead,
 * so the option menu is rendered and managed by Carbon rather than the browser.
 */
export function Select({
  id,
  labelText,
  value,
  children,
  onChange,
  hideLabel,
  ...dropdownProps
}: SelectProps) {
  const items = useMemo(() => {
    const collected: Option[] = [];

    const visit = (nodes: ReactNode) => {
      React.Children.forEach(nodes, (node) => {
        if (!React.isValidElement<SelectItemProps>(node)) return;

        if (node.type === React.Fragment) {
          visit(node.props.children);
          return;
        }

        if (node.type !== SelectItem) return;

        collected.push({
          value: String(node.props.value),
          text: String(node.props.text ?? ''),
          disabled: node.props.disabled,
        });
      });
    };

    visit(children);
    return collected;
  }, [children]);

  const selectedItem = items.find((item) => item.value === String(value));

  return (
    <Dropdown<Option>
      {...dropdownProps}
      id={id}
      items={items}
      label={labelText}
      titleText={labelText}
      hideLabel={hideLabel}
      selectedItem={selectedItem}
      itemToString={(item) => item?.text ?? ''}
      onChange={({ selectedItem: nextItem }) => {
        onChange?.({ currentTarget: { value: nextItem?.value ?? '' } });
      }}
    />
  );
}
