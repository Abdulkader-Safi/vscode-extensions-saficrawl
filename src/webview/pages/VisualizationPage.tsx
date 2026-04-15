import React, { useEffect, useMemo, useRef, useState } from "react";
import { DataSet, Network, type Options } from "vis-network/standalone";
import { useStore } from "../store";
import type { UrlRow, LinkRow } from "../../types/messages";

type Layout = "cose" | "grid" | "circle";

const NODE_CAP = 500;

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

export const VisualizationPage: React.FC = () => {
  const urls = useStore((s) => s.urls);
  const links = useStore((s) => s.links);
  const [layout, setLayout] = useState<Layout>("cose");
  const [maxDepth, setMaxDepth] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<UrlRow | null>(null);

  const { nodes, edges, truncated } = useMemo(
    () => buildGraph(urls, links, maxDepth, statusFilter),
    [urls, links, maxDepth, statusFilter],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const nodeDsRef = useRef<DataSet<{ id: string }> | null>(null);
  const edgeDsRef = useRef<DataSet<{ id: string }> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const nodeDs = new DataSet(nodes);
    const edgeDs = new DataSet(edges);
    nodeDsRef.current = nodeDs as unknown as DataSet<{ id: string }>;
    edgeDsRef.current = edgeDs as unknown as DataSet<{ id: string }>;

    const network = new Network(
      containerRef.current,
      { nodes: nodeDs, edges: edgeDs },
      optionsForLayout(layout),
    );
    network.on("click", (params: { nodes: string[] }) => {
      const first = params.nodes[0];
      if (!first) {
        setSelected(null);
        return;
      }
      const match = urls.find((u) => u.url === first);
      setSelected(match ?? null);
    });
    network.on("stabilizationIterationsDone", () => {
      network.setOptions({ physics: { enabled: false } });
    });
    networkRef.current = network;
    return () => {
      network.destroy();
      networkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nd = nodeDsRef.current;
    const ed = edgeDsRef.current;
    const network = networkRef.current;
    if (!nd || !ed || !network) return;

    const existingNodeIds = new Set(nd.getIds().map(String));
    const incomingNodeIds = new Set(nodes.map((n) => n.id));
    const addedNodes = nodes.filter((n) => !existingNodeIds.has(n.id));
    const removedNodeIds = [...existingNodeIds].filter(
      (id) => !incomingNodeIds.has(id),
    );

    const existingEdgeIds = new Set(ed.getIds().map(String));
    const incomingEdgeIds = new Set(edges.map((e) => e.id));
    const addedEdges = edges.filter((e) => !existingEdgeIds.has(e.id));
    const removedEdgeIds = [...existingEdgeIds].filter(
      (id) => !incomingEdgeIds.has(id),
    );

    if (removedNodeIds.length) nd.remove(removedNodeIds);
    if (addedNodes.length)
      nd.add(addedNodes as unknown as Array<{ id: string }>);
    if (removedEdgeIds.length) ed.remove(removedEdgeIds);
    if (addedEdges.length)
      ed.add(addedEdges as unknown as Array<{ id: string }>);

    // Only re-stabilize when topology actually changed.
    if (
      addedNodes.length ||
      removedNodeIds.length ||
      addedEdges.length ||
      removedEdgeIds.length
    ) {
      network.setOptions({ physics: { enabled: layout === "cose" } });
      network.stabilize(80);
    }
  }, [nodes, edges, layout]);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    network.setOptions(optionsForLayout(layout));
    if (layout === "cose") network.stabilize(120);
  }, [layout]);

  const inbound = useMemo(
    () =>
      selected ? links.filter((l) => l.targetUrl === selected.url).length : 0,
    [links, selected],
  );
  const outbound = useMemo(
    () =>
      selected ? links.filter((l) => l.sourceUrl === selected.url).length : 0,
    [links, selected],
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-64 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)] overflow-auto">
        <ControlSection title="Layout">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as Layout)}
            className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]"
          >
            <option value="cose">Force-Directed</option>
            <option value="grid">Grid</option>
            <option value="circle">Circle</option>
          </select>
        </ControlSection>

        <ControlSection title="Depth Filter">
          <input
            type="range"
            min={0}
            max={10}
            value={maxDepth}
            onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="text-[11px] text-[color:var(--color-sc-text-dim)]">
            Up to depth {maxDepth}
          </div>
        </ControlSection>

        <ControlSection title="Status Code">
          {["all", "2xx", "3xx", "4xx", "5xx"].map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 text-xs cursor-pointer"
            >
              <input
                type="radio"
                checked={statusFilter === key}
                onChange={() => setStatusFilter(key)}
              />
              <span>{key === "all" ? "All" : key}</span>
            </label>
          ))}
        </ControlSection>

        <ControlSection title="Legend">
          <LegendRow color="#34d399" label="2xx OK" />
          <LegendRow color="#fbbf24" label="3xx Redirect" />
          <LegendRow color="#f87171" label="4xx Not Found" />
          <LegendRow color="#c084fc" label="5xx Error" />
          <LegendRow color="#6b7280" label="Unknown" />
        </ControlSection>

        {selected ? (
          <ControlSection title="Selected Node">
            <div className="p-2 text-xs border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
              <div className="font-mono truncate" title={selected.url}>
                {selected.url}
              </div>
              <div
                className="mt-1 text-[color:var(--color-sc-text-dim)] truncate"
                title={selected.title ?? undefined}
              >
                {selected.title ?? "\u2014"}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[color:var(--color-sc-text-faint)]">
                <span>
                  In:{" "}
                  <span className="text-[color:var(--color-sc-text)]">
                    {inbound}
                  </span>
                </span>
                <span>
                  Out:{" "}
                  <span className="text-[color:var(--color-sc-text)]">
                    {outbound}
                  </span>
                </span>
                <span>
                  Status:{" "}
                  <span className="text-[color:var(--color-sc-text)]">
                    {selected.statusCode ?? "\u2014"}
                  </span>
                </span>
              </div>
            </div>
          </ControlSection>
        ) : null}
      </aside>

      <div className="flex-1 min-w-0 relative bg-[color:var(--color-sc-bg)]">
        {truncated ? (
          <div className="absolute top-2 left-2 z-10 px-2 py-1 text-[11px] rounded bg-[color:var(--color-sc-bg-raised)] border border-[color:var(--color-sc-border)] text-[color:var(--color-sc-text-dim)]">
            Showing {NODE_CAP} of {urls.length.toLocaleString()} nodes
          </div>
        ) : null}
        <div ref={containerRef} className="absolute inset-0" />
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[color:var(--color-sc-text-faint)] text-sm">
            No graph data yet. Run a crawl to populate.
          </div>
        ) : null}
      </div>
    </div>
  );
};

