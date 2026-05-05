# AirportReady MVP

AirportReady is a mobile-first web/PWA MVP for airport departure planning, security wait reports, Trip Pass waitlist validation, and lightweight admin metrics.

## Run Locally

```powershell
npm start
```

Default local URL:

```text
http://127.0.0.1:4181/
```

Useful routes:

```text
/                         Main planner
/airports/prg             SEO airport page
/airports/vie             SEO airport page
/airports/ber             SEO airport page
/admin                    Validation dashboard
/api/health               Health check
/api/admin                Metrics JSON
```

## Deployment Decision

Deploy this as a public web/PWA first. Do not start with App Store or Google Play until there is proof that travelers:

- calculate a trip,
- submit wait reports,
- open Trip Pass,
- join the waitlist,
- return for a second use.

## Render Deploy

1. Create a GitHub repository and push this folder.
2. In Render, create a new Blueprint or Web Service from the repository.
3. Render can use `render.yaml` automatically.
4. Confirm these settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/api/health`
   - Environment variable: `NODE_ENV=production`
   - Environment variable: `DATA_DIR=/var/data`

The `render.yaml` is configured for Render's free web service tier. This is fine for a public smoke test, but collected JSON data can reset on restarts or deploys because free Render web services do not support persistent disks.

When the app starts showing real signal, upgrade to a paid instance with a persistent disk or move the data layer to Postgres.

## Production Caveat

This MVP stores data in JSON files. That is fine for early validation with low traffic, but it should move to a real database before serious public launch. Good next choices:

- SQLite on a persistent disk for a simple beta,
- Postgres for multi-user production,
- Supabase/Neon if you want managed Postgres quickly.

## Validation Metrics

The app currently tracks:

- `calculate_trip`
- `submit_report`
- `open_trip_pass`
- `join_waitlist`
- `select_airport`
- `enable_alert`
- `offer_click`

Watch `/admin` after sharing the public link.
