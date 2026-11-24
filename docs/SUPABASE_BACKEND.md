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

## Migrations

The initial schema is in `supabase/migrations/20261124033636_global_hub_foundation_schema.sql`.

## Important scope and safety

- This backend does not automatically verify jobs or guarantee employment.
- Opportunity records should be imported only from permitted sources and should retain source attribution and canonical links.
- Public publishing and moderation must remain human-reviewed until a separate, audited admin workflow exists.
- Do not create a public policy that lets anonymous visitors insert, update, or delete opportunity records.
- Configure Auth providers and redirect URLs before enabling user signup in the website.
