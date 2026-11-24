-- Users may submit their own suggestions, but cannot self-approve them.
drop policy if exists "Users can submit opportunities and resources" on public.submissions;

create policy "Users can submit opportunities and resources"
on public.submissions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
);
