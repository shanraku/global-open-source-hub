-- Global Open Source Hub foundation schema.
-- User-owned data is private; public opportunity browsing is published-only.
-- Never place service_role keys in browser code.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 200),
  organization text check (char_length(organization) <= 160),
  description text check (char_length(description) <= 12000),
  opportunity_type text not null check (opportunity_type in ('job','internship','volunteer','grant','opensource','learning','other')),
  location text check (char_length(location) <= 160),
  is_remote boolean not null default false,
  source_name text not null check (char_length(source_name) <= 120),
  source_url text not null check (source_url ~ '^https://'),
  published_at timestamptz,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','published','expired','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_type text not null check (submission_type in ('job_source','project','resource','correction','other')),
  title text not null check (char_length(title) between 3 and 200),
  url text not null check (url ~ '^https://'),
  notes text check (char_length(notes) <= 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists opportunities_public_feed_idx
  on public.opportunities (published_at desc, created_at desc)
  where status = 'published';
create index if not exists opportunities_type_idx on public.opportunities (opportunity_type, status);
create index if not exists saved_opportunities_user_idx on public.saved_opportunities (user_id, created_at desc);
create index if not exists submissions_user_idx on public.submissions (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.opportunities enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.submissions enable row level security;

create policy "Users can read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users can create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Public can read published opportunities" on public.opportunities
  for select to anon, authenticated using (status = 'published');

create policy "Users can read own saved opportunities" on public.saved_opportunities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can save own opportunities" on public.saved_opportunities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can remove own saved opportunities" on public.saved_opportunities
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can submit opportunities and resources" on public.submissions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can read own submissions" on public.submissions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.opportunities, public.saved_opportunities, public.submissions from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.opportunities to anon, authenticated;
grant select, insert, delete on public.saved_opportunities to authenticated;
grant select, insert on public.submissions to authenticated;
