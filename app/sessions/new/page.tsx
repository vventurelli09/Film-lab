'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthGate';
import ClipPicker from '@/components/ClipPicker';
import { AutoTextarea, Avatar } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { extractFrames } from '@/lib/frames';
import { autoInterval, frameCount, MAX_CLIP_SECONDS, MAX_FRAMES, SESSION_TYPES, SPORTS } from '@/lib/sports';

const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB || 50);

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

export default function NewSession() {
  const { session, profile } = useAuth();
  const router = useRouter();

  const [athletes, setAthletes] = useState<any[] | null>(null);
  const [sport, setSport] = useState('softball');
  const [type, setType] = useState('individual');
  const [focus, setFocus] = useState('Hitting / swing');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const isCoach = (profile?.role ?? 'coach') === 'coach';
  const types = SESSION_TYPES.filter((t) => t.id !== 'team' || isCoach);
  const sportObj = SPORTS.find((s) => s.id === sport)!;
  const sportAthletes = (athletes || []).filter((a) => a.sport === sport);
  const sportsWithPlayers = SPORTS.filter((s) => (athletes || []).some((a) => a.sport === s.id));
  const multi = type !== 'individual';
  const len = Math.max(0, end - start);
  const interval = autoInterval(len);
  const frames = len ? frameCount(len, interval) : 0;
  const fast = /swing|hitting|pitch|throw|serv|attack|shoot|strik/i.test(focus);

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('athlete');
    sb().from('athletes').select('*').order('name').then(({ data }) => {
      setAthletes(data || []);
      const first = data?.find((a) => a.id === want) || data?.[0];
      if (first) { setSport(first.sport); setPicked([first.id]); }
    });
  }, []);
  useEffect(() => { if (!sportObj.focuses.includes(focus)) setFocus(sportObj.focuses[0]); }, [sport]); // eslint-disable-line

  function pickFile(f: File | null) {
    if (url) URL.revokeObjectURL(url);
    setFile(f);
    setUrl(f ? URL.createObjectURL(f) : '');
    setStart(0); setEnd(0);
  }

  const toggle = (id: string) => setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));

  async function submit() {
    if (!file) return setErr('Pick a video first.');
    if (!picked.length) return setErr('Pick at least one player.');
    if (len < 0.5) return setErr('Select at least half a second of video.');
    setErr(''); setBusy(true);
    const uid = session.user.id;
    let id = '';
    try {
      setStatus('Creating session…');
      const { data: row, error } = await sb().from('film_sessions').insert({
        title: title || `${focus} · ${new Date().toLocaleDateString()}`,
        sport, session_type: type, focus, athlete_ids: picked, notes,
        frame_interval: interval, clip_start: start, clip_end: end,
      }).select().single();
      if (error) throw error;
      id = row.id;

      const shots = await extractFrames(file, start, end, interval, MAX_FRAMES, (d, t) => setStatus(`Pulling frames ${d}/${t}…`));

      const paths = shots.map((_, i) => `${uid}/${id}/frames/${String(i).padStart(3, '0')}.jpg`);
      for (let i = 0; i < shots.length; i += 8) {
        await Promise.all(shots.slice(i, i + 8).map((f, j) =>
          sb().storage.from('film').upload(paths[i + j], f.blob, { contentType: 'image/jpeg', upsert: true }).then(({ error }) => { if (error) throw error; }),
        ));
        setStatus(`Saving frames ${Math.min(i + 8, shots.length)}/${shots.length}…`);
      }

      let video_path: string | null = null;
      if (file.size <= MAX_VIDEO_MB * 1024 * 1024) {
        setStatus('Uploading video…');
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        video_path = `${uid}/${id}/video.${ext}`;
        const { error: vErr } = await sb().storage.from('film').upload(video_path, file, { contentType: file.type || 'video/mp4', upsert: true });
        if (vErr) video_path = null; // frames are enough to analyze
      }

      await sb().from('film_sessions').update({ frame_paths: paths, frame_times: shots.map((f) => f.t), video_path, status: 'uploaded' }).eq('id', id);
      router.push(`/sessions/${id}`); // the breakdown starts automatically there
    } catch (e: any) {
      if (id) await sb().from('film_sessions').update({ status: 'error', error: e.message }).eq('id', id);
      setErr(e.message || 'Something went wrong');
      setBusy(false);
      setStatus('');
    }
  }

  if (athletes === null) return <p className="text-slate-400">Loading…</p>;
  if (athletes.length === 0) {
    return (
      <div className="card space-y-3">
        <p>Add a player first so the AI knows who it&apos;s watching.</p>
        <Link href="/athletes?add=1" className="btn w-full">Add player</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Upload film</h1>

      <Step n={1} title="Who's in the film?">
        {sportsWithPlayers.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sportsWithPlayers.map((s) => (
              <button key={s.id} className={`chip py-1 text-xs ${sport === s.id ? 'chip-on' : ''}`} onClick={() => { setSport(s.id); setPicked([]); }}>{s.label}</button>
            ))}
          </div>
        )}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {sportAthletes.map((a) => (
            <button key={a.id} onClick={() => toggle(a.id)} className={`flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 ${picked.includes(a.id) ? 'border-accent bg-accent/10' : 'border-line'}`}>
              <Avatar name={a.name} number={a.number} size={44} />
              <span className="w-full truncate text-center text-xs font-medium">{a.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title="What are we looking at?">
        <div className="flex flex-wrap gap-2">
          {sportObj.focuses.map((f) => <button key={f} className={`chip ${focus === f ? 'chip-on' : ''}`} onClick={() => setFocus(f)}>{f}</button>)}
        </div>
        <select className="input" value={type} onChange={(e) => { setType(e.target.value); if (e.target.value === 'individual') setPicked(picked.slice(0, 1)); }}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Step>

      <Step n={3} title="Pick the video">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-5 text-slate-300">
          <input type="file" accept="video/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
          🎬 {file ? 'Choose a different video' : 'Choose or record a video'}
        </label>
        <p className="text-xs text-slate-500">
          The AI analyzes up to {MAX_CLIP_SECONDS} seconds per upload.{fast && ' For swings and pitches, 2-4 seconds around the motion gives the most detail.'}
        </p>
      </Step>

      {file && url && (
        <Step n={4} title="Trim to the moment">
          <ClipPicker key={url} file={file} url={url} start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
          {len > 0 && (
            <div className="rounded-xl bg-panel px-3 py-2 text-sm text-slate-300">
              The AI will study <b className="text-white">{frames} frames</b>, one every {+interval.toFixed(2)}s.
              {interval <= 0.1 ? ' Maximum detail.' : fast && len > 4 ? ' Trim closer to the motion for more detail.' : ''}
            </div>
          )}
          {file.size > MAX_VIDEO_MB * 1024 * 1024 && (
            <p className="text-xs text-amber-300">This video is over {MAX_VIDEO_MB}MB, so only the frames are saved. The analysis still works.</p>
          )}
        </Step>
      )}

      <Step n={file ? 5 : 4} title="Anything the AI should know? (optional)">
        <input className="input" placeholder="Title, e.g. Cage work 11/17" value={title} onChange={(e) => setTitle(e.target.value)} />
        <AutoTextarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 'She's been pulling off the ball'" />
      </Step>

      {err && <p className="text-sm text-red-300">{err}</p>}
      <button className="btn w-full" disabled={busy || !file || !picked.length} onClick={submit}>{busy ? status || 'Working…' : 'Upload & analyze'}</button>
    </div>
  );
}
