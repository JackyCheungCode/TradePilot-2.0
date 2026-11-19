import {
  Button,
  Checkbox,
  DataTable,
  DataTableSkeleton,
  OverflowMenu,
  OverflowMenuItem,
  Pagination,
  Popover,
  PopoverContent,
  Table,
  TableBatchAction,
  TableBatchActions,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
} from '@carbon/react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { TpDataTableProps } from './TpDataTable.types';
import './TpDataTable.scss';

function displayValue<T extends object>(row: T, column: TpDataTableProps<T>['columns'][number]) {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'currency' && typeof value === 'number') return value.toLocaleString();
  if (column.type === 'percent' && typeof value === 'number') return `${value}%`;
  if (column.type === 'number' && typeof value === 'number') return value.toLocaleString();
  if (column.type === 'status') return <Tag type="blue">{String(value)}</Tag>;
  return String(value);
}

export function TpDataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  selectable = false,
  batchActions = [],
  rowActions = [],
  onRowOpen,
  activeRowId,
  loading = false,
  refreshing = false,
  error,
  emptyState,
  pagination,
  searchValue,
  onSearchChange,
  toolbarActions,
  ariaLabel = '数据列表',
  columnSettingsKey,
  selectionRows = rows,
}: TpDataTableProps<T>) {
  const [columnPreferences, setColumnPreferences] = useState<{ order: string[]; hidden: string[] } | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(!columnSettingsKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectedRows = useMemo(
    () => selectionRows.filter((row) => selectedIds.has(String(row[rowKey]))),
    [selectionRows, selectedIds, rowKey],
  );


  useEffect(() => {
    const validIds = new Set(selectionRows.map((row) => String(row[rowKey])));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [selectionRows, rowKey]);

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const togglePageSelection = (ids: string[], checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  useEffect(() => {
    if (!columnSettingsKey) {
      setPreferencesReady(true);
      return;
    }
    let cancelled = false;
    const storageKey = `tradepilot:table-columns:${columnSettingsKey}`;
    let localPreferences: { order: string[]; hidden: string[] } | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) localPreferences = JSON.parse(stored) as { order: string[]; hidden: string[] };
    } catch {
      localPreferences = null;
    }
    if (localPreferences && !cancelled) setColumnPreferences(localPreferences);

    void (async () => {
      try {
        const client = await getSupabaseClient();
        const { data, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        const cloud = data.user?.user_metadata?.tradepilot_table_preferences?.[columnSettingsKey] as
          | { order?: string[]; hidden?: string[] }
          | undefined;
        if (cloud && Array.isArray(cloud.order) && Array.isArray(cloud.hidden)) {
          if (!cancelled) {
            const validKeys = new Set(columns.map((column) => column.key));
            setColumnPreferences({
              order: cloud.order.filter((key) => validKeys.has(key)),
              hidden: cloud.hidden.filter((key) => validKeys.has(key)),
            });
          }
        } else if (localPreferences && data.user) {
          const metadata = data.user.user_metadata ?? {};
          const current = metadata.tradepilot_table_preferences ?? {};
          await client.auth.updateUser({
            data: { tradepilot_table_preferences: { ...current, [columnSettingsKey]: localPreferences } },
          });
        }
      } catch {
        // Local preferences remain available when cloud settings cannot be reached.
      } finally {
        if (!cancelled) setPreferencesReady(true);
      }
    })();
    return () => { cancelled = true; };
  // The table key identifies the preference namespace; columns are reconciled when rendering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnSettingsKey]);

  useEffect(() => {
    if (!columnSettingsKey || !preferencesReady || !columnPreferences) return;
    const storageKey = `tradepilot:table-columns:${columnSettingsKey}`;
    try { window.localStorage.setItem(storageKey, JSON.stringify(columnPreferences)); } catch { /* Storage may be unavailable. */ }
    let cancelled = false;
    void (async () => {
      try {
        const client = await getSupabaseClient();
        const { data, error: authError } = await client.auth.getUser();
        if (authError || !data.user || cancelled) return;
        const metadata = data.user.user_metadata ?? {};
        const current = metadata.tradepilot_table_preferences ?? {};
        await client.auth.updateUser({
          data: { tradepilot_table_preferences: { ...current, [columnSettingsKey]: columnPreferences } },
        });
      } catch {
        // Keep the local copy and retry on the next preference change.
      }
    })();
    return () => { cancelled = true; };
  }, [columnSettingsKey, columnPreferences, preferencesReady]);

  const visibleColumns = useMemo(() => {
    const hidden = new Set(columnPreferences?.hidden ?? []);
    const order = columnPreferences?.order ?? [];
    return columns
      .filter((column) => column.required || column.primary || (hidden.has(column.key)
        ? false
        : columnPreferences ? true : !column.longText && column.defaultVisible !== false))
      .sort((a, b) => {
        const ai = order.indexOf(a.key);
        const bi = order.indexOf(b.key);
        if (ai < 0 && bi < 0) return columns.indexOf(a) - columns.indexOf(b);
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        return ai - bi;
      });
  }, [columns, columnPreferences]);
  const headers = useMemo(() => [
    ...visibleColumns.map((column) => ({ key: column.key, header: column.header, isSortable: Boolean(column.sortable) })),
    ...(rowActions.length ? [{ key: '__actions', header: '操作' }] : []),
  ], [visibleColumns, rowActions.length]);
  const carbonRows = useMemo(() => rows.map((row) => ({
    id: String(row[rowKey]),
    ...Object.fromEntries(visibleColumns.map((column) => [column.key, displayValue(row, column)])),
    __source: row,
  })), [rows, rowKey, visibleColumns]);

  if (loading) return <DataTableSkeleton columnCount={headers.length || 1} rowCount={8} showToolbar />;
  if (error) return <div className="tp-data-table__message" role="alert">{String(error)}</div>;

  return (
    <div className={`tp-data-table${refreshing ? ' tp-data-table--refreshing' : ''}`}>
      <DataTable rows={carbonRows} headers={headers} isSortable>
        {({ rows: renderedRows, getHeaderProps, getRowProps, getSelectionProps, getBatchActionProps, selectedRows: carbonSelectedRows, selectRow }) => {
          const pageStart = pagination ? (pagination.page - 1) * pagination.pageSize : 0;
          const pageRows = pagination ? renderedRows.slice(pageStart, pageStart + pagination.pageSize) : renderedRows;
          const pageIds = pageRows.map((row) => row.id);
          const selectedPageCount = pageIds.filter((id) => selectedIds.has(id)).length;
          const allPageSelected = pageIds.length > 0 && selectedPageCount === pageIds.length;
          const somePageSelected = selectedPageCount > 0 && !allPageSelected;
          return (
          <TableContainer aria-label={ariaLabel}>
            <TableToolbar>
              {selectable && selectedRows.length > 0 && (
                <TableBatchActions
                  {...getBatchActionProps()}
                  onCancel={() => {
                    setSelectedIds(new Set());
                    getBatchActionProps().onCancel();
                  }}
                >
                  {batchActions.map((action) => (
                    <TableBatchAction
                      key={action.key}
                      tabIndex={0}
                      onClick={() => void action.onClick(selectedRows)}
                      disabled={action.disabled}
                    >
                      {action.label}
                    </TableBatchAction>
                  ))}
                </TableBatchActions>
              )}
              <TableToolbarContent>
                {selectable && selectedRows.length > 0 && (
                  <div className="tp-data-table__selection-summary" aria-live="polite">
                    <span>已选 {selectedRows.length} 条</span>
                    <Button kind="ghost" size="sm" onClick={() => {
                      carbonSelectedRows.forEach((row) => selectRow(row.id));
                      setSelectedIds(new Set());
                    }}>清除选择</Button>
                  </div>
                )}
                {onSearchChange && (
                  <TableToolbarSearch
                    persistent
                    value={searchValue ?? ''}
                    onChange={(_event, value) => {
                      onSearchChange(value ?? '');
                    }}
                  />
                )}
                {toolbarActions}
                {columnSettingsKey && (
                  <Popover open={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
                    <Button kind="ghost" size="sm" onClick={() => setSettingsOpen((open) => !open)}>
                      列设置
                    </Button>
                    <PopoverContent>
                      <div className="tp-data-table__column-settings">
                        <strong>显示列</strong>
                        {columns.map((column) => {
                          const isRequired = Boolean(column.required || column.primary);
                          const isVisible = visibleColumns.some((item) => item.key === column.key);
                          return (
                            <div className="tp-data-table__column-setting-row" key={column.key}>
                              <Checkbox
                                id={`tp-table-column-${columnSettingsKey}-${column.key}`}
                                labelText={column.header}
                                checked={isVisible}
                                disabled={isRequired}
                                onChange={(checked) => {
                                  setColumnPreferences((current) => {
                                    const defaultHidden = columns.filter((item) => item.longText || item.defaultVisible === false).map((item) => item.key);
                                    const hidden = new Set(current?.hidden ?? defaultHidden);
                                    if (checked) hidden.delete(column.key);
                                    else hidden.add(column.key);
                                    return { order: current?.order ?? columns.map((item) => item.key), hidden: [...hidden] };
                                  });
                                }}
                              />
                              <div className="tp-data-table__column-order">
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={columns.findIndex((item) => item.key === column.key) === 0}
                                  onClick={() => setColumnPreferences((current) => {
                                    const order = current?.order?.length ? [...current.order] : columns.map((item) => item.key);
                                    const index = order.indexOf(column.key);
                                    if (index > 0) [order[index - 1], order[index]] = [order[index], order[index - 1]];
                                    return { order, hidden: current?.hidden ?? columns.filter((item) => item.longText || item.defaultVisible === false).map((item) => item.key) };
                                  })}
                                >上移</Button>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={columns.findIndex((item) => item.key === column.key) === columns.length - 1}
                                  onClick={() => setColumnPreferences((current) => {
                                    const order = current?.order?.length ? [...current.order] : columns.map((item) => item.key);
                                    const index = order.indexOf(column.key);
                                    if (index >= 0 && index < order.length - 1) [order[index + 1], order[index]] = [order[index], order[index + 1]];
                                    return { order, hidden: current?.hidden ?? columns.filter((item) => item.longText || item.defaultVisible === false).map((item) => item.key) };
                                  })}
                                >下移</Button>
                              </div>
                            </div>
                          );
                        })}
                        <Button kind="ghost" size="sm" onClick={() => setColumnPreferences({
                          order: columns.map((column) => column.key),
                          hidden: columns.filter((column) => column.longText || column.defaultVisible === false).map((column) => column.key),
                        })}>
                          恢复默认列
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </TableToolbarContent>
            </TableToolbar>
            <div className="tp-data-table__scroll" role="region" aria-label={`${ariaLabel}，可横向滚动`} tabIndex={0}>
              <Table size={typeof window !== 'undefined' && window.innerWidth < 672 ? 'lg' : 'md'}>
                <TableHead>
                  <TableRow>
                    {selectable && (
                      <TableSelectAll
                        {...getSelectionProps({ onClick: () => togglePageSelection(pageIds, !allPageSelected) })}
                        checked={allPageSelected}
                        indeterminate={somePageSelected}
                      />
                    )}
                    {headers.map((header) => {
                      const column = visibleColumns.find((item) => item.key === header.key);
                      return (
                        <TableHeader
                          {...getHeaderProps({ header })}
                          className={header.key === '__actions' ? 'tp-data-table__actions-heading' : undefined}
                          style={column ? {
                            minWidth: column.minWidth ? `${column.minWidth}px` : undefined,
                            textAlign: column.align === 'end' ? 'right' : column.align === 'center' ? 'center' : 'left',
                          } : undefined}
                        >
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.map((carbonRow) => {
                    const source = rows.find((row) => String(row[rowKey]) === carbonRow.id);
                    if (!source) return null;
                    return (
                      <TableRow
                        {...getRowProps({ row: carbonRow })}
                        className={`${activeRowId === carbonRow.id ? 'tp-data-table__row--active' : ''}`}
                        onClick={(event) => onRowOpen?.(source, event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ') && onRowOpen) {
                            event.preventDefault();
                            onRowOpen(source, event.currentTarget);
                          }
                        }}
                        tabIndex={onRowOpen ? 0 : undefined}
                      >
                        {selectable && (
                          <TableSelectRow
                            {...getSelectionProps({
                              row: carbonRow,
                              onClick: (event) => {
                                event.stopPropagation();
                                toggleRowSelection(carbonRow.id, !selectedIds.has(carbonRow.id));
                              },
                            })}
                            checked={selectedIds.has(carbonRow.id)}
                          />
                        )}
                        {visibleColumns.map((column) => (
                          <TableCell
                            key={column.key}
                            className={column.longText ? 'tp-data-table__long-text' : undefined}
                            style={{
                              minWidth: column.minWidth ? `${column.minWidth}px` : undefined,
                              textAlign: column.align === 'end' ? 'right' : column.align === 'center' ? 'center' : 'left',
                            }}
                          >
                            {displayValue(source, column)}
                          </TableCell>
                        ))}
                        {rowActions.length > 0 && (
                          <TableCell className="tp-data-table__actions-cell">
                            <OverflowMenu ariaLabel="行操作" flipped>
                              {rowActions.map((action) => (
                                <OverflowMenuItem
                                  key={action.key}
                                  itemText={action.label}
                                  isDelete={action.kind === 'danger'}
                                  onClick={(event: React.MouseEvent) => {
                                    event.stopPropagation();
                                    action.onClick(source);
                                  }}
                                />
                              ))}
                            </OverflowMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {renderedRows.length === 0 && <div className="tp-data-table__empty">{emptyState ?? '暂无数据'}</div>}
            {pagination && (
              <Pagination
                totalItems={pagination.totalItems}
                page={pagination.page}
                pageSize={pagination.pageSize}
                pageSizes={[10, 20, 50, 100]}
                onChange={({ page, pageSize }) => pagination.onChange(page, pageSize as 10 | 20 | 50 | 100)}
                itemsPerPageText="每页条数"
                pageNumberText="页码"
                pageRangeText={(current, total) => `第 ${current} 页，共 ${total} 页`}
                itemRangeText={(min, max, total) => `${min}–${max} 条，共 ${total} 条`}
                backwardText="上一页"
                forwardText="下一页"
              />
            )}
          </TableContainer>
          );
        }}
      </DataTable>
    </div>
  );
}
