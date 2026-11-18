'use client';
import { useEffect, useRef, useState } from 'react';
import { extractFrames } from '@/lib/frames';
import { MAX_CLIP_SECONDS } from '@/lib/sports';

const fmt = (t: number) => `${t.toFixed(1)}s`;

/**
 * Video trimmer: drag the two orange handles (or use "Start here"/"End here")
 * to pick the moment to analyze. The selection can never exceed MAX_CLIP_SECONDS.
 */
export default function ClipPicker({ file, url, start, end, onChange }: {
  file: File; url: string; start: number; end: number; onChange: (start: number, end: number, duration: number) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [dur, setDur] = useState(0);
  const [now, setNow] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const drag = useRef<'start' | 'end' | null>(null);

  // Filmstrip behind the trimmer.
  useEffect(() => {
    if (!dur) return;
    let cancelled = false;
    const n = 8;
    extractFrames(file, 0, dur, dur / n, n, undefined, 120)
      .then((fr) => { if (!cancelled) setThumbs(fr.map((f) => URL.createObjectURL(f.blob))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [file, dur]);

  function onMeta(e: React.SyntheticEvent<HTMLVideoElement>) {
    const d = e.currentTarget.duration || 0;
    setDur(d);
    onChange(0, Math.min(d, MAX_CLIP_SECONDS), d);
  }

  function set(which: 'start' | 'end', t: number) {
    t = Math.max(0, Math.min(dur, Math.round(t * 10) / 10));
    let s = start, e = end;
    if (which === 'start') { s = Math.min(t, e - 0.5); if (e - s > MAX_CLIP_SECONDS) e = s + MAX_CLIP_SECONDS; }
    else { e = Math.max(t, s + 0.5); if (e - s > MAX_CLIP_SECONDS) s = e - MAX_CLIP_SECONDS; }
    s = Math.max(0, s); e = Math.min(dur, e);
    onChange(s, e, dur);
    if (video.current) { video.current.pause(); video.current.currentTime = which === 'start' ? s : e; }
  }

  const timeAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * dur;
  };

  function preview() {
    const v = video.current!;
    if (playing) { v.pause(); return; }
    v.currentTime = start;
    v.play();
  }

  function onTime() {
    const v = video.current!;
    setNow(v.currentTime);
    if (playing && v.currentTime >= end) { v.pause(); v.currentTime = start; }
  }

  const pct = (t: number) => `${dur ? (t / dur) * 100 : 0}%`;
  const len = end - start;

  return (
    <div className="space-y-3">
      <video
        ref={video}
        src={url}
        playsInline
        muted
        preload="metadata"
        className="w-full rounded-xl bg-black"
        onLoadedMetadata={onMeta}
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={preview}
      />

      {dur > 0 && (
        <>
          {/* Trimmer */}
          <div
            ref={track}
            className="relative h-14 touch-none select-none overflow-hidden rounded-xl bg-line"
            onPointerMove={(e) => drag.current && set(drag.current, timeAt(e.clientX))}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <div className="absolute inset-0 flex">
              {thumbs.map((t, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={t} alt="" className="h-full min-w-0 flex-1 object-cover opacity-80" />
              ))}
            </div>
            <div className="absolute inset-y-0 left-0 bg-black/65" style={{ width: pct(start) }} />
            <div className="absolute inset-y-0 right-0 bg-black/65" style={{ left: pct(end) }} />
            <div className="absolute inset-y-0 border-y-4 border-accent" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(now) }} />
            {(['start', 'end'] as const).map((h) => (
              <div
                key={h}
                onPointerDown={(e) => { drag.current = h; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
                className="absolute inset-y-0 z-10 flex w-7 -translate-x-1/2 items-center justify-center"
                style={{ left: pct(h === 'start' ? start : end) }}
              >
                <div className="flex h-full w-4 items-center justify-center rounded-md bg-accent shadow">
                  <div className="h-5 w-0.5 rounded bg-white/80" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{fmt(start)} → {fmt(end)}</span>
            <span className={`font-semibold ${len >= MAX_CLIP_SECONDS - 0.05 ? 'text-amber-300' : 'text-white'}`}>{fmt(len)} selected · max {MAX_CLIP_SECONDS}s</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button className="btn-ghost px-2 text-sm" onClick={() => set('start', video.current?.currentTime ?? 0)}>⇤ Start here</button>
            <button className="btn-ghost px-2 text-sm" onClick={preview}>{playing ? '❚❚ Pause' : '▶ Preview'}</button>
            <button className="btn-ghost px-2 text-sm" onClick={() => set('end', video.current?.currentTime ?? dur)}>End here ⇥</button>
          </div>
          <p className="text-xs text-slate-500">
            Drag the orange handles, or play the video, pause on the moment, and tap Start here / End here.
            {dur > MAX_CLIP_SECONDS && ` Your video is ${Math.round(dur)}s, so pick the ${MAX_CLIP_SECONDS}s that matter.`}
          </p>
        </>
      )}
    </div>
  );
}
