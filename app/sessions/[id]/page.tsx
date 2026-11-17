'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { api, sb } from '@/lib/supabase';
import { sportLabel } from '@/lib/sports';

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<any>(null);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [frames, setFrames] = useState<{ t: number; url: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data: session } = await sb().from('film_sessions').select('*').eq('id', id).single();
    if (!session) return;
    setS(session);
    const [a, an, m, p] = await Promise.all([
      session.athlete_ids.length ? sb().from('athletes').select('*').in('id', session.athlete_ids) : Promise.resolve({ data: [] as any[] }),
      sb().from('analyses').select('*').eq('session_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb().from('messages').select('*').eq('session_id', id).order('created_at'),
      sb().from('plans').select('*').eq('session_id', id).order('created_at', { ascending: false }),
    ]);
    setAthletes(a.data || []);
    setAnalysis(an.data);
    setMessages(m.data || []);
    setPlans(p.data || []);
    const planIds = (p.data || []).map((x: any) => x.id);
    if (planIds.length) {
      const { data } = await sb().from('plan_logs').select('*').in('plan_id', planIds).order('done_on', { ascending: false });
      setLogs(data || []);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!s) return;
    const store = sb().storage.from('film');
    if (s.video_path) store.createSignedUrl(s.video_path, 3600).then(({ data }) => setVideoUrl(data?.signedUrl || ''));
    if (s.frame_paths.length) {
      store.createSignedUrls(s.frame_paths, 3600).then(({ data }) =>
        setFrames((data || []).map((d, i) => ({ t: Number(s.frame_times[i]), url: d.signedUrl || '' }))),
      );
    }
  }, [s?.id]); // eslint-disable-line

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label); setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); }
    setBusy('');
  }

  if (!s) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{s.title}</h1>
        <p className="text-xs text-slate-400">
          {sportLabel(s.sport)} · {s.session_type} · {s.focus} · {athletes.map((a) => a.name).join(', ')}
        </p>
      </div>

      {videoUrl && <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />}

      {frames.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Frames the AI saw ({frames.length} · every {s.frame_interval}s)</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {frames.map((f) => (
              <a key={f.t} href={f.url} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`${f.t}s`} className="h-24 rounded-lg border border-line" />
                <div className="text-center text-[11px] text-slate-400">{f.t.toFixed(2)}s</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {err && <p className="card text-sm text-red-300">{err}</p>}

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">AI analysis</h2>
          <button className="text-sm text-slate-400 underline" disabled={!!busy} onClick={() => run('analyze', () => api('/api/analyze', { sessionId: id }))}>
            {busy === 'analyze' ? 'Analyzing…' : analysis ? 'Re-run' : 'Run analysis'}
          </button>
        </div>
        {busy === 'analyze' && <p className="text-sm text-slate-400">The AI is watching your film (30–60 sec)…</p>}
        {analysis ? (
          <>
            <div className="md text-[15px]"><ReactMarkdown>{analysis.content}</ReactMarkdown></div>
            <Rating analysis={analysis} onDone={load} />
          </>
        ) : busy !== 'analyze' && <p className="text-sm text-slate-400">No analysis yet. Tap Run analysis.</p>}
      </section>

      {analysis && <TeachAI session={s} athletes={athletes} />}
      {analysis && <Chat id={id} messages={messages} reload={load} />}
      {analysis && <Plans session={s} athletes={athletes} plans={plans} logs={logs} reload={load} busy={busy} run={run} />}
    </div>
  );
}

function Rating({ analysis, onDone }: { analysis: any; onDone: () => void }) {
  const rate = async (v: number) => {
    await sb().from('analyses').update({ rating: v }).eq('id', analysis.id);
    onDone();
  };
  return (
    <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-sm text-slate-400">
      Was this useful?
      <button className={`chip py-1 ${analysis.rating === 1 ? 'chip-on' : ''}`} onClick={() => rate(1)}>👍</button>
      <button className={`chip py-1 ${analysis.rating === -1 ? 'chip-on' : ''}`} onClick={() => rate(-1)}>👎</button>
      {analysis.rating === -1 && <span className="text-xs">Tell the AI what it got wrong in the chat below.</span>}
    </div>
  );
}

function TeachAI({ session, athletes }: { session: any; athletes: any[] }) {
  const [note, setNote] = useState('');
  const [scope, setScope] = useState('sport');
  const [saved, setSaved] = useState('');

  async function save() {
    if (!note.trim()) return;
    const { error } = await sb().from('ai_rules').insert({
      note: note.trim(),
      sport: session.sport,
      athlete_id: scope === 'sport' ? null : scope,
    });
    setSaved(error ? error.message : 'Saved. The AI will follow this on all future film.');
    if (!error) setNote('');
  }

  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Save as coaching rule</h2>
      <p className="text-xs text-slate-400">Teach the AI something it should always remember, like &quot;We teach a no-stride approach&quot; or &quot;She&apos;s coming back from a shoulder injury, so no long-toss.&quot;</p>
      <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your rule…" />
      <div className="flex gap-2">
        <select className="input flex-1" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="sport">All {sportLabel(session.sport)} film</option>
          {athletes.map((a) => <option key={a.id} value={a.id}>Only {a.name}</option>)}
        </select>
        <button className="btn-ghost" onClick={save}>Save</button>
      </div>
      {saved && <p className="text-xs text-emerald-400">{saved}</p>}
    </section>
  );
}

