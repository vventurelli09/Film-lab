import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

export function anthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export const jsonError = (error: string, status = 400) => NextResponse.json({ error }, { status });

type Ctx = { ok: true; sb: SupabaseClient; user: User } | { ok: false; res: NextResponse };

/** Verifies the caller's login, invite list and server config. All DB calls run as that user (RLS). */
export async function getCtx(req: Request): Promise<Ctx> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, res: jsonError('Supabase env vars are missing in Vercel.', 500) };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, res: jsonError('ANTHROPIC_API_KEY is missing in Vercel.', 500) };

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, res: jsonError('Please sign in again.', 401) };

  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return { ok: false, res: jsonError('Please sign in again.', 401) };

  const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email || '').toLowerCase())) {
    return { ok: false, res: jsonError('This beta is invite-only.', 403) };
  }
  return { ok: true, sb, user: data.user };
}

/** Rows this user created in the last 24 hours in a table, optionally filtered. */
export async function countToday(sb: SupabaseClient, table: string, filter?: (q: any) => any) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let q = sb.from(table).select('id', { count: 'exact', head: true }).gte('created_at', since.toISOString());
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

/** Downloads up to `max` evenly spaced frames from storage as base64 images. */
export async function loadFrames(sb: SupabaseClient, paths: string[], times: number[], max: number) {
  let idx = paths.map((_, i) => i);
  if (idx.length > max) idx = Array.from({ length: max }, (_, k) => Math.round((k * (paths.length - 1)) / (max - 1)));
  return Promise.all(
    idx.map(async (i) => {
      const { data, error } = await sb.storage.from('film').download(paths[i]);
      if (error || !data) throw new Error('Could not load saved frames.');
      return { t: Number(times[i] ?? i), data: Buffer.from(await data.arrayBuffer()).toString('base64') };
    }),
  );
}

export function frameBlocks(frames: { t: number; data: string }[]): Anthropic.ContentBlockParam[] {
  return frames.flatMap((f) => [
    { type: 'text' as const, text: `Frame at ${f.t.toFixed(2)}s` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.data } },
  ]);
}

/** Everything the AI should know about a session: athletes, notes and the user's standing rules. */
export async function sessionContext(sb: SupabaseClient, sessionId: string) {
  const { data: s, error } = await sb.from('film_sessions').select('*').eq('id', sessionId).single();
  if (error || !s) throw new Error('Session not found.');
  const [{ data: athletes }, { data: rules }, { data: profile }] = await Promise.all([
    s.athlete_ids?.length ? sb.from('athletes').select('*').in('id', s.athlete_ids) : Promise.resolve({ data: [] as any[] }),
    sb.from('ai_rules').select('*'),
    sb.from('profiles').select('*').maybeSingle(),
  ]);
  const relevantRules = (rules || []).filter(
    (r: any) => (!r.sport || r.sport === s.sport) && (!r.athlete_id || s.athlete_ids?.includes(r.athlete_id)),
  );
  const athleteText = (athletes || [])
    .map((a: any) =>
      `- ${a.name}: ${[a.position, a.level, a.bats && `bats ${a.bats}`, a.throws && `throws ${a.throws}`, a.notes].filter(Boolean).join(', ')}`,
    )
    .join('\n');
  const rulesText = relevantRules
    .map((r: any) => `- ${r.note}${r.athlete_id ? ` (for ${(athletes || []).find((a: any) => a.id === r.athlete_id)?.name ?? 'this athlete'})` : ''}`)
    .join('\n');
  const text = [
    `Sport: ${s.sport}. Session type: ${s.session_type}. Focus: ${s.focus || 'general'}.`,
    `Viewer role: ${profile?.role || 'coach'}.`,
    athleteText && `Athletes in this film:\n${athleteText}`,
    s.notes && `Notes from the user: ${s.notes}`,
    rulesText && `Standing coaching rules from this user (always follow these; they override your defaults):\n${rulesText}`,
  ].filter(Boolean).join('\n\n');
  return { session: s, athletes: athletes || [], text };
}

export const COACH_SYSTEM = `You are Film Lab, an expert sports coach and video analyst working with youth and amateur athletes, their coaches and parents.
You see still frames sampled from a video clip, each labeled with its timestamp. Base everything you say on what the frames actually show.
Talk like a coach, not a lab report: describe what happens in general terms ("early in the load", "at contact", "on the finish"). Do not cite timestamps or frame numbers unless the user asks for a frame-by-frame or timing breakdown.
Do not give advice on how to film, camera angles or lighting unless the user asks. If the video quality makes something hard to judge, say so in one short sentence and move on.
Be specific, practical and encouraging. Prioritize the 1-3 changes that will matter most. Adjust language to the viewer's role (coach = technical, parent = plain language, player = direct and motivating).
Never comment on an athlete's body or appearance beyond what affects mechanics.`;

export function textOf(msg: Anthropic.Message) {
  return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
}

/**
 * Calls Claude and returns its text. Newer models think before answering and that
 * thinking counts toward max_tokens, so the limit is generous. Never returns empty text.
 */
export async function ask(params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model' | 'max_tokens'>, maxTokens = 16000) {
  const msg = await anthropic().messages.create({ model: MODEL, max_tokens: maxTokens, ...params });
  const text = textOf(msg);
  console.log('claude', { model: MODEL, stop: msg.stop_reason, blocks: msg.content.map((b) => b.type), usage: msg.usage });
  if (!text) {
    throw new Error(
      msg.stop_reason === 'max_tokens'
        ? 'The AI ran out of room before answering. Try again.'
        : msg.stop_reason === 'refusal'
          ? 'The AI declined to analyze this clip.'
          : `The AI returned an empty answer (${msg.stop_reason}). Try again.`,
    );
  }
  return text;
}
