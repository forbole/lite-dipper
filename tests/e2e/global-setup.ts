import { build } from "vite";
import { fileURLToPath } from "node:url";

export default async function buildTestWorker() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await build({
    root, configFile: false, logLevel: "warn",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    ssr: { noExternal: true },
    build: {
      ssr: fileURLToPath(new URL("../../worker/index.ts", import.meta.url)),
      outDir: "node_modules/.cache/lite-dipper-test-worker", emptyOutDir: true,
      rollupOptions: { output: { format: "es", entryFileNames: "worker.mjs" } }
    }
  });
}
