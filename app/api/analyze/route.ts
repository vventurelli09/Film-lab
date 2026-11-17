import { NextResponse } from 'next/server';
import { anthropic, COACH_SYSTEM, countToday, frameBlocks, getCtx, jsonError, loadFrames, MODEL, sessionContext, textOf } from '@/lib/server';

export const maxDuration = 120;

export async function POST(req: Request) {
  const ctx = await getCtx(req);
  if (!ctx.ok) return ctx.res;
  const { sb } = ctx;
  try {
    const { sessionId } = await req.json();
    const limit = Number(process.env.DAILY_ANALYSIS_LIMIT || 10);
    if ((await countToday(sb, 'analyses')) >= limit) return jsonError(`Daily analysis limit (${limit}) reached. Try again tomorrow.`, 429);

    const { session, text } = await sessionContext(sb, sessionId);
    if (!session.frame_paths?.length) return jsonError('No frames were saved for this session.');
    const frames = await loadFrames(sb, session.frame_paths, session.frame_times, 40);

    const team = session.session_type === 'team';
    const format = team
      ? `Write a team assessment in markdown with these sections:
## Team summary
## Player by player (one short subsection per visible player: strengths, top fix, cite frames)
## Team patterns (spacing, timing, communication, positioning)
## Practice priorities (top 3 for the whole team)
## What I couldn't see`
      : `Write the analysis in markdown with these sections:
## Summary (2-3 sentences)
## What's working
## Top fixes (numbered, most important first; for each: what you see, cite frames, why it matters, the cue to use)
## Drills (2-4 drills that target the top fixes, with reps)
## What I couldn't see (camera/angle limits, and what footage would help next time)`;

    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 3000,
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

    const content = textOf(msg);
    const { error } = await sb.from('analyses').insert({ session_id: sessionId, content, model: MODEL });
    if (error) throw error;
    await sb.from('film_sessions').update({ status: 'analyzed' }).eq('id', sessionId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return jsonError(e?.message || 'Analysis failed', 500);
  }
}
