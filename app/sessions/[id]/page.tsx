'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import PlanCard from '@/components/PlanCard';
import { AutoTextarea, Avatar, Empty, Sheet, Spinner, Tabs } from '@/components/ui';
import { api, sb } from '@/lib/supabase';
import { sportLabel } from '@/lib/sports';

const STEPS = ['Loading frames', 'Reading the setup', 'Following the motion', 'Finding the top fixes', 'Picking drills'];

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
  const [viewer, setViewer] = useState<number | null>(null);
  const [tab, setTab] = useState('breakdown');
  const [err, setErr] = useState('');
  const started = useRef(false);

  const load = useCallback(async () => {
    const { data: session } = await sb().from('film_sessions').select('*').eq('id', id).single();
    if (!session) return;
    setS(session);
    const [a, an, m, p] = await Promise.all([
      session.athlete_ids.length ? sb().from('athletes').select('*').in('id', session.athlete_ids) : Promise.resolve({ data: [] as any[] }),
      sb().from('analyses').select('*').eq('session_id', id).neq('content', '').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb().from('messages').select('*').eq('session_id', id).neq('content', '').order('created_at'),
      sb().from('plans').select('*').eq('session_id', id).order('created_at', { ascending: false }),
    ]);
    setAthletes(a.data || []);
    setAnalysis(an.data);
    setMessages(m.data || []);
    setPlans(p.data || []);
    const ids = (p.data || []).map((x: any) => x.id);
    setLogs(ids.length ? (await sb().from('plan_logs').select('*').in('plan_id', ids)).data || [] : []);
    return session;
  }, [id]);

  const runAnalysis = useCallback(async () => {
    setErr('');
    setS((x: any) => ({ ...x, status: 'analyzing', analysis_started_at: new Date().toISOString() }));
    await sb().from('film_sessions').update({ status: 'analyzing', analysis_started_at: new Date().toISOString() }).eq('id', id);
    try { await api('/api/analyze', { sessionId: id }); } catch (e: any) { setErr(e.message); }
    await load();
  }, [id, load]);

  // First load; kick off the breakdown automatically for fresh uploads.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t) setTab(t);
    load().then((session) => {
      if (session && !started.current && session.status === 'uploaded') {
        started.current = true;
        runAnalysis();
      }
    });
  }, [load, runAnalysis]);

  // While another tab/device is analyzing, poll for the result.
  useEffect(() => {
    if (s?.status !== 'analyzing' || started.current) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [s?.status, load]);

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

  if (!s) return <p className="text-slate-400">Loading…</p>;
  const stale = s.status === 'analyzing' && s.analysis_started_at && Date.now() - new Date(s.analysis_started_at).getTime() > 6 * 60 * 1000;
  const analyzing = s.status === 'analyzing' && !stale;

  return (
    <div className="space-y-4">
      <div className="-mx-4 -mt-4 bg-black">
        {videoUrl ? (
          <video src={videoUrl} controls playsInline className="max-h-[45vh] w-full" />
        ) : frames[Math.floor(frames.length / 2)] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frames[Math.floor(frames.length / 2)].url} alt="" className="max-h-[45vh] w-full object-contain" />
        ) : <div className="aspect-video" />}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">{athletes.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} size={36} />)}</div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight">{s.title}</h1>
          <p className="truncate text-xs text-slate-400">{[athletes.map((a) => a.name).join(', '), sportLabel(s.sport), s.focus].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'breakdown', label: 'Breakdown' },
        { id: 'ask', label: 'Ask AI', badge: messages.filter((m) => m.role === 'assistant').length },
        { id: 'plan', label: 'Plan', badge: plans.filter((p) => p.status !== 'completed').length },
      ]} />

      {err && <div className="card border-red-500/40 text-sm text-red-300">{err}</div>}

      {tab === 'breakdown' && (
        <div className="space-y-4">
          <FrameStrip frames={frames} interval={s.frame_interval} onOpen={setViewer} />
          {analyzing ? (
            <Analyzing since={s.analysis_started_at} />
          ) : analysis ? (
            <>
              <Breakdown content={analysis.content} />
              <Rating analysis={analysis} onDone={load} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost" onClick={() => setTab('ask')}>Ask a question</button>
                <button className="btn" onClick={() => setTab('plan')}>Build a plan</button>
              </div>
              <button className="w-full py-1 text-xs text-slate-500 underline" onClick={runAnalysis}>Re-run breakdown</button>
            </>
          ) : (
            <Empty
              title={s.status === 'error' || stale ? 'The breakdown didn’t finish' : 'No breakdown yet'}
              body={s.error || 'Run the AI on these frames.'}
              action={<button className="btn mt-2" onClick={runAnalysis}>Run breakdown</button>}
            />
          )}
        </div>
      )}

      {tab === 'ask' && <Chat id={id} session={s} athletes={athletes} messages={messages} reload={load} hasAnalysis={!!analysis} />}

      {tab === 'plan' && (
        <PlanTab session={s} athletes={athletes} plans={plans} logs={logs} reload={load} hasAnalysis={!!analysis} />
      )}

      <FrameViewer frames={frames} index={viewer} setIndex={setViewer} />
    </div>
  );
}

