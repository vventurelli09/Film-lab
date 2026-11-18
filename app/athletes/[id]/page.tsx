'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AthleteForm from '@/components/AthleteForm';
import PlanCard from '@/components/PlanCard';
import { AutoTextarea, colorFor, Empty, FilmCard, initials, sessionThumbs, Tabs } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { sportLabel } from '@/lib/sports';

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [tab, setTab] = useState('film');
  const [rule, setRule] = useState('');

  const load = useCallback(async () => {
    const [ath, s, p, r] = await Promise.all([
      sb().from('athletes').select('*').eq('id', id).single(),
      sb().from('film_sessions').select('*').contains('athlete_ids', [id]).order('created_at', { ascending: false }),
      sb().from('plans').select('*').eq('athlete_id', id).order('created_at', { ascending: false }),
      sb().from('ai_rules').select('*').eq('athlete_id', id).order('created_at', { ascending: false }),
    ]);
    setA(ath.data);
    setSessions(s.data || []);
    setPlans(p.data || []);
    setRules(r.data || []);
    const ids = (p.data || []).map((x: any) => x.id);
    setLogs(ids.length ? (await sb().from('plan_logs').select('*').in('plan_id', ids)).data || [] : []);
    setThumbs(await sessionThumbs(s.data || []));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!a) return <p className="text-slate-400">Loading…</p>;
  const color = colorFor(a.name);
  const active = plans.filter((p) => p.status === 'approved');
  const reps = logs.length;

  async function addRule() {
    if (!rule.trim()) return;
    await sb().from('ai_rules').insert({ note: rule.trim(), sport: a.sport, athlete_id: id });
    setRule(''); load();
  }
  async function remove() {
    if (!confirm(`Delete ${a.name}? Their film stays, but their plans and notes are removed.`)) return;
    await sb().from('athletes').delete().eq('id', id);
    router.push('/athletes');
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="-mx-4 -mt-4 px-4 pb-5 pt-6" style={{ background: `linear-gradient(180deg, ${color}55, transparent)` }}>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white ring-4 ring-ink" style={{ background: color }}>
            {initials(a.name)}
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold leading-tight">{a.name}</div>
            <div className="text-sm text-slate-300">
              {[a.number && `#${a.number}`, a.position, a.team].filter(Boolean).join(' · ') || sportLabel(a.sport)}
            </div>
            <div className="text-xs text-slate-400">
              {[sportLabel(a.sport), a.level, a.bats && `B/T ${a.bats}/${a.throws || '-'}`].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[[sessions.length, 'Clips'], [active.length, 'Active plans'], [reps, 'Drills done']].map(([n, l]) => (
            <div key={l as string} className="rounded-xl bg-ink/60 py-2">
              <div className="text-xl font-bold">{n}</div>
              <div className="text-[11px] text-slate-400">{l}</div>
            </div>
          ))}
        </div>
        <Link href={`/sessions/new?athlete=${a.id}`} className="btn mt-4 w-full">+ Upload film for {a.name.split(' ')[0]}</Link>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'film', label: 'Film' },
        { id: 'plans', label: 'Plans', badge: active.length },
        { id: 'notes', label: 'AI Notes' },
        { id: 'info', label: 'Info' },
      ]} />

      {tab === 'film' && (sessions.length ? (
        <div className="grid grid-cols-2 gap-3">{sessions.map((s) => <FilmCard key={s.id} s={s} thumb={thumbs[s.id]} />)}</div>
      ) : <Empty title="No film yet" body={`Upload a clip of ${a.name.split(' ')[0]} to get a breakdown.`} />)}

      {tab === 'plans' && (plans.length ? (
        <div className="space-y-3">{plans.map((p) => <PlanCard key={p.id} plan={p} athlete={a} logs={logs.filter((l) => l.plan_id === p.id)} onChange={load} showLink />)}</div>
      ) : <Empty title="No plans yet" body="Open a breakdown and tap the Plan tab to build one." />)}

      {tab === 'notes' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Things the AI should always remember about {a.name.split(' ')[0]}. They&apos;re used on every breakdown and chat.</p>
          <AutoTextarea value={rule} onChange={(e) => setRule(e.target.value)} placeholder="e.g. Coming back from a shoulder injury, no long-toss. We teach a toe-tap load." />
          <button className="btn w-full" onClick={addRule}>Save note</button>
          {rules.map((r) => (
            <div key={r.id} className="card flex items-start justify-between gap-3">
              <p className="text-sm">{r.note}</p>
              <button className="text-xs text-red-300" onClick={async () => { await sb().from('ai_rules').delete().eq('id', r.id); load(); }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'info' && (
        <div className="space-y-4">
          <AthleteForm athlete={a} onSaved={() => { load(); setTab('film'); }} />
          <button className="w-full py-2 text-sm text-red-300" onClick={remove}>Delete player</button>
        </div>
      )}
    </div>
  );
}
