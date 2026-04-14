export type PsiStrategy = "mobile" | "desktop";

export interface CwvRow {
  url: string;
  strategy: PsiStrategy;
  performance: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  fcpMs: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
  tbtMs: number | null;
  error: string | null;
}
