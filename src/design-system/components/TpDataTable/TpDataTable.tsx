import {
  Button,
  Checkbox,
  DataTable,
  DataTableSkeleton,
  InlineNotification,
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
import { SidePanel } from '@carbon/ibm-products';
import { isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { TpDataTableProps } from './TpDataTable.types';
import './TpDataTable.scss';

function flattenExportValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenExportValue).filter(Boolean).join(' ');
  if (isValidElement(value)) {
    const props = value.props as { children?: unknown; alt?: string; title?: string };
    return flattenExportValue(props.children ?? props.alt ?? props.title ?? '');
  }
  if (typeof value === 'object') return JSON.stringify(value) ?? String(value);
  return String(value);
}

function csvSafeValue(value: unknown) {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadSelectedRows<T extends Record<string, unknown>>(
  rows: T[],
  columns: TpDataTableProps<T>['columns'],
  fileName: string,
) {
  const headers = columns.map((column) => column.header);
  const lines = [
    headers.map(csvSafeValue).join(','),
    ...rows.map((row) => columns.map((column) => {
      const value = column.exportValue
        ? column.exportValue(row)
        : row[column.key] !== undefined
          ? row[column.key]
          : displayValue(row, column);
      return csvSafeValue(flattenExportValue(value));
    }).join(',')),
  ];
  const blob = new Blob(['\\uFEFF', lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
  detailPanel = false,
  canOpenRow,
  detailTitle,
  activeRowId,
  loading = false,
  refreshing = false,
  error,
  onRetry,
  emptyState,
  pagination,
  searchValue,
  onSearchChange,
  toolbarActions,
  ariaLabel = '数据列表',
  columnSettingsKey,
  selectionRows = rows,
  selectionScopeKey,
  onSortChange,
}: TpDataTableProps<T>) {
  const [columnPreferences, setColumnPreferences] = useState<{ order: string[]; hidden: string[] } | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(!columnSettingsKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [pendingDetailNavigation, setPendingDetailNavigation] = useState<{ targetPage: number; direction: -1 | 1; sourceRows: T[] } | null>(null);
  const detailLauncherRef = useRef<HTMLElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [batchFeedback, setBatchFeedback] = useState<{ kind: 'success' | 'error'; title: string; subtitle: string } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const selectedRowCache = useRef(new Map<string, T>());

  useEffect(() => {
    selectionRows.forEach((row) => selectedRowCache.current.set(String(row[rowKey]), row));
    setSelectionRevision((revision) => revision + 1);
  }, [selectionRows, rowKey]);

  const selectedRows = useMemo(
    () => [...selectedIds].map((id) => selectedRowCache.current.get(id)).filter((row): row is T => Boolean(row)),
    [selectedIds, selectionRevision],
  );


  useEffect(() => {
    // Clear stale selections when the logical filter scope changes, not when a page changes.
    setSelectedIds(new Set());
    selectedRowCache.current.clear();
  }, [selectionScopeKey]);

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else { next.delete(id); selectedRowCache.current.delete(id); }
      return next;
    });
  };

  const togglePageSelection = (ids: string[], checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else { next.delete(id); selectedRowCache.current.delete(id); }
      });
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
  const orderedColumnKeys = useMemo(() => {
    const configured = columnPreferences?.order ?? [];
    return [...columns].sort((a, b) => {
      const ai = configured.indexOf(a.key);
      const bi = configured.indexOf(b.key);
      if (ai < 0 && bi < 0) return columns.indexOf(a) - columns.indexOf(b);
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    }).map((column) => column.key);
  }, [columns, columnPreferences]);
  const headers = useMemo(() => [
    ...visibleColumns.map((column) => ({ key: column.key, header: column.header, isSortable: column.sortable !== false && (!pagination?.serverSide || Boolean(onSortChange)) })),
    ...(rowActions.length ? [{ key: '__actions', header: '操作' }] : []),
  ], [visibleColumns, rowActions.length, pagination?.serverSide, onSortChange]);
  const detailRow = detailPanel && detailRowId
    ? rows.find((row) => String(row[rowKey]) === detailRowId) ?? null
    : null;
  const openDetail = (row: T, trigger?: HTMLElement, replace = false) => {
    if (canOpenRow && !canOpenRow(row)) {
      onRowOpen?.(row, trigger);
      return;
    }
    detailLauncherRef.current = trigger ?? detailLauncherRef.current;
    const id = String(row[rowKey]);
    const url = new URL(window.location.href);
    const currentId = url.searchParams.get('tpRecord');
    url.searchParams.set('tpRecord', id);
    const state = { ...(window.history.state ?? {}), __tpDataTableDetail: true };
    if (replace) window.history.replaceState(state, '', url);
    else if (currentId !== id) window.history.pushState(state, '', url);
    setDetailRowId(id);
  };
  const closeDetail = () => {
    if (window.history.state?.__tpDataTableDetail) {
      window.history.back();
      setDetailRowId(null);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('tpRecord');
    window.history.replaceState(window.history.state, '', url);
    setDetailRowId(null);
  };
  const moveDetail = (offset: -1 | 1) => {
    if (!detailRow) return;
    const navigableRows = rows.filter((row) => !canOpenRow || canOpenRow(row));
    const index = navigableRows.findIndex((row) => String(row[rowKey]) === String(detailRow[rowKey]));
    const next = navigableRows[index + offset];
    if (next) {
      openDetail(next, detailLauncherRef.current ?? undefined, true);
      return;
    }
    if (pagination?.serverSide) {
      const targetPage = pagination.page + offset;
      const totalPages = Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize));
      if (targetPage >= 1 && targetPage <= totalPages) {
        setPendingDetailNavigation({ targetPage, direction: offset, sourceRows: rows });
        pagination.onChange(targetPage, pagination.pageSize);
      }
    }
  };

  useEffect(() => {
    if (!pendingDetailNavigation || !pagination?.serverSide || pagination.page !== pendingDetailNavigation.targetPage || rows === pendingDetailNavigation.sourceRows) return;
    const navigableRows = rows.filter((row) => !canOpenRow || canOpenRow(row));
    const next = pendingDetailNavigation.direction > 0 ? navigableRows[0] : navigableRows[navigableRows.length - 1];
    if (next) openDetail(next, detailLauncherRef.current ?? undefined, true);
    setPendingDetailNavigation(null);
  }, [pendingDetailNavigation, pagination?.page, pagination?.serverSide, rows, canOpenRow]);

  useEffect(() => {
    if (!detailPanel) return;
    const syncFromUrl = () => setDetailRowId(new URLSearchParams(window.location.search).get('tpRecord'));
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [detailPanel]);

  const carbonRows = useMemo(() => rows.map((row) => ({
    id: String(row[rowKey]),
    ...Object.fromEntries(visibleColumns.map((column) => [column.key, displayValue(row, column)])),
    __source: row,
  })), [rows, rowKey, visibleColumns]);

  if (loading) return <DataTableSkeleton columnCount={headers.length || 1} rowCount={8} showToolbar />;
  if (error) return (
    <div className="tp-data-table__message" role="alert">
      <span>{String(error)}</span>
      {onRetry && <Button kind="ghost" size="sm" onClick={onRetry}>重试</Button>}
    </div>
  );

  return (
    <div className={`tp-data-table${refreshing ? ' tp-data-table--refreshing' : ''}`} aria-busy={refreshing || batchBusy}>
      <DataTable rows={carbonRows} headers={headers} isSortable>
        {({ rows: renderedRows, getHeaderProps, getRowProps, getSelectionProps, getBatchActionProps, selectedRows: carbonSelectedRows, selectRow }) => {
          const pageStart = pagination ? (pagination.page - 1) * pagination.pageSize : 0;
          const pageRows = pagination && !pagination.serverSide ? renderedRows.slice(pageStart, pageStart + pagination.pageSize) : renderedRows;
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
                    selectedRowCache.current.clear();
                    getBatchActionProps().onCancel();
                  }}
                >
                  <TableBatchAction
                    key="__export-selected"
                    tabIndex={0}
                    onClick={() => {
                      try {
                        const safeName = (ariaLabel || 'data').replace(/[^\\w\\-\\u4e00-\\u9fff]+/g, '-');
                        downloadSelectedRows(selectedRows, visibleColumns, `${safeName}-selected.csv`);
                        setBatchFeedback({ kind: 'success', title: '导出已开始', subtitle: `已导出 ${selectedRows.length} 条所选记录` });
                      } catch (cause) {
                        setBatchFeedback({ kind: 'error', title: '导出失败', subtitle: cause instanceof Error ? cause.message : '无法生成导出文件' });
                      }
                    }}
                  >
                    导出所选
                  </TableBatchAction>
                  {batchActions.map((action) => (
                    <TableBatchAction
                      key={action.key}
                      tabIndex={0}
                      onClick={async () => {
                        if (batchBusy || action.disabled) return;
                        setBatchBusy(true);
                        setBatchFeedback(null);
                        try {
                          await action.onClick(selectedRows);
                          setBatchFeedback({ kind: 'success', title: '批量操作已完成', subtitle: action.label });
                        } catch (cause) {
                          setBatchFeedback({ kind: 'error', title: '批量操作失败', subtitle: cause instanceof Error ? cause.message : '操作未能完成，请重试' });
                        } finally {
                          setBatchBusy(false);
                        }
                      }}
                      disabled={batchBusy || action.disabled}
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
                      selectedRowCache.current.clear();
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
                  <Popover open={settingsOpen} align="bottom-end" onRequestClose={() => setSettingsOpen(false)}>
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
                                  disabled={orderedColumnKeys.indexOf(column.key) === 0}
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
                                  disabled={orderedColumnKeys.indexOf(column.key) === orderedColumnKeys.length - 1}
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
                          {...getHeaderProps({ header, onClick: (_event: unknown, sortState: { sortHeaderKey?: string; sortDirection?: string }) => {
                            if (onSortChange && sortState.sortHeaderKey) {
                              const direction = sortState.sortDirection === 'ASC' || sortState.sortDirection === 'DESC' ? sortState.sortDirection : 'NONE';
                              onSortChange(sortState.sortHeaderKey, direction);
                            }
                          } })}
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
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('a,button,input,[role="button"]')) return;
                          if (detailPanel) openDetail(source, event.currentTarget);
                          else onRowOpen?.(source, event.currentTarget);
                        }}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ') && (detailPanel || onRowOpen)) {
                            event.preventDefault();
                            if (detailPanel) openDetail(source, event.currentTarget);
                            else onRowOpen?.(source, event.currentTarget);
                          }
                        }}
                        tabIndex={detailPanel || onRowOpen ? 0 : undefined}
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
            {batchFeedback && (
              <InlineNotification
                kind={batchFeedback.kind}
                title={batchFeedback.title}
                subtitle={batchFeedback.subtitle}
                lowContrast
                hideCloseButton={false}
                onCloseButtonClick={() => setBatchFeedback(null)}
              />
            )}
            {renderedRows.length === 0 && <div className="tp-data-table__empty" role="status">{emptyState ?? '暂无数据'}</div>}
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
      {detailPanel && (
        <SidePanel
          className="tp-data-table__detail-panel"
          open={Boolean(detailRow)}
          title={detailRow ? (detailTitle?.(detailRow) || String(detailRow[visibleColumns.find((column) => column.primary)?.key ?? rowKey] ?? ariaLabel + '详情')) : ariaLabel + '详情'}
          subtitle={detailRow ? `记录 ID：${String(detailRow[rowKey])}` : undefined}
          size="lg"
          placement="right"
          includeOverlay={false}
          slideIn={false}
          launcherButtonRef={detailLauncherRef}
          onRequestClose={closeDetail}
        >
          {detailRow && (
            <div className="tp-data-table__detail-content">
              <div className="tp-data-table__detail-navigation">
                <Button kind="ghost" size="sm" disabled={rows.findIndex((row) => String(row[rowKey]) === String(detailRow[rowKey])) <= 0} onClick={() => moveDetail(-1)}>上一条</Button>
                <Button kind="ghost" size="sm" disabled={rows.findIndex((row) => String(row[rowKey]) === String(detailRow[rowKey])) >= rows.length - 1} onClick={() => moveDetail(1)}>下一条</Button>
                {onRowOpen && <Button kind="primary" size="sm" onClick={() => onRowOpen(detailRow, detailLauncherRef.current ?? undefined)}>打开完整详情</Button>}
              </div>
              <dl className="tp-data-table__detail-fields">
                {columns.filter((column) => column.key !== '__actions').map((column) => (
                  <div className="tp-data-table__detail-field" key={column.key}>
                    <dt>{column.header}</dt>
                    <dd>{displayValue(detailRow, column)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </SidePanel>
      )}
    </div>
  );
}
