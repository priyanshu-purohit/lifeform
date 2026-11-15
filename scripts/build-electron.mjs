import { build } from "esbuild";

const common = { platform: "node", target: "node22", format: "cjs", bundle: true, sourcemap: true, logLevel: "info" };

// Main: keep node_modules external so the SDK loads its native runtime from disk.
await build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.js", packages: "external" });

// Preload: bundle everything except electron (sandboxed preloads can only require "electron").
await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.js", external: ["electron"] });
