-- Save external Jobicy opportunities per signed-in user.
-- Only canonical HTTPS Jobicy URLs are accepted; rows are private to their owner.
create table if not exists public.saved_external_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  organization text check (char_length(organization) <= 160),
  location text check (char_length(location) <= 160),
  source_name text not null default 'Jobicy' check (char_length(source_name) <= 120),
  source_url text not null check (left(source_url, length('https://jobicy.com/')) = 'https://jobicy.com/'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source_url)
);
create index if not exists saved_external_opportunities_user_idx
  on public.saved_external_opportunities (user_id, created_at desc);
alter table public.saved_external_opportunities enable row level security;
revoke all on public.saved_external_opportunities from anon, authenticated;
grant select, insert, delete on public.saved_external_opportunities to authenticated;
create policy "Users can read own external saved opportunities"
  on public.saved_external_opportunities for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can save own external opportunities"
  on public.saved_external_opportunities for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can remove own external saved opportunities"
  on public.saved_external_opportunities for delete to authenticated
  using ((select auth.uid()) = user_id);
