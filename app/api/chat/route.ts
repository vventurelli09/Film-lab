import { NextResponse } from 'next/server';
import { anthropic, COACH_SYSTEM, countToday, frameBlocks, getCtx, jsonError, loadFrames, MODEL, sessionContext, textOf } from '@/lib/server';

export const maxDuration = 90;

export async function POST(req: Request) {
  const ctx = await getCtx(req);
  if (!ctx.ok) return ctx.res;
  const { sb } = ctx;
  try {
    const { sessionId, message } = await req.json();
    if (!message?.trim()) return jsonError('Message is empty.');
    const limit = Number(process.env.DAILY_CHAT_LIMIT || 60);
    if ((await countToday(sb, 'messages', (q) => q.eq('role', 'assistant'))) >= limit) {
      return jsonError(`Daily chat limit (${limit}) reached.`, 429);
    }

    const { session, text } = await sessionContext(sb, sessionId);
    const [{ data: analysis }, { data: history }] = await Promise.all([
      sb.from('analyses').select('content').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('messages').select('role, content').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(30),
    ]);
    await sb.from('messages').insert({ session_id: sessionId, role: 'user', content: message });

    const frames = session.frame_paths?.length ? await loadFrames(sb, session.frame_paths, session.frame_times, 8) : [];
    const system = `${COACH_SYSTEM}

You are now in a follow-up conversation about one film session. The user may ask questions, push back, or correct you.
If they correct you, take it seriously: re-check the frames, say plainly whether you agree, and update your advice.
If a correction sounds like something that should apply to all future film (a coaching philosophy, a known injury limit, a team system), suggest they tap "Save as coaching rule" so you remember it.
Keep replies short enough to read on a phone unless they ask for detail.`;

    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${text}\n\nKey frames from the clip:` },
            ...frameBlocks(frames),
            { type: 'text', text: `Your earlier analysis:\n${analysis?.content || '(none yet)'}` },
          ],
        },
        { role: 'assistant', content: 'Got it. I have the frames and my analysis in front of me.' },
        ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ],
    });

    const reply = textOf(msg);
    await sb.from('messages').insert({ session_id: sessionId, role: 'assistant', content: reply });
    return NextResponse.json({ reply });
  } catch (e: any) {
    console.error(e);
    return jsonError(e?.message || 'Chat failed', 500);
  }
}
