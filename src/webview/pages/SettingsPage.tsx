import React, { useState } from "react";
import { useStore } from "../store";

type FieldType = "number" | "boolean" | "string" | "enum" | "csv";

interface Field {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

interface Section {
  id: string;
  label: string;
  fields: Field[];
}

const SECTIONS: Section[] = [
  {
    id: "crawler",
    label: "Crawler",
    fields: [
      {
        key: "crawler.maxDepth",
        label: "Max Depth",
        type: "number",
        min: 1,
        max: 10,
        step: 1,
      },
      {
        key: "crawler.maxUrls",
        label: "Max URLs",
        type: "number",
        min: 1,
        step: 1,
      },
      {
        key: "crawler.delay",
        label: "Crawl Delay (s)",
        type: "number",
        min: 0,
        max: 60,
        step: 0.1,
      },
      {
        key: "crawler.concurrency",
        label: "Concurrency",
        type: "number",
        min: 1,
        max: 50,
        step: 1,
      },
      {
        key: "crawler.followRedirects",
        label: "Follow Redirects",
        type: "boolean",
      },
      {
        key: "crawler.includeExternal",
        label: "Include External Links",
        type: "boolean",
      },
      {
        key: "crawler.discoverSitemaps",
        label: "Discover Sitemaps",
        type: "boolean",
      },
    ],
  },
  {
    id: "requests",
    label: "Requests",
    fields: [
      { key: "requests.userAgent", label: "User Agent", type: "string" },
      {
        key: "requests.timeout",
        label: "Timeout (s)",
        type: "number",
        min: 1,
        max: 120,
        step: 1,
      },
      {
        key: "requests.retries",
        label: "Retries",
        type: "number",
        min: 0,
        max: 10,
        step: 1,
      },
      {
        key: "requests.respectRobots",
        label: "Respect robots.txt",
        type: "boolean",
      },
      {
        key: "requests.acceptLanguage",
        label: "Accept-Language",
        type: "string",
      },
    ],
  },
  {
    id: "javascript",
    label: "JavaScript",
    fields: [
      {
        key: "javascript.enabled",
        label: "Enable Rendering",
        type: "boolean",
        hint: "Requires Install Playwright Browsers (M4).",
      },
      {
        key: "javascript.browser",
        label: "Browser",
        type: "enum",
        options: ["chromium", "firefox", "webkit"],
      },
      {
        key: "javascript.viewportWidth",
        label: "Viewport Width",
        type: "number",
        min: 320,
        max: 3840,
        step: 1,
      },
      {
        key: "javascript.viewportHeight",
        label: "Viewport Height",
        type: "number",
        min: 320,
        max: 2160,
        step: 1,
      },
      {
        key: "javascript.concurrency",
        label: "Concurrent Pages",
        type: "number",
        min: 1,
        max: 10,
        step: 1,
      },
      {
        key: "javascript.waitTime",
        label: "Wait Time (s)",
        type: "number",
        min: 0,
        max: 30,
        step: 0.5,
      },
      {
        key: "javascript.timeout",
        label: "Render Timeout (s)",
        type: "number",
        min: 5,
        max: 120,
        step: 1,
      },
    ],
  },
  {
    id: "filters",
    label: "Filters",
    fields: [
      {
        key: "filters.includeExtensions",
        label: "Include Extensions",
        type: "csv",
        hint: "Comma-separated (e.g. .html,.htm). Empty = all.",
      },
      {
        key: "filters.excludeExtensions",
        label: "Exclude Extensions",
        type: "csv",
      },
      { key: "filters.urlRegex", label: "URL Regex", type: "string" },
      {
        key: "filters.maxFileSizeMB",
        label: "Max File Size (MB)",
        type: "number",
        min: 1,
        max: 1000,
        step: 1,
      },
    ],
  },
  {
    id: "pagespeed",
    label: "PageSpeed",
    fields: [
      {
        key: "pagespeed.enabled",
        label: "Enable PageSpeed",
        type: "boolean",
        hint: "Requires a Google API key stored in SecretStorage.",
      },
      {
        key: "pagespeed.urlLimit",
        label: "URL Limit",
        type: "number",
        min: 1,
        max: 25000,
        step: 1,
      },
      {
        key: "pagespeed.strategy",
        label: "Strategy",
        type: "enum",
        options: ["mobile", "desktop", "both"],
      },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    fields: [
      { key: "advanced.proxy", label: "Proxy URL", type: "string" },
      {
        key: "advanced.logLevel",
        label: "Log Level",
        type: "enum",
        options: ["error", "warn", "info", "debug"],
      },
      {
        key: "diagnostics.enabled",
        label: "Problems Panel Diagnostics",
        type: "boolean",
        hint: "Surface issues for workspace-mapped URLs in VS Code's Problems panel.",
      },
      { key: "telemetry.enabled", label: "Telemetry", type: "boolean" },
    ],
  },
];

export const SettingsPage: React.FC = () => {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col w-48 px-3 py-3 border-r border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-soft)]">
        <div className="mb-1 text-[11px] tracking-wider uppercase text-[color:var(--color-sc-text-faint)]">
          Settings
        </div>
        <div className="flex flex-col space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={
                "px-2 py-1 text-sm text-left rounded " +
                (active === s.id
                  ? "bg-[color:var(--color-sc-bg-raised)] border border-[color:var(--color-sc-accent)]"
                  : "border border-transparent hover:bg-[color:var(--color-sc-bg-raised)] text-[color:var(--color-sc-text-dim)]")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-auto pt-3 border-t border-[color:var(--color-sc-border)] text-[11px] text-[color:var(--color-sc-text-faint)]">
          Changes auto-save and sync with{" "}
          <span className="font-mono">settings.json</span>.
        </div>
      </aside>

