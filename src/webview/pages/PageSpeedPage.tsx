import React, { useMemo } from "react";
import { useStore } from "../store";
import { VirtualTable, type Column } from "../components/VirtualTable";
import type { CwvMessageRow } from "../../types/messages";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function formatMs(v: number | null, toSec = false): string {
  if (v === null) return "\u2014";
  if (toSec) return `${(v / 1000).toFixed(2)}s`;
  return `${Math.round(v)}ms`;
}
function formatCls(v: number | null): string {
  return v === null ? "\u2014" : v.toFixed(3);
}
function formatPerf(v: number | null): string {
  return v === null ? "\u2014" : `${Math.round(v * 100)}`;
}

const COLUMNS: Column<CwvMessageRow>[] = [
  {
    id: "url",
    header: "URL",
    width: 360,
    render: (r) => (
      <span className="font-mono truncate" title={r.url}>
        {r.url}
      </span>
    ),
    sortBy: (r) => r.url,
  },
  {
    id: "strategy",
    header: "Strategy",
    width: 90,
    render: (r) => <span className="capitalize">{r.strategy}</span>,
    sortBy: (r) => r.strategy,
  },
  {
    id: "perf",
    header: "Perf",
    width: 84,
    render: (r) => {
      if (r.performance === null && r.error === null) {
        return (
          <span
            className="font-mono text-[color:var(--color-sc-text-faint)]"
            title="Queued — PageSpeed hasn't run yet"
          >
            queued
          </span>
        );
      }
      if (r.error !== null) {
        return (
          <span className="font-mono text-[color:var(--color-sc-err)]" title={r.error}>
            error
          </span>
        );
      }
      return (
        <span className="font-mono tabular-nums">
          {formatPerf(r.performance)}
        </span>
      );
    },
    sortBy: (r) => r.performance,
  },
  {
    id: "lcp",
    header: "LCP",
    width: 80,
    render: (r) => <span className="font-mono">{formatMs(r.lcpMs, true)}</span>,
    sortBy: (r) => r.lcpMs,
  },
  {
    id: "cls",
    header: "CLS",
    width: 72,
    render: (r) => <span className="font-mono">{formatCls(r.clsScore)}</span>,
    sortBy: (r) => r.clsScore,
  },
  {
    id: "fcp",
    header: "FCP",
    width: 80,
    render: (r) => <span className="font-mono">{formatMs(r.fcpMs, true)}</span>,
    sortBy: (r) => r.fcpMs,
  },
  {
    id: "inp",
    header: "INP",
    width: 80,
    render: (r) => <span className="font-mono">{formatMs(r.inpMs)}</span>,
    sortBy: (r) => r.inpMs,
  },
  {
    id: "ttfb",
    header: "TTFB",
    width: 80,
    render: (r) => <span className="font-mono">{formatMs(r.ttfbMs)}</span>,
    sortBy: (r) => r.ttfbMs,
  },
];

