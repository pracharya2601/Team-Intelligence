/**
 * Read-only Nebius credential + capability check.
 *
 * Run: npm run check:nebius   (requires bora/.env with NEBIUS_API_KEY)
 *
 * Nebius hosts Bora's ONLY externally-keyed model — the cheap, always-on trigger that emits a
 * SpeakDecision on every transcript window (Phase 3). It's an OpenAI-compatible inference API.
 *
 * This probe is SAFE/read-only-ish (one tiny chat completion, no fine-tunes, no uploads):
 *   1. Finds the working base URL (Token Factory vs legacy AI Studio) via GET /models.
 *   2. Lists the catalog and surfaces small/fast models good for the trigger (Qwen 4B etc.).
 *   3. Round-trips a SpeakDecision with the chosen model to prove JSON structured output works.
 *
 * On success it prints the NEBIUS_API_BASE + NEBIUS_TRIGGER_MODEL to set in .env.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- tiny .env loader (same pattern as scripts/check-recall.ts) ---
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

const KEY = process.env.NEBIUS_API_KEY ?? process.env.Nebius_API_KEY ?? "";
const HINTED_BASE = process.env.NEBIUS_API_BASE?.trim();
const HINTED_MODEL = process.env.NEBIUS_TRIGGER_MODEL?.trim();

// The two base URLs in circulation (rebrand: AI Studio → Token Factory). We probe both.
const BASES = [
  "https://api.tokenfactory.nebius.com/v1",
  "https://api.studio.nebius.ai/v1",
] as const;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function listModels(base: string): Promise<{ ok: boolean; status: number; ids: string[]; note: string }> {
  try {
    const r = await fetch(`${base}/models`, { headers: authHeaders() });
    if (!r.ok) {
      const note = r.status === 401 || r.status === 403 ? "key not valid here" : (await r.text().catch(() => "")).slice(0, 140);
      return { ok: false, status: r.status, ids: [], note };
    }
    const body: any = await r.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.data) ? body.data.map((m: any) => m?.id).filter(Boolean) : [];
    return { ok: true, status: r.status, ids, note: "" };
  } catch (e) {
    return { ok: false, status: 0, ids: [], note: e instanceof Error ? e.message : String(e) };
  }
}

/** Heuristic: small/fast models that suit an always-on trigger. Prefer Qwen ~3-4B, then 7-8B. */
function rankTriggerCandidates(ids: string[]): string[] {
  const score = (id: string) => {
    const s = id.toLowerCase();
    let n = 0;
    if (s.includes("qwen")) n += 5;
    if (/\b(3b|4b)\b/.test(s) || /-4b/.test(s) || /-3b/.test(s)) n += 6;
    if (/-7b/.test(s) || /-8b/.test(s)) n += 3;
    if (s.includes("fast")) n += 4;
    if (s.includes("instruct") || s.includes("-it")) n += 1;
    if (s.includes("llama") && (/-8b/.test(s))) n += 2;
    // de-prioritize big/reasoning models on the hot path
    if (/-70b|-72b|-405b|deepseek|reason|r1/.test(s)) n -= 8;
    return n;
  };
  return [...ids].sort((a, b) => score(b) - score(a)).filter((id) => score(id) > 0);
}

const SPEAK_DECISION_PROMPT = {
  system:
    "You are Bora's meeting trigger. Read the transcript window and decide if the bot should react. " +
    'Reply with ONLY a JSON object: {"speak_now": bool, "should_i_speak": number 0..1, "reason": string, ' +
    '"addressed_name": string|null, "release_gate": bool}. ' +
    "speak_now=true only if Bora is directly addressed by name. release_gate=true only if someone is telling " +
    "Bora to go ahead/speak. No prose, no code fences.",
  user: 'Transcript window:\n"Bora, what did we decide about the launch date?"',
};

