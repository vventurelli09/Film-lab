# Film Lab (private beta)

Upload sports film from your phone, get AI coaching analysis, chat with the AI about it, teach it your coaching rules, and turn it into a tracked practice plan.

**Stack:** Next.js 15 (installable PWA) · Supabase (login, database, private film storage) · Claude API · Vercel

## What's built

| Milestone | Feature |
|---|---|
| 1 | Email/password login, roles (coach / parent / player), athlete profiles, multi-sport |
| 2 | Video upload from camera roll, clip start/end marking, size cap (frames-only above the cap) |
| 3 | Frame extraction **in the browser** (0.1s for swings/pitches, up to 40 frames), AI analysis with daily limits |
| 4 | Results page, frame strip, 👍/👎 rating, chat about the film, **"Save as coaching rule"** (the AI follows it on all future film) |
| 5 | Coach-only team assessment (multi-player), AI practice plan → edit → approve → daily check-off tracking |

## One-time setup (all doable from a phone browser)

### 1. Supabase (database + storage)
1. supabase.com → **New project** (any name, save the DB password somewhere).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**.
4. **Authentication → Sign In / Providers → Email**: for a solo beta, turn **Confirm email** off (or leave it on and confirm from your inbox).

### 2. Anthropic (the AI)
1. console.anthropic.com → **API Keys → Create key**. Copy it.
2. **Billing / Limits**: set a monthly spend limit (e.g. $20).

### 3. Vercel (hosting)
1. vercel.com → sign in with GitHub → **Add New → Project** → import `film-lab`.
2. Before deploying, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `ANTHROPIC_API_KEY` = your key
   - `ALLOWED_EMAILS` = your email (blocks anyone else from using your AI credits)
3. **Deploy**. Every push to `main` redeploys automatically.

### 4. Use it
1. Open your Vercel link in Safari → **Create account**.
2. Back in Supabase: **Authentication → Sign In / Providers** → turn off **Allow new users to sign up** (keeps the beta private).
3. Safari **Share → Add to Home Screen**. That's your app.

## Tips
- Record at **1080p** so videos stay under the 50MB storage cap (larger clips still analyze, but only frames are saved).
- Mark start right at the load/trigger of a swing; at 0.1s the AI sees a 4-second window.
- Use chat to correct the AI, then **Save as coaching rule** for anything it should always remember.

## Optional settings (Vercel env vars)
`ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `DAILY_ANALYSIS_LIMIT` (10), `DAILY_CHAT_LIMIT` (60), `NEXT_PUBLIC_MAX_VIDEO_MB` (50).
