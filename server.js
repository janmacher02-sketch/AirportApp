const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const rootDir = __dirname;
const seedDataDir = path.join(rootDir, "data");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : seedDataDir;
const airportsPath = path.join(dataDir, "airports.json");
const reportsPath = path.join(dataDir, "reports.json");
const tripsPath = path.join(dataDir, "trips.json");
const eventsPath = path.join(dataDir, "events.json");
const waitlistPath = path.join(dataDir, "waitlist.json");
const port = Number(process.env.PORT || 4181);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const defaultGoogleSiteVerification = "BzTbHKuBhMDYpjVa2WVY-c_g6B_gY-5hNP-IQLoUzBA";
const defaultIndexNowKey = "a74f9bb9d6a84b2a92a3fd29b5479d1f8e6d8a35c24b4f188a9c5a6d0e2f531c";
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
};

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeJson(filePath, fallback);
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function supabaseConfigured() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

async function supabaseRequest(pathname, { method = "GET", body, prefer } = {}) {
  if (!supabaseConfigured()) {
    throw Object.assign(new Error("Supabase is not configured"), { status: 503 });
  }

  const headers = {
    apikey: supabaseServiceRoleKey,
    authorization: `Bearer ${supabaseServiceRoleKey}`,
    "content-type": "application/json",
  };
  if (prefer) headers.prefer = prefer;

  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload && (payload.message || payload.details || payload.hint);
    throw Object.assign(new Error(message || `Supabase request failed with ${response.status}`), {
      status: 502,
    });
  }

  return payload;
}

function toEventRow(event) {
  return {
    id: event.id,
    event_type: event.eventType,
    airport_code: event.airportCode,
    metadata: event.metadata || {},
    created_at: event.createdAt,
  };
}

function fromEventRow(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    airportCode: row.airport_code,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function toWaitlistRow(entry) {
  return {
    id: entry.id,
    email: entry.email,
    airport_code: entry.airportCode,
    plan: entry.plan,
    created_at: entry.createdAt,
  };
}

function fromWaitlistRow(row) {
  return {
    id: row.id,
    email: row.email,
    airportCode: row.airport_code,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

async function readEvents() {
  if (!supabaseConfigured()) return readJson(eventsPath, []);
  const rows = await supabaseRequest("airport_events?select=*&order=created_at.desc&limit=5000");
  return rows.map(fromEventRow);
}

async function createEvent(event) {
  if (!supabaseConfigured()) {
    const events = await readJson(eventsPath, []);
    events.unshift(event);
    await writeJson(eventsPath, events);
    return { event, eventCount: events.length };
  }

  await supabaseRequest("airport_events", {
    method: "POST",
    body: toEventRow(event),
    prefer: "return=minimal",
  });
  const events = await readEvents();
  return { event, eventCount: events.length };
}

async function readWaitlist() {
  if (!supabaseConfigured()) return readJson(waitlistPath, []);
  const rows = await supabaseRequest("waitlist_signups?select=*&order=created_at.desc&limit=5000");
  return rows.map(fromWaitlistRow);
}

async function findWaitlistEntry(email, plan) {
  if (!supabaseConfigured()) {
    const waitlist = await readJson(waitlistPath, []);
    return waitlist.find((item) => item.email === email && item.plan === plan) || null;
  }

  const rows = await supabaseRequest(
    `waitlist_signups?select=*&email=eq.${encodeURIComponent(email)}&plan=eq.${encodeURIComponent(plan)}&limit=1`
  );
  return rows.length ? fromWaitlistRow(rows[0]) : null;
}

async function createWaitlistEntry(entry) {
  if (!supabaseConfigured()) {
    const waitlist = await readJson(waitlistPath, []);
    waitlist.unshift(entry);
    await writeJson(waitlistPath, waitlist);
    return { entry, waitlistCount: waitlist.length };
  }

  await supabaseRequest("waitlist_signups", {
    method: "POST",
    body: toWaitlistRow(entry),
    prefer: "return=minimal",
  });
  const waitlist = await readWaitlist();
  return { entry, waitlistCount: waitlist.length };
}

async function copySeedDataIfMissing(targetPath, seedFileName, fallback) {
  try {
    await fs.access(targetPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    const seedPath = path.join(seedDataDir, seedFileName);
    try {
      const seed = JSON.parse(await fs.readFile(seedPath, "utf8"));
      await writeJson(targetPath, seed);
    } catch (seedError) {
      if (seedError.code !== "ENOENT") throw seedError;
      await writeJson(targetPath, fallback);
    }
  }
}

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true });
  await Promise.all([
    copySeedDataIfMissing(airportsPath, "airports.json", []),
    copySeedDataIfMissing(reportsPath, "reports.json", []),
    copySeedDataIfMissing(tripsPath, "trips.json", []),
    copySeedDataIfMissing(eventsPath, "events.json", []),
    copySeedDataIfMissing(waitlistPath, "waitlist.json", []),
  ]);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1024 * 1024) {
      throw Object.assign(new Error("Request body too large"), { status: 413 });
    }
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const statusCode = error.status || 500;
  sendJson(response, statusCode, {
    error: statusCode === 500 ? "Internal server error" : error.message,
  });
}

function normalizeAirportReport(input) {
  const airportCode = String(input.airportCode || "").toUpperCase();
  const observedWait = Number(input.observedWait);
  const crowdLevel = Number(input.crowdLevel || 3);
  const terminal = String(input.terminal || "");

  if (!/^[A-Z0-9]{3}$/.test(airportCode)) {
    throw Object.assign(new Error("airportCode must be a 3-character airport code"), { status: 400 });
  }

  if (!Number.isFinite(observedWait) || observedWait < 0 || observedWait > 180) {
    throw Object.assign(new Error("observedWait must be between 0 and 180 minutes"), { status: 400 });
  }

  if (!Number.isFinite(crowdLevel) || crowdLevel < 1 || crowdLevel > 5) {
    throw Object.assign(new Error("crowdLevel must be between 1 and 5"), { status: 400 });
  }

  return {
    id: randomUUID(),
    airportCode,
    terminal,
    observedWait,
    crowdLevel,
    createdAt: new Date().toISOString(),
  };
}

