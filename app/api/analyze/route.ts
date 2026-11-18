import { NextResponse } from 'next/server';
import { ask, COACH_SYSTEM, countToday, frameBlocks, getCtx, jsonError, loadFrames, sessionContext } from '@/lib/server';

export const maxDuration = 300;

export async function POST(req: Request) {
  const ctx = await getCtx(req);
  if (!ctx.ok) return ctx.res;
  const { sb } = ctx;
  const { sessionId } = await req.json();
  try {
    const limit = Number(process.env.DAILY_ANALYSIS_LIMIT || 10);
    if ((await countToday(sb, 'analyses')) >= limit) return jsonError(`Daily analysis limit (${limit}) reached. Try again tomorrow.`, 429);

    const { session, text } = await sessionContext(sb, sessionId);
    if (!session.frame_paths?.length) return jsonError('No frames were saved for this session.');
    await sb.from('film_sessions').update({ status: 'analyzing', error: null, analysis_started_at: new Date().toISOString() }).eq('id', sessionId);

    const frames = await loadFrames(sb, session.frame_paths, session.frame_times, 40);
    const team = session.session_type === 'team';
    const format = team
      ? `Write a team assessment in markdown using exactly these ## sections:
## Summary
(2-3 sentences. If video quality limits the read, say so in one sentence.)
## Player by player
(### subsection per visible player: one strength, one top fix)
## Team patterns
## Practice priorities
(top 3 for the whole team)`
      : `Write the breakdown in markdown using exactly these ## sections. Keep it tight and readable on a phone.
## Summary
(2-3 sentences: how the movement looks overall and the single biggest takeaway. If video quality limits the read, say so in one sentence.)
## What's working
(2-4 short bullets)
## Top fixes
(1-3 numbered fixes, most important first. For each: **what's happening**, why it matters, and a one-line cue in quotes.)
## Drills
(2-3 drills that target the top fixes, each with reps)

No timestamps, no frame-by-frame narration, no filming advice.`;

    const content = await ask({
      system: COACH_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${text}\n\nFrames sampled every ${session.frame_interval}s from ${session.clip_start}s to ${session.clip_end}s:` },
            ...frameBlocks(frames),
            { type: 'text', text: format },
          ],
        },
      ],
    });

    const { error } = await sb.from('analyses').insert({ session_id: sessionId, content });
    if (error) throw error;
    await sb.from('film_sessions').update({ status: 'analyzed' }).eq('id', sessionId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    await sb.from('film_sessions').update({ status: 'error', error: e?.message || 'Analysis failed' }).eq('id', sessionId);
    return jsonError(e?.message || 'Analysis failed', 500);
  }
}
