import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import type { DomainHistoryPoint } from "../../types/messages";

type Axis = "count" | "percent";

interface Series {
  id: string;
  label: string;
  color: string;
  axis: Axis;
  get: (p: DomainHistoryPoint) => number | null;
}

const SERIES: Series[] = [
  {
    id: "pages",
    label: "Pages crawled",
    color: "#7cc36e",
    axis: "count",
    get: (p) => p.pagesCrawled,
  },
  {
    id: "issues",
    label: "Total issues",
    color: "#1c8a7b",
    axis: "count",
    get: (p) => p.totalIssues,
  },
  {
    id: "errors",
    label: "Errors",
    color: "#e06464",
    axis: "count",
    get: (p) => p.errors,
  },
  {
    id: "warnings",
    label: "Warnings",
    color: "#e0b050",
    axis: "count",
    get: (p) => p.warnings,
  },
  {
    id: "notices",
    label: "Notices",
    color: "#ff8a3d",
    axis: "count",
    get: (p) => p.notices,
  },
  {
    id: "engineErrors",
    label: "Engine errors",
    color: "#a04bd0",
    axis: "count",
    get: (p) => p.engineErrors,
  },
  {
    id: "mobilePerf",
    label: "Avg mobile perf",
    color: "#3aa3ff",
    axis: "percent",
    get: (p) => p.avgMobilePerf,
  },
  {
    id: "desktopPerf",
    label: "Avg desktop perf",
    color: "#28507a",
    axis: "percent",
    get: (p) => p.avgDesktopPerf,
  },
];

const MARGIN = { top: 24, right: 72, bottom: 44, left: 60 };

export const HistoryPage: React.FC = () => {
  const group = useStore((s) => s.historyGroup);
  const points = useStore((s) => s.historyPoints);
  const refresh = useStore((s) => s.refreshHistory);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [width, setWidth] = useState(900);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    // Push the initial width immediately so the first paint is correct.
    const initial = node.getBoundingClientRect().width;
    if (initial > 0) setWidth(Math.max(360, Math.floor(initial)));
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(360, Math.floor(w)));
    });
    obs.observe(node);
    observerRef.current = obs;
  }, []);

  if (!group) {
    return (
      <div className="p-6 text-sm text-[color:var(--color-sc-text-dim)]">
        Select a domain group from the sidebar to see its history.
      </div>
    );
  }

  if (!points) {
    return (
      <div className="p-6 text-sm text-[color:var(--color-sc-text-dim)]">
        Loading history for <strong>{group.domain}</strong>…
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="p-6 text-sm text-[color:var(--color-sc-text-dim)]">
        No completed runs yet for <strong>{group.domain}</strong>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 h-full min-h-0 w-full">
      <HistoryHeader group={group} points={points} onRefresh={refresh} />
      <div ref={containerRef} className="w-full">
        <Chart
          points={points}
          width={width}
          hidden={hidden}
          hoverX={hoverX}
          setHoverX={setHoverX}
        />
      </div>
      <Legend
        hidden={hidden}
        onToggle={(id) =>
          setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
      />
    </div>
  );
};

const HistoryHeader: React.FC<{
  group: { domain: string; crawlIds: number[] };
  points: DomainHistoryPoint[];
  onRefresh: () => void;
}> = ({ group, points, onRefresh }) => {
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-semibold">{group.domain}</div>
        <div className="text-xs text-[color:var(--color-sc-text-dim)]">
          {points.length} run{points.length === 1 ? "" : "s"} \u00b7{" "}
          {formatDate(first.startedAt)} \u2013 {formatDate(last.startedAt)}
        </div>
      </div>
      <button
        onClick={onRefresh}
        className="px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
      >
        Refresh
      </button>
    </div>
  );
};

