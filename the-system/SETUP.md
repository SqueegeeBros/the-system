# The System — setup guide

Everything is free. Total time is about 15 minutes, done once.

## 1. Put it online (GitHub Pages, ~5 min, on your PC)

The app has to live at a web address so your phone can install it. That address also lets the camera, Gemini and Drive work.

1. Go to **github.com** and sign in, or create a free account.
2. Click **+** (top right) → **New repository**. Name it `the-system`, set it to **Public**, and click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Unzip `the-system.zip`. Open the folder and drag **everything inside it** onto the page: `index.html`, `sw.js`, `manifest.webmanifest`, `SETUP.md`, and the `css`, `js` and `icons` folders. Click **Commit changes**.
5. Go to **Settings → Pages**. Under *Branch*, pick **main** and **/ (root)**, then click **Save**.
6. Wait about a minute. Your app is live at `https://YOUR-USERNAME.github.io/the-system/`.

To update the app later, upload changed files the same way. The app picks them up the next time it opens.

## 2. Install it on your Android phone

1. Open your link in **Chrome** on your phone.
2. Tap **⋮ → Install app** (on some phones it's called *Add to Home screen*).
3. Open it from the new icon. From now on it runs full-screen like a normal app and works offline.

Your data lives only on the phone. Uninstalling the app or clearing Chrome's site data erases it, so set up backup (step 4).

## 3. Gemini key: photo scan + AI meal builder (~2 min)

1. Go to **aistudio.google.com/apikey** and sign in with your Google account.
2. Click **Create API key** and copy it.
3. In the app, go to **Status → Settings → AI · Gemini**, paste the key, and tap **Test key**.

The free tier needs no card. If you ever hit the free limit, the app retries once on the lighter Flash-Lite model automatically. Logging manually always works. Google may use free-tier requests to improve its products. Only food photos and recipe text are sent.

## 4. Google Drive automatic backup (~7 min, optional but recommended)

1. Go to **console.cloud.google.com** → create a project (any name, e.g. "The System").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → choose *External* → fill in the app name and your email. Under **Test users**, add your own Gmail.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   Under **Authorized JavaScript origins**, add `https://YOUR-USERNAME.github.io` (no path at the end).
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into **Settings → Backup**.
6. Tap **Back up to Drive** once and approve. The backup is saved as `the-system-backup.json` in your Drive.

The app only gets access to files it creates itself, not the rest of your Drive. Backups run once a day. If Google's sign-in from earlier that session has expired, a banner on the Quests tab asks for one tap. **Export file** works anytime as a manual backup.

Progress photos are not included in backups because of their size.

## 5. Fix these first (2 minutes in the app)

- **Food → My Meals.** Rice cakes, 4 eggs + sausage, beef & rice and overnight oats are estimates (marked *Estimate*). Tap ✎ and enter real numbers from your labels, or rebuild each one with **Build with AI**.
- **Turkey & rice and chicken pot pie** aren't saved, because the exact amounts weren't known. Add each one with **Build with AI** in one sentence, including amounts and servings.
- **Train → Weekly split.** Upper is preloaded from your last recorded session. Lower, Push, Pull and Legs are empty. Tap ✎ to add them, or add exercises during your first session and they'll save to the template.
- **Work → Side quests.** The three starter tasks are placeholders. Replace them with your real daily business tasks.

## How the rules work

- **Daily quests:** hit calories and protein (every day); finish your session (Mon–Fri); 90 minutes of deep work (Mon–Fri); in bed by 8:00 PM (Sun–Thu nights). Each quest is worth 25 XP and gives +1 to a stat. Clearing all of them gives a +50 bonus and extends your streak.
- **Streak multiplier:** +10% XP per streak day, up to ×2.0.
- **At midnight:** each open quest costs 30 XP (you can drop levels) and resets your streak. Three missed days in a row drop you a rank.
- **Ranks:** E (Lv 1–9), D (10–19), C (20–34), B (35–49), A (50–74), S (75+). Each level takes 100 × level XP.
- **Pause:** 4 per month, for real sick days only. A paused day has no quests, no XP and no penalties, and your streak is frozen.
- **Side quests:** +10 XP each, never penalized. **PRs:** +15 XP. **Milestones:** S 50 · M 100 · L 200 · XL 400 XP.

Every number above can be changed in **Settings**.
