'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthGate';
import { sb } from '@/lib/supabase';
import { sportLabel } from '@/lib/sports';

export default function Home() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [athleteCount, setAthleteCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [s, p, a] = await Promise.all([
        sb().from('film_sessions').select('id,title,sport,session_type,status,created_at').order('created_at', { ascending: false }).limit(20),
        sb().from('plans').select('id,title,session_id,items,status').eq('status', 'approved').order('approved_at', { ascending: false }),
        sb().from('athletes').select('id', { count: 'exact', head: true }),
      ]);
      setSessions(s.data || []);
      setPlans(p.data || []);
      setAthleteCount(a.count ?? 0);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hey{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋</h1>
        <p className="text-sm text-slate-400">What are we watching today?</p>
      </div>

      {athleteCount === 0 ? (
        <Link href="/athletes" className="btn w-full">Step 1: Add your first athlete</Link>
      ) : (
        <Link href="/sessions/new" className="btn w-full">+ Upload new film</Link>
      )}

      {plans.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Active practice plans</h2>
          <div className="space-y-2">
            {plans.map((p) => (
              <Link key={p.id} href={`/sessions/${p.session_id}#plan`} className="card block">
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-slate-400">{p.items.length} items · tap to log today&apos;s work</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Film sessions</h2>
        {sessions.length === 0 && <p className="text-sm text-slate-500">No film yet.</p>}
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-slate-400">
                  {sportLabel(s.sport)} · {s.session_type} · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className={`text-xs ${s.status === 'analyzed' ? 'text-emerald-400' : 'text-amber-300'}`}>{s.status}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
