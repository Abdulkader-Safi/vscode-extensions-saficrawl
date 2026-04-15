import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { forceCollide, forceManyBody, forceLink, forceX, forceY } from "d3-force";
import { useStore } from "../store";
import { send } from "../messaging";
import type { UrlRow, LinkRow } from "../../types/messages";

const NODE_CAP = 500;

interface GraphNode {
  id: string;
  url: string;
  title: string | null;
  statusCode: number | null;
  degree: number;
  color: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

const FADED_OPACITY = 0.1;
const SEARCH_FADED_OPACITY = 0.05;

interface ForceSettings {
  centerForce: number;   // 0..1
  repelForce: number;    // -300..0
  linkForce: number;     // 0..1
  linkDistance: number;  // 10..250
}

interface DisplaySettings {
  nodeSizeMul: number;       // 0.5..3
  linkThickness: number;     // 0.2..3
  textFadeThreshold: number; // 0.5..4
  arrows: boolean;
  animate: boolean;
}

interface FilterSettings {
  search: string;
  hideOrphans: boolean;
}

const DEFAULT_FORCES: ForceSettings = {
  centerForce: 0.1,
  repelForce: -100,
  linkForce: 0.5,
  linkDistance: 50,
};

const DEFAULT_DISPLAY: DisplaySettings = {
  nodeSizeMul: 1.0,
  linkThickness: 0.5,
  textFadeThreshold: 1.5,
  arrows: false,
  animate: true,
};

function statusColor(code: number | null): string {
  if (code === null) return "#6b7280";
  if (code >= 200 && code < 300) return "#34d399";
  if (code >= 300 && code < 400) return "#fbbf24";
  if (code >= 400 && code < 500) return "#f87171";
  if (code >= 500) return "#c084fc";
  return "#6b7280";
}

function statusBucket(code: number | null): string {
  if (code === null) return "unknown";
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500) return "5xx";
  return "unknown";
}

function nodeRadius(degree: number, mul: number): number {
  return (2 + Math.sqrt(degree) * 1.5) * mul;
}

function shortLabel(url: string, title: string | null): string {
  if (title && title.trim()) {
    return title.length > 40 ? title.slice(0, 39) + "\u2026" : title;
  }
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return u.hostname;
    const last = u.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop();
    return last ?? u.pathname;
  } catch {
    return url;
  }
}

