/**
 * Deploy Phase 2 functions (meeting-create, recall-webhook) to Butterbase with their envVars.
 *
 *   node scripts/bundle-fn.mjs functions/meeting-create.ts
 *   node scripts/bundle-fn.mjs functions/recall-webhook.ts
 *   node scripts/deploy-phase2.mjs
 *
 * Reads secrets from .env. Deploys the BUNDLED (self-contained) versions from functions/_deploy/.
 *   - meeting-create : auth=required  (uses ctx.user; admin-gated inside)
 *   - recall-webhook : auth=none      (Recall calls it w/ no JWT; verifies via whsec signature)
 */
import { readFileSync } from "node:fs";

function loadEnv(file = ".env") {
  const out = {};
  for (const raw of readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const APP = env.BUTTERBASE_APP_ID;
const BASE = env.BUTTERBASE_API_BASE ?? "https://api.butterbase.ai";
const KEY = env.BUTTERBASE_API_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://bora-meeting-bot.butterbase.dev";
if (!APP || !KEY) { console.error("BUTTERBASE_APP_ID / BUTTERBASE_API_KEY missing in .env"); process.exit(1); }

// Common Butterbase envVars every function gets (runtime injects URL/APP too, but be explicit).
const bb = { BUTTERBASE_API_KEY: KEY, BUTTERBASE_API_URL: BASE, BUTTERBASE_APP_ID: APP };
const recall = {
  RECALL_API_KEY: env.RECALL_API_KEY,
  RECALL_REGION: env.RECALL_REGION,
};
const models = { BORA_MODEL_CHAT: env.BORA_MODEL_CHAT, BORA_MODEL_MEETING: env.BORA_MODEL_MEETING };

const targets = [
  {
    name: "meeting-create",
    file: "functions/_deploy/meeting-create.ts",
    auth: "required",
    envVars: { ...bb, ...recall, APP_BASE_URL },
  },
  {
    name: "recall-webhook",
    file: "functions/_deploy/recall-webhook.ts",
    auth: "none",
    envVars: {
      ...bb,
      ...recall,
      ...models,
      RECALL_WORKSPACE_VERIFICATION_SECRET: env.RECALL_WORKSPACE_VERIFICATION_SECRET,
    },
  },
];

for (const t of targets) {
  const code = readFileSync(new URL(`../${t.file}`, import.meta.url), "utf8");
  const payload = { name: t.name, code, trigger: { type: "http", config: { method: "POST", auth: t.auth } }, envVars: t.envVars };
  const res = await fetch(`${BASE}/v1/${APP}/functions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`✗ ${t.name} deploy failed (${res.status}):`, text.slice(0, 500)); process.exit(1); }
  const out = JSON.parse(text);
  console.log(`✓ deployed ${t.name} (auth=${t.auth}) → ${out.url}`);
}
console.log("\nAll Phase 2 functions deployed.");
