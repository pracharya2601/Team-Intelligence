/**
 * Deploy a Butterbase function over HTTP using the service key — no MCP needed.
 *
 *   node scripts/deploy-fn.mjs <file> <name> [method] [auth]
 *   node scripts/deploy-fn.mjs functions/org-members.ts org-members POST required
 *
 * Cron trigger (pass "cron" as <method>; <auth> slot becomes the schedule):
 *   node scripts/deploy-fn.mjs functions/daily-recap.ts daily-recap cron "0 16 * * *"
 *
 * Reads BUTTERBASE_* from .env.local. The function file must be SELF-CONTAINED
 * (no local `./_shared` imports) — this sends a single code blob; relative imports
 * won't resolve. Inline what you need. Supplies BUTTERBASE_API_KEY/URL/APP_ID as envVars.
 *
 * Verify after deploy with: node scripts/check-fn.mjs  (or invoke /v1/{app}/fn/<name>).
 */
import { readFileSync } from "node:fs";

function loadEnv(file = ".env.local") {
  try {
    for (const raw of readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* rely on ambient env */ }
}
loadEnv();

const [, , file, name, method = "POST", auth = "required"] = process.argv;
if (!file || !name) {
  console.error("usage: node scripts/deploy-fn.mjs <file> <name> [method] [auth]");
  process.exit(1);
}

const APP = process.env.BUTTERBASE_APP_ID;
const BASE = process.env.BUTTERBASE_API_BASE ?? "https://api.butterbase.ai";
const KEY = process.env.BUTTERBASE_API_KEY;
if (!APP || !KEY) {
  console.error("BUTTERBASE_APP_ID / BUTTERBASE_API_KEY missing in .env.local");
  process.exit(1);
}

const code = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
// `cron` as the <method> arg switches to a scheduled trigger; the <auth> slot carries the
// 5-field cron expression (default daily 16:00 UTC). Otherwise it's a normal HTTP trigger.
const trigger =
  method === "cron"
    ? { type: "cron", config: { schedule: auth && auth !== "required" ? auth : "0 16 * * *", timezone: "UTC" } }
    : { type: "http", config: { method, auth } };
const payload = {
  name,
  code,
  trigger,
  envVars: {
    BUTTERBASE_API_KEY: KEY,
    BUTTERBASE_API_URL: BASE,
    BUTTERBASE_APP_ID: APP,
    APP_BASE_URL: process.env.APP_BASE_URL ?? "",
  },
};

const res = await fetch(`${BASE}/v1/${APP}/functions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
if (!res.ok) {
  console.error(`✗ deploy failed (${res.status}):`, text.slice(0, 400));
  process.exit(1);
}
const out = JSON.parse(text);
console.log(`✓ deployed "${name}" → ${out.url}`);
