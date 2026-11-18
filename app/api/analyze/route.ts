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
## Player by player (### subsection per visible player: strengths, top fix, cite frames)
## Team patterns
## Practice priorities
## What I couldn't see`
      : `Write the breakdown in markdown using exactly these ## sections:
## Summary
(2-3 sentences: overall grade of the movement and the single biggest takeaway)
## What's working
(bullets, cite frames)
## Top fixes
(numbered, most important first. For each: **what you see** with frame times, why it matters, and the one-line cue to use)
## Phase by phase
(short bullets for each phase you can see, e.g. stance, load, stride, launch, contact, finish, with frame times)
## Drills
(2-4 drills that target the top fixes, with reps)
## What I couldn't see
(camera or angle limits, and how to film it next time)`;

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
