'use client';

export type Frame = { t: number; blob: Blob };

function waitFor(v: HTMLVideoElement, event: string, ms = 4000) {
  return new Promise<void>((resolve) => {
    const done = () => { v.removeEventListener(event, done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, ms);
    v.addEventListener(event, done);
  });
}

/**
 * Pulls still frames out of a video right in the browser (works on iPhone/Android),
 * so the server never has to process video.
 */
export async function extractFrames(
  file: File,
  start: number,
  end: number,
  interval: number,
  maxFrames: number,
  onProgress?: (done: number, total: number) => void,
  width = 640,
): Promise<Frame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not read this video. Try an .mp4 or .mov file.'));
  });
  // iOS Safari only paints frames after playback has started once.
  try { await video.play(); video.pause(); } catch { /* ignore */ }
  if (video.readyState < 2) await waitFor(video, 'loadeddata');

  const dur = video.duration || 0;
  const s = Math.max(0, Math.min(start, dur));
  const e = Math.min(end > s ? end : dur, dur);
  const times: number[] = [];
  for (let t = s; t <= e + 1e-6 && times.length < maxFrames; t += interval) times.push(Math.round(t * 100) / 100);

  const scale = Math.min(1, width / (video.videoWidth || width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((video.videoWidth || width) * scale);
  canvas.height = Math.round((video.videoHeight || width * 0.5625) * scale);
  const ctx = canvas.getContext('2d')!;

  const frames: Frame[] = [];
  for (const t of times) {
    const seeked = waitFor(video, 'seeked');
    video.currentTime = Math.min(t, Math.max(0, dur - 0.01));
    await seeked;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Frame capture failed'))), 'image/jpeg', 0.72),
    );
    frames.push({ t, blob });
    onProgress?.(frames.length, times.length);
  }
  URL.revokeObjectURL(url);
  return frames;
}