async function tryCompletion(base: string, model: string): Promise<{ ok: boolean; status: number; raw: string; parsed: any; note: string }> {
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: SPEAK_DECISION_PROMPT.system },
          { role: "user", content: SPEAK_DECISION_PROMPT.user },
        ],
      }),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, raw: text.slice(0, 200), parsed: null, note: "" };
    const body: any = text ? JSON.parse(text) : null;
    const content: string = body?.choices?.[0]?.message?.content ?? "";
    // strip accidental code fences
    const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // try to extract the first {...}
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { /* leave null */ }
    }
    return { ok: true, status: r.status, raw: content.slice(0, 200), parsed, note: "" };
  } catch (e) {
    return { ok: false, status: 0, raw: "", parsed: null, note: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log("Nebius credential + trigger check (read-only)\n");

  if (!KEY) {
    console.error("  ✗ NEBIUS_API_KEY not set in bora/.env");
    process.exit(1);
  }
  console.log(`  key:  ${KEY.slice(0, 8)}…${KEY.slice(-4)}  (len ${KEY.length})`);
  console.log(`  base: ${HINTED_BASE ?? "(not set — probing both Token Factory + AI Studio)"}\n`);

  const basesToTry = HINTED_BASE ? [HINTED_BASE] : [...BASES];
  let workingBase = "";
  let modelIds: string[] = [];

  for (const base of basesToTry) {
    const res = await listModels(base);
    const mark = res.ok ? "✓" : res.status === 0 ? "…" : "·";
    console.log(`  ${mark} ${base.padEnd(42)} ${res.ok ? `200 OK — ${res.ids.length} models` : `${res.status || "network error"}${res.note ? ` (${res.note})` : ""}`}`);
    if (res.ok && !workingBase) {
      workingBase = base;
      modelIds = res.ids;
    }
  }
  console.log("");

  if (!workingBase) {
    console.error("  ✗ Key did not authenticate at either base URL.");
    console.error("    → The pasted token looks like a Nebius IAM/service-account token (v1.Cm…).");
    console.error("      The inference API wants an AI Studio / Token Factory key. In the Nebius");
    console.error("      console open AI Studio (Token Factory) → API keys → create key, and paste THAT.");
    process.exit(1);
  }

  console.log(`  ✓ Authenticated. NEBIUS_API_BASE=${workingBase}\n`);

  // Pick a model: honor .env hint, else best small/fast candidate.
  const candidates = rankTriggerCandidates(modelIds);
  const model = HINTED_MODEL || candidates[0] || modelIds[0] || "";
  if (candidates.length) {
    console.log("  Suggested trigger models (small/fast first):");
    for (const id of candidates.slice(0, 6)) console.log(`     • ${id}`);
    console.log("");
  }
  if (!model) {
    console.error("  ✗ No models visible to this key. Check the account has inference access.");
    process.exit(1);
  }

  console.log(`  Probing structured output with: ${model}`);
  const c = await tryCompletion(workingBase, model);
  if (!c.ok) {
    console.error(`  ✗ chat/completions failed: ${c.status || "network"} ${c.note} ${c.raw}`);
    process.exit(1);
  }
  console.log(`  raw → ${c.raw}`);
  if (c.parsed && typeof c.parsed.speak_now === "boolean" && typeof c.parsed.should_i_speak === "number") {
    console.log(`  ✓ Valid SpeakDecision JSON — speak_now=${c.parsed.speak_now}, should_i_speak=${c.parsed.should_i_speak}, addressed=${c.parsed.addressed_name ?? "null"}`);
    console.log(`    (For "Bora, what did we decide…?" speak_now SHOULD be true.)\n`);
  } else {
    console.log("  ⚠  Got a completion but couldn't parse a SpeakDecision — the model may need a tighter");
    console.log("     prompt or a smaller/instruct model. The key + base are valid, though.\n");
  }

  console.log("  → Add to bora/.env:");
  console.log(`       NEBIUS_API_BASE=${workingBase}`);
  console.log(`       NEBIUS_TRIGGER_MODEL=${model}`);
  console.log("");
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
