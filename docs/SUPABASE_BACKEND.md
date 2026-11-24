# Supabase backend

The Global Open Source Hub uses a dedicated Supabase project. It is intentionally separate from Mauqify and GrowTrust.

## Project

- Project name: `Global-Open-Source-Hub`
- Region: `ap-south-1` (Mumbai)
- Project ref: `rvbvfiendmmzjxxhilcf`
- API URL: `https://rvbvfiendmmzjxxhilcf.supabase.co`

## Foundation tables

- `profiles`: private user profile fields; users can read/create/update only their own row.
- `opportunities`: curated jobs, internships, volunteering, grants, open-source projects and learning resources. Public clients can read published rows only. Inserts and moderation are reserved for trusted server-side workflows.
- `saved_opportunities`: private saved items, scoped to the signed-in owner.
- `submissions`: user suggestions; each user can create and read only their own submissions. New submissions default to pending review.

All four public-schema tables have Row Level Security enabled. The browser must use only a Supabase publishable key. Never expose a service-role or secret key in client-side code, GitHub Pages, commits, or public workflows.

## Website integration

The Global Jobs page now loads `supabase-client.js` and `supabase-auth.js` for browser-side email signup, sign-in, session display and sign-out. The browser uses only the project's publishable key. The client library is loaded from a pinned jsDelivr ESM URL.

Before enabling public signup, configure the Supabase Auth Site URL and allowed redirect URLs for `https://shanraku.github.io/global-open-source-hub/**`, and confirm the email provider and confirmation template. The current UI reports the confirmation state to the user. The saved-opportunities UI is a separate next step and must use rows from `public.opportunities`; external Jobicy feed links are not saved into that table.

## Migrations

The initial schema is in `supabase/migrations/20261124033636_global_hub_foundation_schema.sql`.

## Important scope and safety

- This backend does not automatically verify jobs or guarantee employment.
- Opportunity records should be imported only from permitted sources and should retain source attribution and canonical links.
- Public publishing and moderation must remain human-reviewed until a separate, audited admin workflow exists.
- Do not create a public policy that lets anonymous visitors insert, update, or delete opportunity records.
- Configure Auth providers and redirect URLs before enabling user signup in the website.


## Saved external opportunities

The Global Jobs page lets authenticated users save external Jobicy feed listings to `public.saved_external_opportunities`. This table stores only a small listing snapshot and canonical Jobicy URL; it does not copy the full job description or claim the listing is verified. Rows are private to their owner through RLS. The browser uses the publishable key only. The feature is intentionally limited to HTTPS URLs on the exact `jobicy.com` hostname.

## Submission moderation policy

The migration `20261124070000_lock_submissions_to_pending.sql` restricts the authenticated insert policy on `public.submissions`: users may insert only rows whose `user_id` matches `auth.uid()` and whose `status` is `pending`. Users cannot self-approve submissions. The table remains RLS-protected, and users can read only their own submissions.

## Admin review and publishing

The private `admin-review.html` page is a moderation workspace. Admin authorization uses the Supabase JWT `app_metadata.hub_role = admin` claim; never use user-editable `user_metadata` for authorization. The initial administrator role is assigned server-side to the confirmed owner account.

The migration `20261124080000_admin_review_dashboard.sql` adds administrator-only RLS policies and the `review_community_submission` transaction. The function runs as SECURITY INVOKER, verifies the admin claim, locks a pending submission, and records the decision atomically. Approving a job, project, resource, or other suggestion creates a published row in `public.opportunities`; approving a correction records the decision without creating a duplicate listing. Rejecting a suggestion does not publish it.

The browser uses only the publishable key. Admin-only reads, status updates, and publishing are enforced by database policies and function permissions, not by hiding the page. After the first role assignment, the administrator must sign out and sign in again so the JWT contains the refreshed app metadata claim. Admin review should include checking the original source, eligibility, legitimacy, and current availability before approval.
