'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthGate';
import { sb } from '@/lib/supabase';
import { extractFrames } from '@/lib/frames';
import { defaultInterval, MAX_FRAMES, SESSION_TYPES, SPORTS } from '@/lib/sports';

const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB || 50);

export default function NewSession() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [athletes, setAthletes] = useState<any[]>([]);
  const [sport, setSport] = useState('softball');
  const [type, setType] = useState('individual');
  const [focus, setFocus] = useState('Hitting / swing');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [interval, setIntervalSec] = useState(0.1);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const isCoach = (profile?.role ?? 'coach') === 'coach';
  const types = SESSION_TYPES.filter((t) => t.id !== 'team' || isCoach);
  const sportObj = SPORTS.find((s) => s.id === sport)!;
  const sportAthletes = athletes.filter((a) => a.sport === sport);
  const multi = type === 'team' || type === 'game' || type === 'practice';
  const clipWindow = MAX_FRAMES * interval;
  const frameCount = useMemo(() => Math.min(MAX_FRAMES, Math.floor((end - start) / interval) + 1), [start, end, interval]);

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('athlete');
    sb().from('athletes').select('*').order('name').then(({ data }) => {
      setAthletes(data || []);
      const first = data?.find((a) => a.id === want) || data?.[0];
      if (first) { setSport(first.sport); setPicked([first.id]); }
    });
  }, []);

  useEffect(() => { setFocus(sportObj.focuses[0]); }, [sport]); // eslint-disable-line
  useEffect(() => { setIntervalSec(defaultInterval(focus)); }, [focus]);
  useEffect(() => { setEnd(Math.min(duration, start + clipWindow)); }, [interval, duration]); // eslint-disable-line

  function pickFile(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : '');
    setStart(0);
  }

  function markStart() {
    const t = videoRef.current?.currentTime ?? 0;
    setStart(Math.round(t * 10) / 10);
    setEnd(Math.min(duration, Math.round((t + clipWindow) * 10) / 10));
  }
  function markEnd() {
    const t = videoRef.current?.currentTime ?? 0;
    if (t > start) setEnd(Math.min(Math.round(t * 10) / 10, start + clipWindow));
  }

  function toggle(id: string) {
    setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
  }

  async function submit() {
    if (!file) return setErr('Pick a video first.');
    if (!picked.length) return setErr('Pick at least one athlete.');
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

      setStatus('Pulling frames from video…');
      const frames = await extractFrames(file, start, end, interval, MAX_FRAMES, (d, t) => setStatus(`Pulling frames ${d}/${t}…`));

      setStatus('Saving frames…');
      const paths = frames.map((_, i) => `${uid}/${id}/frames/${String(i).padStart(3, '0')}.jpg`);
      for (let i = 0; i < frames.length; i += 8) {
        await Promise.all(frames.slice(i, i + 8).map((f, j) =>
          sb().storage.from('film').upload(paths[i + j], f.blob, { contentType: 'image/jpeg', upsert: true }).then(({ error }) => { if (error) throw error; }),
        ));
        setStatus(`Saving frames ${Math.min(i + 8, frames.length)}/${frames.length}…`);
      }

      let video_path: string | null = null;
      if (file.size <= MAX_VIDEO_MB * 1024 * 1024) {
        setStatus('Uploading video…');
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        video_path = `${uid}/${id}/video.${ext}`;
        const { error: vErr } = await sb().storage.from('film').upload(video_path, file, { contentType: file.type || 'video/mp4', upsert: true });
        if (vErr) video_path = null; // frames are enough to analyze
      }

      await sb().from('film_sessions').update({ frame_paths: paths, frame_times: frames.map((f) => f.t), video_path, status: 'uploaded' }).eq('id', id);

      router.push(`/sessions/${id}`); // the breakdown starts automatically there
    } catch (e: any) {
      if (id) await sb().from('film_sessions').update({ status: 'error', error: e.message }).eq('id', id);
      setErr(e.message || 'Something went wrong');
      setBusy(false);
      setStatus('');
    }
  }

  if (athletes.length === 0) {
    return (
      <div className="card space-y-3">
        <p>Add an athlete first so the AI knows who it&apos;s watching.</p>
        <Link href="/athletes?add=1" className="btn w-full">Add player</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Upload film</h1>

      <section className="space-y-2">
        <label className="label">1. Sport</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((s) => (
            <button key={s.id} className={`chip ${sport === s.id ? 'chip-on' : ''}`} onClick={() => { setSport(s.id); setPicked([]); }}>{s.label}</button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="label">2. Who&apos;s in the film{multi ? ' (pick all)' : ''}</label>
        {sportAthletes.length === 0 && <p className="text-sm text-slate-500">No {sportObj.label} athletes yet. <Link className="underline" href="/athletes">Add one</Link>.</p>}
        <div className="flex flex-wrap gap-2">
          {sportAthletes.map((a) => (
            <button key={a.id} className={`chip ${picked.includes(a.id) ? 'chip-on' : ''}`} onClick={() => toggle(a.id)}>{a.name}</button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">3. Session type</label>
          <select className="input" value={type} onChange={(e) => { setType(e.target.value); if (e.target.value === 'individual') setPicked(picked.slice(0, 1)); }}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Focus</label>
          <select className="input" value={focus} onChange={(e) => setFocus(e.target.value)}>
            {sportObj.focuses.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
      </section>

      <section className="space-y-2">
        <label className="label">4. Video</label>
        <input type="file" accept="video/*" className="input" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
        {file && file.size > MAX_VIDEO_MB * 1024 * 1024 && (
          <p className="text-xs text-amber-300">Over {MAX_VIDEO_MB}MB, so only the frames will be saved (analysis still works). Record at 1080p to keep the video.</p>
        )}
        {preview && (
          <div className="space-y-2">
            <video ref={videoRef} src={preview} controls playsInline muted className="w-full rounded-xl bg-black" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} />
            <p className="text-xs text-slate-400">Scrub to the moment it starts (e.g. load of the swing), then tap Mark start.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={markStart}>Mark start ({start.toFixed(1)}s)</button>
              <button className="btn-ghost" onClick={markEnd}>Mark end ({end.toFixed(1)}s)</button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Sample every</span>
              {[0.1, 0.25, 0.5, 1].map((v) => (
                <button key={v} className={`chip py-1 ${interval === v ? 'chip-on' : ''}`} onClick={() => setIntervalSec(v)}>{v}s</button>
              ))}
            </div>
            <p className="text-xs text-slate-500">{frameCount} frames · max {MAX_FRAMES} ({clipWindow.toFixed(1)}s window at this rate)</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <label className="label">5. Details (optional)</label>
        <input className="input" placeholder="Title, e.g. Cage work 11/17" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" rows={3} placeholder="What should the AI look for? e.g. 'She's been pulling off the ball'" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {err && <p className="text-sm text-red-300">{err}</p>}
      {status && <p className="text-sm text-slate-300">{status}</p>}
      <button className="btn w-full" disabled={busy || !file} onClick={submit}>{busy ? status || 'Working…' : 'Upload & analyze'}</button>
    </div>
  );
}
