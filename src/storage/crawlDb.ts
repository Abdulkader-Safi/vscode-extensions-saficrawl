import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CrawlerConfig } from "../engine/types";
import type { IssueRow, LinkRow, UrlRow } from "../types/messages";
import type { CwvRow, PsiStrategy } from "../pagespeed/types";

export type StoredStatus =
  | "running"
  | "paused"
  | "stopping"
  | "completed"
  | "error"
  | "interrupted";

export interface StoredCrawl {
  id: number;
  baseUrl: string;
  status: StoredStatus;
  config: CrawlerConfig;
  startedAt: number;
  completedAt: number | null;
  archivedAt: number | null;
  canResume: boolean;
  urlCount: number;
  linkCount: number;
  issueCount: number;
  errorCount: number;
  pagespeedCount: number;
  psiStrategies: PsiStrategy[];
}

export interface ResumeCheckpoint {
  visited: string[];
  // [url, depth] for back-compat OR [url, depth, priority] (priority 0 = sitemap, 1 = BFS).
  queue: Array<[string, number] | [string, number, number]>;
}

export interface LoadedCrawl {
  crawl: StoredCrawl;
  urls: UrlRow[];
  links: LinkRow[];
  issues: IssueRow[];
  pagespeed: CwvRow[];
  checkpoint: ResumeCheckpoint | null;
}

const PERSIST_THROTTLE_MS = 500;

const INSERT_URL_SQL = `
  INSERT INTO crawled_urls (crawl_id, url, depth, status_code, content_type, size, response_time_ms, title, word_count, internal, issue_count, js_rendered, fields_json)
  VALUES ($crawl_id, $url, $depth, $status_code, $content_type, $size, $response_time_ms, $title, $word_count, $internal, $issue_count, $js_rendered, $fields_json)
  ON CONFLICT(crawl_id, url) DO UPDATE SET
    depth=excluded.depth,
    status_code=excluded.status_code,
    content_type=excluded.content_type,
    size=excluded.size,
    response_time_ms=excluded.response_time_ms,
    title=excluded.title,
    word_count=excluded.word_count,
    internal=excluded.internal,
    issue_count=excluded.issue_count,
    js_rendered=excluded.js_rendered,
    fields_json=excluded.fields_json
`;

const INSERT_LINK_SQL = `
  INSERT INTO crawl_links (crawl_id, source_url, target_url, anchor_text, is_internal, target_domain, target_status, placement)
  VALUES ($crawl_id, $source_url, $target_url, $anchor_text, $is_internal, $target_domain, $target_status, $placement)
  ON CONFLICT(crawl_id, source_url, target_url) DO UPDATE SET
    anchor_text=excluded.anchor_text,
    is_internal=excluded.is_internal,
    target_domain=excluded.target_domain,
    target_status=excluded.target_status,
    placement=excluded.placement
`;

const INSERT_ISSUE_SQL = `
  INSERT INTO crawl_issues (crawl_id, url, type, category, issue, details)
  VALUES ($crawl_id, $url, $type, $category, $issue, $details)
`;

const INSERT_QUEUE_SQL = `INSERT OR REPLACE INTO crawl_queue (crawl_id, url, depth, priority) VALUES ($crawl_id, $url, $depth, $priority)`;
const DELETE_QUEUE_SQL = `DELETE FROM crawl_queue WHERE crawl_id = ?`;

const INSERT_PAGESPEED_SQL = `
  INSERT INTO crawl_pagespeed (crawl_id, url, strategy, performance, lcp_ms, cls_score, fcp_ms, inp_ms, ttfb_ms, tbt_ms, error)
  VALUES ($crawl_id, $url, $strategy, $performance, $lcp_ms, $cls_score, $fcp_ms, $inp_ms, $ttfb_ms, $tbt_ms, $error)
  ON CONFLICT(crawl_id, url, strategy) DO UPDATE SET
    performance=excluded.performance, lcp_ms=excluded.lcp_ms, cls_score=excluded.cls_score,
    fcp_ms=excluded.fcp_ms, inp_ms=excluded.inp_ms, ttfb_ms=excluded.ttfb_ms,
    tbt_ms=excluded.tbt_ms, error=excluded.error
`;

