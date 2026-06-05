/**
 * Read-only ElevenLabs credential + voice-list check.
 *
 * Run: npm run check:elevenlabs   (requires bora/.env with ELEVENLABS_API_KEY)
 *
 * Phase 3 speaks via ElevenLabs TTS → Recall Output Audio. There is no single ELEVENLABS_VOICE_ID:
 * the voice is chosen per-org in the UI from the account's voice list. This probe is SAFE/read-only
 * (GET /v1/voices — lists voices, synthesizes nothing) and prints the available voices so we know
 * what the picker will show.
 *
 * Auth: header `xi-api-key: <key>` (NOT Bearer).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(here, "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env */
}

const KEY = process.env.ELEVENLABS_API_KEY ?? "";
const BASE = "https://api.elevenlabs.io";

async function main() {
  console.log("ElevenLabs credential check (read-only)\n");

  if (!KEY) {
    console.error("  ✗ ELEVENLABS_API_KEY not set in bora/.env");
    process.exit(1);
  }
  console.log(`  key: ${KEY.slice(0, 6)}…${KEY.slice(-4)}  (len ${KEY.length})\n`);

  // Also fetch the subscription/user to confirm the key + show the tier (read-only).
  try {
    const ures = await fetch(`${BASE}/v1/user/subscription`, { headers: { "xi-api-key": KEY, Accept: "application/json" } });
    if (ures.ok) {
      const u: any = await ures.json().catch(() => null);
      if (u) console.log(`  ✓ tier: ${u.tier ?? "?"} — chars used ${u.character_count ?? "?"}/${u.character_limit ?? "?"}`);
    } else if (ures.status === 401) {
      console.error(`  ✗ 401 Unauthorized — key invalid or revoked.`);
      process.exit(1);
    }
  } catch {
    /* non-fatal; the voices call below is the real test */
  }

  const r = await fetch(`${BASE}/v1/voices`, { headers: { "xi-api-key": KEY, Accept: "application/json" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error(`  ✗ GET /v1/voices → ${r.status} ${t.slice(0, 160)}`);
    if (r.status === 401) console.error("    Key invalid. Check it was copied whole from the ElevenLabs dashboard → Profile → API Key.");
    process.exit(1);
  }

  const body: any = await r.json().catch(() => null);
  const voices: any[] = Array.isArray(body?.voices) ? body.voices : [];
  console.log(`  ✓ ELEVENLABS_API_KEY is VALID. ${voices.length} voices available:\n`);

  for (const v of voices) {
    const cat = v?.category ? ` [${v.category}]` : "";
    const labels = v?.labels ? Object.values(v.labels).filter(Boolean).join(", ") : "";
    console.log(`     • ${String(v?.name ?? "?").padEnd(20)} ${v?.voice_id}${cat}${labels ? `  (${labels})` : ""}`);
  }

  console.log("\n  → No ELEVENLABS_VOICE_ID in .env by design — the org picks a voice in the UI from this list.");
  console.log("    Phase 3 stores the chosen voice_id per bot/org.\n");
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