function normalizeEvent(input) {
  const eventType = String(input.eventType || "").trim();
  const airportCode = String(input.airportCode || "").toUpperCase();
  const allowedEvents = new Set([
    "page_view",
    "calculate_trip",
    "submit_report",
    "open_trip_pass",
    "join_waitlist",
    "select_airport",
    "enable_alert",
    "offer_click",
  ]);

  if (!allowedEvents.has(eventType)) {
    throw Object.assign(new Error("Unsupported eventType"), { status: 400 });
  }

  return {
    id: randomUUID(),
    eventType,
    airportCode: /^[A-Z0-9]{3}$/.test(airportCode) ? airportCode : null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    createdAt: new Date().toISOString(),
  };
}

function normalizeWaitlist(input) {
  const email = String(input.email || "").trim().toLowerCase();
  const airportCode = String(input.airportCode || "").toUpperCase();
  const plan = String(input.plan || "trip_pass").slice(0, 40);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw Object.assign(new Error("Valid email is required"), { status: 400 });
  }

  return {
    id: randomUUID(),
    email,
    airportCode: /^[A-Z0-9]{3}$/.test(airportCode) ? airportCode : null,
    plan,
    createdAt: new Date().toISOString(),
  };
}

function applyReportToAirports(airports, report) {
  const airport = airports.find((item) => item.code === report.airportCode);
  if (!airport) return airports;

  airport.wait = [Math.max(0, report.observedWait - 4), report.observedWait + 5];
  airport.reports += 1;
  airport.updated = 0;
  airport.confidence = airport.reports >= 20 ? "High" : "Medium";
  airport.status = report.observedWait >= 35 ? "Severe" : report.observedWait >= 20 ? "Busy" : "Normal";
  airport.trend = report.observedWait >= airport.wait[1] ? "Rising" : airport.trend;
  airport.trendData = [...airport.trendData.slice(1), report.observedWait];

  return airports;
}

