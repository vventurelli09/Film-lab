'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthGate';
import { sb } from '@/lib/supabase';
import { sportLabel } from '@/lib/sports';

export default function Settings() {
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState('coach');
  const [rules, setRules] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { setName(profile?.full_name || ''); setRole(profile?.role || 'coach'); }, [profile]);

  const loadRules = async () => {
    const [r, a] = await Promise.all([
      sb().from('ai_rules').select('*').order('created_at', { ascending: false }),
      sb().from('athletes').select('id,name'),
    ]);
    setRules(r.data || []);
    setAthletes(a.data || []);
  };
  useEffect(() => { loadRules(); }, []);

  async function save() {
    const { error } = await sb().from('profiles').upsert({ id: session.user.id, full_name: name, role });
    setMsg(error ? error.message : 'Saved');
    refreshProfile();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="card space-y-3">
        <div><label className="label">Your name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label">I&apos;m a…</label>
          <div className="flex gap-2">
            {['coach', 'parent', 'player'].map((r) => (
              <button key={r} className={`chip capitalize ${role === r ? 'chip-on' : ''}`} onClick={() => setRole(r)}>{r}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Changes how the AI talks to you. Team assessments are coach-only.</p>
        </div>
        <button className="btn w-full" onClick={save}>Save</button>
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Coaching rules the AI follows</h2>
        {rules.length === 0 && <p className="text-sm text-slate-500">None yet. Add them from any film session.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 border-t border-line pt-2">
            <div>
              <div className="text-sm">{r.note}</div>
              <div className="text-xs text-slate-500">{r.athlete_id ? athletes.find((a) => a.id === r.athlete_id)?.name : `All ${sportLabel(r.sport)}`}</div>
            </div>
            <button className="text-sm text-red-300" onClick={async () => { await sb().from('ai_rules').delete().eq('id', r.id); loadRules(); }}>Remove</button>
          </div>
        ))}
      </section>

      <section className="card space-y-2 text-sm text-slate-400">
        <p>Signed in as {session.user.email}</p>
        <p>Install: in Safari tap Share → <b>Add to Home Screen</b>.</p>
        <button className="btn-ghost w-full" onClick={() => sb().auth.signOut()}>Sign out</button>
      </section>
    </div>
  );
}