function optionsForLayout(layout: Layout): Options {
  const common: Options = {
    interaction: { hover: true, dragNodes: true, zoomView: true },
    physics:
      layout === "cose"
        ? {
            enabled: true,
            solver: "barnesHut",
            barnesHut: {
              gravitationalConstant: -8000,
              centralGravity: 0.3,
              springLength: 120,
              springConstant: 0.04,
              damping: 0.9,
              avoidOverlap: 0.4,
            },
            stabilization: {
              enabled: true,
              iterations: 150,
              updateInterval: 25,
              fit: true,
            },
            maxVelocity: 40,
            timestep: 0.35,
          }
        : { enabled: false },
    nodes: {
      shape: "dot",
      size: 12,
      font: { size: 10, color: "#9ca3af" },
      borderWidth: 1,
    },
    edges: {
      color: { color: "#26262c", opacity: 0.6 },
      smooth: false,
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    },
  };
  if (layout === "circle") {
    return {
      ...common,
      layout: { improvedLayout: false },
      physics: { enabled: false },
    };
  }
  if (layout === "grid") {
    return {
      ...common,
      layout: {
        hierarchical: {
          enabled: true,
          direction: "UD",
          sortMethod: "directed",
        },
      },
      physics: { enabled: false },
    };
  }
  return common;
}

function buildGraph(
  urls: UrlRow[],
  links: LinkRow[],
  maxDepth: number,
  statusFilter: string,
) {
  const filtered = urls.filter((u) => {
    if (u.depth > maxDepth) return false;
    if (statusFilter !== "all" && statusBucket(u.statusCode) !== statusFilter)
      return false;
    return true;
  });
  const truncated = filtered.length > NODE_CAP;
  const capped = truncated ? filtered.slice(0, NODE_CAP) : filtered;
  const nodeIds = new Set(capped.map((u) => u.url));

  const nodes = capped.map((u) => ({
    id: u.url,
    label: labelForUrl(u.url),
    title: `${u.url}\n${u.title ?? ""}\nStatus: ${u.statusCode ?? "\u2014"}`,
    color: {
      background: statusColor(u.statusCode),
      border: statusColor(u.statusCode),
    },
    size: 8 + Math.min(16, Math.log2(1 + (u.wordCount ?? 0))),
  }));

  const edgeSet = new Set<string>();
  const edges: Array<{ id: string; from: string; to: string }> = [];
  for (const l of links) {
    if (!nodeIds.has(l.sourceUrl) || !nodeIds.has(l.targetUrl)) continue;
    const key = `${l.sourceUrl}|${l.targetUrl}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ id: key, from: l.sourceUrl, to: l.targetUrl });
  }

  return { nodes, edges, truncated };
}

function labelForUrl(url: string): string {
  try {
    const u = new URL(url);
    const p =
      u.pathname === "/"
        ? "/"
        : (u.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop() ??
          "/");
    return p.length > 18 ? p.slice(0, 17) + "\u2026" : p;
  } catch {
    return url.slice(0, 18);
  }
}

const ControlSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="mb-4">
    <div className="mb-1.5 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
      {title}
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const LegendRow: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
    <span>{label}</span>
  </div>
);
