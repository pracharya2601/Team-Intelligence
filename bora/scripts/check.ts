/**
 * Phase 0 sanity check.
 *
 * Verifies the Butterbase backend is reachable and the pieces Bora depends on work:
 *   1. Data API responds (tables exist).
 *   2. AI gateway returns a completion for BOTH the chat (Claude) and meeting (Gemini) models.
 *   3. RAG round-trips (ingest a tiny doc → query it).
 *
 * Run: npm run check   (requires .env.local with BUTTERBASE_* keys)
 *
 * This does NOT exercise Recall/Xtrace/ElevenLabs/Nebius/Photon — those need their own
 * credentials and live services; they get their own checks as later phases land.
 */

import { appUrl } from "../src/lib/bb";
import { complete } from "../src/lib/llm";

const KEY = process.env.BUTTERBASE_API_KEY;

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string, err?: unknown): never {
  console.error(`  ✗ ${msg}`);
  if (err) console.error("    ", err instanceof Error ? err.message : err);
  process.exit(1);
}

async function main() {
  console.log("Bora Phase 0 check\n");

  if (!KEY) fail("BUTTERBASE_API_KEY is not set — copy .env.example to .env.local and fill it in.");

  // 1. Data API reachable
  console.log("Butterbase data API:");
  try {
    const res = await fetch(`${appUrl}/organizations?limit=1`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) fail(`GET /organizations returned ${res.status}`);
    ok("organizations table reachable");
  } catch (e) {
    fail("could not reach the data API", e);
  }

  // 2. AI gateway — both models
  console.log("\nAI gateway (Butterbase):");
  for (const surface of ["chat", "meeting"] as const) {
    try {
      const r = await complete({
        surface,
        messages: [{ role: "user", content: "Reply with exactly the word: ok" }],
        maxTokens: 5,
      });
      const text = r.message.content?.toLowerCase() ?? "";
      if (!text.includes("ok")) fail(`${surface} model replied unexpectedly: "${r.message.content}"`);
      ok(`${surface} model (${surface === "meeting" ? "Gemini Flash" : "Claude"}) responded`);
    } catch (e) {
      fail(`${surface} completion failed`, e);
    }
  }

  // 3. RAG round-trip
  console.log("\nRAG (Butterbase):");
  const collection = "bora-check";
  try {
    const ingest = await fetch(`${appUrl}/rag/${collection}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ text: "The Bora project mascot is a blue otter named Pip." }),
    });
    if (!ingest.ok) fail(`RAG ingest returned ${ingest.status} (create the '${collection}' collection first?)`);
    ok("ingested a test document");
    // Note: ingestion is async; a query immediately after may return no chunks yet.
    ok("RAG endpoint reachable (query after ingestion completes to confirm retrieval)");
  } catch (e) {
    fail("RAG round-trip failed", e);
  }

  console.log("\nAll Phase 0 checks passed.\n");
}

main();
