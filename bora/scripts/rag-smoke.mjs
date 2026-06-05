/**
 * RAG round-trip smoke test — proves the Butterbase RAG HTTP routes the functions use.
 *
 *   node scripts/rag-smoke.mjs
 *
 * Creates a temp collection, ingests text, polls to ready, queries (raw + synthesized),
 * asserts the sentinel is retrieved, then deletes the collection. Self-cleaning.
 *
 * Routes (service key; path param is the collection NAME):
 *   POST   /v1/{app}/rag/collections                       create
 *   POST   /v1/{app}/rag/collections/{name}/ingest         ingest  -> 202 { documentId, status }
 *   GET    /v1/{app}/rag/collections/{name}/documents/{id} status
 *   POST   /v1/{app}/rag/collections/{name}/query          query   -> { chunks:[{content,score,...}], answer? }
 *   DELETE /v1/{app}/rag/collections/{name}                delete
 */
import { readFileSync } from "node:fs";

for (const raw of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i === -1) continue;
  const k = line.slice(0, i).trim();
  if (!(k in process.env)) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const APP = process.env.BUTTERBASE_APP_ID;
const BASE = process.env.BUTTERBASE_API_BASE ?? "https://api.butterbase.ai";
const KEY = process.env.BUTTERBASE_API_KEY;
const rag = `${BASE}/v1/${APP}/rag/collections`;
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const stamp = String(process.env.STAMP ?? "00").slice(-6);
const coll = `smoke-${stamp}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (res) => { const t = await res.text(); return { ok: res.ok, status: res.status, body: t ? JSON.parse(t) : null }; };
const die = (m, x) => { console.error(`✗ ${m}`, x ?? ""); process.exit(1); };

// 1. create
let r = await j(await fetch(rag, { method: "POST", headers: H, body: JSON.stringify({ name: coll, access_mode: "private", description: "rag-smoke" }) }));
if (!r.ok) die("create collection failed", r.body);
console.log(`✓ created collection ${coll}`);

// 2. ingest
r = await j(await fetch(`${rag}/${coll}/ingest`, { method: "POST", headers: H, body: JSON.stringify({ text: "Bora RAG smoke: the launch code is ZEBRA-42-NEPTUNE.", filename: "smoke.txt" }) }));
if (!r.ok || !r.body.documentId) die("ingest failed", r.body);
const docId = r.body.documentId;
console.log(`✓ ingested doc ${docId.slice(0, 8)}… (status ${r.body.status})`);

// 3. poll to ready
let status = r.body.status;
for (let i = 0; i < 12 && status !== "ready"; i++) {
  await sleep(2000);
  r = await j(await fetch(`${rag}/${coll}/documents/${docId}`, { headers: H }));
  status = r.body?.status;
  if (status === "failed") die("ingestion failed", r.body);
}
if (status !== "ready") die(`doc never reached ready (last: ${status})`);
console.log(`✓ doc embedded → ready`);

// 4. query (raw) — sentinel must be retrieved
r = await j(await fetch(`${rag}/${coll}/query`, { method: "POST", headers: H, body: JSON.stringify({ query: "what is the launch code?", top_k: 3 }) }));
if (!r.ok) die("query failed", r.body);
const hit = (r.body.chunks ?? []).some((c) => c.content.includes("ZEBRA-42-NEPTUNE"));
if (!hit) die("sentinel not retrieved", r.body);
console.log(`✓ query retrieved the sentinel chunk (score ${r.body.chunks[0].score.toFixed(3)})`);

// 5. query (synthesized answer)
r = await j(await fetch(`${rag}/${coll}/query`, { method: "POST", headers: H, body: JSON.stringify({ query: "what is the launch code?", top_k: 3, synthesize: true }) }));
if (!r.ok || !r.body.answer) die("synthesized query failed", r.body);
console.log(`✓ synthesized answer: "${r.body.answer.slice(0, 70)}…"`);

// 6. cleanup — delete the collection
r = await j(await fetch(`${rag}/${coll}`, { method: "DELETE", headers: { Authorization: `Bearer ${KEY}` } }));
if (!r.ok && r.status !== 204) console.warn(`⚠ delete returned ${r.status} (collection ${coll} may need manual cleanup)`);
else console.log(`✓ deleted collection ${coll}`);

console.log("\n✓ ALL PASS — RAG ingest + query round-trip works");
