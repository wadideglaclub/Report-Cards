-- شغّل الملف ده مرة واحدة في Supabase: SQL Editor -> New query -> Run
create table if not exists public.wadi_sync (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table public.wadi_sync enable row level security;

drop policy if exists "wadi_sync_select" on public.wadi_sync;
drop policy if exists "wadi_sync_insert" on public.wadi_sync;
drop policy if exists "wadi_sync_update" on public.wadi_sync;
create policy "wadi_sync_select" on public.wadi_sync for select using (true);
create policy "wadi_sync_insert" on public.wadi_sync for insert with check (true);
create policy "wadi_sync_update" on public.wadi_sync for update using (true) with check (true);