export class CrawlDb {
  private readonly db: Database;
  private readonly dbPath: string;
  private persistTimer: NodeJS.Timeout | null = null;
  private lastPersistAt = 0;
  private persistDirty = false;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async open(dbPath: string): Promise<CrawlDb> {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const wasmBinary = loadWasmBinary();
    const SQL: SqlJsStatic = await initSqlJs({
      wasmBinary: wasmBinary.buffer as ArrayBuffer,
    });

    let db: Database;
    if (fs.existsSync(dbPath)) {
      const bytes = fs.readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(bytes));
    } else {
      db = new SQL.Database();
      db.exec(fs.readFileSync(resolveSchemaPath(), "utf8"));
    }
    // sql.js drops PRAGMA state per connection; re-enable FK enforcement explicitly.
    db.exec("PRAGMA foreign_keys = ON;");
    // Idempotent migration: add crawl_queue.priority column if missing (older DBs predate sitemap-first).
    const cols = (() => {
      const stmt = db.prepare(`PRAGMA table_info(crawl_queue)`);
      const out: string[] = [];
      try {
        while (stmt.step()) {
          out.push(
            String((stmt.getAsObject() as { name?: string }).name ?? ""),
          );
        }
      } finally {
        stmt.free();
      }
      return out;
    })();
    if (!cols.includes("priority")) {
      db.exec(
        "ALTER TABLE crawl_queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;",
      );
    }
    const crawlCols = tableColumns(db, "crawls");
    if (!crawlCols.includes("psi_strategies_json")) {
      db.run("ALTER TABLE crawls ADD COLUMN psi_strategies_json TEXT");
    }
    return new CrawlDb(db, dbPath);
  }

  close(): void {
    this.flushPersist();
    this.db.close();
  }

  private schedulePersist(): void {
    this.persistDirty = true;
    const now = Date.now();
    if (now - this.lastPersistAt >= PERSIST_THROTTLE_MS) {
      this.flushPersist();
      return;
    }
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(
      () => this.flushPersist(),
      PERSIST_THROTTLE_MS,
    );
  }

  private flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.persistDirty) {
      return;
    }
    const bytes = this.db.export();
    const tmp = this.dbPath + ".tmp";
    fs.writeFileSync(tmp, Buffer.from(bytes));
    fs.renameSync(tmp, this.dbPath);
    this.lastPersistAt = Date.now();
    this.persistDirty = false;
  }

  createCrawl(
    baseUrl: string,
    config: CrawlerConfig,
    psiStrategies: PsiStrategy[] = [],
  ): number {
    this.db.run(
      `INSERT INTO crawls (base_url, status, config_json, psi_strategies_json, started_at) VALUES (?, 'running', ?, ?, ?)`,
      [
        baseUrl,
        JSON.stringify(config),
        JSON.stringify(psiStrategies),
        Date.now(),
      ],
    );
    const id = this.scalarNumber(`SELECT last_insert_rowid() AS id`);
    this.schedulePersist();
    return id;
  }

  setPsiStrategies(id: number, psiStrategies: PsiStrategy[]): void {
    this.db.run(`UPDATE crawls SET psi_strategies_json = ? WHERE id = ?`, [
      JSON.stringify(psiStrategies),
      id,
    ]);
    this.schedulePersist();
  }

  setStatus(id: number, status: StoredStatus, canResume: boolean): void {
    const completedAt = status === "completed" ? Date.now() : null;
    this.db.run(
      `UPDATE crawls SET status = ?, can_resume = ?, completed_at = ? WHERE id = ?`,
      [status, canResume ? 1 : 0, completedAt, id],
    );
    this.schedulePersist();
  }

  recoverInterrupted(): number[] {
    const ids = this.selectMany(
      `SELECT id FROM crawls WHERE status IN ('running', 'paused', 'stopping')`,
    ).map((r) => Number(r.id));
    if (ids.length) {
      this.db.run(
        `UPDATE crawls SET status = 'interrupted', can_resume = 1 WHERE status IN ('running', 'paused', 'stopping')`,
      );
      this.schedulePersist();
    }
    return ids;
  }

  saveCheckpoint(id: number, checkpoint: ResumeCheckpoint): void {
    this.db.run(
      `UPDATE crawls SET resume_checkpoint = ?, can_resume = 1 WHERE id = ?`,
      [JSON.stringify(checkpoint), id],
    );
    this.schedulePersist();
  }

  saveQueue(
    id: number,
    pending: Array<[string, number] | [string, number, number]>,
  ): void {
    this.db.run("BEGIN");
    try {
      this.db.run(DELETE_QUEUE_SQL, [id]);
      for (const entry of pending) {
        const url = entry[0];
        const depth = entry[1];
        const priority = entry[2] ?? 1;
        this.db.run(INSERT_QUEUE_SQL, {
          $crawl_id: id,
          $url: url,
          $depth: depth,
          $priority: priority,
        });
      }
      this.db.run("COMMIT");
    } catch (err) {
      this.db.run("ROLLBACK");
      throw err;
    }
    this.schedulePersist();
  }

  saveUrls(
    id: number,
    rows: UrlRow[],
    jsRenderedByUrl?: Map<string, boolean>,
  ): void {
    if (rows.length === 0) {
      return;
    }
    this.runBatch(
      INSERT_URL_SQL,
      rows.map((r) => ({
        $crawl_id: id,
        $url: r.url,
        $depth: r.depth,
        $status_code: r.statusCode,
        $content_type: null,
        $size: 0,
        $response_time_ms: r.loadTimeMs ?? 0,
        $title: r.title,
        $word_count: r.wordCount,
        $internal: r.internal ? 1 : 0,
        $issue_count: r.issueCount,
        $js_rendered: jsRenderedByUrl?.get(r.url) ? 1 : 0,
        $fields_json: JSON.stringify(r),
      })),
    );
    this.updateCounts(id);
    this.schedulePersist();
  }

  saveLinks(id: number, rows: LinkRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.runBatch(
      INSERT_LINK_SQL,
      rows.map((r) => ({
        $crawl_id: id,
        $source_url: r.sourceUrl,
        $target_url: r.targetUrl,
        $anchor_text: r.anchorText,
        $is_internal: r.isInternal ? 1 : 0,
        $target_domain: r.targetDomain,
        $target_status: r.targetStatus,
        $placement: r.placement,
      })),
    );
    this.updateCounts(id);
    this.schedulePersist();
  }

  saveIssues(id: number, rows: IssueRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.runBatch(
      INSERT_ISSUE_SQL,
      rows.map((r) => ({
        $crawl_id: id,
        $url: r.url,
        $type: r.type,
        $category: r.category,
        $issue: r.issue,
        $details: r.details,
      })),
    );
    this.updateCounts(id);
    this.schedulePersist();
  }

  savePageSpeed(id: number, rows: CwvRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.runBatch(
      INSERT_PAGESPEED_SQL,
      rows.map((r) => ({
        $crawl_id: id,
        $url: r.url,
        $strategy: r.strategy,
        $performance: r.performance,
        $lcp_ms: r.lcpMs,
        $cls_score: r.clsScore,
        $fcp_ms: r.fcpMs,
        $inp_ms: r.inpMs,
        $ttfb_ms: r.ttfbMs,
        $tbt_ms: r.tbtMs,
        $error: r.error,
      })),
    );
    this.updateCounts(id);
    this.schedulePersist();
  }

  recordEngineError(id: number): void {
    this.db.run(
      `UPDATE crawls SET error_count = error_count + 1 WHERE id = ?`,
      [id],
    );
    this.schedulePersist();
  }

  private updateCounts(id: number): void {
    this.db.run(
      `UPDATE crawls SET
        url_count = (SELECT COUNT(*) FROM crawled_urls WHERE crawl_id = ?),
        link_count = (SELECT COUNT(*) FROM crawl_links WHERE crawl_id = ?),
        issue_count = (SELECT COUNT(*) FROM crawl_issues WHERE crawl_id = ?),
        pagespeed_count = (SELECT COUNT(*) FROM crawl_pagespeed WHERE crawl_id = ?)
      WHERE id = ?`,
      [id, id, id, id, id],
    );
  }

  listCrawls(includeArchived = false): StoredCrawl[] {
    const sql = includeArchived
      ? `SELECT * FROM crawls ORDER BY started_at DESC`
      : `SELECT * FROM crawls WHERE archived_at IS NULL ORDER BY started_at DESC`;
    return this.selectMany(sql).map(rowToCrawl);
  }

  getCrawl(id: number): StoredCrawl | null {
    const rows = this.selectMany(`SELECT * FROM crawls WHERE id = ?`, [id]);
    return rows[0] ? rowToCrawl(rows[0]) : null;
  }

  loadCrawl(id: number): LoadedCrawl | null {
    const crawl = this.getCrawl(id);
    if (!crawl) {
      return null;
    }

    const urlRows = this.selectMany(
      `SELECT fields_json FROM crawled_urls WHERE crawl_id = ? ORDER BY rowid ASC`,
      [id],
    );
    const urls: UrlRow[] = urlRows.map(
      (r) => JSON.parse(String(r.fields_json)) as UrlRow,
    );

    const linkRows = this.selectMany(
      `SELECT source_url, target_url, anchor_text, is_internal, target_domain, target_status, placement FROM crawl_links WHERE crawl_id = ?`,
      [id],
    );
    const links: LinkRow[] = linkRows.map((r) => ({
      sourceUrl: String(r.source_url),
      targetUrl: String(r.target_url),
      anchorText: String(r.anchor_text ?? ""),
      isInternal: Boolean(r.is_internal),
      targetDomain: String(r.target_domain ?? ""),
      targetStatus:
        r.target_status === null || r.target_status === undefined
          ? null
          : Number(r.target_status),
      placement: r.placement as LinkRow["placement"],
    }));

    const issueRows = this.selectMany(
      `SELECT url, type, category, issue, details FROM crawl_issues WHERE crawl_id = ? ORDER BY id ASC`,
      [id],
    );
    const issues: IssueRow[] = issueRows.map((r) => ({
      url: String(r.url),
      type: r.type as IssueRow["type"],
      category: String(r.category),
      issue: String(r.issue),
      details: String(r.details),
    }));

    const psRows = this.selectMany(
      `SELECT * FROM crawl_pagespeed WHERE crawl_id = ?`,
      [id],
    );
    const pagespeed: CwvRow[] = psRows.map((r) => ({
      url: String(r.url),
      strategy: r.strategy as CwvRow["strategy"],
      performance: toNum(r.performance),
      lcpMs: toNum(r.lcp_ms),
      clsScore: toNum(r.cls_score),
      fcpMs: toNum(r.fcp_ms),
      inpMs: toNum(r.inp_ms),
      ttfbMs: toNum(r.ttfb_ms),
      tbtMs: toNum(r.tbt_ms),
      error: r.error === null || r.error === undefined ? null : String(r.error),
    }));

    const rawCheckpoint = this.selectMany(
      `SELECT resume_checkpoint FROM crawls WHERE id = ?`,
      [id],
    )[0];
    const checkpoint = rawCheckpoint?.resume_checkpoint
      ? (JSON.parse(
          String(rawCheckpoint.resume_checkpoint),
        ) as ResumeCheckpoint)
      : null;

    return { crawl, urls, links, issues, pagespeed, checkpoint };
  }

  archiveCrawl(id: number): void {
    this.db.run(`UPDATE crawls SET archived_at = ? WHERE id = ?`, [
      Date.now(),
      id,
    ]);
    this.schedulePersist();
  }

  unarchiveCrawl(id: number): void {
    this.db.run(`UPDATE crawls SET archived_at = NULL WHERE id = ?`, [id]);
    this.schedulePersist();
  }

  deleteCrawl(id: number): void {
    this.db.run("BEGIN");
    try {
      this.db.run(`DELETE FROM crawled_urls WHERE crawl_id = ?`, [id]);
      this.db.run(`DELETE FROM crawl_links WHERE crawl_id = ?`, [id]);
      this.db.run(`DELETE FROM crawl_issues WHERE crawl_id = ?`, [id]);
      this.db.run(`DELETE FROM crawl_queue WHERE crawl_id = ?`, [id]);
      this.db.run(`DELETE FROM crawl_pagespeed WHERE crawl_id = ?`, [id]);
      this.db.run(`DELETE FROM crawls WHERE id = ?`, [id]);
      this.db.run("COMMIT");
    } catch (err) {
      this.db.run("ROLLBACK");
      throw err;
    }
    this.schedulePersist();
  }

  getResumeQueue(id: number): Array<[string, number, number]> {
    const rows = this.selectMany(
      `SELECT url, depth, priority FROM crawl_queue WHERE crawl_id = ?`,
      [id],
    );
    return rows.map(
      (r) =>
        [
          String(r.url),
          Number(r.depth),
          r.priority === null || r.priority === undefined
            ? 1
            : Number(r.priority),
        ] as [string, number, number],
    );
  }

  getVisitedUrls(id: number): string[] {
    const rows = this.selectMany(
      `SELECT url FROM crawled_urls WHERE crawl_id = ?`,
      [id],
    );
    return rows.map((r) => String(r.url));
  }

  private runBatch(sql: string, params: Array<Record<string, unknown>>): void {
    if (params.length === 0) {
      return;
    }
    this.db.run("BEGIN");
    try {
      const stmt = this.db.prepare(sql);
      try {
        for (const p of params) {
          stmt.run(p as never);
        }
      } finally {
        stmt.free();
      }
      this.db.run("COMMIT");
    } catch (err) {
      this.db.run("ROLLBACK");
      throw err;
    }
  }

  private selectMany(
    sql: string,
    params: unknown[] = [],
  ): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never);
      while (stmt.step()) {
        out.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return out;
  }

  private scalarNumber(sql: string, params: unknown[] = []): number {
    const rows = this.selectMany(sql, params);
    const first = rows[0];
    if (!first) {
      return 0;
    }
    const firstKey = Object.keys(first)[0];
    return Number(first[firstKey] ?? 0);
  }
}