function byCount(items, keySelector) {
  return items.reduce((accumulator, item) => {
    const key = keySelector(item) || "unknown";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function originFromRequest(request) {
  const proto = request.headers["x-forwarded-proto"] || "https";
  const hostHeader = request.headers["x-forwarded-host"] || request.headers.host || "airportready.onrender.com";
  return `${proto}://${hostHeader}`;
}

function googleVerificationMeta() {
  const token = String(process.env.GOOGLE_SITE_VERIFICATION || defaultGoogleSiteVerification).trim();
  if (!token) return "";
  return `<meta name="google-site-verification" content="${escapeHtml(token)}" />`;
}

function withGoogleVerification(html) {
  return html.replaceAll("__GOOGLE_SITE_VERIFICATION_META__", googleVerificationMeta());
}

function indexNowKey() {
  return String(process.env.INDEXNOW_KEY || defaultIndexNowKey).trim();
}

function indexNowKeyLocation(request) {
  return `${originFromRequest(request)}/indexnow-key.txt`;
}

function acquisitionTrackingScript(page, airportCode = null) {
  const pageValue = JSON.stringify(page);
  const airportValue = airportCode ? JSON.stringify(airportCode) : "null";
  return `<script>
      (function () {
        var params = new URLSearchParams(location.search);
        var explicitSource = params.get("src") || params.get("utm_source");
        var referrer = document.referrer || "";
        var referrerHost = "";
        try {
          referrerHost = referrer ? new URL(referrer).hostname.replace(/^www\\./, "") : "";
        } catch (error) {
          referrerHost = "";
        }
        var searchHosts = ["google.", "bing.", "duckduckgo.", "seznam.", "yahoo.", "ecosia.", "baidu.", "yandex."];
        var acquisitionSource =
          explicitSource ||
          (searchHosts.some(function (host) { return referrerHost.indexOf(host) !== -1; })
            ? "organic_search"
            : referrerHost
              ? "referral"
              : "direct");
        fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eventType: "page_view",
            airportCode: ${airportValue},
            metadata: {
              acquisitionSource: acquisitionSource,
              referrerHost: referrerHost,
              path: location.pathname,
              query: location.search,
              page: ${pageValue}
            }
          })
        }).catch(function () {});
      })();
    </script>`;
}

function landingWaitlistBlock({ airportCode = "", plan = "trip_pass", title = "Get airport timing alerts" } = {}) {
  const airportValue = airportCode ? escapeHtml(airportCode) : "";
  const helperText = airportCode
    ? `Airport: ${escapeHtml(airportCode)} - Plan: ${escapeHtml(plan)}`
    : `Plan: ${escapeHtml(plan)}`;
  return `<section class="public-card landing-cta">
        <div>
          <p class="eyebrow">Trip alerts</p>
          <h2>${escapeHtml(title)}</h2>
          <p class="public-copy">Join the test list for leave-now alerts and airport timing updates when this pilot becomes available.</p>
        </div>
        <form class="landing-waitlist-form" data-airport-code="${airportValue}" data-plan="${escapeHtml(plan)}">
          <label>
            <span>Email</span>
            <div class="landing-waitlist-row">
              <input name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
              <button type="submit">Get alerts</button>
            </div>
          </label>
          <p class="helper">${helperText}</p>
          <p class="landing-form-message" role="status" aria-live="polite"></p>
        </form>
      </section>`;
}

function landingWaitlistScript(page) {
  const pageValue = JSON.stringify(page);
  return `<script>
      document.querySelectorAll(".landing-waitlist-form").forEach(function (form) {
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          var emailInput = form.querySelector("input[name='email']");
          var message = form.querySelector(".landing-form-message");
          var airportCode = form.getAttribute("data-airport-code") || null;
          var plan = form.getAttribute("data-plan") || "trip_pass";
          if (message) message.textContent = "Saving...";
          fetch("/api/waitlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: emailInput.value.trim(), airportCode: airportCode, plan: plan })
          })
            .then(function (response) {
              return response.json().then(function (payload) {
                if (!response.ok) throw new Error(payload.error || "Waitlist signup failed.");
                return payload;
              });
            })
            .then(function (payload) {
              emailInput.value = "";
              if (message) message.textContent = payload.duplicate ? "You are already on the list." : "Saved. We will use this to prioritize alerts.";
              return fetch("/api/events", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  eventType: "join_waitlist",
                  airportCode: airportCode,
                  metadata: { page: ${pageValue}, plan: plan, duplicate: Boolean(payload.duplicate), path: location.pathname }
                })
              });
            })
            .catch(function (error) {
              if (message) message.textContent = error.message || "Could not save email.";
            });
        });
      });
    </script>`;
}

function seoLandingPages(origin, airports) {
  return [
    {
      path: "/tools/airport-arrival-calculator",
      url: `${origin}/tools/airport-arrival-calculator`,
      title: "Airport arrival calculator",
      intent: "Tool search",
      eventPage: "arrival_calculator",
      cta: "calculator_alerts",
      priority: "0.9",
    },
    {
      path: "/guides/airport-security-wait-times",
      url: `${origin}/guides/airport-security-wait-times`,
      title: "Airport security wait times guide",
      intent: "General guide",
      eventPage: "security_guide",
      cta: "security_wait_alerts",
      priority: "0.8",
    },
    {
      path: "/guides/how-long-before-flight-should-i-arrive",
      url: `${origin}/guides/how-long-before-flight-should-i-arrive`,
      title: "How long before a flight should I arrive?",
      intent: "General guide",
      eventPage: "how_long_before_flight_guide",
      cta: "flight_arrival_guide",
      priority: "0.8",
    },
    ...airports.flatMap((airport) => [
      {
        path: `/airports/${airport.code.toLowerCase()}`,
        url: `${origin}/airports/${airport.code.toLowerCase()}`,
        title: `${airport.name} security wait time`,
        intent: "Airport status",
        eventPage: "airport_page",
        cta: "planner",
        priority: airport.code === "PRG" || airport.code === "VIE" ? "0.9" : "0.7",
      },
      {
        path: `/airports/${airport.code.toLowerCase()}/security-wait-time`,
        url: `${origin}/airports/${airport.code.toLowerCase()}/security-wait-time`,
        title: `${airport.name} security wait time today`,
        intent: "Airport search",
        eventPage: "airport_security_wait_page",
        cta: "security_wait_alerts",
        priority: airport.code === "PRG" || airport.code === "VIE" ? "0.9" : "0.7",
      },
      {
        path: `/airports/${airport.code.toLowerCase()}/how-early-to-arrive`,
        url: `${origin}/airports/${airport.code.toLowerCase()}/how-early-to-arrive`,
        title: `How early to arrive at ${airport.name}`,
        intent: "Airport search",
        eventPage: "how_early_page",
        cta: "arrival_alerts",
        priority: airport.code === "PRG" || airport.code === "VIE" ? "0.9" : "0.7",
      },
    ]),
  ];
}

async function renderAirportPage(request, response, code) {
  const airportCode = String(code || "").toUpperCase();
  const airports = await readJson(airportsPath, []);
  const airport = airports.find((item) => item.code === airportCode);

  if (!airport) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Airport not found");
    return;
  }

  const template = await fs.readFile(path.join(rootDir, "airport-page.html"), "utf8");
  const replacements = {
    "__AIRPORT_CODE__": airport.code,
    "__AIRPORT_NAME__": airport.name,
    "__AIRPORT_CITY__": airport.city,
    "__AIRPORT_WAIT__": `${airport.wait[0]}-${airport.wait[1]} min`,
    "__AIRPORT_STATUS__": airport.status,
    "__AIRPORT_CONFIDENCE__": airport.confidence,
    "__AIRPORT_UPDATED__": `${airport.updated}m ago`,
    "__CANONICAL_URL__": `${originFromRequest(request)}/airports/${airport.code.toLowerCase()}`,
  };

  const html = withGoogleVerification(Object.entries(replacements).reduce(
    (content, [key, value]) => content.replaceAll(key, escapeHtml(value)),
    template
  ));

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function renderHowEarlyPage(request, response, code) {
  const airportCode = String(code || "").toUpperCase();
  const airports = await readJson(airportsPath, []);
  const airport = airports.find((item) => item.code === airportCode);

  if (!airport) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Airport not found");
    return;
  }

  const recommendedArrival = airport.wait[1] >= 35 ? "2h 45m" : airport.wait[1] >= 22 ? "2h 25m" : "2h 10m";
  const schengenArrival = airport.wait[1] >= 35 ? "2h 20m" : "2h 00m";
  const fastTrackArrival = airport.wait[1] >= 35 ? "2h 15m" : "1h 50m";
  const canonicalUrl = `${originFromRequest(request)}/airports/${airport.code.toLowerCase()}/how-early-to-arrive`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#002045" />
    ${googleVerificationMeta()}
    <meta name="description" content="How early to arrive at ${escapeHtml(airport.name)} (${escapeHtml(
      airport.code
    )}) based on current security wait estimates, terminal buffer, and crowd confidence." />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="How early to arrive at ${escapeHtml(airport.name)} (${escapeHtml(
      airport.code
    )})" />
    <meta property="og:description" content="Current ${escapeHtml(
      airport.code
    )} arrival guidance using security wait estimates and crowd reports." />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <title>How early to arrive at ${escapeHtml(airport.name)} (${escapeHtml(airport.code)}) | AirportReady</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="public-topbar">
      <a class="brand" href="/"><span class="material-symbols-outlined" aria-hidden="true">flight_takeoff</span><span>AirportReady</span></a>
      <nav class="public-nav" aria-label="Public navigation"><a href="/">Planner</a><a href="/airports/${escapeHtml(
        airport.code.toLowerCase()
      )}">${escapeHtml(airport.code)} wait time</a></nav>
    </header>
    <main class="public-page">
      <section class="airport-hero">
        <div>
          <p class="eyebrow">Airport arrival guide</p>
          <h1>How early should you arrive at ${escapeHtml(airport.name)}?</h1>
          <p class="public-copy">For ${escapeHtml(
            airport.code
          )}, AirportReady currently recommends arriving around <strong>${recommendedArrival}</strong> before departure for a standard international trip. The live security estimate is <strong>${escapeHtml(
    `${airport.wait[0]}-${airport.wait[1]} min`
  )}</strong> with ${escapeHtml(airport.confidence.toLowerCase())} confidence.</p>
          <div class="public-actions">
            <a class="primary-link" href="/?airport=${escapeHtml(airport.code)}">Calculate my departure time</a>
            <a class="secondary-link" href="/airports/${escapeHtml(airport.code.toLowerCase())}">View live wait time</a>
          </div>
        </div>
        <aside class="public-status-card">
          <p class="eyebrow">Current guidance</p>
          <strong>${recommendedArrival}</strong>
          <span>${escapeHtml(airport.status)}</span>
          <p>Security estimate: <b>${escapeHtml(`${airport.wait[0]}-${airport.wait[1]} min`)}</b></p>
          <p>Updated: <b>${escapeHtml(`${airport.updated}m ago`)}</b></p>
        </aside>
      </section>
      <section class="public-grid">
        <article class="public-card">
          <p class="eyebrow">Arrival windows</p>
          <h2>${escapeHtml(airport.code)} arrival recommendations</h2>
          <div class="security-summary">
            <div class="metric"><span>Standard international</span><strong>${recommendedArrival}</strong></div>
            <div class="metric"><span>Schengen / short-haul</span><strong>${schengenArrival}</strong></div>
            <div class="metric"><span>Fast track / cabin bag</span><strong>${fastTrackArrival}</strong></div>
            <div class="metric"><span>Current security</span><strong>${escapeHtml(`${airport.wait[0]}-${airport.wait[1]}`)}</strong></div>
          </div>
        </article>
        <article class="public-card">
          <p class="eyebrow">Why this changes</p>
          <h2>Security wait time is the unstable part</h2>
          <p class="public-copy">Airline check-in and boarding buffers are predictable. Security, passport control, and travel time to the airport are not. AirportReady combines those risks into a practical leave-now estimate.</p>
          <div class="public-actions"><a class="primary-link" href="/airports/${escapeHtml(
            airport.code.toLowerCase()
          )}#report">Report ${escapeHtml(airport.code)} wait time</a></div>
        </article>
      </section>
      <section class="public-card">
        <p class="eyebrow">Why this matters</p>
        <h2>Airport timing is easier when the wait is current</h2>
        <p class="public-copy">People searching "how early to arrive at ${escapeHtml(
          airport.name
        )}" usually need a decision soon. AirportReady turns wait estimates and trip buffers into a practical departure plan.</p>
      </section>
      ${landingWaitlistBlock({
        airportCode: airport.code,
        plan: "arrival_alerts",
        title: `Get ${airport.code} arrival alerts`,
      })}
    </main>
    ${acquisitionTrackingScript("how_early_page", airport.code)}
    ${landingWaitlistScript("how_early_page")}
  </body>