export const PageSpeedPage: React.FC = () => {
  const pagespeed = useStore((s) => s.pagespeed);
  const summary = useStore((s) => s.pageSpeedSummary);
  const env = useStore((s) => s.env);
  const settings = useStore((s) => s.settings);
  const setPageSpeedKey = useStore((s) => s.setPageSpeedKey);
  const clearPageSpeedKey = useStore((s) => s.clearPageSpeedKey);
  const updateSetting = useStore((s) => s.updateSetting);

  const rows = useMemo(() => Object.values(pagespeed), [pagespeed]);

  const medians = useMemo(() => {
    const pick = (f: (r: CwvMessageRow) => number | null): number | null =>
      median(rows.map(f).filter((v): v is number => typeof v === "number"));
    return {
      lcp: pick((r) => r.lcpMs),
      cls: pick((r) => r.clsScore),
      fcp: pick((r) => r.fcpMs),
      inp: pick((r) => r.inpMs),
      ttfb: pick((r) => r.ttfbMs),
      perf: pick((r) => r.performance),
    };
  }, [rows]);

  const enabled = Boolean(settings["pagespeed.enabled"]);
  const keyConfigured = Boolean(env?.pageSpeedKeyConfigured);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-56 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)]">
        <div className="mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Median
        </div>
        <SidebarMetric label="Perf" value={formatPerf(medians.perf)} />
        <SidebarMetric label="LCP" value={formatMs(medians.lcp, true)} />
        <SidebarMetric label="CLS" value={formatCls(medians.cls)} />
        <SidebarMetric label="FCP" value={formatMs(medians.fcp, true)} />
        <SidebarMetric label="INP" value={formatMs(medians.inp)} />
        <SidebarMetric label="TTFB" value={formatMs(medians.ttfb)} />

        <div className="mt-4 mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          API Key
        </div>
        <div className="p-2 text-xs border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
          <div
            className={
              keyConfigured
                ? "text-[color:var(--color-sc-ok)]"
                : "text-[color:var(--color-sc-text-faint)]"
            }
          >
            {keyConfigured ? "Configured" : "Not configured"}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={setPageSpeedKey}
              className="flex-1 px-2 py-1 text-[11px] font-medium text-white rounded bg-[color:var(--color-sc-accent)] hover:bg-[color:var(--color-sc-accent-hover)]"
            >
              {keyConfigured ? "Change" : "Set Key\u2026"}
            </button>
            {keyConfigured ? (
              <button
                onClick={clearPageSpeedKey}
                className="px-2 py-1 text-[11px] rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg)]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Status
        </div>
        <div className="text-xs text-[color:var(--color-sc-text-dim)]">
          {summary
            ? `Analyzed ${summary.analyzed} \u2022 Skipped ${summary.skipped}`
            : "Runs after each crawl completes."}
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="p-4 border-b border-[color:var(--color-sc-border)]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cwv
              label="LCP"
              value={formatMs(medians.lcp, true)}
              accent={classifyLcp(medians.lcp)}
            />
            <Cwv
              label="CLS"
              value={formatCls(medians.cls)}
              accent={classifyCls(medians.cls)}
            />
            <Cwv
              label="FCP"
              value={formatMs(medians.fcp, true)}
              accent={classifyFcp(medians.fcp)}
            />
            <Cwv
              label="TTFB"
              value={formatMs(medians.ttfb)}
              accent={classifyTtfb(medians.ttfb)}
            />
          </div>
          {!enabled ? (
            <div className="flex items-center justify-between p-2 mt-3 text-xs border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
              <span className="text-[color:var(--color-sc-text-dim)]">
                PageSpeed is disabled in Settings.
              </span>
              <button
                onClick={() => updateSetting("pagespeed.enabled", true)}
                className="px-2 py-1 text-[11px] font-medium text-white rounded bg-[color:var(--color-sc-accent)] hover:bg-[color:var(--color-sc-accent-hover)]"
              >
                Enable
              </button>
            </div>
          ) : null}
        </div>

        <VirtualTable
          rows={rows}
          columns={COLUMNS}
          storageKey="saficrawl.pagespeed.widths"
          rowKey={(r, i) => `${r.url}-${r.strategy}-${i}`}
          emptyLabel={
            enabled
              ? keyConfigured
                ? "PageSpeed runs automatically after each crawl completes."
                : "Set a PageSpeed API key to analyze URLs after a crawl."
              : "Enable PageSpeed in Settings to analyze URLs after a crawl."
          }
        />
      </div>
    </div>
  );
};

const SidebarMetric: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between px-2 py-1 text-xs rounded bg-[color:var(--color-sc-bg-raised)] border border-[color:var(--color-sc-border)] mb-1">
    <span className="text-[color:var(--color-sc-text-faint)]">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

const Cwv: React.FC<{ label: string; value: string; accent: string }> = ({
  label,
  value,
  accent,
}) => (
  <div className="p-4 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
    <div className="text-xs tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
      {label}
    </div>
    <div className={"mt-1 text-2xl font-semibold tabular-nums " + accent}>
      {value}
    </div>
  </div>
);

function classifyLcp(v: number | null): string {
  if (v === null) return "text-[color:var(--color-sc-text-faint)]";
  if (v <= 2500) return "text-[color:var(--color-sc-ok)]";
  if (v <= 4000) return "text-[color:var(--color-sc-warn)]";
  return "text-[color:var(--color-sc-err)]";
}
function classifyCls(v: number | null): string {
  if (v === null) return "text-[color:var(--color-sc-text-faint)]";
  if (v <= 0.1) return "text-[color:var(--color-sc-ok)]";
  if (v <= 0.25) return "text-[color:var(--color-sc-warn)]";
  return "text-[color:var(--color-sc-err)]";
}
function classifyFcp(v: number | null): string {
  if (v === null) return "text-[color:var(--color-sc-text-faint)]";
  if (v <= 1800) return "text-[color:var(--color-sc-ok)]";
  if (v <= 3000) return "text-[color:var(--color-sc-warn)]";
  return "text-[color:var(--color-sc-err)]";
}
function classifyTtfb(v: number | null): string {
  if (v === null) return "text-[color:var(--color-sc-text-faint)]";
  if (v <= 800) return "text-[color:var(--color-sc-ok)]";
  if (v <= 1800) return "text-[color:var(--color-sc-warn)]";
  return "text-[color:var(--color-sc-err)]";
}
