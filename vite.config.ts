import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localpadBridge } from "./server/bridge.ts";
import { localpadProjects } from "./server/projects.ts";
export default defineConfig({
  plugins: [react(), localpadBridge(), localpadProjects()],
  worker: { format: "es" },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/.localpad/**"] },
  },
  preview: { port: 4173, strictPort: true },
});
