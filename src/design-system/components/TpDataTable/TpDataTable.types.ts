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
  /** Plain-text value used by CSV export when the displayed cell is rendered as a React node. */
  exportValue?: (row: T) => string | number | null;
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
  serverSide?: boolean;
  onChange: (page: number, pageSize: 10 | 20 | 50 | 100) => void;
}

export interface TpDataTableProps<T extends object> {
  columns: TpTableColumn<T>[];
  rows: T[];
  rowKey: keyof T;
  selectable?: boolean;
  batchActions?: TpBatchAction<T>[];
  rowActions?: TpRowAction<T>[];
  onRowOpen?: (row: T, triggerElement?: HTMLElement) => void;
  /** Opens an IBM Products SidePanel with the selected record while keeping the list in context. */
  detailPanel?: boolean;
  /** Optional guard for rows that are structural/group rows rather than records. */
  canOpenRow?: (row: T) => boolean;
  /** Prevents synthetic/group rows from entering the selected-record set. */
  canSelectRow?: (row: T) => boolean;
  /** Optional record title shown in the detail SidePanel. */
  detailTitle?: (row: T) => string;
  activeRowId?: string;
  loading?: boolean;
  refreshing?: boolean;
  error?: Error | string | null;
  /** Optional recovery action rendered with an error state. */
  onRetry?: () => void;
  emptyState?: ReactNode;
  pagination?: TpPaginationConfig;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  toolbarActions?: ReactNode;
  columnSettingsKey?: string;
  /** Rows supplied by the current result page; selected records are cached as pages change. */
  selectionRows?: T[];
  /** Stable key for the active filter scope; changing it clears selections. */
  selectionScopeKey?: string;
  onSortChange?: (key: string, direction: 'ASC' | 'DESC' | 'NONE') => void;
  ariaLabel?: string;
}
