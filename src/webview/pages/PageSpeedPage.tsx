import React from "react";

export const PageSpeedPage: React.FC = () => {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-56 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)]">
        <div className="mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Core Web Vitals
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <SidebarMetric label="LCP" value="—" />
          <SidebarMetric label="CLS" value="—" />
          <SidebarMetric label="FCP" value="—" />
          <SidebarMetric label="INP" value="—" />
          <SidebarMetric label="TTFB" value="—" />
        </div>
        <div className="mt-auto pt-3 border-t border-[color:var(--color-sc-border)] text-[11px] text-[color:var(--color-sc-text-faint)]">
          Run PageSpeed after crawl to populate.
        </div>
      </aside>

      <div className="flex-1 min-w-0 p-6 overflow-auto">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cwv
            label="LCP"
            suffix="s"
            color="text-[color:var(--color-sc-warn)]"
          />
          <Cwv label="CLS" suffix="" color="text-[color:var(--color-sc-ok)]" />
          <Cwv label="FCP" suffix="s" color="text-[color:var(--color-sc-ok)]" />
          <Cwv
            label="TTFB"
            suffix="s"
            color="text-[color:var(--color-sc-ok)]"
          />
        </div>

        <div className="mt-6 p-4 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
          <div className="text-sm font-semibold">PageSpeed Insights</div>
          <div className="mt-1 text-xs text-[color:var(--color-sc-text-dim)]">
            Provide a Google API key in Settings \u2192 PageSpeed, then the
            engine will run Lighthouse on up to{" "}
            <span className="font-mono">pagespeed.urlLimit</span> URLs after the
            crawl completes. Lands in M4.
          </div>
          <button
            disabled
            className="mt-3 px-3 py-1.5 text-xs font-medium text-white rounded bg-[color:var(--color-sc-accent)] opacity-50 cursor-not-allowed"
          >
            Run PageSpeed (M4)
          </button>
        </div>

        <div className="mt-4 p-8 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] text-center">
          <div className="text-sm text-[color:var(--color-sc-text-dim)]">
            Per-URL metrics table will render here.
          </div>
        </div>
      </div>
    </div>
  );
};

const SidebarMetric: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between px-2 py-1 text-xs rounded bg-[color:var(--color-sc-bg-raised)] border border-[color:var(--color-sc-border)]">
    <span className="text-[color:var(--color-sc-text-faint)]">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

const Cwv: React.FC<{ label: string; suffix: string; color: string }> = ({
  label,
  suffix,
  color,
}) => (
  <div className="p-4 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
    <div className="text-xs tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
      {label}
    </div>
    <div className={"mt-1 text-2xl font-semibold tabular-nums " + color}>
      — <span className="text-sm font-normal">{suffix}</span>
    </div>
    <div className="mt-1 text-[11px] text-[color:var(--color-sc-text-faint)]">
      No data yet
    </div>
  </div>
);
