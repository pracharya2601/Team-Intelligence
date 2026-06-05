/**
 * Read-only Recall.ai credential check.
 *
 * Run: npm run check:recall   (requires bora/.env with RECALL_API_KEY)
 *
 * What it does: a SAFE, read-only probe — `GET /api/v1/bot` (list bots) against each Recall
 * region with `Authorization: Token <RECALL_API_KEY>`. It creates nothing and joins no meeting.
 *
 * Recall has 4 data-isolated regions, each with its OWN credentials (a key is valid in exactly
 * one region). We don't yet have RECALL_REGION in .env, so we probe all four: the region that
 * returns 200 is the key's home region (and proves the key works). 401 = invalid for that region.
 *
 * On success it prints the region to set as RECALL_REGION and the bot count visible to the key.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- tiny .env loader (same pattern as scripts/check.ts) ---
const here = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(here, "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env */
}

const KEY = process.env.RECALL_API_KEY ?? "";
const HINTED = process.env.RECALL_REGION?.trim(); // optional; if set we report whether it matches

// All four Recall regions (docs.recall.ai/docs/regions). api.recall.ai == us-east-1.
const REGIONS = ["us-west-2", "us-east-1", "eu-central-1", "ap-northeast-1"] as const;
type Region = (typeof REGIONS)[number];

const baseUrl = (r: Region) => `https://${r}.recall.ai`;

async function probe(region: Region): Promise<{ region: Region; status: number; count: number | null; note: string }> {
  // GET /api/v1/bot — paginated list; ?page_size=1 keeps it tiny. Read-only.
  const url = `${baseUrl(region)}/api/v1/bot/?page_size=1`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Token ${KEY}`, Accept: "application/json" } });
    let count: number | null = null;
    let note = "";
    if (r.ok) {
      const body: any = await r.json().catch(() => null);
      // DRF-style pagination: { count, next, previous, results }
      count = typeof body?.count === "number" ? body.count : Array.isArray(body?.results) ? body.results.length : null;
    } else if (r.status === 401 || r.status === 403) {
      note = "key not valid for this region";
    } else {
      note = await r.text().then((t) => t.slice(0, 140)).catch(() => "");
    }
    return { region, status: r.status, count, note };
  } catch (e) {
    return { region, status: 0, count: null, note: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log("Recall.ai credential check (read-only)\n");

  if (!KEY) {
    console.error("  ✗ RECALL_API_KEY not set in bora/.env");
    process.exit(1);
  }
  console.log(`  key:    ${KEY.slice(0, 6)}…${KEY.slice(-4)}  (len ${KEY.length})`);
  console.log(`  region: ${HINTED ?? "(not set in .env — probing all four)"}\n`);

  // Probe all regions in parallel — only one should authenticate.
  const results = await Promise.all(REGIONS.map(probe));

  for (const res of results) {
    const ok = res.status >= 200 && res.status < 300;
    const mark = ok ? "✓" : res.status === 0 ? "…" : "·";
    const detail = ok
      ? `200 OK — authenticated. bots visible: ${res.count ?? "?"}`
      : `${res.status || "network error"}${res.note ? ` (${res.note})` : ""}`;
    console.log(`  ${mark} ${res.region.padEnd(15)} ${detail}`);
  }

  const winner = results.find((r) => r.status >= 200 && r.status < 300);
  console.log("");

  if (!winner) {
    const any401 = results.some((r) => r.status === 401 || r.status === 403);
    if (any401) {
      console.error("  ✗ Key did not authenticate in ANY region (all 401/403).");
      console.error("    → Double-check RECALL_API_KEY was copied whole, and that it's an API key");
      console.error("      (Authorization: Token …), not a webhook secret.");
    } else {
      console.error("  ✗ No region authenticated; saw network/other errors above.");
    }
    process.exit(1);
  }

  console.log(`  ✓ RECALL_API_KEY is VALID. Home region: ${winner.region}`);
  console.log(`    Base URL for all Recall calls: ${baseUrl(winner.region)}/api/v1/...`);
  if (!HINTED) {
    console.log(`\n  → Add to bora/.env:   RECALL_REGION=${winner.region}`);
  } else if (HINTED !== winner.region) {
    console.log(`\n  ⚠  Your .env RECALL_REGION=${HINTED} but the key authenticates in ${winner.region}.`);
    console.log(`     Set RECALL_REGION=${winner.region} to match the key.`);
  } else {
    console.log(`  ✓ RECALL_REGION=${HINTED} matches the key's region.`);
  }
  console.log("");
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