const Chart: React.FC<{
  points: DomainHistoryPoint[];
  width: number;
  hidden: Set<string>;
  hoverX: number | null;
  setHoverX: (x: number | null) => void;
}> = ({ points, width, hidden, hoverX, setHoverX }) => {
  const height = 360;
  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(1, height - MARGIN.top - MARGIN.bottom);

  const xMin = points[0].startedAt;
  const xMax = points[points.length - 1].startedAt;
  const xSpan = xMax - xMin;
  const singleTimestamp = xSpan <= 0;

  const scaleX = (t: number): number =>
    singleTimestamp
      ? MARGIN.left + innerW / 2
      : ((t - xMin) / xSpan) * innerW + MARGIN.left;

  const visible = SERIES.filter((s) => !hidden.has(s.id));

  const countMax = useMemo(() => {
    let m = 1;
    for (const p of points) {
      for (const s of visible) {
        if (s.axis !== "count") continue;
        const v = s.get(p);
        if (v !== null && v > m) m = v;
      }
    }
    return niceCeil(m);
  }, [points, visible]);

  const scaleCount = (v: number): number =>
    MARGIN.top + innerH - (v / countMax) * innerH;
  const scalePercent = (v: number): number =>
    MARGIN.top + innerH - (v / 100) * innerH;

  const scaleFor = (axis: Axis) =>
    axis === "count" ? scaleCount : scalePercent;

  const xTicks = useMemo(
    () => (singleTimestamp ? [xMin] : buildTimeTicks(xMin, xMax, 6)),
    [xMin, xMax, singleTimestamp],
  );
  const countTicks = useMemo(() => buildLinearTicks(0, countMax, 5), [
    countMax,
  ]);
  const pctTicks = [0, 25, 50, 75, 100];

  const hoverIdx =
    hoverX === null
      ? null
      : nearestIndex(points.map((p) => scaleX(p.startedAt)), hoverX);

  return (
    <div className="relative w-full rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)] overflow-hidden">
      <svg
        width={width}
        height={height}
        style={{ display: "block" }}
        onMouseMove={(e) => {
          const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
          if (!rect) return;
          setHoverX(e.clientX - rect.left);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* gridlines */}
        {countTicks.map((t) => (
          <line
            key={`gh-${t}`}
            x1={MARGIN.left}
            x2={MARGIN.left + innerW}
            y1={scaleCount(t)}
            y2={scaleCount(t)}
            stroke="var(--color-sc-border)"
            strokeOpacity={0.5}
          />
        ))}

        {/* x ticks */}
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line
              x1={scaleX(t)}
              x2={scaleX(t)}
              y1={MARGIN.top + innerH}
              y2={MARGIN.top + innerH + 4}
              stroke="var(--color-sc-text-faint)"
            />
            <text
              x={scaleX(t)}
              y={MARGIN.top + innerH + 16}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-sc-text-dim)"
            >
              {formatShortDate(t)}
            </text>
          </g>
        ))}

        {/* left axis labels (counts) */}
        {countTicks.map((t) => (
          <text
            key={`yl-${t}`}
            x={MARGIN.left - 8}
            y={scaleCount(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-sc-text-dim)"
          >
            {formatCount(t)}
          </text>
        ))}

        {/* right axis labels (percent) */}
        {pctTicks.map((t) => (
          <text
            key={`yr-${t}`}
            x={MARGIN.left + innerW + 8}
            y={scalePercent(t) + 3}
            textAnchor="start"
            fontSize="10"
            fill="var(--color-sc-text-dim)"
          >
            {t}
          </text>
        ))}

        {/* axis titles */}
        <text
          x={12}
          y={MARGIN.top + innerH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-sc-text-faint)"
          transform={`rotate(-90 12 ${MARGIN.top + innerH / 2})`}
        >
          Count
        </text>
        <text
          x={width - 14}
          y={MARGIN.top + innerH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-sc-text-faint)"
          transform={`rotate(90 ${width - 14} ${MARGIN.top + innerH / 2})`}
        >
          Perf %
        </text>

        {/* series polylines */}
        {visible.map((s) => {
          const scale = scaleFor(s.axis);
          const path = buildPath(points, s, scaleX, scale);
          return path ? (
            <path
              key={s.id}
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
            />
          ) : null;
        })}

        {/* series dots */}
        {visible.flatMap((s) => {
          const scale = scaleFor(s.axis);
          return points.map((p, i) => {
            const v = s.get(p);
            if (v === null) return null;
            return (
              <circle
                key={`${s.id}-${i}`}
                cx={scaleX(p.startedAt)}
                cy={scale(v)}
                r={2.5}
                fill={s.color}
              />
            );
          });
        })}

        {/* hover crosshair */}
        {hoverIdx !== null ? (
          <>
            <line
              x1={scaleX(points[hoverIdx].startedAt)}
              x2={scaleX(points[hoverIdx].startedAt)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerH}
              stroke="var(--color-sc-text-faint)"
              strokeDasharray="3 3"
            />
            {visible.map((s) => {
              const v = s.get(points[hoverIdx]);
              if (v === null) return null;
              const scale = scaleFor(s.axis);
              return (
                <circle
                  key={`hover-${s.id}`}
                  cx={scaleX(points[hoverIdx].startedAt)}
                  cy={scale(v)}
                  r={4.5}
                  fill="var(--color-sc-bg)"
                  stroke={s.color}
                  strokeWidth={2}
                />
              );
            })}
          </>
        ) : null}
      </svg>

      {hoverIdx !== null ? (
        <HoverTooltip
          point={points[hoverIdx]}
          xPct={(scaleX(points[hoverIdx].startedAt) / width) * 100}
          hidden={hidden}
        />
      ) : null}
    </div>
  );
};

