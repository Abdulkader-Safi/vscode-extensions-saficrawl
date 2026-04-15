# Change Log

All notable changes to the SafiCrawl extension are documented in this file.
The format follows [Keep a Changelog](http://keepachangelog.com/).

## [1.0.0] — 2026-04-15

First stable release.

### Added

- **Pending rows up front.** When a crawl starts, the Overview, Internal,
  Status Codes, and PageSpeed tabs pre-populate every URL discovered from
  the seed + sitemap as a "pending" row, then fill each row in place as
  the crawler + PageSpeed worker finish it. No more waiting to see what
  will be crawled.
- **Full resume, including PageSpeed.** Crawls interrupted by closing the
  panel, reloading VS Code, or a process crash can be continued from where
  they stopped. Resume now covers PageSpeed: if the HTML crawl finished
  but only 5 of 10 PSI runs completed, continuing picks up at URL 6
  instead of restarting. PSI strategies used by a crawl are persisted
  per-crawl so the resume matches the original configuration.
- **Continue crawl button.** In-panel button that appears whenever the
  currently-loaded crawl has remaining queue entries or outstanding PSI
  work. Replaces the need to go through the sidebar context menu.
- **Saved Crawls grouped by domain.** The sidebar collapses every run of
  the same site under a single expandable parent. `www.example.com` and
  `example.com` share a group; other subdomains stay distinct.
- **Per-domain History tab with trend chart.** Click a domain group to
  open a new History tab with an SVG time-series chart across every run:
  Pages crawled, Total issues, Errors, Warnings, Notices, Engine errors,
  Avg mobile perf, Avg desktop perf. Dual-axis (counts left, 0–100% right),
  hover crosshair + tooltip, toggleable legend chips, responsive width.

### Changed

- PageSpeed and crawl tables no longer append duplicate rows when the
  same URL is posted again — the webview store now merges incoming batches
  by URL so pending → complete transitions happen in place.
- URL input in the toolbar defaults to the currently loaded crawl's base
  URL instead of a placeholder, so "Continue" and "Start Crawl" can be
  used without retyping.
- Filter URLs input tightened and the toolbar rebalanced so the Start /
  Continue controls stay visible on narrow panels.

### Fixed

- PageSpeed results no longer leak between crawls: while a crawl is
  running PSI in the background, opening a different saved crawl in the
  same session no longer overwrites the displayed PSI rows or mis-saves
  results under the wrong crawl ID. Results keep streaming into the
  originating crawl's DB row silently.
- History chart now spans the full panel width on first paint (previously
  it initialised at a fixed narrow width when the tab opened before the
  chart container was laid out).
- Stray `\u2026` / `\u2715` escapes that rendered as literal characters
  in the filter toolbar have been replaced with their intended glyphs.

### Internal

- New `queue:seeded` crawler event emitted after sitemap discovery so
  the controller can fan out pending rows in a single place.
- New `crawls.psi_strategies_json` column (idempotent migration) to make
  PSI resume deterministic across sessions.
- New `CrawlDb.getDomainHistory(crawlIds)` aggregates per-crawl issue
  counts by severity and average PSI performance per strategy in a
  single round-trip for the history chart.

## [0.1.0]

- Initial release.
