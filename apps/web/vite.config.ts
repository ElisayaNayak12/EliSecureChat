import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** First existing node_modules path (workspace packages are usually hoisted to the repo root). */
function pkgDir(...parts: string[]) {
  for (const base of [join(here, "node_modules"), resolve(here, "../../node_modules")]) {
    const p = join(base, ...parts);
    if (existsSync(p)) return p;
  }
  throw new Error(`Cannot find ${parts.join("/")} in node_modules`);
}

/**
 * Serves the on-device AI runtimes (MediaPipe WASM, ONNX Runtime WASM) from this app instead of a CDN,
 * so inference keeps working offline once the page and models are cached (spec section 4).
 */
function localAiRuntimes(): Plugin {
  const mounts = [
    { url: "/vendor/mediapipe/", dir: pkgDir("@mediapipe", "tasks-vision", "wasm") },
    { url: "/vendor/ort/", dir: pkgDir("onnxruntime-web", "dist") },
  ];
  const types: Record<string, string> = { ".wasm": "application/wasm", ".mjs": "text/javascript", ".js": "text/javascript" };
  let outDir = "dist";
  return {
    name: "local-ai-runtimes",
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const mount = mounts.find((m) => url.startsWith(m.url));
        if (!mount) return next();
        const name = url.slice(mount.url.length);
        if (!/^[\w.-]+$/.test(name)) return next(); // no path traversal
        const file = join(mount.dir, name);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        const ext = name.slice(name.lastIndexOf("."));
        res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const m of mounts) cpSync(m.dir, join(outDir, m.url), { recursive: true, filter: (src) => !/\.(map|d\.ts)$/.test(src) });
    },
  };
}

export default defineConfig({
  plugins: [react(), localAiRuntimes()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
