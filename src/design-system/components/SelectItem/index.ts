import type { ReactNode } from 'react';

export interface SelectItemProps {
  value: string | number;
  text: ReactNode;
  disabled?: boolean;
}

/**
 * Option descriptor consumed by the local Carbon Dropdown adapter.
 * It intentionally renders no DOM node or native <option> element.
 */
export function SelectItem(_props: SelectItemProps) {
  return null;
}