export const VisualizationPage: React.FC = () => {
  const urls = useStore((s) => s.urls);
  const links = useStore((s) => s.links);
  const [maxDepth, setMaxDepth] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<UrlRow | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [forces, setForces] = useState<ForceSettings>(DEFAULT_FORCES);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [filters, setFilters] = useState<FilterSettings>({ search: "", hideOrphans: false });

  const { nodes, edges, truncated, neighbors } = useMemo(
    () => buildGraph(urls, links, maxDepth, statusFilter, filters.hideOrphans),
    [urls, links, maxDepth, statusFilter, filters.hideOrphans],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  // Live-rewire forces when sliders change.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setForce = (name: string, force: any) => fg.d3Force(name, force);
    // forceCenter recenters the centroid every tick (jerky); use forceX/Y for smooth pull-toward-origin.
    // This also keeps orphan nodes contained — they get pulled back instead of flying off.
    setForce("center", null);
    setForce("x", forceX(0).strength(forces.centerForce));
    setForce("y", forceY(0).strength(forces.centerForce));
    // distanceMax limits charge falloff so distant nodes don't keep getting pushed.
    setForce("charge", forceManyBody().strength(forces.repelForce).distanceMax(300).theta(0.9));
    setForce(
      "link",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      forceLink<any, any>().id((n) => n.id).distance(forces.linkDistance).strength(forces.linkForce),
    );
    setForce(
      "collide",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      forceCollide<any>().radius((n) => nodeRadius(n.degree, display.nodeSizeMul) + 1).strength(0.6).iterations(1),
    );
    fg.d3ReheatSimulation();
  }, [forces, display.nodeSizeMul, nodes.length]);

  // Pause / resume animation.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    if (display.animate) fg.resumeAnimation();
    else fg.pauseAnimation();
  }, [display.animate]);

  const inbound = useMemo(
    () => (selected ? links.filter((l) => l.targetUrl === selected.url).length : 0),
    [links, selected],
  );
  const outbound = useMemo(
    () => (selected ? links.filter((l) => l.sourceUrl === selected.url).length : 0),
    [links, selected],
  );

  const highlightId = focusedId ?? hoverId;
  const highlightSet = useMemo(() => {
    if (!highlightId) return null;
    const set = new Set<string>([highlightId]);
    const ns = neighbors.get(highlightId);
    if (ns) for (const n of ns) set.add(n);
    return set;
  }, [highlightId, neighbors]);

  // CRITICAL: stable graphData reference. A fresh object literal would make react-force-graph-2d
  // think the data changed on every React render and restart the simulation — causing nodes to
  // drift on hover, click, or any state change.
  const graphData = useMemo(() => ({ nodes, links: edges }), [nodes, edges]);

  const searchTerm = filters.search.trim().toLowerCase();
  const matchesSearch = (n: GraphNode): boolean => {
    if (!searchTerm) return true;
    return (
      n.url.toLowerCase().includes(searchTerm) ||
      (n.title ?? "").toLowerCase().includes(searchTerm)
    );
  };

  const opacityFor = (n: GraphNode): number => {
    if (searchTerm && !matchesSearch(n)) return SEARCH_FADED_OPACITY;
    if (!highlightSet) return 1.0;
    return highlightSet.has(n.id) ? 1.0 : FADED_OPACITY;
  };

  const linkOpacityFor = (l: GraphLink): number => {
    const s = typeof l.source === "string" ? l.source : l.source.id;
    const t = typeof l.target === "string" ? l.target : l.target.id;
    if (searchTerm) {
      const sn = nodes.find((n) => n.id === s);
      const tn = nodes.find((n) => n.id === t);
      if (!sn || !tn || (!matchesSearch(sn) && !matchesSearch(tn))) return SEARCH_FADED_OPACITY;
    }
    if (!highlightSet) return 0.4;
    return highlightSet.has(s) && highlightSet.has(t) ? 0.8 : 0.05;
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-64 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)] overflow-auto">
        <ControlSection title="Filters">
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search\u2026"
            className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
          />
          <ToggleRow
            label="Hide orphans"
            value={filters.hideOrphans}
            onChange={(v) => setFilters({ ...filters, hideOrphans: v })}
          />
          <div>
            <div className="text-[11px] text-[color:var(--color-sc-text-dim)] mb-1">Depth \u2264 {maxDepth}</div>
            <input
              type="range"
              min={0}
              max={10}
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
          <div>
            <div className="text-[11px] text-[color:var(--color-sc-text-dim)] mb-1">Status code</div>
            <div className="grid grid-cols-5 gap-1">
              {["all", "2xx", "3xx", "4xx", "5xx"].map((key) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={
                    "px-1 py-0.5 text-[10px] rounded border " +
                    (statusFilter === key
                      ? "border-[color:var(--color-sc-accent)] bg-[color:var(--color-sc-bg-raised)]"
                      : "border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]")
                  }
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </ControlSection>

        <ControlSection title="Display">
          <SliderRow
            label="Node size"
            value={display.nodeSizeMul}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => setDisplay({ ...display, nodeSizeMul: v })}
          />
          <SliderRow
            label="Link thickness"
            value={display.linkThickness}
            min={0.2}
            max={3}
            step={0.1}
            onChange={(v) => setDisplay({ ...display, linkThickness: v })}
          />
          <SliderRow
            label="Label fade-in zoom"
            value={display.textFadeThreshold}
            min={0.5}
            max={4}
            step={0.1}
            onChange={(v) => setDisplay({ ...display, textFadeThreshold: v })}
          />
          <ToggleRow
            label="Arrows"
            value={display.arrows}
            onChange={(v) => setDisplay({ ...display, arrows: v })}
          />
          <ToggleRow
            label="Animate"
            value={display.animate}
            onChange={(v) => setDisplay({ ...display, animate: v })}
          />
        </ControlSection>

        <ControlSection title="Forces">
          <SliderRow
            label="Center force"
            value={forces.centerForce}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setForces({ ...forces, centerForce: v })}
          />
          <SliderRow
            label="Repel force"
            value={forces.repelForce}
            min={-500}
            max={0}
            step={10}
            onChange={(v) => setForces({ ...forces, repelForce: v })}
          />
          <SliderRow
            label="Link force"
            value={forces.linkForce}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setForces({ ...forces, linkForce: v })}
          />
          <SliderRow
            label="Link distance"
            value={forces.linkDistance}
            min={10}
            max={250}
            step={5}
            onChange={(v) => setForces({ ...forces, linkDistance: v })}
          />
          <button
            onClick={() => { setForces(DEFAULT_FORCES); setDisplay(DEFAULT_DISPLAY); }}
            className="w-full mt-2 px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
          >
            Reset to defaults
          </button>
        </ControlSection>

        <ControlSection title="Legend">
          <LegendRow color="#34d399" label="2xx OK" />
          <LegendRow color="#fbbf24" label="3xx Redirect" />
          <LegendRow color="#f87171" label="4xx Not Found" />
          <LegendRow color="#c084fc" label="5xx Error" />
          <LegendRow color="#6b7280" label="Unknown" />
        </ControlSection>

        <ControlSection title="Actions">
          <button
            onClick={() => fgRef.current?.zoomToFit(400, 60)}
            className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
          >
            Fit to view
          </button>
          <button
            onClick={() => {
              // Unpin every node so they re-flow with physics.
              for (const n of nodes as Array<GraphNode & { fx?: number; fy?: number }>) {
                n.fx = undefined;
                n.fy = undefined;
              }
              fgRef.current?.d3ReheatSimulation();
            }}
            className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
          >
            Unpin all
          </button>
          {focusedId ? (
            <button
              onClick={() => { setFocusedId(null); setSelected(null); }}
              className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] hover:bg-[color:var(--color-sc-bg-raised)]"
            >
              Clear focus
            </button>
          ) : null}
        </ControlSection>

        {selected ? (
          <ControlSection title="Selected Node">
            <div className="p-2 text-xs border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
              <div className="font-mono truncate" title={selected.url}>{selected.url}</div>
              <div
                className="mt-1 text-[color:var(--color-sc-text-dim)] truncate"
                title={selected.title ?? undefined}
              >
                {selected.title ?? "\u2014"}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[color:var(--color-sc-text-faint)]">
                <span>In: <span className="text-[color:var(--color-sc-text)]">{inbound}</span></span>
                <span>Out: <span className="text-[color:var(--color-sc-text)]">{outbound}</span></span>
                <span>Status: <span className="text-[color:var(--color-sc-text)]">{selected.statusCode ?? "\u2014"}</span></span>
              </div>
            </div>
          </ControlSection>
        ) : null}
      </aside>

      <div
        ref={containerRef}
        className="flex-1 min-w-0 relative bg-[color:var(--color-sc-bg)] overflow-hidden"
      >
        {truncated ? (
          <div className="absolute top-2 left-2 z-10 px-2 py-1 text-[11px] rounded bg-[color:var(--color-sc-bg-raised)] border border-[color:var(--color-sc-border)] text-[color:var(--color-sc-text-dim)]">
            Showing {NODE_CAP} of {urls.length.toLocaleString()} nodes
          </div>
        ) : null}
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[color:var(--color-sc-text-faint)] text-sm">
            No graph data yet. Run a crawl to populate.
          </div>
        ) : (
          <ForceGraph2D<GraphNode, GraphLink>
            ref={fgRef}
            graphData={graphData}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={4}
            nodeLabel={(n) => `${n.url}\n${n.title ?? ""}\nStatus: ${n.statusCode ?? "\u2014"}`}
            linkColor={(l) => `rgba(180, 180, 200, ${linkOpacityFor(l as GraphLink)})`}
            linkWidth={(l) => {
              const s = typeof (l as GraphLink).source === "string"
                ? (l as GraphLink).source as string
                : ((l as GraphLink).source as GraphNode).id;
              const t = typeof (l as GraphLink).target === "string"
                ? (l as GraphLink).target as string
                : ((l as GraphLink).target as GraphNode).id;
              const base = display.linkThickness;
              return highlightSet && highlightSet.has(s) && highlightSet.has(t) ? base * 2.5 : base;
            }}
            linkDirectionalArrowLength={display.arrows ? 6 : 0}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalArrowColor={() => "#cbd5e1"}
            cooldownTicks={120}
            warmupTicks={20}
            d3AlphaDecay={0.0228}
            d3VelocityDecay={0.55}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GraphNode;
              if (n.x === undefined || n.y === undefined) return;
              const radius = nodeRadius(n.degree, display.nodeSizeMul);
              const alpha = opacityFor(n);

              ctx.globalAlpha = alpha;
              ctx.fillStyle = n.color;
              ctx.beginPath();
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
              ctx.fill();

              if (highlightId === n.id) {
                ctx.lineWidth = 1.5 / globalScale;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
              }

              const fadeStart = display.textFadeThreshold;
              const fadeEnd = fadeStart + 1.0;
              if (globalScale > fadeStart) {
                const fadeProgress = Math.min(1, (globalScale - fadeStart) / (fadeEnd - fadeStart));
                ctx.globalAlpha = alpha * fadeProgress;
                const fontSize = Math.max(8, 11 / globalScale);
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = "#e5e7eb";
                ctx.fillText(shortLabel(n.url, n.title), n.x, n.y + radius + 2);
              }

              ctx.globalAlpha = 1;
            }}
            onNodeHover={(node) => {
              setHoverId(node ? (node as GraphNode).id : null);
              if (containerRef.current) {
                containerRef.current.style.cursor = node ? "pointer" : "default";
              }
            }}
            onNodeClick={(n) => {
              // Click → open the page in the user's default browser.
              send({ type: "openExternal", url: (n as GraphNode).url });
            }}
            onNodeRightClick={(n) => {
              // Right-click → focus + populate the Selected Node card (no browser open).
              const id = (n as GraphNode).id;
              setFocusedId((prev) => (prev === id ? null : id));
              const match = urls.find((u) => u.url === id);
              setSelected(match ?? null);
            }}
            onBackgroundClick={() => {
              setFocusedId(null);
              setSelected(null);
            }}
            onNodeDragEnd={(node) => {
              // Don't pin — let the simulation settle the node naturally. (Obsidian behavior.)
              const n = node as GraphNode & { fx?: number; fy?: number };
              n.fx = undefined;
              n.fy = undefined;
            }}
          />
        )}
      </div>
    </div>
  );
};

