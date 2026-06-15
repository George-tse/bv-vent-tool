# BV Vent Survey Tool — Deployment Guide

**Total time: ~15 minutes, done entirely in a browser. No coding knowledge required.**

---

## Step 1 — Set up the Supabase database (once only)

1. Go to **https://supabase.com/dashboard** and sign in.
2. Open the project **xifeyqspfftoizobfhed** (your existing BV Workbench project).
3. Click **SQL Editor** in the left sidebar.
4. Click **+ New query**.
5. Copy the entire contents of `supabase/schema.sql` and paste into the editor.
6. Click **Run** (or press Ctrl+Enter).
   - You should see "Success. No rows returned."
7. Create the photo storage bucket:
   - In the left sidebar, click **Storage**.
   - Click **+ New bucket**.
   - Name: `vent-photos`
   - Toggle **Public bucket** to **OFF**.
   - File size limit: `10 MB`
   - Click **Save**.

---

## Step 2 — Create a GitHub repository (once only)

1. Go to **https://github.com** and sign in (create a free account if needed).
2. Click the **+** button (top right) → **New repository**.
3. Settings:
   - Repository name: `bv-vent-tool`
   - Visibility: **Private** ✓
   - ☐ Do NOT tick "Add README"
4. Click **Create repository**.

---

## Step 3 — Add Supabase credentials as GitHub Secrets

> These secrets are injected at build time — they never appear in plain text in your repository.

1. In your new GitHub repository, click **Settings** (top tab bar).
2. In the left sidebar: **Secrets and variables → Actions**.
3. Click **New repository secret** and add these two secrets:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://xifeyqspfftoizobfhed.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpZmV5cXNwZmZ0b2l6b2JmaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzcyODIsImV4cCI6MjA5NzAxMzI4Mn0.16gbAD68lNVEed1oyvPEpwpJE0txgxWMD4jKY5icHQM` |

---

## Step 4 — Upload the project files

1. On your repository's main page, click **uploading an existing file** (or drag files).
2. Drag the entire `bv-vent-tool/` folder onto the GitHub upload page.
   - All files and subfolders will be uploaded automatically.
3. Write a commit message: `Initial deployment`
4. Click **Commit changes**.

> **Important:** The `.github/` folder (hidden on macOS) must be included.  
> On macOS: press **Cmd+Shift+.** in Finder to show hidden files before dragging.

---

## Step 5 — Enable GitHub Pages

1. In your repository, click **Settings → Pages** (left sidebar).
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Click **Save**.

The first deployment starts automatically (check the **Actions** tab — it takes ~2 minutes).

---

## Step 6 — Access the app

Once the Actions workflow shows a green tick ✓, your app is live at:

```
https://YOUR-GITHUB-USERNAME.github.io/bv-vent-tool/
```

Replace `YOUR-GITHUB-USERNAME` with your actual GitHub username.

---

## Install on phone / tablet (Android)

1. Open the URL above in Chrome on your phone.
2. Tap the **⋮** menu → **Add to home screen**.
3. The app installs as a standalone app — no browser UI, works offline underground.

## Install on iPhone / iPad

1. Open the URL in Safari.
2. Tap the **Share** button (rectangle with arrow) → **Add to Home Screen**.
3. Tap **Add**.

---

## Updating the app

Any time you push changes to the `main` branch, GitHub Actions automatically rebuilds and deploys. No manual steps needed.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Actions workflow fails with "secrets not found" | Check Step 3 — secrets must be named exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| App loads but "sync" fails | Check Supabase SQL ran successfully (Step 1) and the `vent-photos` bucket exists |
| Hidden `.github` folder not uploaded | On macOS press Cmd+Shift+. in Finder to show it, then re-drag |
| App shows blank screen | Open browser console (F12) and check for error messages — usually a typo in secrets |
| Photos don't appear in report | Photos are stored on-device; open the same survey on the same device |

---

## Data architecture

```
Device (underground, offline)     Cloud (surface, when online)
─────────────────────────────     ───────────────────────────
IndexedDB                    →←   Supabase PostgreSQL
  surveys                         vent_surveys
  readings (in survey)            vent_readings
  defects  (in survey)            vent_defects
  photos   (base64 blobs)   →     Storage: vent-photos/
                                  vent_photos (metadata)
fan_events                  →     fan_events
```

Sync is one-way (device → cloud) and idempotent (safe to run multiple times).
All data is written to IndexedDB first, so the app is fully functional offline.
