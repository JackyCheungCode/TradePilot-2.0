import {
  DataTable,
  DataTableSkeleton,
  OverflowMenu,
  OverflowMenuItem,
  Pagination,
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
import { useMemo } from 'react';
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
}: TpDataTableProps<T>) {
  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.longText && (column.defaultVisible !== false || column.required || column.primary)),
    [columns],
  );
  const headers = useMemo(() => [
    ...visibleColumns.map((column) => ({ key: column.key, header: column.header })),
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
      <DataTable rows={carbonRows} headers={headers} isSortable batchActions={selectable}>
        {({ rows: renderedRows, getHeaderProps, getRowProps, getSelectionProps, getBatchActionProps, selectedRows: carbonSelectedRows, onInputChange }) => (
          <TableContainer aria-label={ariaLabel}>
            <TableToolbar>
              {selectable && (
                <TableBatchActions {...getBatchActionProps()}>
                  {batchActions.map((action) => (
                    <TableBatchAction
                      key={action.key}
                      tabIndex={0}
                      onClick={() => void action.onClick(carbonSelectedRows.map((selected) => rows.find((row) => String(row[rowKey]) === selected.id)).filter((row): row is T => Boolean(row)))}
                      disabled={action.disabled}
                    >
                      {action.label}
                    </TableBatchAction>
                  ))}
                </TableBatchActions>
              )}
              <TableToolbarContent>
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
              </TableToolbarContent>
            </TableToolbar>
            <div className="tp-data-table__scroll" role="region" aria-label={`${ariaLabel}，可横向滚动`} tabIndex={0}>
              <Table size={typeof window !== 'undefined' && window.innerWidth < 672 ? 'lg' : 'md'}>
                <TableHead>
                  <TableRow>
                    {selectable && <TableSelectAll {...getSelectionProps()} />}
                    {headers.map((header) => (
                      <TableHeader
                        {...getHeaderProps({ header })}
                        className={header.key === '__actions' ? 'tp-data-table__actions-heading' : undefined}
                        >
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderedRows.map((carbonRow) => {
                    const source = rows.find((row) => String(row[rowKey]) === carbonRow.id);
                    if (!source) return null;
                    return (
                      <TableRow
                        {...getRowProps({ row: carbonRow })}
                        className={`${activeRowId === carbonRow.id ? 'tp-data-table__row--active' : ''}`}
                        onClick={() => onRowOpen?.(source)}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && onRowOpen) {
                            event.preventDefault();
                            onRowOpen(source);
                          }
                        }}
                        tabIndex={onRowOpen ? 0 : undefined}
                      >
                        {selectable && (
                          <TableSelectRow
                            {...getSelectionProps({ row: carbonRow })}
                          />
                        )}
                        {visibleColumns.map((column) => (
                          <TableCell key={column.key} className={column.longText ? 'tp-data-table__long-text' : undefined}>
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
        )}
      </DataTable>
    </div>
  );
}
