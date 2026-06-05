import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA, deployed to Butterbase (Cloudflare Pages). All server logic is in
// Butterbase functions (see functions/), called from the app via /v1/{app_id}/fn/{name}.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
});
