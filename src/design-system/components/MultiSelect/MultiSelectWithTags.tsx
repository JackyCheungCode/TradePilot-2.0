import type { ReactNode } from 'react';
import { DismissibleTag, FilterableMultiSelect as CarbonFilterableMultiSelect, MultiSelect as CarbonMultiSelect } from '@carbon/react';

type SelectionChange<Item> = (data: { selectedItems: Item[] | null }) => void;
type MultiSelectWithTagsProps<Item> = {
  id: string;
  items: Item[];
  label: ReactNode;
  titleText?: ReactNode;
  selectedItems?: Item[];
  itemToString?: (item: Item) => string;
  onChange?: SelectionChange<Item>;
  disabled?: boolean;
  [key: string]: unknown;
};

function selectedLabel<Item>(item: Item, itemToString?: (item: Item) => string) {
  if (itemToString) return itemToString(item);
  if (item && typeof item === 'object') {
    const value = item as Record<string, unknown>;
    return String(value.text ?? value.label ?? value.name ?? value.id ?? '');
  }
  return String(item ?? '');
}

function SelectedTags<Item>({ id, items, itemToString, onChange, disabled }: {
  id: string;
  items: Item[];
  itemToString?: (item: Item) => string;
  onChange?: SelectionChange<Item>;
  disabled?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="tp-multiselect__selected-tags" aria-label="已选择项目">
      {items.map((item, index) => {
        const label = selectedLabel(item, itemToString);
        return (
          <DismissibleTag
            key={`${id}-selected-${index}-${label}`}
            text={label}
            tagTitle={label}
            dismissTooltipLabel={`移除${label}`}
            title={`移除${label}`}
            disabled={disabled || !onChange}
            onClose={() => onChange?.({ selectedItems: items.filter((_, itemIndex) => itemIndex !== index) })}
          />
        );
      })}
    </div>
  );
}

export function MultiSelect<Item = unknown>(props: MultiSelectWithTagsProps<Item>) {
  const selectedItems = props.selectedItems ?? [];
  return (
    <div className="tp-multiselect">
      <CarbonMultiSelect {...props as any} selectedItems={selectedItems} />
      <SelectedTags
        id={props.id}
        items={selectedItems}
        itemToString={props.itemToString}
        onChange={props.onChange}
        disabled={props.disabled}
      />
    </div>
  );
}

export function FilterableMultiSelect<Item = unknown>(props: MultiSelectWithTagsProps<Item>) {
  const selectedItems = props.selectedItems ?? [];
  return (
    <div className="tp-multiselect">
      <CarbonFilterableMultiSelect {...props as any} selectedItems={selectedItems} />
      <SelectedTags
        id={props.id}
        items={selectedItems}
        itemToString={props.itemToString}
        onChange={props.onChange}
        disabled={props.disabled}
      />
    </div>
  );
}
