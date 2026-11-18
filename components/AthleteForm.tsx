'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { SPORTS } from '@/lib/sports';
import { AutoTextarea } from './ui';

const blank = { name: '', number: '', sport: 'softball', team: '', position: '', level: '', bats: '', throws: '', notes: '' };

export default function AthleteForm({ athlete, onSaved }: { athlete?: any; onSaved: (a: any) => void }) {
  const [f, setF] = useState<any>(athlete ? { ...blank, ...athlete } : blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const bat = SPORTS.find((s) => s.id === f.sport)?.batSport;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const row = Object.fromEntries(Object.keys(blank).map((k) => [k, f[k] || null]));
    const q = athlete ? sb().from('athletes').update(row).eq('id', athlete.id) : sb().from('athletes').insert(row);
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved(data);
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-[1fr_80px] gap-3">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
        <div><label className="label">#</label><input className="input text-center" inputMode="numeric" value={f.number || ''} onChange={set('number')} placeholder="00" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Sport</label>
          <select className="input" value={f.sport} onChange={set('sport')}>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div><label className="label">Position</label><input className="input" value={f.position || ''} onChange={set('position')} placeholder="SS / P" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Team</label><input className="input" value={f.team || ''} onChange={set('team')} placeholder="Team name" /></div>
        <div><label className="label">Level / age</label><input className="input" value={f.level || ''} onChange={set('level')} placeholder="14U" /></div>
      </div>
      {bat && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Bats</label><select className="input" value={f.bats || ''} onChange={set('bats')}><option value="">-</option><option>R</option><option>L</option><option>S</option></select></div>
          <div><label className="label">Throws</label><select className="input" value={f.throws || ''} onChange={set('throws')}><option value="">-</option><option>R</option><option>L</option></select></div>
        </div>
      )}
      <div>
        <label className="label">Notes for the AI</label>
        <AutoTextarea value={f.notes || ''} onChange={set('notes')} placeholder="Goals, injuries to work around, what you're already fixing…" />
      </div>
      {err && <p className="text-sm text-red-300">{err}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? 'Saving…' : athlete ? 'Save changes' : 'Add player'}</button>
    </form>
  );
}
