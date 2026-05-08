# Supabase Setup

Goal: persist AirportReady waitlist signups and analytics events beyond Render free instance restarts.

## Render Environment Variables

Add these to the `airportready` Render service:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Use the service role key only on the server. Do not paste it into browser code.

## Database SQL

Run this in Supabase SQL Editor:

```sql
create table if not exists public.airport_events (
  id uuid primary key,
  event_type text not null,
  airport_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists airport_events_created_at_idx
  on public.airport_events (created_at desc);

create index if not exists airport_events_event_type_idx
  on public.airport_events (event_type);

create index if not exists airport_events_airport_code_idx
  on public.airport_events (airport_code);

create table if not exists public.waitlist_signups (
  id uuid primary key,
  email text not null,
  airport_code text,
  plan text not null default 'trip_pass',
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_plan_unique unique (email, plan)
);

create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);

create index if not exists waitlist_signups_airport_code_idx
  on public.waitlist_signups (airport_code);

alter table public.airport_events enable row level security;
alter table public.waitlist_signups enable row level security;
```

No public RLS policies are needed because AirportReady writes from the server with the service role key.

## Verification

After Render redeploys, open:

```text
https://airportready.onrender.com/admin/seo
```

The `Persistent storage` row should show:

```text
Supabase
```

Then submit a test email from any landing page and confirm it appears in the `waitlist_signups` table.