function buildGraph(
  urls: UrlRow[],
  links: LinkRow[],
  maxDepth: number,
  statusFilter: string,
  hideOrphans: boolean,
): {
  nodes: GraphNode[];
  edges: GraphLink[];
  truncated: boolean;
  neighbors: Map<string, Set<string>>;
} {
  const filtered = urls.filter((u) => {
    if (u.depth > maxDepth) return false;
    if (statusFilter !== "all" && statusBucket(u.statusCode) !== statusFilter) return false;
    return true;
  });
  const truncated = filtered.length > NODE_CAP;
  const capped = truncated ? filtered.slice(0, NODE_CAP) : filtered;
  const nodeIds = new Set(capped.map((u) => u.url));

  const degree = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();
  const edgeSet = new Set<string>();
  const edges: GraphLink[] = [];

  for (const l of links) {
    if (!nodeIds.has(l.sourceUrl) || !nodeIds.has(l.targetUrl)) continue;
    const key = `${l.sourceUrl}|${l.targetUrl}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ source: l.sourceUrl, target: l.targetUrl });
    degree.set(l.sourceUrl, (degree.get(l.sourceUrl) ?? 0) + 1);
    degree.set(l.targetUrl, (degree.get(l.targetUrl) ?? 0) + 1);
    if (!neighbors.has(l.sourceUrl)) neighbors.set(l.sourceUrl, new Set());
    if (!neighbors.has(l.targetUrl)) neighbors.set(l.targetUrl, new Set());
    neighbors.get(l.sourceUrl)!.add(l.targetUrl);
    neighbors.get(l.targetUrl)!.add(l.sourceUrl);
  }

  let nodes: GraphNode[] = capped.map((u) => ({
    id: u.url,
    url: u.url,
    title: u.title,
    statusCode: u.statusCode,
    degree: degree.get(u.url) ?? 0,
    color: statusColor(u.statusCode),
  }));

  if (hideOrphans) {
    nodes = nodes.filter((n) => n.degree > 0);
  }

  return { nodes, edges, truncated, neighbors };
}

const ControlSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-4">
    <div className="mb-1.5 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">{title}</div>
    <div className="space-y-2">{children}</div>
  </div>
);

const LegendRow: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
    <span>{label}</span>
  </div>
);

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <div>
    <div className="flex items-center justify-between text-[11px] text-[color:var(--color-sc-text-dim)] mb-0.5">
      <span>{label}</span>
      <span className="font-mono text-[color:var(--color-sc-text)]">{value.toFixed(step < 1 ? 2 : 0)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full"
    />
  </div>
);

const ToggleRow: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between text-xs cursor-pointer">
    <span className="text-[color:var(--color-sc-text-dim)]">{label}</span>
    <input
      type="checkbox"
      checked={value}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-[color:var(--color-sc-accent)]"
    />
  </label>
);
