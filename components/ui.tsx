'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { sb } from '@/lib/supabase';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];
export function colorFor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export function Avatar({ name, number, size = 48 }: { name: string; number?: string | null; size?: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.38 }}
    >
      {initials(name)}
      {number && (
        <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-ink bg-white px-1.5 text-[11px] font-bold leading-4 text-ink">
          {number}
        </span>
      )}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; badge?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="sticky top-[57px] z-[5] -mx-4 flex border-b border-line bg-ink/95 px-2 backdrop-blur">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative flex-1 py-3 text-sm font-semibold ${value === t.id ? 'text-white' : 'text-slate-500'}`}
        >
          {t.label}
          {!!t.badge && <span className="ml-1 rounded-full bg-accent px-1.5 text-[11px] text-white">{t.badge}</span>}
          {value === t.id && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet modal, comfortable for editing on a phone. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="mx-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-t border-line bg-panel px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button className="text-sm text-slate-400" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Textarea that grows to fit its text, so nothing is hidden behind a scroll box. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={2} {...props} className={`input resize-none ${props.className || ''}`} />;
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`} />;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-8 text-center">
      <div className="font-semibold">{title}</div>
      {body && <p className="text-sm text-slate-400">{body}</p>}
      {action}
    </div>
  );
}

/** Signed URL for the middle frame of each session (the action shot), keyed by session id. */
export async function sessionThumbs(sessions: any[]): Promise<Record<string, string>> {
  const picks = sessions.filter((s) => s.frame_paths?.length).map((s) => ({ id: s.id, path: s.frame_paths[Math.floor(s.frame_paths.length / 2)] }));
  if (!picks.length) return {};
  const { data } = await sb().storage.from('film').createSignedUrls(picks.map((p) => p.path), 3600);
  return Object.fromEntries(picks.map((p, i) => [p.id, data?.[i]?.signedUrl || '']));
}

export const statusLabel: Record<string, { text: string; cls: string }> = {
  analyzed: { text: 'Breakdown ready', cls: 'bg-emerald-500/15 text-emerald-300' },
  analyzing: { text: 'Analyzing…', cls: 'bg-amber-500/15 text-amber-300' },
  uploaded: { text: 'Queued', cls: 'bg-amber-500/15 text-amber-300' },
  processing: { text: 'Uploading', cls: 'bg-slate-500/20 text-slate-300' },
  error: { text: 'Needs retry', cls: 'bg-red-500/15 text-red-300' },
};

export function FilmCard({ s, thumb, athletes }: { s: any; thumb?: string; athletes?: any[] }) {
  const st = statusLabel[s.status] || statusLabel.processing;
  const names = athletes?.filter((a) => s.athlete_ids?.includes(a.id)).map((a) => a.name.split(' ')[0]).join(', ');
  return (
    <a href={`/sessions/${s.id}`} className="block overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="relative aspect-video bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 text-[11px] text-white">{s.frame_paths?.length || 0} frames</span>
      </div>
      <div className="p-3">
        <div className="truncate font-semibold">{s.title}</div>
        <div className="truncate text-xs text-slate-400">
          {[names, s.focus, new Date(s.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
        </div>
      </div>
    </a>
  );
}
