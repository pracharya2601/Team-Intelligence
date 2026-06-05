/**
 * Quick setup check — confirms the Butterbase backend is reachable and the gateway works.
 *
 * Run: npm run check   (reads bora/.env.local or .env for BUTTERBASE_API_KEY)
 *
 * For the full Phase 0 verification (schema, RLS prerequisite, RAG embedding, OAuth, …) run the
 * test suite instead: `npm test` → tests/phase0.test.ts. This file is the fast smoke test.
 *
 * (Repointed off the old Next.js src/lib/{bb,llm} imports — those were removed when the app
 *  moved to the Vite SPA + functions model.)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Load .env.local first (preferred, matches deploy-fn.mjs), then fall back to .env.
for (const file of [".env.local", ".env"]) {
  try {
    const raw = readFileSync(join(here, "..", file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file absent — try the next one */
  }
}

const APP_ID = process.env.BUTTERBASE_APP_ID ?? "app_91v2kzy0pe03";
const API_BASE = process.env.BUTTERBASE_API_BASE ?? "https://api.butterbase.ai";
const KEY = process.env.BUTTERBASE_API_KEY ?? "";
const appUrl = `${API_BASE}/v1/${APP_ID}`;

async function main() {
  console.log("Bora setup check\n");
  if (!KEY.startsWith("bb_sk_")) {
    console.error("  ✗ BUTTERBASE_API_KEY (bb_sk_...) not set — copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }

  // 1. Data API
  const data = await fetch(`${appUrl}/organizations?limit=1`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!data.ok) {
    console.error(`  ✗ data API GET /organizations → ${data.status}`);
    process.exit(1);
  }
  console.log("  ✓ Butterbase data API reachable");

  // 2. AI gateway — both surface models
  for (const [label, model] of [
    ["Gemini Flash (meetings)", process.env.BORA_MODEL_MEETING ?? "google/gemini-2.5-flash"],
    ["Claude 4.8 (chat/notes/Slack)", process.env.BORA_MODEL_CHAT ?? "anthropic/claude-opus-4.8"],
  ] as const) {
    const r = await fetch(`${appUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with: ok" }], max_tokens: 8 }),
    });
    if (!r.ok) {
      console.error(`  ✗ gateway ${model} → ${r.status}`);
      process.exit(1);
    }
    console.log(`  ✓ gateway: ${label}`);
  }

  console.log("\nAll good. For full verification run: npm test\n");
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
