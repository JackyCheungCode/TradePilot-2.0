import type { ReactNode } from 'react';

export type TpTableValueType = 'text' | 'number' | 'currency' | 'percent' | 'datetime' | 'status' | 'person' | 'longText';

export interface TpTableColumn<T> {
  key: string;
  header: string;
  primary?: boolean;
  required?: boolean;
  defaultVisible?: boolean;
  type?: TpTableValueType;
  align?: 'start' | 'center' | 'end';
  minWidth?: number;
  sortable?: boolean;
  longText?: boolean;
  render?: (row: T) => ReactNode;
}

export interface TpBatchAction<T> {
  key: string;
  label: string;
  onClick: (rows: T[]) => void | Promise<void>;
  disabled?: boolean;
}

export interface TpRowAction<T> {
  key: string;
  label: string;
  onClick: (row: T) => void;
  kind?: 'default' | 'danger';
}

export interface TpPaginationConfig {
  page: number;
  pageSize: 10 | 20 | 50 | 100;
  totalItems: number;
  onChange: (page: number, pageSize: 10 | 20 | 50 | 100) => void;
}

export interface TpDataTableProps<T extends object> {
  columns: TpTableColumn<T>[];
  rows: T[];
  rowKey: keyof T;
  selectable?: boolean;
  batchActions?: TpBatchAction<T>[];
  rowActions?: TpRowAction<T>[];
  onRowOpen?: (row: T) => void;
  activeRowId?: string;
  loading?: boolean;
  refreshing?: boolean;
  error?: Error | string | null;
  emptyState?: ReactNode;
  pagination?: TpPaginationConfig;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  toolbarActions?: ReactNode;
  columnSettingsKey?: string;
  ariaLabel?: string;
}
