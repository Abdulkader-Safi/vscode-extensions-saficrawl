import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as fs from "node:fs";

export interface PlaywrightLike {
  chromium: PlaywrightBrowserType;
  firefox: PlaywrightBrowserType;
  webkit: PlaywrightBrowserType;
}

export interface PlaywrightBrowserType {
  launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>;
}

export interface PlaywrightBrowser {
  newContext(options?: {
    viewport?: { width: number; height: number };
    userAgent?: string;
  }): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

export interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

export interface PlaywrightPage {
  goto(
    url: string,
    options?: {
      waitUntil?: "domcontentloaded" | "load" | "networkidle";
      timeout?: number;
    },
  ): Promise<PlaywrightResponse | null>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
  close(): Promise<void>;
}

export interface PlaywrightResponse {
  status(): number;
}

export interface PlaywrightDetection {
  playwright: PlaywrightLike | null;
  resolvedFrom: string | null;
  attemptedPaths: string[];
}

interface ResolveOptions {
  workspacePath?: string;
  configuredPath?: string;
}

/**
 * Resolves a Playwright install from the user's environment without bundling it.
 * Search order: explicit setting > workspace node_modules > global npm root.
 */
export function detectPlaywright(
  options: ResolveOptions = {},
): PlaywrightDetection {
  const attempts: string[] = [];

  const candidates: string[] = [];
  if (options.configuredPath) {candidates.push(options.configuredPath);}
  if (options.workspacePath)
    {candidates.push(
      path.join(options.workspacePath, "node_modules", "playwright"),
    );}
  const globalRoot = resolveGlobalNpmRoot();
  if (globalRoot) {candidates.push(path.join(globalRoot, "playwright"));}

  for (const candidate of candidates) {
    attempts.push(candidate);
    const mod = tryRequireFrom(candidate);
    if (mod)
      {return {
        playwright: mod,
        resolvedFrom: candidate,
        attemptedPaths: attempts,
      };}
  }

  return { playwright: null, resolvedFrom: null, attemptedPaths: attempts };
}

function tryRequireFrom(absolutePath: string): PlaywrightLike | null {
  try {
    if (!fs.existsSync(absolutePath)) {return null;}
    const req = createRequire(path.join(absolutePath, "package.json"));
    const mod = req("playwright") as PlaywrightLike;
    return mod && mod.chromium ? mod : null;
  } catch {
    return null;
  }
}

function resolveGlobalNpmRoot(): string | null {
  try {
    const raw = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
