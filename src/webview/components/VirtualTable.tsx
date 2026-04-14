import React, { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface Column<T> {
  id: string;
  header: string;
  width: number;
  minWidth?: number;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  sortBy?: (row: T) => string | number | null;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  storageKey?: string;
  rowHeight?: number;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
  rowKey: (row: T, index: number) => string;
}

type SortDir = "asc" | "desc";

export function VirtualTable<T>({
  rows,
  columns,
  storageKey,
  rowHeight = 28,
  emptyLabel = "No rows.",
  onRowClick,
  rowKey,
}: Props<T>): React.ReactElement {
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(storageKey, columns));
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    if (storageKey) saveWidths(storageKey, widths);
  }, [storageKey, widths]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const col = columns.find((c) => c.id === sortCol);
    if (!col || !col.sortBy) return rows;
    const sortBy = col.sortBy;
    const copy = rows.slice();
    copy.sort((a, b) => {
      const va = sortBy(a);
      const vb = sortBy(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      return sortDir === "asc" ? 1 : -1;
    });
    return copy;
  }, [rows, sortCol, sortDir, columns]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const headerCells = columns.map((c) => (
    <HeaderCell
      key={c.id}
      column={c}
      width={widths[c.id] ?? c.width}
      sortDir={sortCol === c.id ? sortDir : null}
      onSort={() => {
        if (!c.sortBy) return;
        if (sortCol === c.id) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else { setSortCol(c.id); setSortDir("asc"); }
      }}
      onResize={(w) => setWidths((prev) => ({ ...prev, [c.id]: Math.max(c.minWidth ?? 40, w) }))}
    />
  ));

  return (
    <div className="flex flex-col h-full min-h-0 border-t border-[color:var(--color-sc-border)]">
      <div className="flex px-3 text-[11px] uppercase tracking-wider text-[color:var(--color-sc-text-faint)] bg-[color:var(--color-sc-bg-soft)] border-b border-[color:var(--color-sc-border)]">
        {headerCells}
      </div>
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        {sortedRows.length === 0 ? (
          <div className="p-6 text-center text-[color:var(--color-sc-text-faint)] text-sm">{emptyLabel}</div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {rowVirtualizer.getVirtualItems().map((vItem) => {
              const row = sortedRows[vItem.index];
              return (
                <div
                  key={rowKey(row, vItem.index)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={
                    "absolute left-0 right-0 flex items-center px-3 border-b border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)] " +
                    (onRowClick ? "cursor-pointer" : "")
                  }
                  style={{ top: vItem.start, height: rowHeight }}
                >
                  {columns.map((c) => (
                    <div
                      key={c.id}
                      style={{ width: widths[c.id] ?? c.width, flex: "0 0 auto", textAlign: c.align ?? "left" }}
                      className="px-2 text-xs truncate"
                    >
                      {c.render(row)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface HeaderProps<T> {
  column: Column<T>;
  width: number;
  sortDir: SortDir | null;
  onSort: () => void;
  onResize: (width: number) => void;
}

function HeaderCell<T>({ column, width, sortDir, onSort, onResize }: HeaderProps<T>): React.ReactElement {
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, w: width };
    const move = (ev: MouseEvent) => {
      if (!startRef.current) return;
      const delta = ev.clientX - startRef.current.x;
      onResize(startRef.current.w + delta);
    };
    const up = () => {
      startRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div style={{ width, flex: "0 0 auto" }} className="relative flex items-center py-1.5 px-2 select-none">
      <button
        onClick={onSort}
        className={"flex items-center gap-1 " + (column.sortBy ? "cursor-pointer" : "cursor-default")}
      >
        <span>{column.header}</span>
        {sortDir ? <span className="text-[10px]">{sortDir === "asc" ? "\u25B4" : "\u25BE"}</span> : null}
      </button>
      <span
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[color:var(--color-sc-accent)] hover:opacity-50"
      />
    </div>
  );
}

function loadWidths<T>(storageKey: string | undefined, columns: Column<T>[]): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const c of columns) defaults[c.id] = c.width;
  if (!storageKey || typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function saveWidths(storageKey: string, widths: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // ignore
  }
}
