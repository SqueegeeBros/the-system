-- The System: cross-device sync setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Run it once.

-- 1) One private row per account holding your app data
create table if not exists public.system_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.system_state enable row level security;

drop policy if exists "own row select" on public.system_state;
drop policy if exists "own row insert" on public.system_state;
drop policy if exists "own row update" on public.system_state;
drop policy if exists "own row delete" on public.system_state;
create policy "own row select" on public.system_state for select using (auth.uid() = user_id);
create policy "own row insert" on public.system_state for insert with check (auth.uid() = user_id);
create policy "own row update" on public.system_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.system_state for delete using (auth.uid() = user_id);

-- 2) Private file storage (DEXA reports, records, progress photos). Each account only sees its own folder.
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

drop policy if exists "own files select" on storage.objects;
drop policy if exists "own files insert" on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;
create policy "own files select" on storage.objects for select using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files insert" on storage.objects for insert with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
