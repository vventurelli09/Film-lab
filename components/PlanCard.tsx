'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { AutoTextarea, Avatar, Sheet } from './ui';

type Item = { title: string; detail: string; dose?: string; frequency?: string };

export default function PlanCard({ plan, logs, athlete, onChange, showLink }: { plan: any; logs: any[]; athlete?: any; onChange: () => void; showLink?: boolean }) {
  const [items, setItems] = useState<Item[]>(plan.items);
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setItems(plan.items), [plan.items]);

  const today = new Date().toISOString().slice(0, 10);
  const draft = plan.status === 'draft';
  const active = plan.status === 'approved';
  const doneToday = (i: number) => logs.some((l) => l.item_index === i && l.done_on === today);
  const total = (i: number) => logs.filter((l) => l.item_index === i).length;
  const todayCount = items.filter((_, i) => doneToday(i)).length;

  const saveItems = async (next: Item[]) => { setItems(next); await sb().from('plans').update({ items: next }).eq('id', plan.id); onChange(); };
  const approve = async () => { await sb().from('plans').update({ items, status: 'approved', approved_at: new Date().toISOString() }).eq('id', plan.id); onChange(); };
  const discard = async () => { if (confirm('Delete this plan?')) { await sb().from('plans').delete().eq('id', plan.id); onChange(); } };
  const complete = async () => { await sb().from('plans').update({ status: 'completed' }).eq('id', plan.id); onChange(); };
  const toggle = async (i: number) => {
    const hit = logs.find((l) => l.item_index === i && l.done_on === today);
    if (hit) await sb().from('plan_logs').delete().eq('id', hit.id);
    else await sb().from('plan_logs').insert({ plan_id: plan.id, item_index: i });
    onChange();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line p-4">
        {athlete ? <Avatar name={athlete.name} number={athlete.number} size={40} /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-line">👥</div>}
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-snug">{plan.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${draft ? 'bg-amber-500/15 text-amber-300' : active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
              {draft ? 'Draft: review & approve' : active ? `Active · ${todayCount}/${items.length} today` : 'Completed'}
            </span>
            {showLink && <Link href={`/sessions/${plan.session_id}`} className="text-slate-400 underline">View film</Link>}
          </div>
        </div>
      </div>

      <ol>
        {items.map((it, i) => {
          const expanded = open === i || draft;
          return (
            <li key={i} className={`flex gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}>
              {active ? (
                <button
                  onClick={() => toggle(i)}
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${doneToday(i) ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-line text-transparent'}`}
                  aria-label="Done today"
                >✓</button>
              ) : (
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line text-sm font-bold">{i + 1}</span>
              )}
              <div className="min-w-0 flex-1" onClick={() => !draft && setOpen(open === i ? null : i)}>
                <div className="font-semibold leading-snug">{it.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {it.dose && <span className="rounded-md bg-ink px-2 py-0.5 text-xs text-slate-300">{it.dose}</span>}
                  {it.frequency && <span className="rounded-md bg-ink px-2 py-0.5 text-xs text-slate-300">{it.frequency}</span>}
                  {active && <span className="rounded-md bg-ink px-2 py-0.5 text-xs text-slate-400">done {total(i)}x</span>}
                </div>
                {expanded ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{it.detail}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Tap for how-to</p>
                )}
              </div>
              {draft && <button className="self-start text-sm text-accent" onClick={() => setEditing(i)}>Edit</button>}
            </li>
          );
        })}
      </ol>

      {draft && (
        <div className="flex gap-2 border-t border-line p-4">
          <button className="btn flex-1" onClick={approve}>Approve &amp; start tracking</button>
          <button className="btn-ghost" onClick={discard}>Discard</button>
        </div>
      )}
      {active && (
        <div className="flex justify-between border-t border-line px-4 py-3 text-xs text-slate-400">
          <span>Tap the circle when it&apos;s done today.</span>
          <button className="underline" onClick={complete}>Mark plan complete</button>
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit drill">
        {editing !== null && items[editing] && (
          <ItemEditor
            item={items[editing]}
            onSave={(v) => { saveItems(items.map((x, j) => (j === editing ? v : x))); setEditing(null); }}
            onDelete={() => { saveItems(items.filter((_, j) => j !== editing)); setEditing(null); }}
          />
        )}
      </Sheet>
    </div>
  );
}

function ItemEditor({ item, onSave, onDelete }: { item: Item; onSave: (v: Item) => void; onDelete: () => void }) {
  const [v, setV] = useState<Item>(item);
  const set = (k: keyof Item) => (e: any) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div><label className="label">Drill</label><AutoTextarea value={v.title} onChange={set('title')} /></div>
      <div><label className="label">How to do it</label><AutoTextarea value={v.detail} onChange={set('detail')} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Reps</label><AutoTextarea value={v.dose || ''} onChange={set('dose')} /></div>
        <div><label className="label">How often</label><AutoTextarea value={v.frequency || ''} onChange={set('frequency')} /></div>
      </div>
      <button className="btn w-full" onClick={() => onSave(v)}>Save</button>
      <button className="w-full py-2 text-sm text-red-300" onClick={onDelete}>Remove this drill</button>
    </div>
  );
}
