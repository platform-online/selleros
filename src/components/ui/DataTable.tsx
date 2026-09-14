/**
 * DataTable — sorting, pagination, accessible headers, and a responsive
 * transform into stacked cards on small screens (spec §94).
 */
import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** sort label used by screen readers */
  sortLabel?: string;
  render: (row: T) => ReactNode;
  /** value used for sorting; falls back to the rendered string */
  sortValue?: (row: T) => number | string | null | undefined;
  numeric?: boolean;
  hideOnMobile?: boolean;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  pageSize?: number;
  caption?: string;
  compact?: boolean;
  footerExtra?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  pageSize = 25,
  caption,
  footerExtra,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const value = (row: T): number | string => {
      const raw = col.sortValue ? col.sortValue(row) : col.render(row);
      if (raw === null || raw === undefined || raw === '') return col.sortValue ? Number.NEGATIVE_INFINITY : '';
      return raw as number | string;
    };
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      let cmpResult: number;
      if (typeof av === 'number' && typeof bv === 'number') cmpResult = av - bv;
      else if (typeof av === 'number' || typeof bv === 'number') cmpResult = Number(av) - Number(bv);
      else cmpResult = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmpResult : -cmpResult;
    });
  }, [rows, columns, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  if (rows.length === 0) return <>{empty ?? null}</>;

  return (
    <div>
      <div className="table-wrap">
        <table className="table table--responsive">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`${col.numeric ? 'num' : ''} sortable`}
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => toggleSort(col.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSort(col.key);
                    }
                  }}
                  tabIndex={0}
                >
                  {col.label}
                  {sortKey === col.key && <span aria-hidden="true"> {sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} data-label={typeof col.label === 'string' ? col.label : col.sortLabel ?? col.key} className={col.numeric ? 'num' : ''}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {sorted.length} · {safePage + 1}/{pageCount}
        </span>
        <div className="row gap-2">
          {footerExtra}
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
