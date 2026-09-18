import { fileURLToPath } from "node:url";
import { testEnvironment } from "../server/test-environment.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const settings = testEnvironment(root);
if (!settings) throw new Error("Test servers must be launched by Playwright.");
// Deliberately overwrite inherited application storage settings.
process.env.LOCALPAD_DATA_DIR = settings.directory;

const { createServer, preview } = await import("vite");
const identityPlugin = {
  name: "localpad-test-server-identity",
  configureServer: installIdentity,
  configurePreviewServer: installIdentity,
};
function installIdentity(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url !== "/__localpad_e2e__/identity") return next();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(settings));
  });
}
const network = { host: "127.0.0.1", port: settings.port, strictPort: true };
const options = {
  root,
  plugins: [identityPlugin],
  // Tests exercise one source revision. Background release artifacts and local
  // database writes must never trigger a browser reload during Python execution.
  server: { ...network, hmr: false, watch: null },
  preview: network,
};
const server =
  settings.mode === "production"
    ? await preview(options)
    : await createServer(options);
if (settings.mode === "development") await server.listen();
server.printUrls();
