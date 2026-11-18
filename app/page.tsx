'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthGate';
import { Avatar, Empty, FilmCard, sessionThumbs } from '@/components/ui';
import { sb } from '@/lib/supabase';

export default function Home() {
  const { profile } = useAuth();
  const [athletes, setAthletes] = useState<any[] | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [a, s, p, l] = await Promise.all([
        sb().from('athletes').select('*').order('name'),
        sb().from('film_sessions').select('*').order('created_at', { ascending: false }).limit(6),
        sb().from('plans').select('*').eq('status', 'approved'),
        sb().from('plan_logs').select('plan_id,item_index').eq('done_on', today),
      ]);
      setAthletes(a.data || []);
      setSessions(s.data || []);
      setPlans(p.data || []);
      setLogs(l.data || []);
      setThumbs(await sessionThumbs(s.data || []));
    })();
  }, []);

  if (athletes === null) return <p className="text-slate-400">Loading…</p>;
  const first = profile?.full_name?.split(' ')[0];

  return (
    <div className="space-y-7">
      <h1 className="text-2xl font-bold">{first ? `Hey, ${first}` : 'Welcome'} 👋</h1>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">My players</h2>
          <Link href="/athletes" className="text-sm text-accent">See all</Link>
        </div>
        {athletes.length === 0 ? (
          <Empty title="Add your first player" body="Profiles hold every clip, breakdown and plan for that athlete." action={<Link href="/athletes?add=1" className="btn mt-2">+ Add player</Link>} />
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {athletes.map((a) => (
              <Link key={a.id} href={`/athletes/${a.id}`} className="flex w-24 shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-panel px-2 py-3">
                <Avatar name={a.name} number={a.number} size={52} />
                <div className="w-full truncate text-center text-sm font-semibold">{a.name.split(' ')[0]}</div>
                <div className="-mt-1.5 text-[11px] text-slate-400">{a.position || a.sport}</div>
              </Link>
            ))}
            <Link href="/athletes?add=1" className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-slate-400">
              <span className="text-2xl">+</span><span className="text-xs">Add</span>
            </Link>
          </div>
        )}
      </section>

      {plans.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Today&apos;s work</h2>
          <div className="space-y-2">
            {plans.map((p) => {
              const done = logs.filter((l) => l.plan_id === p.id).length;
              const who = athletes.find((a) => a.id === p.athlete_id);
              return (
                <Link key={p.id} href={`/sessions/${p.session_id}?tab=plan`} className="card flex items-center gap-3">
                  {who ? <Avatar name={who.name} size={40} /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-line">👥</div>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.title}</div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className="h-full bg-accent" style={{ width: `${(done / Math.max(1, p.items.length)) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm text-slate-400">{done}/{p.items.length}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Recent film</h2>
        {sessions.length === 0 ? (
          <Empty title="No film yet" body="Tap the orange + to upload your first clip." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sessions.map((s) => <FilmCard key={s.id} s={s} thumb={thumbs[s.id]} athletes={athletes} />)}
          </div>
        )}
      </section>
    </div>
  );
}