const HoverTooltip: React.FC<{
  point: DomainHistoryPoint;
  xPct: number;
  hidden: Set<string>;
}> = ({ point, xPct, hidden }) => {
  const visible = SERIES.filter((s) => !hidden.has(s.id));
  const side = xPct > 50 ? "right" : "left";
  return (
    <div
      className="absolute pointer-events-none rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] px-3 py-2 text-[11px] shadow-lg"
      style={{
        top: MARGIN.top + 4,
        left: side === "left" ? `calc(${xPct}% + 12px)` : undefined,
        right: side === "right" ? `calc(${100 - xPct}% + 12px)` : undefined,
      }}
    >
      <div className="mb-1 font-medium text-[color:var(--color-sc-text)]">
        {formatDateTime(point.startedAt)}
      </div>
      {visible.map((s) => {
        const v = s.get(point);
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[color:var(--color-sc-text-dim)]">
              {s.label}:
            </span>
            <span className="font-mono tabular-nums">
              {v === null ? "—" : formatValue(s, v)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const Legend: React.FC<{
  hidden: Set<string>;
  onToggle: (id: string) => void;
}> = ({ hidden, onToggle }) => (
  <div className="flex flex-wrap gap-2">
    {SERIES.map((s) => {
      const off = hidden.has(s.id);
      return (
        <button
          key={s.id}
          onClick={() => onToggle(s.id)}
          className={
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] " +
            (off
              ? "border-[color:var(--color-sc-border)] text-[color:var(--color-sc-text-faint)] opacity-60"
              : "border-[color:var(--color-sc-border)] text-[color:var(--color-sc-text)] bg-[color:var(--color-sc-bg-raised)]")
          }
          title={off ? "Show series" : "Hide series"}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: off ? "transparent" : s.color, outline: `1px solid ${s.color}` }}
          />
          {s.label}
        </button>
      );
    })}
  </div>
);

// ---- helpers ---------------------------------------------------------------

function buildPath(
  points: DomainHistoryPoint[],
  series: Series,
  scaleX: (t: number) => number,
  scaleY: (v: number) => number,
): string | null {
  let out = "";
  let inSegment = false;
  for (const p of points) {
    const v = series.get(p);
    if (v === null) {
      inSegment = false;
      continue;
    }
    const x = scaleX(p.startedAt);
    const y = scaleY(v);
    out += `${inSegment ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    inSegment = true;
  }
  return out.trim() || null;
}

function nearestIndex(xs: number[], target: number): number | null {
  if (xs.length === 0) return null;
  let bestIdx = 0;
  let bestDist = Math.abs(xs[0] - target);
  for (let i = 1; i < xs.length; i++) {
    const d = Math.abs(xs[i] - target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  if (n <= 1) return mag;
  if (n <= 2) return 2 * mag;
  if (n <= 5) return 5 * mag;
  return 10 * mag;
}

function buildLinearTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = (max - min) / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(Math.round(min + step * i));
  }
  return out;
}

function buildTimeTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = (max - min) / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(min + step * i);
  }
  return out;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n}`;
}

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(series: Series, v: number): string {
  if (series.axis === "percent") return `${Math.round(v)}`;
  return v.toLocaleString();
}