function tableColumns(db: Database, table: string): string[] {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const out: string[] = [];
  try {
    while (stmt.step()) {
      out.push(String((stmt.getAsObject() as { name?: string }).name ?? ""));
    }
  } finally {
    stmt.free();
  }
  return out;
}

function rowToCrawl(row: Record<string, unknown>): StoredCrawl {
  let psiStrategies: PsiStrategy[] = [];
  const raw = row.psi_strategies_json;
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        psiStrategies = parsed.filter(
          (s): s is PsiStrategy => s === "mobile" || s === "desktop",
        );
      }
    } catch {
      // ignore malformed value
    }
  }
  return {
    id: Number(row.id),
    baseUrl: String(row.base_url),
    status: row.status as StoredStatus,
    config: JSON.parse(String(row.config_json)) as CrawlerConfig,
    startedAt: Number(row.started_at),
    completedAt:
      row.completed_at === null || row.completed_at === undefined
        ? null
        : Number(row.completed_at),
    archivedAt:
      row.archived_at === null || row.archived_at === undefined
        ? null
        : Number(row.archived_at),
    canResume: Boolean(row.can_resume),
    urlCount: Number(row.url_count),
    linkCount: Number(row.link_count),
    issueCount: Number(row.issue_count),
    errorCount: Number(row.error_count),
    pagespeedCount: Number(row.pagespeed_count),
    psiStrategies,
  };
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function resolveSchemaPath(): string {
  const inline = path.join(__dirname, "schema.sql");
  if (fs.existsSync(inline)) {
    return inline;
  }
  const src = path.join(__dirname, "..", "..", "src", "storage", "schema.sql");
  if (fs.existsSync(src)) {
    return src;
  }
  return inline;
}

function loadWasmBinary(): Uint8Array {
  const candidates: string[] = [
    path.join(__dirname, "sql-wasm.wasm"),
    path.join(
      __dirname,
      "..",
      "..",
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm.wasm",
    ),
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm.wasm",
    ),
  ];
  try {
    const pkg = require.resolve("sql.js/package.json");
    candidates.unshift(path.join(path.dirname(pkg), "dist", "sql-wasm.wasm"));
  } catch {
    // keep hard-coded candidates
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return new Uint8Array(fs.readFileSync(candidate));
    }
  }
  throw new Error(`sql-wasm.wasm not found in: ${candidates.join(", ")}`);
}
