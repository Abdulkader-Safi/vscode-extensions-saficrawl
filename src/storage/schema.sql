PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS crawls (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  base_url            TEXT    NOT NULL,
  status              TEXT    NOT NULL,
  config_json         TEXT    NOT NULL,
  started_at          INTEGER NOT NULL,
  completed_at        INTEGER,
  archived_at         INTEGER,
  can_resume          INTEGER NOT NULL DEFAULT 0,
  resume_checkpoint   TEXT,
  url_count           INTEGER NOT NULL DEFAULT 0,
  link_count          INTEGER NOT NULL DEFAULT 0,
  issue_count         INTEGER NOT NULL DEFAULT 0,
  error_count         INTEGER NOT NULL DEFAULT 0,
  pagespeed_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crawls_started_at ON crawls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawls_archived ON crawls(archived_at);

CREATE TABLE IF NOT EXISTS crawled_urls (
  crawl_id         INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  url              TEXT    NOT NULL,
  depth            INTEGER NOT NULL,
  status_code      INTEGER,
  content_type     TEXT,
  size             INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  title            TEXT,
  word_count       INTEGER,
  internal         INTEGER NOT NULL DEFAULT 1,
  issue_count      INTEGER NOT NULL DEFAULT 0,
  js_rendered      INTEGER NOT NULL DEFAULT 0,
  fields_json      TEXT    NOT NULL,
  PRIMARY KEY (crawl_id, url)
);

CREATE INDEX IF NOT EXISTS idx_urls_crawl_status ON crawled_urls(crawl_id, status_code);

CREATE TABLE IF NOT EXISTS crawl_links (
  crawl_id       INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  source_url     TEXT    NOT NULL,
  target_url     TEXT    NOT NULL,
  anchor_text    TEXT,
  is_internal    INTEGER NOT NULL DEFAULT 0,
  target_domain  TEXT,
  target_status  INTEGER,
  placement      TEXT    NOT NULL,
  PRIMARY KEY (crawl_id, source_url, target_url)
);

CREATE INDEX IF NOT EXISTS idx_links_crawl_target ON crawl_links(crawl_id, target_url);

CREATE TABLE IF NOT EXISTS crawl_issues (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_id   INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  type       TEXT    NOT NULL,
  category   TEXT    NOT NULL,
  issue      TEXT    NOT NULL,
  details    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_crawl ON crawl_issues(crawl_id);
CREATE INDEX IF NOT EXISTS idx_issues_crawl_url ON crawl_issues(crawl_id, url);

CREATE TABLE IF NOT EXISTS crawl_queue (
  crawl_id  INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  url       TEXT    NOT NULL,
  depth     INTEGER NOT NULL,
  priority  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (crawl_id, url)
);

CREATE TABLE IF NOT EXISTS crawl_pagespeed (
  crawl_id    INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  strategy    TEXT    NOT NULL,
  performance REAL,
  lcp_ms      REAL,
  cls_score   REAL,
  fcp_ms      REAL,
  inp_ms      REAL,
  ttfb_ms     REAL,
  tbt_ms      REAL,
  error       TEXT,
  PRIMARY KEY (crawl_id, url, strategy)
);
