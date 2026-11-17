'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { SPORTS, sportLabel } from '@/lib/sports';

const blank = { name: '', sport: 'softball', position: '', level: '', bats: '', throws: '', notes: '' };

export default function Athletes() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<any>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const { data } = await sb().from('athletes').select('*').order('name');
    setList(data || []);
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const bat = SPORTS.find((s) => s.id === form.sport)?.batSport;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const row = { ...form };
    delete row.id; delete row.owner_id; delete row.created_at;
    const { error } = editing
      ? await sb().from('athletes').update(row).eq('id', editing)
      : await sb().from('athletes').insert(row);
    if (error) return setErr(error.message);
    setForm(blank); setEditing(null); setOpen(false); load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this athlete? Their coaching rules go too.')) return;
    await sb().from('athletes').delete().eq('id', id);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Athletes</h1>
        {!open && <button className="btn-ghost py-2" onClick={() => { setForm(blank); setEditing(null); setOpen(true); }}>+ Add</button>}
      </div>

      {open && (
        <form onSubmit={save} className="card space-y-3">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={set('name')} required /></div>
          <div>
            <label className="label">Sport</label>
            <select className="input" value={form.sport} onChange={set('sport')}>
              {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Position</label><input className="input" value={form.position || ''} onChange={set('position')} placeholder="e.g. SS / P" /></div>
            <div><label className="label">Level / age</label><input className="input" value={form.level || ''} onChange={set('level')} placeholder="e.g. 14U" /></div>
          </div>
          {bat && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Bats</label><select className="input" value={form.bats || ''} onChange={set('bats')}><option value="">—</option><option>R</option><option>L</option><option>S</option></select></div>
              <div><label className="label">Throws</label><select className="input" value={form.throws || ''} onChange={set('throws')}><option value="">—</option><option>R</option><option>L</option></select></div>
            </div>
          )}
          <div><label className="label">Notes for the AI</label><textarea className="input" rows={3} value={form.notes || ''} onChange={set('notes')} placeholder="Goals, injuries to work around, what you're already fixing…" /></div>
          {err && <p className="text-sm text-red-300">{err}</p>}
          <div className="flex gap-2">
            <button className="btn flex-1">{editing ? 'Save' : 'Add athlete'}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {list.length === 0 && !open && <p className="text-sm text-slate-500">Add yourself, your player, or your whole roster.</p>}
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-slate-400">{[sportLabel(a.sport), a.position, a.level].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex gap-3 text-sm">
              <button className="text-slate-300" onClick={() => { setForm(a); setEditing(a.id); setOpen(true); window.scrollTo(0, 0); }}>Edit</button>
              <button className="text-red-300" onClick={() => remove(a.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
