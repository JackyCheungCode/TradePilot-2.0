import {
  Button,
  Checkbox,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
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
import { Activity } from '@carbon/icons-react';
import { SidePanel } from '@carbon/ibm-products';
import { isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { TpBatchAction, TpDataTableProps } from './TpDataTable.types';
import './TpDataTable.scss';
import { TPInlineLoading } from '../TPInlineLoading';

const activityRoutes: Record<string,{route:string;recordType:string}> = {
  'crm-accounts':{route:'/accounts',recordType:'crm_accounts'}, 'crm-contacts':{route:'/contacts',recordType:'crm_contacts'},
  opportunities:{route:'/opportunities',recordType:'crm_opportunities'}, 'sales-quotes':{route:'/quotes',recordType:'trade_documents'},
  'sales-orders':{route:'/sales-orders',recordType:'trade_orders'}, 'logistics-shipments':{route:'/shipments',recordType:'trade_shipments'},
  'finance-payments':{route:'/payments',recordType:'trade_payments'}, 'catalog-products':{route:'/products',recordType:'trade_products'}
};

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
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
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
  const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
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
  batchArchiveTable,
  rowActions = [],
  onRowOpen,
  detailPanel = false,
  canOpenRow,
  canSelectRow,
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
  const tableRootRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [batchFeedback, setBatchFeedback] = useState<{ kind: 'success' | 'error'; title: string; subtitle: string } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [pendingBatchAction, setPendingBatchAction] = useState<TpBatchAction<T> | null>(null);
  const selectedRowCache = useRef(new Map<string, T>());

  useEffect(() => {
    selectionRows.forEach((row) => selectedRowCache.current.set(String(row[rowKey]), row));
    setSelectionRevision((revision) => revision + 1);
  }, [selectionRows, rowKey]);

  const selectedRows = useMemo(
    () => [...selectedIds].map((id) => selectedRowCache.current.get(id)).filter((row): row is T => row !== undefined),
    [selectedIds, selectionRevision],
  );
  const hasSelection = selectedIds.size > 0;
  const runBatchAction = async (action: TpBatchAction<T>) => {
    if (batchBusy || action.disabled || selectedRows.length === 0) return;
    setBatchBusy(true);
    setBatchFeedback(null);
    try {
      await action.onClick(selectedRows);
      setSelectedIds(new Set());
      selectedRowCache.current.clear();
      setSelectionRevision((revision) => revision + 1);
      setBatchFeedback({ kind: 'success', title: '批量操作已完成', subtitle: action.label });
      setPendingBatchAction(null);
    } catch (cause) {
      setBatchFeedback({ kind: 'error', title: '批量操作失败', subtitle: cause instanceof Error ? cause.message : '操作未能完成，请重试' });
    } finally {
      setBatchBusy(false);
    }
  };


  const previousSelectionScope = useRef(selectionScopeKey);
  useEffect(() => {
    // Clear stale selections and close a record preview when the logical filter scope changes,
    // but preserve both while the user moves between pages.
    if (previousSelectionScope.current === selectionScopeKey) return;
    previousSelectionScope.current = selectionScopeKey;
    setSelectedIds(new Set());
    selectedRowCache.current.clear();
    if (detailRowId) {
      const url = new URL(window.location.href);
      url.searchParams.delete('tpRecord');
      window.history.replaceState(window.history.state, '', url);
      setDetailRowId(null);
    }
  }, [selectionScopeKey]);

  const toggleRowSelection = (id: string, row: T, checked: boolean) => {
    if (checked) selectedRowCache.current.set(id, row);
    setSelectionRevision((revision) => revision + 1);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else { next.delete(id); selectedRowCache.current.delete(id); }
      return next;
    });
  };

  const togglePageSelection = (ids: string[], checked: boolean) => {
    ids.forEach((id) => {
      const row = rowById.get(id);
      if (checked && row) selectedRowCache.current.set(id, row);
    });
    setSelectionRevision((revision) => revision + 1);
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
  const activityRoute = columnSettingsKey ? activityRoutes[columnSettingsKey] : undefined;
  const activityPageIds = useMemo(() => {
    const visibleRows = pagination && !pagination.serverSide
      ? rows.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize)
      : rows;
    return visibleRows.map((row) => String(row[rowKey])).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  }, [rows, rowKey, pagination?.page, pagination?.pageSize, pagination?.serverSide]);
  const [activitySummary, setActivitySummary] = useState<Record<string,{activities:number;openTasks:number;overdue:boolean}>>({});
  useEffect(() => {
    if (!activityRoute || activityPageIds.length === 0) { setActivitySummary({}); return; }
    let cancelled = false;
    void (async () => {
      try {
        const db = await getSupabaseClient();
        const [activityResult, taskResult] = await Promise.all([
          db.from('record_activities').select('record_id').eq('record_type', activityRoute.recordType).in('record_id', activityPageIds),
          db.from('record_activity_tasks').select('record_id,status,due_at').eq('record_type', activityRoute.recordType).in('record_id', activityPageIds),
        ]);
        if (activityResult.error) throw activityResult.error;
        if (taskResult.error) throw taskResult.error;
        const summary: Record<string,{activities:number;openTasks:number;overdue:boolean}> = {};
        activityPageIds.forEach((id) => { summary[id] = {activities:0,openTasks:0,overdue:false}; });
        (activityResult.data || []).forEach((item) => { const row=summary[item.record_id]; if(row) row.activities += 1; });
        (taskResult.data || []).forEach((item) => { const row=summary[item.record_id]; if(row && item.status==='open'){ row.openTasks += 1; if(item.due_at && new Date(item.due_at).getTime()<Date.now()) row.overdue=true; } });
        if (!cancelled) setActivitySummary(summary);
      } catch {
        if (!cancelled) setActivitySummary({});
      }
    })();
    return () => { cancelled = true; };
  }, [activityRoute, activityPageIds.join('|')]);
  const headers = useMemo(() => [
    ...visibleColumns.map((column) => ({ key: column.key, header: column.header, isSortable: column.sortable !== false && (!pagination?.serverSide || Boolean(onSortChange)) })),
    ...(activityRoute ? [{ key: '__activity', header: '活动 / 待办' }] : []),
    ...(rowActions.length ? [{ key: '__actions', header: '操作' }] : []),
  ], [visibleColumns, activityRoute, rowActions.length, pagination?.serverSide, onSortChange]);
  const detailRow = detailPanel && detailRowId
    ? rows.find((row) => String(row[rowKey]) === detailRowId) ?? null
    : null;
  const detailNavigationRows = detailRow ? rows.filter((row) => !canOpenRow || canOpenRow(row)) : [];
  const detailNavigationIndex = detailRow
    ? detailNavigationRows.findIndex((row) => String(row[rowKey]) === String(detailRow[rowKey]))
    : -1;
  const detailTotalPages = pagination ? Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize)) : 1;
  const canNavigatePrevious = detailNavigationIndex > 0 || Boolean(pagination?.serverSide && pagination.page > 1);
  const canNavigateNext = detailNavigationIndex >= 0 && (
    detailNavigationIndex < detailNavigationRows.length - 1
    || Boolean(pagination?.serverSide && pagination.page < detailTotalPages)
  );
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
    if (next) {
      detailLauncherRef.current = tableRootRef.current;
      openDetail(next, tableRootRef.current ?? undefined, true);
    }
    setPendingDetailNavigation(null);
  }, [pendingDetailNavigation, pagination?.page, pagination?.serverSide, rows, canOpenRow]);

  useEffect(() => {
    if (!detailPanel) return;
    const syncFromUrl = () => setDetailRowId(new URLSearchParams(window.location.search).get('tpRecord'));
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [detailPanel]);

  const rowById = useMemo(() => new Map(rows.map((row) => [String(row[rowKey]), row] as const)), [rows, rowKey]);
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
    <div ref={tableRootRef} tabIndex={-1} className={`tp-data-table${refreshing ? ' tp-data-table--refreshing' : ''}`} aria-busy={refreshing || batchBusy}>
      <DataTable rows={carbonRows} headers={headers} isSortable>
        {({ rows: renderedRows, getHeaderProps, getRowProps, getSelectionProps, getBatchActionProps, selectedRows: carbonSelectedRows, selectRow }) => {
          const pageStart = pagination ? (pagination.page - 1) * pagination.pageSize : 0;
          const pageRows = pagination && !pagination.serverSide ? renderedRows.slice(pageStart, pageStart + pagination.pageSize) : renderedRows;
          const pageIds = pageRows.filter((row) => {
            const source = rowById.get(row.id);
            return Boolean(source && (!canSelectRow || canSelectRow(source)));
          }).map((row) => row.id);
          const selectedPageCount = pageIds.filter((id) => selectedIds.has(id)).length;
          const allPageSelected = pageIds.length > 0 && selectedPageCount === pageIds.length;
          const somePageSelected = selectedPageCount > 0 && !allPageSelected;
          return (
          <TableContainer aria-label={ariaLabel}>
            <TableToolbar>
              {selectable && hasSelection && (
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
                        const safeName = (ariaLabel || 'data').replace(/[^\w\-\u4e00-\u9fff]+/g, '-');
                        downloadSelectedRows(selectedRows, visibleColumns, `${safeName}-selected.csv`);
                        setBatchFeedback({ kind: 'success', title: '导出已开始', subtitle: `已导出 ${selectedRows.length} 条所选记录` });
                      } catch (cause) {
                        setBatchFeedback({ kind: 'error', title: '导出失败', subtitle: cause instanceof Error ? cause.message : '无法生成导出文件' });
                      }
                    }}
                  >
                    导出所选
                  </TableBatchAction>
                  {batchArchiveTable && (
                    <TableBatchAction key="__archive-selected" tabIndex={0} onClick={() => setPendingBatchAction({
                      key: '__archive-selected', label: '归档所选',
                      confirmation: `确定归档选中的 ${selectedRows.length} 条记录吗？归档后记录将从当前列表移除，但不会执行物理删除。`,
                      onClick: async (records) => {
                        const client = await getSupabaseClient();
                        const { error: archiveError } = await client.from(batchArchiveTable).update({ is_archived: true, updated_at: new Date().toISOString() }).in('id', records.map((record) => String(record[rowKey])));
                        if (archiveError) throw archiveError;
                        setSelectedIds(new Set());
                        selectedRowCache.current.clear();
                        setSelectionRevision((revision) => revision + 1);
                        onRetry?.();
                      },
                    })} disabled={batchBusy}>归档所选</TableBatchAction>
                  )}
                  {batchActions.map((action) => (
                    <TableBatchAction
                      key={action.key}
                      tabIndex={0}
                      onClick={() => {
                        if (batchBusy || action.disabled) return;
                        if (action.confirmation) setPendingBatchAction(action);
                        else void runBatchAction(action);
                      }}
                      disabled={batchBusy || action.disabled}
                    >
                      {action.label}
                    </TableBatchAction>
                  ))}
                </TableBatchActions>
              )}
              <TableToolbarContent>
                {refreshing && <TPInlineLoading status="active" description="正在刷新列表…" />}
                {batchBusy && <TPInlineLoading status="active" description="正在处理所选记录…" />}
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
                          className={header.key === '__actions' ? 'tp-data-table__actions-heading' : header.key === '__activity' ? 'tp-data-table__activity-heading' : undefined}
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
                    const source = rowById.get(carbonRow.id);
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
                        tabIndex={(detailPanel || onRowOpen) && (!canOpenRow || canOpenRow(source)) ? 0 : undefined}
                      >
                        {selectable && (
                          canSelectRow && !canSelectRow(source)
                            ? <TableCell />
                            : (
                              <TableSelectRow
                                {...getSelectionProps({
                                  row: carbonRow,
                                  onClick: (event) => {
                                    event.stopPropagation();
                                    toggleRowSelection(carbonRow.id, source, !selectedIds.has(carbonRow.id));
                                  },
                                })}
                                checked={selectedIds.has(carbonRow.id)}
                              />
                            )
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
                        {activityRoute && (
                          <TableCell className="tp-data-table__activity-cell">
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={Activity}
                              iconDescription="查看活动与修改记录"
                              className={activitySummary[String(source[rowKey])]?.overdue ? 'tp-data-table__activity-action--overdue' : undefined}
                              onClick={(event: React.MouseEvent) => {
                                event.stopPropagation();
                                window.location.assign(activityRoute.route + '/' + encodeURIComponent(String(source[rowKey])));
                              }}
                            >{(activitySummary[String(source[rowKey])]?.activities || 0) + (activitySummary[String(source[rowKey])]?.openTasks || 0) || '活动'}</Button>
                          </TableCell>
                        )}
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
          title={detailRow ? (detailTitle?.(detailRow) || String(detailRow[String(visibleColumns.find((column) => column.primary)?.key ?? rowKey)] ?? ariaLabel + '详情')) : ariaLabel + '详情'}
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
                <Button kind="ghost" size="sm" disabled={!canNavigatePrevious} onClick={() => moveDetail(-1)}>上一条</Button>
                <Button kind="ghost" size="sm" disabled={!canNavigateNext} onClick={() => moveDetail(1)}>下一条</Button>
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
      {pendingBatchAction && (
        <ComposedModal open onClose={() => !batchBusy && setPendingBatchAction(null)} size="sm">
          <ModalHeader title={`确认${pendingBatchAction.label}`} />
          <ModalBody>
            <p>{pendingBatchAction.confirmation}</p>
            <p>涉及 {selectedRows.length} 条所选记录。</p>
          </ModalBody>
          <ModalFooter>
            <Button kind="secondary" disabled={batchBusy} onClick={() => setPendingBatchAction(null)}>取消</Button>
            <Button kind="danger" disabled={batchBusy || selectedRows.length === 0} onClick={() => void runBatchAction(pendingBatchAction)}>{batchBusy ? '正在处理…' : '确认执行'}</Button>
          </ModalFooter>
        </ComposedModal>
      )}
    </div>
  );
}
