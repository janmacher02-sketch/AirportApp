const totalsEl = document.querySelector("#admin-totals");
const eventsByTypeEl = document.querySelector("#events-by-type");
const signalsByAirportEl = document.querySelector("#signals-by-airport");
const eventsBySourceEl = document.querySelector("#events-by-source");
const eventsByPageEl = document.querySelector("#events-by-page");
const latestEventsEl = document.querySelector("#latest-events");
const latestWaitlistEl = document.querySelector("#latest-waitlist");
const goalFunnelEl = document.querySelector("#goal-funnel");
const decisionCardEl = document.querySelector("#decision-card");
const refreshButton = document.querySelector("#refresh-admin");
const toastEl = document.querySelector("#toast");

let toastTimer;

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

function renderKeyValues(target, data, emptyText) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    target.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  target.innerHTML = entries
    .map(
      ([key, value]) => `
        <div class="admin-row">
          <span>${key}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function relativeTime(isoDate) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function renderList(target, items, mapper, emptyText) {
  if (!items.length) {
    target.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }
  target.innerHTML = items.map(mapper).join("");
}

function renderGoalFunnel(goals) {
  goalFunnelEl.innerHTML = (goals || [])
    .map(
      (goal) => `
        <div class="goal-step">
          <span>${goal.label}</span>
          <strong>${goal.value}</strong>
          <small>${goal.note}</small>
        </div>
      `
    )
    .join("");
}

function renderDecision(decision) {
  if (!decision) {
    decisionCardEl.innerHTML = "";
    return;
  }

  decisionCardEl.className = `decision-card ${decision.tone || "waiting"}`;
  decisionCardEl.innerHTML = `
    <div>
      <p class="eyebrow">Decision</p>
      <h2>${decision.verdict}</h2>
      <p>${decision.reason}</p>
    </div>
    <div class="decision-score">
      <span>Score</span>
      <strong>${decision.score}</strong>
    </div>
    <div>
      <p class="eyebrow">Next action</p>
      <p>${decision.nextAction}</p>
    </div>
  `;
}

async function loadAdmin() {
  const data = await api("/api/admin");
  totalsEl.innerHTML = `
    <div class="validation-stat"><span>Airports</span><strong>${data.totals.airports}</strong></div>
    <div class="validation-stat"><span>Events</span><strong>${data.totals.events}</strong></div>
    <div class="validation-stat"><span>Reports</span><strong>${data.totals.reports}</strong></div>
    <div class="validation-stat"><span>Waitlist</span><strong>${data.totals.waitlist}</strong></div>
    <div class="validation-stat"><span>Trip plans</span><strong>${data.totals.trips}</strong></div>
  `;

  renderDecision(data.decision);
  renderGoalFunnel(data.goals);
  renderKeyValues(eventsByTypeEl, data.eventsByType, "No tracked events yet.");
  renderKeyValues(signalsByAirportEl, data.eventsByAirport, "No airport events yet.");
  renderKeyValues(eventsBySourceEl, data.eventsBySource, "No source data yet.");
  renderKeyValues(eventsByPageEl, data.eventsByPage, "No landing page data yet.");

  renderList(
    latestEventsEl,
    data.latestEvents,
    (event) => `
      <div class="admin-row">
        <span>${event.eventType}<small>${event.metadata?.acquisitionSource || "unknown"} / ${
      event.metadata?.page || event.metadata?.path || "unknown"
    } - ${relativeTime(event.createdAt)}</small></span>
        <strong>${event.airportCode || "-"}</strong>
      </div>
    `,
    "No recent events."
  );

  renderList(
    latestWaitlistEl,
    data.latestWaitlist,
    (entry) => `
      <div class="admin-row">
        <span>${entry.email}<small>${entry.plan} - ${relativeTime(entry.createdAt)}</small></span>
        <strong>${entry.airportCode || "-"}</strong>
      </div>
    `,
    "No waitlist signups yet."
  );
}

refreshButton.addEventListener("click", () => {
  loadAdmin()
    .then(() => showToast("Admin metrics refreshed."))
    .catch((error) => showToast(error.message || "Admin refresh failed."));
});

loadAdmin().catch((error) => showToast(error.message || "Could not load admin metrics."));
