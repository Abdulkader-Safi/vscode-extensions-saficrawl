const esbuild = require("esbuild");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

/**
 * @type {import('esbuild').Plugin}
 */
const postcssPlugin = {
  name: "postcss-plugin",
  setup(build) {
    build.onEnd(() => {
      return new Promise((resolve, reject) => {
        const args = [
          "postcss",
          "./src/webview/index.css",
          "-o",
          "./dist/webview.css",
        ];

        if (production) {
          args.push("--env", "production");
        }

        const postcss = spawn("npx", args, {
          shell: true,
        });

        postcss.stdout.on("data", (data) => {
          console.log(data.toString());
        });

        postcss.stderr.on("data", (data) => {
          console.error(data.toString());
        });

        postcss.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`PostCSS process exited with code ${code}`));
          }
        });
      });
    });
  },
};

const copyAssetsPlugin = {
  name: "copy-assets",
  setup(build) {
    build.onEnd(() => {
      fs.mkdirSync("dist", { recursive: true });
      const schemaSrc = path.join("src", "storage", "schema.sql");
      const schemaDst = path.join("dist", "schema.sql");
      if (fs.existsSync(schemaSrc)) {
        fs.copyFileSync(schemaSrc, schemaDst);
      }
      // sql.js wasm binary.
      const wasmSrc = path.join("node_modules", "sql.js", "dist", "sql-wasm.wasm");
      const wasmDst = path.join("dist", "sql-wasm.wasm");
      if (fs.existsSync(wasmSrc)) {
        fs.copyFileSync(wasmSrc, wasmDst);
      }
    });
  },
};

async function main() {
  // Build extension
  const extensionCtx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    // Only "vscode" (provided by the host) and "playwright" (resolved from
    // the user's own install at runtime) stay external. Everything else —
    // including sql.js — must be bundled or it won't exist in the .vsix.
    external: ["vscode", "playwright"],
    logLevel: "silent",
    plugins: [esbuildProblemMatcherPlugin, copyAssetsPlugin],
  });

  // Build webview
  const webviewCtx = await esbuild.context({
    entryPoints: ["src/webview/index.tsx"],
    bundle: true,
    format: "esm",
    minify: production,
    sourcemap: !production,
    platform: "browser",
    outfile: "dist/webview.js",
    logLevel: "silent",
    plugins: [postcssPlugin],
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await extensionCtx.dispose();
    await webviewCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
