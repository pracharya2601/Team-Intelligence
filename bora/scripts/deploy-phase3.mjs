/**
 * Deploy Phase 3 (proactive bot) functions to Butterbase with their envVars.
 *
 *   for f in recall-webhook meeting-create speak-trigger speak speak-voice; do node scripts/bundle-fn.mjs functions/$f.ts; done
 *   node scripts/deploy-phase3.mjs
 *
 * Reads secrets from .env. Deploys the BUNDLED (self-contained) versions from functions/_deploy/.
 *
 *   meeting-create : auth=required  (ctx.user; admin-gated) — now also wires realtime transcript
 *   recall-webhook : auth=none      (Recall calls it; whsec-verified) — fires speak-trigger
 *   speak-trigger  : auth=none      (server→server from recall-webhook; runs Nebius + Gemini Flash)
 *   speak          : auth=none      (server→server from speak-trigger; ElevenLabs TTS → bot_state)
 *   speak-voice    : auth=required  (ctx.user; member reads voices, admin sets voice_id)
 *
 * Re-deploying an existing function name updates it (Butterbase upserts by name).
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
const APP_BASE_URL = process.env.APP_BASE_URL ?? env.APP_BASE_URL ?? "https://bora-meeting-bot.butterbase.dev";
if (!APP || !KEY) { console.error("BUTTERBASE_APP_ID / BUTTERBASE_API_KEY missing in .env"); process.exit(1); }

// Common Butterbase envVars every function gets (runtime also injects URL/APP, but be explicit).
const bb = { BUTTERBASE_API_KEY: KEY, BUTTERBASE_API_URL: BASE, BUTTERBASE_APP_ID: APP };
const recall = { RECALL_API_KEY: env.RECALL_API_KEY, RECALL_REGION: env.RECALL_REGION };
const models = { BORA_MODEL_CHAT: env.BORA_MODEL_CHAT, BORA_MODEL_MEETING: env.BORA_MODEL_MEETING };
const nebius = {
  NEBIUS_API_KEY: env.NEBIUS_API_KEY ?? env.Nebius_API_KEY,
  NEBIUS_API_BASE: env.NEBIUS_API_BASE,
  NEBIUS_TRIGGER_MODEL: env.NEBIUS_TRIGGER_MODEL,
};
const eleven = { ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY };

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
    envVars: { ...bb, ...recall, ...models, RECALL_WORKSPACE_VERIFICATION_SECRET: env.RECALL_WORKSPACE_VERIFICATION_SECRET },
  },
  {
    name: "speak-trigger",
    file: "functions/_deploy/speak-trigger.ts",
    auth: "none",
    envVars: { ...bb, ...models, ...nebius },
  },
  {
    name: "speak",
    file: "functions/_deploy/speak.ts",
    auth: "none",
    envVars: { ...bb, ...eleven },
  },
  {
    name: "speak-voice",
    file: "functions/_deploy/speak-voice.ts",
    auth: "required",
    envVars: { ...bb, ...eleven },
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
console.log("\nAll Phase 3 functions deployed.");