</html>`;

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function renderArrivalCalculatorPage(request, response) {
  const origin = originFromRequest(request);
  const airports = await readJson(airportsPath, []);
  const airportLinks = airports
    .map(
      (airport) =>
        `<a href="/airports/${escapeHtml(airport.code.toLowerCase())}/how-early-to-arrive">${escapeHtml(
          airport.name
        )}</a>`
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#002045" />
    ${googleVerificationMeta()}
    <meta name="description" content="Free airport arrival calculator for deciding when to leave for the airport based on security wait time, travel time, and flight departure." />
    <link rel="canonical" href="${escapeHtml(origin)}/tools/airport-arrival-calculator" />
    <meta property="og:title" content="Airport arrival calculator | AirportReady" />
    <meta property="og:description" content="Calculate when to leave for the airport using security wait estimates and practical departure buffers." />
    <meta property="og:url" content="${escapeHtml(origin)}/tools/airport-arrival-calculator" />
    <meta property="og:type" content="website" />
    <title>Airport arrival calculator | AirportReady</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="public-topbar">
      <a class="brand" href="/"><span class="material-symbols-outlined" aria-hidden="true">flight_takeoff</span><span>AirportReady</span></a>
      <nav class="public-nav" aria-label="Public navigation"><a href="/">Planner</a><a href="/guides/airport-security-wait-times">Security guide</a></nav>
    </header>
    <main class="public-page">
      <section class="airport-hero">
        <div>
          <p class="eyebrow">Free airport tool</p>
          <h1>Airport arrival calculator</h1>
          <p class="public-copy">Use AirportReady to estimate when to leave for the airport. The planner combines flight departure time, travel time to the airport, current security waits, and a practical gate buffer.</p>
          <div class="public-actions">
            <a class="primary-link" href="/#planner">Open calculator</a>
            <a class="secondary-link" href="/airports/prg/how-early-to-arrive">See PRG example</a>
          </div>
        </div>
        <aside class="public-status-card">
          <p class="eyebrow">Best first use</p>
          <strong>2-3h</strong>
          <span>Dynamic buffer</span>
          <p>Built for real departure decisions, not generic travel inspiration.</p>
        </aside>
      </section>
      <section class="public-grid">
        <article class="public-card">
          <p class="eyebrow">Inputs</p>
          <h2>What the calculator uses</h2>
          <div class="security-summary">
            <div class="metric"><span>Flight departure</span><strong>Time</strong></div>
            <div class="metric"><span>Route to airport</span><strong>Minutes</strong></div>
            <div class="metric"><span>Security wait</span><strong>Live estimate</strong></div>
            <div class="metric"><span>Gate buffer</span><strong>Risk margin</strong></div>
          </div>
        </article>
        <article class="public-card">
          <p class="eyebrow">Airport pages</p>
          <h2>Arrival guides by airport</h2>
          <p class="public-copy">These pages are built for people searching with immediate departure intent.</p>
          <div class="airport-page-links">${airportLinks}</div>
        </article>
      </section>
      ${landingWaitlistBlock({
        plan: "calculator_alerts",
        title: "Get airport calculator alerts",
      })}
    </main>
    ${acquisitionTrackingScript("arrival_calculator")}
    ${landingWaitlistScript("arrival_calculator")}
  </body>
</html>`;

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function renderSecurityGuidePage(request, response) {
  const origin = originFromRequest(request);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#002045" />
    ${googleVerificationMeta()}
    <meta name="description" content="A practical guide to airport security wait times, why they change, and how to decide when to arrive at the airport." />
    <link rel="canonical" href="${escapeHtml(origin)}/guides/airport-security-wait-times" />
    <meta property="og:title" content="Airport security wait times guide | AirportReady" />
    <meta property="og:description" content="Understand airport security waits and use them to plan when to leave for the airport." />
    <meta property="og:url" content="${escapeHtml(origin)}/guides/airport-security-wait-times" />
    <meta property="og:type" content="article" />
    <title>Airport security wait times guide | AirportReady</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="public-topbar">
      <a class="brand" href="/"><span class="material-symbols-outlined" aria-hidden="true">flight_takeoff</span><span>AirportReady</span></a>
      <nav class="public-nav" aria-label="Public navigation"><a href="/">Planner</a><a href="/tools/airport-arrival-calculator">Calculator</a></nav>
    </header>
    <main class="public-page">
      <section class="airport-hero">
        <div>
          <p class="eyebrow">Airport timing guide</p>
          <h1>Airport security wait times are the part you cannot guess</h1>
          <p class="public-copy">Most departure advice says to arrive two or three hours early. That is useful, but incomplete. The real decision depends on live security pressure, airport layout, route time, baggage, and destination type.</p>
          <div class="public-actions">
            <a class="primary-link" href="/tools/airport-arrival-calculator">Use the calculator</a>
            <a class="secondary-link" href="/airports/prg">View airport wait pages</a>
          </div>
        </div>
        <aside class="public-status-card">
          <p class="eyebrow">Search intent</p>
          <strong>High</strong>
          <span>Pre-flight problem</span>
          <p>This guide is meant to capture users already worried about airport timing.</p>
        </aside>
      </section>
      <section class="public-grid">
        <article class="public-card">
          <p class="eyebrow">Decision factors</p>
          <h2>What changes your arrival time</h2>
          <div class="security-summary">
            <div class="metric"><span>Security line</span><strong>Variable</strong></div>
            <div class="metric"><span>Checked baggage</span><strong>+30m</strong></div>
            <div class="metric"><span>Passport control</span><strong>+20m</strong></div>
            <div class="metric"><span>Airport route</span><strong>Live risk</strong></div>
          </div>
        </article>
        <article class="public-card">
          <p class="eyebrow">Rule of thumb</p>
          <h2>Start with a baseline, then adjust</h2>
          <p class="public-copy">For short-haul flights, two hours is a common baseline. For long-haul or non-Schengen flights, three hours is safer. AirportReady turns that broad advice into a more practical leave-time estimate.</p>
        </article>
      </section>
      ${landingWaitlistBlock({
        plan: "security_wait_alerts",
        title: "Get security wait alerts",
      })}
    </main>
    ${acquisitionTrackingScript("security_guide")}
    ${landingWaitlistScript("security_guide")}
  </body>
</html>`;

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function renderHowLongBeforeFlightGuidePage(request, response) {
  const origin = originFromRequest(request);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#002045" />
    ${googleVerificationMeta()}
    <meta name="description" content="A practical answer to how long before a flight you should arrive at the airport, with buffers for domestic, short-haul, international, baggage, and airport security." />
    <link rel="canonical" href="${escapeHtml(origin)}/guides/how-long-before-flight-should-i-arrive" />
    <meta property="og:title" content="How long before a flight should I arrive? | AirportReady" />
    <meta property="og:description" content="Use a practical arrival buffer based on security waits, baggage, passport control, and airport route time." />
    <meta property="og:url" content="${escapeHtml(origin)}/guides/how-long-before-flight-should-i-arrive" />
    <meta property="og:type" content="article" />
    <title>How long before a flight should I arrive? | AirportReady</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="public-topbar">
      <a class="brand" href="/"><span class="material-symbols-outlined" aria-hidden="true">flight_takeoff</span><span>AirportReady</span></a>
      <nav class="public-nav" aria-label="Public navigation"><a href="/">Planner</a><a href="/tools/airport-arrival-calculator">Calculator</a></nav>
    </header>
    <main class="public-page">
      <section class="airport-hero">
        <div>
          <p class="eyebrow">Pre-flight timing</p>
          <h1>How long before a flight should you arrive?</h1>
          <p class="public-copy">Use two hours as a short-haul baseline and three hours for long-haul or passport-control trips, then adjust for live security pressure, checked baggage, airport layout, and route time.</p>
          <div class="public-actions">
            <a class="primary-link" href="/tools/airport-arrival-calculator">Calculate my arrival time</a>
            <a class="secondary-link" href="/guides/airport-security-wait-times">Read security guide</a>
          </div>
        </div>
        <aside class="public-status-card">
          <p class="eyebrow">Baseline</p>
          <strong>2-3h</strong>
          <span>Then adjust</span>
          <p>The right answer changes when the airport gets busy.</p>
        </aside>
      </section>
      <section class="public-grid">
        <article class="public-card">
          <p class="eyebrow">Quick answer</p>
          <h2>Recommended starting points</h2>
          <div class="security-summary">
            <div class="metric"><span>Domestic / Schengen</span><strong>2h</strong></div>
            <div class="metric"><span>International</span><strong>3h</strong></div>
            <div class="metric"><span>Checked baggage</span><strong>+30m</strong></div>
            <div class="metric"><span>Busy security</span><strong>+20m</strong></div>
          </div>
        </article>
        <article class="public-card">
          <p class="eyebrow">Better method</p>
          <h2>Calculate backwards from boarding</h2>
          <p class="public-copy">Start with departure time, subtract boarding close, gate walking time, security, check-in, passport control, and the route to the airport. AirportReady packages that into one leave-time estimate.</p>
          <div class="public-actions"><a class="primary-link" href="/#planner">Open planner</a></div>
        </article>
      </section>
      ${landingWaitlistBlock({
        plan: "flight_arrival_guide",
        title: "Get better arrival-time guidance",
      })}
    </main>
    ${acquisitionTrackingScript("how_long_before_flight_guide")}
    ${landingWaitlistScript("how_long_before_flight_guide")}
  </body>
</html>`;

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function renderAirportSecurityWaitPage(request, response, code) {
  const airportCode = String(code || "").toUpperCase();
  const airports = await readJson(airportsPath, []);
  const airport = airports.find((item) => item.code === airportCode);

  if (!airport) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Airport not found");
    return;
  }

  const origin = originFromRequest(request);
  const waitTextValue = `${airport.wait[0]}-${airport.wait[1]} min`;
  const canonicalUrl = `${origin}/airports/${airport.code.toLowerCase()}/security-wait-time`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#002045" />
    ${googleVerificationMeta()}
    <meta name="description" content="${escapeHtml(airport.name)} security wait time today, crowd status, confidence, and practical arrival guidance for ${escapeHtml(airport.code)}." />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(airport.name)} security wait time today | AirportReady" />
    <meta property="og:description" content="Current ${escapeHtml(airport.code)} security wait estimate: ${escapeHtml(waitTextValue)}." />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <title>${escapeHtml(airport.name)} security wait time today | AirportReady</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="public-topbar">
      <a class="brand" href="/"><span class="material-symbols-outlined" aria-hidden="true">flight_takeoff</span><span>AirportReady</span></a>
      <nav class="public-nav" aria-label="Public navigation"><a href="/">Planner</a><a href="/airports/${escapeHtml(airport.code.toLowerCase())}/how-early-to-arrive">Arrival guide</a></nav>
    </header>
    <main class="public-page">
      <section class="airport-hero">
        <div>
          <p class="eyebrow">Security wait time</p>
          <h1>${escapeHtml(airport.name)} security wait time today</h1>
          <p class="public-copy">Current ${escapeHtml(airport.code)} security estimate is <strong>${escapeHtml(waitTextValue)}</strong>. Airport status is <strong>${escapeHtml(airport.status)}</strong> with ${escapeHtml(airport.confidence.toLowerCase())} confidence from sample crowd signals.</p>
          <div class="public-actions">
            <a class="primary-link" href="/?airport=${escapeHtml(airport.code)}">Calculate when to leave</a>
            <a class="secondary-link" href="/airports/${escapeHtml(airport.code.toLowerCase())}">Open airport dashboard</a>
          </div>
        </div>
        <aside class="public-status-card">
          <p class="eyebrow">Current estimate</p>
          <strong>${escapeHtml(waitTextValue)}</strong>
          <span>${escapeHtml(airport.status)}</span>
          <p>Terminal: <b>${escapeHtml(airport.selectedTerminal)}</b></p>
          <p>Reports: <b>${escapeHtml(airport.reports)}</b></p>
        </aside>
      </section>
      <section class="public-grid">
        <article class="public-card">
          <p class="eyebrow">Timing impact</p>
          <h2>What this means for arrival time</h2>
          <p class="public-copy">If security is above 30 minutes, arrive earlier or reduce risk with cabin baggage, online check-in, and a larger walking buffer. The planner uses this wait estimate to calculate a practical leave time.</p>
        </article>
        <article class="public-card">
          <p class="eyebrow">Next action</p>
          <h2>Do not guess from averages</h2>
          <p class="public-copy">Use the current airport status to plan your departure time, then add alerts if you want updates before this route becomes busy.</p>
        </article>
      </section>
      ${landingWaitlistBlock({
        airportCode: airport.code,
        plan: "security_wait_alerts",
        title: `Get ${airport.code} security wait alerts`,
      })}
    </main>
    ${acquisitionTrackingScript("airport_security_wait_page", airport.code)}
    ${landingWaitlistScript("airport_security_wait_page")}
  </body>
