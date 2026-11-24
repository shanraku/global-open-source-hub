-- Secure moderation for Global Open Source Hub.
-- Authorization is based only on Supabase app_metadata, never user-editable user_metadata.

drop policy if exists "Admins can read all submissions" on public.submissions;
create policy "Admins can read all submissions"
on public.submissions
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'hub_role') = 'admin');

drop policy if exists "Admins can update submission status" on public.submissions;
create policy "Admins can update submission status"
on public.submissions
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'hub_role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'hub_role') = 'admin');

grant select, insert on public.submissions to authenticated;
grant update (status) on public.submissions to authenticated;

drop policy if exists "Admins can publish opportunities" on public.opportunities;
create policy "Admins can publish opportunities"
on public.opportunities
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'hub_role') = 'admin'
  and status = 'published'
);

grant insert on public.opportunities to authenticated;

-- Atomic review: approving a suggestion publishes it; corrections are approved
-- for follow-up but are not turned into a new opportunity listing.
create or replace function public.review_community_submission(
  p_submission_id uuid,
  p_decision text
)
returns table (
  submission_id uuid,
  review_status text,
  published_opportunity_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission public.submissions%rowtype;
  v_opportunity_id uuid := null;
  v_opportunity_type text;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'hub_role') is distinct from 'admin' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;

  select *
    into v_submission
    from public.submissions
   where id = p_submission_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'Pending submission not found' using errcode = 'P0002';
  end if;

  update public.submissions
     set status = p_decision
   where id = p_submission_id;

  if p_decision = 'approved' and v_submission.submission_type <> 'correction' then
    v_opportunity_type := case v_submission.submission_type
      when 'job_source' then 'job'
      when 'project' then 'opensource'
      when 'resource' then 'learning'
      else 'other'
    end;

    insert into public.opportunities (
      title, description, opportunity_type, source_name, source_url,
      status, published_at
    )
    values (
      v_submission.title,
      nullif(v_submission.notes, ''),
      v_opportunity_type,
      'Community submission',
      v_submission.url,
      'published',
      now()
    )
    returning id into v_opportunity_id;
  end if;

  return query select p_submission_id, p_decision, v_opportunity_id;
end;
$function$;

revoke all on function public.review_community_submission(uuid, text) from public, anon;
grant execute on function public.review_community_submission(uuid, text) to authenticated;
