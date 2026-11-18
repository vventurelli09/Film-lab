'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sb } from '@/lib/supabase';

export type Profile = { id: string; full_name: string | null; role: 'coach' | 'parent' | 'player' };
type Auth = { session: Session; profile: Profile | null; refreshProfile: () => Promise<void> };

const AuthCtx = createContext<Auth | null>(null);
export const useAuth = () => useContext(AuthCtx)!;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    try {
      const client = sb();
      client.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
      return () => data.subscription.unsubscribe();
    } catch (e: any) {
      setConfigError(e.message);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const { data } = await sb().from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (data) return setProfile(data);
    const { data: created } = await sb().from('profiles').insert({ id: session.user.id, role: 'coach' }).select().single();
    setProfile(created);
  }, [session]);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  if (configError) return <Shell><div className="card text-red-300">{configError}</div></Shell>;
  if (session === undefined) return <Shell><p className="text-slate-400">Loading…</p></Shell>;
  if (!session) return <Shell><Login /></Shell>;

  return (
    <AuthCtx.Provider value={{ session, profile, refreshProfile }}>
      <Shell nav>{children}</Shell>
    </AuthCtx.Provider>
  );
}

function Shell({ children, nav }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ink/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur">
        <Link href="/" className="text-lg font-bold tracking-tight">Film <span className="text-accent">Lab</span></Link>
        <span className="text-xs text-slate-500">Private beta</span>
      </header>
      <main className="flex-1 px-4 py-4 pb-28">{children}</main>
      {nav && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const path = usePathname();
  const items = [
    { href: '/', label: 'Home' },
    { href: '/sessions/new', label: '+ Film' },
    { href: '/athletes', label: 'Athletes' },
    { href: '/settings', label: 'Settings' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={`py-3 text-center text-sm font-medium ${path === i.href ? 'text-accent' : 'text-slate-400'}`}>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const auth = sb().auth;
    const { data, error } = mode === 'in'
      ? await auth.signInWithPassword({ email, password })
      : await auth.signUp({ email, password });
    if (error) {
      const network = /load failed|failed to fetch|network/i.test(error.message);
      setMsg(network
        ? `Can't reach Supabase at "${process.env.NEXT_PUBLIC_SUPABASE_URL}". In Vercel, NEXT_PUBLIC_SUPABASE_URL should look like https://abcd1234.supabase.co (no extra path or spaces), then Redeploy.`
        : error.message);
    }
    else if (mode === 'up' && !data.session) setMsg('Check your email to confirm your account, then sign in.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-4">
      <h1 className="text-2xl font-bold">{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
      <p className="text-sm text-slate-400">Upload film. Get coaching. Track the work.</p>
      <input className="input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      <button className="btn w-full" disabled={busy}>{busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <button type="button" className="w-full text-sm text-slate-400 underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'First time? Create an account' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