      <div className="flex-1 min-w-0 p-6 overflow-auto">
        <h2 className="mb-4 text-lg font-semibold">{section.label}</h2>
        <div className="grid max-w-3xl gap-3">
          {section.fields.map((field) => (
            <FieldRow key={field.key} field={field} />
          ))}
        </div>
      </div>
    </div>
  );
};

const FieldRow: React.FC<{ field: Field }> = ({ field }) => {
  const value = useStore((s) => s.settings[field.key]);
  const updateSetting = useStore((s) => s.updateSetting);

  return (
    <div className="flex items-start gap-4 p-3 border rounded border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg-raised)]">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{field.label}</div>
        <div className="mt-0.5 text-[11px] text-[color:var(--color-sc-text-faint)] font-mono">
          {field.key}
        </div>
        {field.hint ? (
          <div className="mt-1 text-xs text-[color:var(--color-sc-text-dim)]">
            {field.hint}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 w-72">
        <FieldInput
          field={field}
          value={value}
          onChange={(v) => updateSetting(field.key, v)}
        />
      </div>
    </div>
  );
};

const FieldInput: React.FC<{
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}> = ({ field, value, onChange }) => {
  switch (field.type) {
    case "boolean":
      return (
        <label className="flex items-center justify-end gap-2 cursor-pointer">
          <span className="text-xs text-[color:var(--color-sc-text-dim)]">
            {value ? "On" : "Off"}
          </span>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--color-sc-accent)]"
          />
        </label>
      );
    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) =>
            onChange(e.target.value === "" ? 0 : Number(e.target.value))
          }
          className="w-full px-2 py-1 text-xs text-right rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
        />
      );
    case "enum":
      return (
        <select
          value={typeof value === "string" ? value : (field.options?.[0] ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)]"
        >
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "csv":
      return (
        <input
          type="text"
          value={Array.isArray(value) ? value.join(",") : ""}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          className="w-full px-2 py-1 text-xs font-mono rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
        />
      );
    case "string":
    default:
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded border border-[color:var(--color-sc-border)] bg-[color:var(--color-sc-bg)] focus:outline-none focus:border-[color:var(--color-sc-accent)]"
        />
      );
  }
};