function Analyzing({ since }: { since?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const secs = since ? Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000)) : tick;
  const step = Math.min(STEPS.length - 1, Math.floor(secs / 12));
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3 font-semibold"><Spinner /> AI coach is reviewing the film… <span className="ml-auto text-xs text-slate-500">{secs}s</span></div>
      <ul className="space-y-1.5 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'text-emerald-300' : i === step ? 'text-white' : 'text-slate-600'}>
            {i < step ? '✓' : i === step ? '•' : '○'} {label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">Usually 30-90 seconds. You can leave this screen; it keeps working.</p>
    </div>
  );
}

function FrameStrip({ frames, interval, onOpen }: { frames: { t: number; url: string }[]; interval: number; onOpen: (i: number) => void }) {
  if (!frames.length) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{frames.length} frames · every {interval}s · tap to step through</div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {frames.map((f, i) => (
          <button key={i} onClick={() => onOpen(i)} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt="" className="h-16 rounded-md" />
            <div className="text-center text-[10px] text-slate-500">{f.t.toFixed(1)}s</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function FrameViewer({ frames, index, setIndex }: { frames: { t: number; url: string }[]; index: number | null; setIndex: (i: number | null) => void }) {
  const touch = useRef(0);
  if (index === null || !frames[index]) return null;
  const go = (d: number) => setIndex(Math.max(0, Math.min(frames.length - 1, index + d)));
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] text-white">
        <span className="font-semibold">{frames[index].t.toFixed(2)}s</span>
        <span className="text-sm text-slate-400">{index + 1} / {frames.length}</span>
        <button onClick={() => setIndex(null)} className="text-sm">Done</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frames[index].url} alt="" className="min-h-0 flex-1 object-contain" />
      <div className="space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
        <input type="range" min={0} max={frames.length - 1} value={index} onChange={(e) => setIndex(Number(e.target.value))} className="w-full accent-orange-500" />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => go(-1)}>‹ Prev</button>
          <button className="btn-ghost" onClick={() => go(1)}>Next ›</button>
        </div>
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = { summary: '📋', working: '✅', fix: '🎯', phase: '🎞️', drill: '🏋️', see: '📷', player: '👤', team: '👥', priorit: '⭐' };
const iconFor = (title: string) => Object.entries(ICONS).find(([k]) => title.toLowerCase().includes(k))?.[1] || '•';

function Breakdown({ content }: { content: string }) {
  const parts = content.split(/^##\s+/m).map((p) => p.trim()).filter(Boolean);
  const sections = parts.map((p) => {
    const nl = p.indexOf('\n');
    return nl === -1 ? { title: p, body: '' } : { title: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
  });
  if (sections.length <= 1) return <div className="card md text-[15px]"><ReactMarkdown>{content}</ReactMarkdown></div>;
  return (
    <div className="space-y-3">
      {sections.map((sec, i) => {
        const key = /fix/i.test(sec.title);
        return (
          <section key={i} className={`card ${key ? 'border-accent/60 bg-accent/[0.06]' : ''}`}>
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold"><span>{iconFor(sec.title)}</span>{sec.title}</h2>
            <div className="md text-[15px] text-slate-200"><ReactMarkdown>{sec.body}</ReactMarkdown></div>
          </section>
        );
      })}
    </div>
  );
}

function Rating({ analysis, onDone }: { analysis: any; onDone: () => void }) {
  const rate = async (v: number) => { await sb().from('analyses').update({ rating: v }).eq('id', analysis.id); onDone(); };
  return (
    <div className="flex items-center gap-3 text-sm text-slate-400">
      Was this breakdown useful?
      <button className={`chip py-1 ${analysis.rating === 1 ? 'chip-on' : ''}`} onClick={() => rate(1)}>👍</button>
      <button className={`chip py-1 ${analysis.rating === -1 ? 'chip-on' : ''}`} onClick={() => rate(-1)}>👎</button>
    </div>
  );
}

function Chat({ id, session, athletes, messages, reload, hasAnalysis }: any) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState('');
  const [err, setErr] = useState('');
  const [teach, setTeach] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, pending]);

  async function send(msg = text.trim()) {
    if (!msg || pending) return;
    setText(''); setPending(msg); setErr('');
    try { await api('/api/chat', { sessionId: id, message: msg }); await reload(); }
    catch (e: any) { setErr(e.message); setText(msg); }
    setPending('');
  }

  const suggestions = hasAnalysis
    ? ['What should we fix first?', 'Give me a frame-by-frame breakdown', 'Explain it like I’m a parent', 'I disagree with fix #1 because…']
    : ['What do you see in these frames?'];

  return (
    <div className="space-y-3 pb-24">
      {messages.length === 0 && !pending && (
        <div className="card space-y-3">
          <p className="text-sm text-slate-300">Ask about the film, push back, or correct the AI. It sees the frames and its breakdown.</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((q) => <button key={q} className="chip text-xs" onClick={() => (q.endsWith('…') ? setText(q.replace('…', ' ')) : send(q))}>{q}</button>)}
          </div>
        </div>
      )}
      {messages.map((m: any) => (
        <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-2'}>
          {m.role === 'assistant' && <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold">AI</div>}
          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] ${m.role === 'user' ? 'rounded-br-md bg-accent text-white' : 'rounded-bl-md bg-panel'}`}>
            {m.role === 'assistant' ? <div className="md"><ReactMarkdown>{m.content}</ReactMarkdown></div> : m.content}
          </div>
        </div>
      ))}
      {pending && (
        <>
          <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[15px] text-white">{pending}</div></div>
          <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Coach is looking at the frames…</div>
        </>
      )}
      {err && <p className="text-sm text-red-300">{err}</p>}
      <button className="text-xs text-accent underline" onClick={() => setTeach(true)}>+ Teach the AI a rule it should always follow</button>
      <div ref={end} />

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[6] border-t border-line bg-ink/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <AutoTextarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask, push back, or correct…" className="max-h-32 py-2.5" />
          <button className="btn h-11 px-4" disabled={!!pending || !text.trim()} onClick={() => send()}>{pending ? <Spinner /> : 'Send'}</button>
        </div>
      </div>

      <Sheet open={teach} onClose={() => setTeach(false)} title="Teach the AI">
        <RuleForm session={session} athletes={athletes} onDone={() => setTeach(false)} />
      </Sheet>
    </div>
  );
}

function RuleForm({ session, athletes, onDone }: any) {
  const [note, setNote] = useState('');
  const [scope, setScope] = useState(athletes.length === 1 ? athletes[0].id : 'sport');
  async function save() {
    if (!note.trim()) return;
    await sb().from('ai_rules').insert({ note: note.trim(), sport: session.sport, athlete_id: scope === 'sport' ? null : scope });
    onDone();
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">The AI follows these on every future breakdown and chat. Example: &quot;We teach a toe-tap load&quot; or &quot;No long-toss, coming back from a shoulder injury.&quot;</p>
      <AutoTextarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your rule…" />
      <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
        {athletes.map((a: any) => <option key={a.id} value={a.id}>Only for {a.name}</option>)}
        <option value="sport">All {sportLabel(session.sport)} film</option>
      </select>
      <button className="btn w-full" onClick={save}>Save rule</button>
    </div>
  );
}

function PlanTab({ session, athletes, plans, logs, reload, hasAnalysis }: any) {
  const [who, setWho] = useState(athletes.length === 1 ? athletes[0].id : '');
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  async function generate() {
    setBusy(true); setErr(''); setOpen(false);
    try { await api('/api/plan', { sessionId: session.id, athleteId: who || null, instructions: ask }); setAsk(''); await reload(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  if (!hasAnalysis) return <Empty title="Breakdown first" body="Once the breakdown is ready, the AI turns it into a 2-week plan." />;

  const form = (
    <div className="space-y-3">
      {athletes.length > 1 && (
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Whole team</option>
          {athletes.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <AutoTextarea value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Optional: 'only 3 days a week', 'no tee at home', 'focus on fix #2'" />
      <button className="btn w-full" disabled={busy} onClick={generate}>{busy ? <><Spinner /> Building plan…</> : 'Generate 2-week plan'}</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-300">{err}</p>}
      {busy && <div className="card flex items-center gap-3 text-sm"><Spinner /> Building a plan from the breakdown…</div>}
      {plans.length === 0 && !busy ? (
        <div className="card space-y-3">
          <div className="font-semibold">Turn this breakdown into a practice plan</div>
          <p className="text-sm text-slate-400">You&apos;ll review each drill, edit anything, then approve it to start daily check-offs.</p>
          {form}
        </div>
      ) : (
        <>
          {plans.map((p: any) => (
            <PlanCard key={p.id} plan={p} athlete={athletes.find((a: any) => a.id === p.athlete_id)} logs={logs.filter((l: any) => l.plan_id === p.id)} onChange={reload} />
          ))}
          {!busy && <button className="btn-ghost w-full" onClick={() => setOpen(true)}>Generate a different plan</button>}
        </>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="New plan">{form}</Sheet>
    </div>
  );
}
