# 🗄️ Agency OS — Database Setup

## Quick Start (5 minutes)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up (free tier is enough)
3. Click **"New Project"**
4. Name it `agency-os` (or anything)
5. Set a database password (save it!)
6. Choose region (closest to you)
7. Wait 2-3 minutes for setup

### Step 2: Get Your Keys

1. Go to **Settings** → **API**
2. Copy two values:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **anon/public key** (NOT the service_role key!)

### Step 3: Add to .env.local

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   ```

### Step 4: Run the Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Copy the entire content of `schema.sql`
4. Paste and click **"Run"**

✅ **Done!** Your database is ready.

---

## What You Get

### Tables Created:
- **profiles** — User profiles (auto-created on signup)
- **clients** — Client companies
- **projects** — Projects linked to clients
- **tasks** — Tasks linked to projects
- **files** — File metadata
- **interactions** — Client interactions (meetings, emails, calls)
- **comments** — Comments on any entity

### Views Created:
- **project_overview** — Projects with client info and task counts
- **client_stats** — Client statistics

### Features:
- ✅ Auto `updated_at` triggers
- ✅ Row Level Security (RLS) enabled
- ✅ Foreign key relationships
- ✅ Indexes for performance
- ✅ Auto profile creation on signup

---

## Development Mode (Without Supabase)

The app works **without** a database! It uses mock data from the pages themselves.

To check if DB is connected:
- Visit `/settings` → Look for database status indicator
- Or check browser console for connection messages

---

## Next Steps

Once DB is set up:
1. **Authentication** — Add login/signup pages
2. **Real Data** — Pages will pull from DB instead of mock data
3. **File Upload** — Use Supabase Storage for real file uploads
4. **Real-time** — Subscribe to live updates

---

## Troubleshooting

**Error: "credentials not set"**
→ Copy `.env.local.example` to `.env.local` and fill in values

**Error: "relation does not exist"**
→ Run the `schema.sql` in Supabase SQL Editor

**Error: "permission denied"**
→ Check RLS policies in Supabase → Authentication → Policies
