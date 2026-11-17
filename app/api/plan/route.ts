import { NextResponse } from 'next/server';
import { anthropic, COACH_SYSTEM, countToday, getCtx, jsonError, MODEL, sessionContext, textOf } from '@/lib/server';

export const maxDuration = 90;

export async function POST(req: Request) {
  const ctx = await getCtx(req);
  if (!ctx.ok) return ctx.res;
  const { sb } = ctx;
  try {
    const { sessionId, athleteId, instructions } = await req.json();
    if ((await countToday(sb, 'plans')) >= 20) return jsonError('Daily plan limit reached.', 429);

    const { athletes, text } = await sessionContext(sb, sessionId);
    const [{ data: analysis }, { data: history }] = await Promise.all([
      sb.from('analyses').select('content').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('messages').select('role, content').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(30),
    ]);
    if (!analysis) return jsonError('Run the analysis first.');
    const who = athletes.find((a: any) => a.id === athleteId)?.name || (athletes.length > 1 ? 'the whole team' : athletes[0]?.name || 'the athlete');
    const chat = (history || []).map((m: any) => `${m.role}: ${m.content}`).join('\n');

    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: COACH_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${text}

Analysis:
${analysis.content}

${chat ? `Follow-up conversation (the user's corrections take priority):\n${chat}\n` : ''}
Build a 2-week practice action plan for ${who} that targets the top fixes.
${instructions ? `The user asked: ${instructions}\n` : ''}
Reply with ONLY JSON, no markdown, in this shape:
{"title": "short plan name", "items": [{"title": "drill or habit", "detail": "how to do it and the cue to use", "dose": "e.g. 3x10 swings", "frequency": "e.g. 4x per week"}]}
Use 3 to 6 items.`,
        },
      ],
    });

    const raw = textOf(msg);
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const { data, error } = await sb
      .from('plans')
      .insert({ session_id: sessionId, athlete_id: athleteId || null, title: json.title || 'Practice plan', items: json.items || [], status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ plan: data });
  } catch (e: any) {
    console.error(e);
    return jsonError(e instanceof SyntaxError ? 'The AI returned a plan I could not read. Try again.' : e?.message || 'Plan failed', 500);
  }
}
