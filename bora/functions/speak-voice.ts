// Function: speak-voice  (HTTP trigger, auth: required)
//
// Per-org voice selection for Bora (Phase 3). Two actions:
//   { action: "list" }                         → the ElevenLabs voices available (proxied so the
//                                                 key stays server-side), + the org's current voice_id.
//   { action: "set", org_id, voice_id }         → admin-only; writes bots.voice_id.
//
// Reading voices needs org membership (any active member); changing the voice is admin-only (same
// rule as other bots writes — RLS is admin-only on bots, so we use the service key after the check).
//
// Deploy with envVars: { ELEVENLABS_API_KEY, BUTTERBASE_API_KEY }.  (URL/APP_ID auto-injected.)

interface FnCtx {
  user?: { id?: string } | null;
  env: Record<string, string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
}

export default async function handler(req: Request, ctx: FnCtx): Promise<Response> {
  const userId = ctx.user?.id ?? req.headers.get("x-user-id");
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const action = String(body?.action ?? "list");
  const orgId = String(body?.orgId ?? body?.org_id ?? "").trim();
  if (!orgId) return json({ error: { message: "orgId is required" } }, 400);

  // Caller must be an active member of the org (any role can read; admin to set).
  const { rows: memRows } = await ctx.db.query(
    `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
    [orgId, userId],
  );
  if (!memRows.length) return json({ error: { message: "Not a member of this org" } }, 403);
  const isAdmin = memRows[0].role === "admin";

  try {
    if (action === "set") {
      if (!isAdmin) return json({ error: { message: "Only an admin can change Bora's voice" } }, 403);
      const voiceId = String(body?.voiceId ?? body?.voice_id ?? "").trim() || null;
      const { rows: bots } = await ctx.db.query(`SELECT id FROM bots WHERE org_id = $1 LIMIT 1`, [orgId]);
      if (bots[0]) {
        await ctx.db.query(`UPDATE bots SET voice_id = $1 WHERE id = $2`, [voiceId, bots[0].id]);
      } else {
        await ctx.db.query(`INSERT INTO bots (org_id, name, voice_id) VALUES ($1, 'Bora', $2)`, [orgId, voiceId]);
      }
      return json({ ok: true, voice_id: voiceId });
    }

    // action === "list"
    const { rows: bots } = await ctx.db.query(`SELECT voice_id FROM bots WHERE org_id = $1 LIMIT 1`, [orgId]);
    const current = bots[0]?.voice_id ?? null;

    const voices = await listVoices(ctx.env.ELEVENLABS_API_KEY);
    return json({ voices, current });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

interface VoiceOption {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

async function listVoices(apiKey: string): Promise<VoiceOption[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}`);
  const body: any = await res.json();
  const voices: any[] = Array.isArray(body?.voices) ? body.voices : [];
  return voices.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    labels: v.labels ?? undefined,
    preview_url: v.preview_url ?? null,
  }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