function Chat({ id, messages, reload }: { id: string; messages: any[]; reload: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState('');
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, pending]);

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setText(''); setPending(msg); setErr('');
    try { await api('/api/chat', { sessionId: id, message: msg }); await reload(); }
    catch (e: any) { setErr(e.message); setText(msg); }
    setPending('');
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Ask about this film</h2>
      <div className="space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={`rounded-xl px-3 py-2 text-[15px] ${m.role === 'user' ? 'ml-8 bg-accent/15' : 'mr-4 bg-ink'}`}>
            {m.role === 'assistant' ? <div className="md"><ReactMarkdown>{m.content}</ReactMarkdown></div> : m.content}
          </div>
        ))}
        {pending && (
          <>
            <div className="ml-8 rounded-xl bg-accent/15 px-3 py-2 text-[15px]">{pending}</div>
            <div className="mr-4 rounded-xl bg-ink px-3 py-2 text-sm text-slate-400">Thinking…</div>
          </>
        )}
        <div ref={end} />
      </div>
      {messages.length === 0 && !pending && (
        <div className="flex flex-wrap gap-2">
          {['What should we fix first?', 'Explain this like I’m a parent', 'You got something wrong:'].map((q) => (
            <button key={q} className="chip text-xs" onClick={() => setText(q)}>{q}</button>
          ))}
        </div>
      )}
      {err && <p className="text-sm text-red-300">{err}</p>}
      <div className="flex gap-2">
        <textarea className="input flex-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask, push back, or correct the AI…" />
        <button className="btn" disabled={!!pending} onClick={send}>Send</button>
      </div>
    </section>
  );
}

function Plans({ session, athletes, plans, logs, reload, busy, run }: any) {
  const [who, setWho] = useState(athletes.length === 1 ? athletes[0].id : '');
  const [ask, setAsk] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const generate = () => run('plan', () => api('/api/plan', { sessionId: session.id, athleteId: who || null, instructions: ask }));

  return (
    <section id="plan" className="card space-y-4">
      <h2 className="font-semibold">Practice action plan</h2>

      {plans.map((p: any) => (
        <PlanCard key={p.id} plan={p} logs={logs.filter((l: any) => l.plan_id === p.id)} today={today} reload={reload} athletes={athletes} />
      ))}

      <div className="space-y-2 border-t border-line pt-3">
        <p className="text-xs text-slate-400">{plans.length ? 'Want a different plan?' : 'Turn the analysis into a 2-week plan. Review it, edit it, then approve to start tracking.'}</p>
        {athletes.length > 1 && (
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Whole team</option>
            {athletes.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Optional: e.g. 'only 3 days a week, no tee available'" />
        <button className="btn w-full" disabled={!!busy} onClick={generate}>{busy === 'plan' ? 'Building plan…' : 'Generate plan'}</button>
      </div>
    </section>
  );
}

function PlanCard({ plan, logs, today, reload, athletes }: any) {
  const [items, setItems] = useState<any[]>(plan.items);
  useEffect(() => setItems(plan.items), [plan.items]);
  const who = athletes.find((a: any) => a.id === plan.athlete_id)?.name;

  const edit = (i: number, k: string, v: string) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const approve = async () => {
    await sb().from('plans').update({ items, status: 'approved', approved_at: new Date().toISOString() }).eq('id', plan.id);
    reload();
  };
  const discard = async () => { if (confirm('Delete this plan?')) { await sb().from('plans').delete().eq('id', plan.id); reload(); } };
  const complete = async () => { await sb().from('plans').update({ status: 'completed' }).eq('id', plan.id); reload(); };
  const toggleToday = async (i: number) => {
    const done = logs.find((l: any) => l.item_index === i && l.done_on === today);
    if (done) await sb().from('plan_logs').delete().eq('id', done.id);
    else await sb().from('plan_logs').insert({ plan_id: plan.id, item_index: i });
    reload();
  };

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-medium">{plan.title}</div>
          <div className="text-xs text-slate-400">{who ? `${who} · ` : ''}{plan.status}</div>
        </div>
        {plan.status === 'approved' && <button className="text-xs text-slate-400 underline" onClick={complete}>Mark complete</button>}
      </div>

      <div className="space-y-3">
        {items.map((it, i) => {
          const count = logs.filter((l: any) => l.item_index === i).length;
          const doneToday = logs.some((l: any) => l.item_index === i && l.done_on === today);
          return plan.status === 'draft' ? (
            <div key={i} className="space-y-1">
              <div className="flex gap-2">
                <input className="input py-2 font-medium" value={it.title} onChange={(e) => edit(i, 'title', e.target.value)} />
                <button className="text-red-300" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
              </div>
              <textarea className="input py-2 text-sm" rows={2} value={it.detail} onChange={(e) => edit(i, 'detail', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className="input py-2 text-sm" value={it.dose || ''} onChange={(e) => edit(i, 'dose', e.target.value)} placeholder="Dose" />
                <input className="input py-2 text-sm" value={it.frequency || ''} onChange={(e) => edit(i, 'frequency', e.target.value)} placeholder="How often" />
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-3">
              {plan.status === 'approved' && (
                <button onClick={() => toggleToday(i)} className={`mt-1 h-7 w-7 shrink-0 rounded-lg border ${doneToday ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-line'}`}>
                  {doneToday ? '✓' : ''}
                </button>
              )}
              <div>
                <div className="font-medium">{it.title}</div>
                <div className="text-sm text-slate-300">{it.detail}</div>
                <div className="text-xs text-slate-500">{[it.dose, it.frequency, `done ${count}x`].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          );
        })}
      </div>

      {plan.status === 'draft' && (
        <div className="mt-3 flex gap-2">
          <button className="btn flex-1" onClick={approve}>Approve &amp; start tracking</button>
          <button className="btn-ghost" onClick={discard}>Discard</button>
        </div>
      )}
      {plan.status === 'approved' && <p className="mt-2 text-xs text-slate-500">Tap a box when it&apos;s done today.</p>}
    </div>
  );
}