</html>`;

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function renderRobots(request, response) {
  const origin = originFromRequest(request);
  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=3600",
  });
  response.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
}

async function renderIndexNowKey(request, response) {
  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=3600",
  });
  response.end(`${indexNowKey()}\n`);
}

async function renderSitemap(request, response) {
  const origin = originFromRequest(request);
  const airports = await readJson(airportsPath, []);
  const urls = [
    { loc: origin, priority: "1.0" },
    ...seoLandingPages(origin, airports).map((page) => ({ loc: page.url, priority: page.priority })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (url) =>
        `  <url><loc>${escapeHtml(url.loc)}</loc><changefreq>hourly</changefreq><priority>${url.priority}</priority></url>`
    )
    .join("\n")}\n</urlset>\n`;

  response.writeHead(200, {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600",
  });
  response.end(body);
}

async function submitIndexNow(request, pages) {
  const origin = originFromRequest(request);
  const hostName = new URL(origin).hostname;
  const body = {
    host: hostName,
    key: indexNowKey(),
    keyLocation: indexNowKeyLocation(request),
    urlList: pages.map((page) => page.url),
  };

  const startedAt = Date.now();
  const indexNowResponse = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const responseText = await indexNowResponse.text();

  return {
    ok: indexNowResponse.ok,
    status: indexNowResponse.status,
    statusText: indexNowResponse.statusText,
    submitted: body.urlList.length,
    keyLocation: body.keyLocation,
    host: body.host,
    durationMs: Date.now() - startedAt,
    response: responseText.slice(0, 500),
    submittedAt: new Date().toISOString(),
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "airportready-api",
      storage: supabaseConfigured() ? "supabase" : "json",
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/airports") {
    const [airports, reports, events, waitlist] = await Promise.all([
      readJson(airportsPath, []),
      readJson(reportsPath, []),
      readEvents(),
      readWaitlist(),
    ]);
    sendJson(response, 200, {
      airports,
      reportCount: reports.length,
      eventCount: events.length,
      waitlistCount: waitlist.length,
      latestReports: reports.slice(0, 5),
      generatedAt: new Date().toISOString(),
    });
    return true;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/airports/")) {
    const airportCode = url.pathname.split("/").pop().toUpperCase();
    const [airports, reports] = await Promise.all([readJson(airportsPath, []), readJson(reportsPath, [])]);
    const airport = airports.find((item) => item.code === airportCode);

    if (!airport) {
      sendJson(response, 404, { error: "Airport not found" });
      return true;
    }

    sendJson(response, 200, {
      airport,
      reports: reports.filter((report) => report.airportCode === airportCode).slice(0, 5),
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin") {
    const [airports, reports, events, waitlist, trips] = await Promise.all([
      readJson(airportsPath, []),
      readJson(reportsPath, []),
      readEvents(),
      readWaitlist(),
      readJson(tripsPath, []),
    ]);

    sendJson(response, 200, {
      totals: {
        airports: airports.length,
        reports: reports.length,
        events: events.length,
        waitlist: waitlist.length,
        trips: trips.length,
      },
      eventsByType: byCount(events, (event) => event.eventType),
      eventsByAirport: byCount(events, (event) => event.airportCode),
      eventsBySource: byCount(events, (event) => event.metadata && event.metadata.acquisitionSource),
      eventsByPage: byCount(events, (event) => event.metadata && event.metadata.page),
      reportsByAirport: byCount(reports, (report) => report.airportCode),
      waitlistByAirport: byCount(waitlist, (entry) => entry.airportCode),
      latestEvents: events.slice(0, 10),
      latestReports: reports.slice(0, 10),
      latestWaitlist: waitlist.slice(0, 10).map((entry) => ({
        ...entry,
        email: entry.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
      })),
      storage: {
        supabaseConfigured: supabaseConfigured(),
        eventStore: supabaseConfigured() ? "supabase" : "json",
        waitlistStore: supabaseConfigured() ? "supabase" : "json",
      },
      generatedAt: new Date().toISOString(),
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/seo") {
    const [airports, events, waitlist] = await Promise.all([
      readJson(airportsPath, []),
      readEvents(),
      readWaitlist(),
    ]);
    const origin = originFromRequest(request);
    const landingPages = seoLandingPages(origin, airports);
    const eventsByPage = byCount(events, (event) => event.metadata && event.metadata.page);
    const waitlistByPlan = byCount(waitlist, (entry) => entry.plan);
    const waitlistByAirport = byCount(waitlist, (entry) => entry.airportCode);

    sendJson(response, 200, {
      totals: {
        landingPages: landingPages.length,
        airports: airports.length,
        indexedInSitemap: landingPages.length,
        organicEvents: events.filter((event) => event.metadata && event.metadata.acquisitionSource === "organic_search")
          .length,
        waitlist: waitlist.length,
      },
      setup: {
        googleVerificationConfigured: Boolean(String(process.env.GOOGLE_SITE_VERIFICATION || "").trim()),
        googleVerificationPresent: Boolean(googleVerificationMeta()),
        googleVerificationEnvVar: "GOOGLE_SITE_VERIFICATION",
        googleSearchConsoleUrl: "https://search.google.com/search-console/welcome",
        renderDashboardUrl: "https://dashboard.render.com/",
        indexNowConfigured: Boolean(indexNowKey()),
        indexNowKeyLocation: indexNowKeyLocation(request),
        sitemapUrl: `${origin}/sitemap.xml`,
        robotsUrl: `${origin}/robots.txt`,
        searchConsoleProperty: `${origin}/`,
        supabaseConfigured: supabaseConfigured(),
        eventStore: supabaseConfigured() ? "supabase" : "json",
        waitlistStore: supabaseConfigured() ? "supabase" : "json",
      },
      checklist: [
        {
          id: "search_console_property",
          label: "Create URL-prefix property in Google Search Console",
          status: "manual",
          detail: `${origin}/`,
        },
        {
          id: "google_verification",
          label: "Add GOOGLE_SITE_VERIFICATION in Render",
          status: process.env.GOOGLE_SITE_VERIFICATION ? "done" : "todo",
          detail: "Render -> airportready -> Environment",
        },
        {
          id: "submit_sitemap",
          label: "Submit sitemap in Search Console",
          status: "manual",
          detail: `${origin}/sitemap.xml`,
        },
        {
          id: "indexnow_submit",
          label: "Submit landing pages to Bing via IndexNow",
          status: indexNowKey() ? "active" : "todo",
          detail: indexNowKeyLocation(request),
        },
        {
          id: "watch_queries",
          label: "Watch queries and landing pages weekly",
          status: events.length ? "active" : "waiting",
          detail: "Use Search Console plus this dashboard.",
        },
        {
          id: "supabase_persistence",
          label: "Persist events and waitlist in Supabase",
          status: supabaseConfigured() ? "done" : "todo",
          detail: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render.",
        },
      ],
      landingPages: landingPages.map((page) => ({
        ...page,
        inSitemap: true,
        events: eventsByPage[page.eventPage] || 0,
        waitlist: waitlist.filter((entry) => entry.plan === page.cta).length,
      })),
      eventsByPage,
      waitlistByPlan,
      waitlistByAirport,
      generatedAt: new Date().toISOString(),
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/indexnow") {
    const airports = await readJson(airportsPath, []);
    const origin = originFromRequest(request);
    const landingPages = seoLandingPages(origin, airports);
    const result = await submitIndexNow(request, landingPages);
    sendJson(response, result.ok ? 200 : 502, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports") {
    const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || 5)));
    const reports = await readJson(reportsPath, []);
    sendJson(response, 200, { reports: reports.slice(0, limit), reportCount: reports.length });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/reports") {
    const body = await readBody(request);
    const report = normalizeAirportReport(body);
    const [airports, reports] = await Promise.all([readJson(airportsPath, []), readJson(reportsPath, [])]);
    applyReportToAirports(airports, report);
    reports.unshift(report);
    await Promise.all([writeJson(airportsPath, airports), writeJson(reportsPath, reports)]);
    sendJson(response, 201, { report, airports, latestReports: reports.slice(0, 5), reportCount: reports.length });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/trips") {
    const body = await readBody(request);
    const trips = await readJson(tripsPath, []);
    const trip = {
      id: randomUUID(),
      airportCode: String(body.airportCode || "").toUpperCase(),
      flight: String(body.flight || "").slice(0, 80),
      departureAt: String(body.departureAt || ""),
      routeMinutes: Number(body.routeMinutes || 0),
      leaveAt: String(body.leaveAt || ""),
      createdAt: new Date().toISOString(),
    };
    trips.unshift(trip);
    await writeJson(tripsPath, trips);
    sendJson(response, 201, { trip });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/events") {
    const body = await readBody(request);
    const event = normalizeEvent(body);
    const result = await createEvent(event);
    sendJson(response, 201, {
      event: result.event,
      eventCount: result.eventCount,
      storage: supabaseConfigured() ? "supabase" : "json",
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/waitlist") {
    const body = await readBody(request);
    const entry = normalizeWaitlist(body);
    const existing = await findWaitlistEntry(entry.email, entry.plan);

    if (existing) {
      const waitlist = await readWaitlist();
      sendJson(response, 200, {
        entry: existing,
        waitlistCount: waitlist.length,
        duplicate: true,
        storage: supabaseConfigured() ? "supabase" : "json",
      });
      return true;
    }

    const result = await createWaitlistEntry(entry);
    sendJson(response, 201, {
      entry: result.entry,
      waitlistCount: result.waitlistCount,
      duplicate: false,
      storage: supabaseConfigured() ? "supabase" : "json",
    });
    return true;
  }

  return false;
}

async function serveStatic(request, response, url) {
  if (url.pathname === "/robots.txt") {
    await renderRobots(request, response);
    return;
  }

  if (url.pathname === "/indexnow-key.txt") {
    await renderIndexNowKey(request, response);
    return;
  }

  if (url.pathname === "/sitemap.xml") {
    await renderSitemap(request, response);
    return;
  }

  if (url.pathname === "/admin") {
    url = new URL("/admin.html", `http://${request.headers.host || "127.0.0.1"}`);
  }

  if (url.pathname === "/admin/seo") {
    url = new URL("/admin-seo.html", `http://${request.headers.host || "127.0.0.1"}`);
  }

  if (url.pathname === "/tools/airport-arrival-calculator") {
    await renderArrivalCalculatorPage(request, response);
    return;
  }

  if (url.pathname === "/guides/airport-security-wait-times") {
    await renderSecurityGuidePage(request, response);
    return;
  }

  if (url.pathname === "/guides/how-long-before-flight-should-i-arrive") {
    await renderHowLongBeforeFlightGuidePage(request, response);
    return;
  }

  const airportMatch = url.pathname.match(/^\/airports\/([a-z0-9]{3})$/i);
  if (airportMatch) {
    await renderAirportPage(request, response, airportMatch[1]);
    return;
  }

  const howEarlyMatch = url.pathname.match(/^\/airports\/([a-z0-9]{3})\/how-early-to-arrive$/i);
  if (howEarlyMatch) {
    await renderHowEarlyPage(request, response, howEarlyMatch[1]);
    return;
  }

  const securityWaitMatch = url.pathname.match(/^\/airports\/([a-z0-9]{3})\/security-wait-time$/i);
  if (securityWaitMatch) {
    await renderAirportSecurityWaitPage(request, response, securityWaitMatch[1]);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const body =
      extension === ".html" ? Buffer.from(withGoogleVerification(content.toString("utf8")), "utf8") : content;
    response.writeHead(200, {
      "content-type": contentTypes[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=60",
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (!handled) sendJson(response, 404, { error: "API route not found" });
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    sendError(response, error);
  }
});

ensureDataFiles()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`AirportReady running on ${host}:${port}`);
      console.log(`Data directory: ${dataDir}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize data files", error);
    process.exitCode = 1;
  });
