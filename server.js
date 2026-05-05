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

  const html = Object.entries(replacements).reduce(
    (content, [key, value]) => content.replaceAll(key, escapeHtml(value)),
    template
  );

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
        <p class="eyebrow">Marketing note</p>
        <h2>This page targets search intent, not social traffic</h2>
        <p class="public-copy">People searching “how early to arrive at ${escapeHtml(
          airport.name
        )}” already have the problem. This page exists to capture that demand without founder posts or personal outreach.</p>
      </section>
    </main>
    <script>
      fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventType: "page_view", airportCode: "${escapeHtml(
        airport.code
      )}", metadata: { acquisitionSource: "direct", path: location.pathname, query: location.search, page: "how_early_page" } }) }).catch(() => {});
    </script>
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

async function renderSitemap(request, response) {
  const origin = originFromRequest(request);
  const airports = await readJson(airportsPath, []);
  const urls = [
    { loc: origin, priority: "1.0" },
    ...airports.flatMap((airport) => [
      {
        loc: `${origin}/airports/${airport.code.toLowerCase()}`,
        priority: airport.code === "PRG" || airport.code === "VIE" ? "0.9" : "0.7",
      },
      {
        loc: `${origin}/airports/${airport.code.toLowerCase()}/how-early-to-arrive`,
        priority: airport.code === "PRG" || airport.code === "VIE" ? "0.9" : "0.7",
      },
    ]),
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

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "airportready-api" });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/airports") {
    const [airports, reports, events, waitlist] = await Promise.all([
      readJson(airportsPath, []),
      readJson(reportsPath, []),
      readJson(eventsPath, []),
      readJson(waitlistPath, []),
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
      readJson(eventsPath, []),
      readJson(waitlistPath, []),
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
      reportsByAirport: byCount(reports, (report) => report.airportCode),
      waitlistByAirport: byCount(waitlist, (entry) => entry.airportCode),
      latestEvents: events.slice(0, 10),
      latestReports: reports.slice(0, 10),
      latestWaitlist: waitlist.slice(0, 10).map((entry) => ({
        ...entry,
        email: entry.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
      })),
      generatedAt: new Date().toISOString(),
    });
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
    const events = await readJson(eventsPath, []);
    events.unshift(event);
    await writeJson(eventsPath, events);
    sendJson(response, 201, { event, eventCount: events.length });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/waitlist") {
    const body = await readBody(request);
    const entry = normalizeWaitlist(body);
    const waitlist = await readJson(waitlistPath, []);
    const existing = waitlist.find((item) => item.email === entry.email && item.plan === entry.plan);

    if (existing) {
      sendJson(response, 200, { entry: existing, waitlistCount: waitlist.length, duplicate: true });
      return true;
    }

    waitlist.unshift(entry);
    await writeJson(waitlistPath, waitlist);
    sendJson(response, 201, { entry, waitlistCount: waitlist.length, duplicate: false });
    return true;
  }

  return false;
}

async function serveStatic(request, response, url) {
  if (url.pathname === "/robots.txt") {
    await renderRobots(request, response);
    return;
  }

  if (url.pathname === "/sitemap.xml") {
    await renderSitemap(request, response);
    return;
  }

  if (url.pathname === "/admin") {
    url = new URL("/admin.html", `http://${request.headers.host || "127.0.0.1"}`);
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
    response.writeHead(200, {
      "content-type": contentTypes[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=60",
    });
    response.end(content);
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
