# Google Search Console Setup

Goal: get AirportReady indexed without posting on social media or messaging people.

## Property

Use a URL-prefix property first:

```text
https://airportready.onrender.com/
```

Domain properties are better long term, but they need DNS access. URL-prefix is faster for this hosted test.

## Verification

Use the HTML tag verification method if possible. The app supports this without code edits through an environment variable.

The operational checklist is available at:

```text
https://airportready.onrender.com/admin/seo
```

1. In Google Search Console, choose URL-prefix property.
2. Copy only the value inside `content="..."` from the verification tag.
3. In Render, open `airportready` -> Environment.
4. Add:

```text
GOOGLE_SITE_VERIFICATION=the-token-from-google
```

5. Save and redeploy.
6. Open the site source and confirm a `google-site-verification` meta tag is present.
7. Click Verify in Search Console.

## Submit Sitemap

After verification, submit:

```text
https://airportready.onrender.com/sitemap.xml
```

Also test:

```text
https://airportready.onrender.com/robots.txt
```

## What To Watch

Search Console:

- Impressions for airport queries
- Clicks
- Average position
- Queries containing `airport security wait time`
- Queries containing `how early to arrive`

AirportReady `/admin`:

- `page_view`
- `organic_search`
- `calculate_trip`
- `submit_report`
- `join_waitlist`

## First SEO Queries To Target

```text
prague airport security wait time
how early to arrive at prague airport
vienna airport security wait time
how early to arrive at vienna airport
berlin airport security wait time
munich airport security wait time
```

## Rule

Do not optimize for generic "travel app" traffic. Optimize for people with an immediate airport timing problem.
