'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AthleteForm from '@/components/AthleteForm';
import { Avatar, Empty, Sheet } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { sportLabel } from '@/lib/sports';

export default function Roster() {
  const router = useRouter();
  const [list, setList] = useState<any[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add')) setAdding(true);
    (async () => {
      const [a, s] = await Promise.all([
        sb().from('athletes').select('*').order('name'),
        sb().from('film_sessions').select('athlete_ids'),
      ]);
      setList(a.data || []);
      const c: Record<string, number> = {};
      (s.data || []).forEach((x: any) => x.athlete_ids.forEach((id: string) => (c[id] = (c[id] || 0) + 1)));
      setCounts(c);
    })();
  }, []);

  if (list === null) return <p className="text-slate-400">Loading…</p>;
  const teams = Array.from(new Set(list.map((a) => a.team || ''))).sort();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Players</h1>
        <button className="btn py-2" onClick={() => setAdding(true)}>+ Add</button>
      </div>

      {list.length === 0 && <Empty title="No players yet" body="Add yourself, your kid, or your whole roster." />}

      {teams.map((team) => (
        <section key={team}>
          {teams.length > 1 && <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{team || 'No team'}</h2>}
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            {list.filter((a) => (a.team || '') === team).map((a, i) => (
              <Link key={a.id} href={`/athletes/${a.id}`} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}>
                <span className="w-7 text-center text-lg font-bold text-slate-400">{a.number || '–'}</span>
                <Avatar name={a.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="truncate text-xs text-slate-400">{[a.position, sportLabel(a.sport), a.level].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="text-xs text-slate-500">{counts[a.id] || 0} clips ›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add player">
        <AthleteForm onSaved={(a) => router.push(`/athletes/${a.id}`)} />
      </Sheet>
    </div>
  );
}
