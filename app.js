const seedAirports = [
  {
    code: "PRG",
    name: "Prague Airport",
    city: "Prague",
    terminals: ["T1", "T2"],
    selectedTerminal: "T2",
    wait: [18, 25],
    trend: "Rising",
    confidence: "Medium",
    reports: 12,
    updated: 4,
    status: "Busy",
    route: 35,
    checkin: 24,
    passport: 12,
    buffer: 20,
    trendData: [8, 12, 14, 18, 22, 27, 31, 25, 19, 16, 14, 11],
  },
  {
    code: "VIE",
    name: "Vienna International",
    city: "Vienna",
    terminals: ["T1", "T3"],
    selectedTerminal: "T3",
    wait: [9, 14],
    trend: "Stable",
    confidence: "High",
    reports: 34,
    updated: 2,
    status: "Normal",
    route: 28,
    checkin: 20,
    passport: 9,
    buffer: 18,
    trendData: [7, 9, 11, 12, 13, 14, 12, 10, 9, 8, 10, 11],
  },
  {
    code: "BTS",
    name: "Bratislava Airport",
    city: "Bratislava",
    terminals: ["Main"],
    selectedTerminal: "Main",
    wait: [7, 12],
    trend: "Falling",
    confidence: "Medium",
    reports: 9,
    updated: 7,
    status: "Low",
    route: 22,
    checkin: 18,
    passport: 8,
    buffer: 18,
    trendData: [18, 16, 13, 12, 11, 10, 8, 7, 9, 10, 8, 7],
  },
  {
    code: "BUD",
    name: "Budapest Airport",
    city: "Budapest",
    terminals: ["2A", "2B"],
    selectedTerminal: "2B",
    wait: [16, 24],
    trend: "Rising",
    confidence: "Medium",
    reports: 15,
    updated: 5,
    status: "Busy",
    route: 38,
    checkin: 24,
    passport: 11,
    buffer: 22,
    trendData: [10, 12, 13, 17, 19, 23, 29, 28, 23, 18, 16, 14],
  },
  {
    code: "BER",
    name: "Berlin Brandenburg",
    city: "Berlin",
    terminals: ["T1", "T2"],
    selectedTerminal: "T1",
    wait: [35, 48],
    trend: "Rising",
    confidence: "High",
    reports: 42,
    updated: 3,
    status: "Severe",
    route: 45,
    checkin: 28,
    passport: 16,
    buffer: 25,
    trendData: [18, 21, 24, 27, 32, 38, 44, 48, 42, 37, 33, 29],
  },
  {
    code: "MUC",
    name: "Munich Airport",
    city: "Munich",
    terminals: ["T1", "T2"],
    selectedTerminal: "T2",
    wait: [12, 18],
    trend: "Stable",
    confidence: "High",
    reports: 27,
    updated: 3,
    status: "Normal",
    route: 34,
    checkin: 22,
    passport: 10,
    buffer: 20,
    trendData: [11, 13, 15, 18, 17, 16, 14, 15, 18, 17, 15, 13],
  },
  {
    code: "WAW",
    name: "Warsaw Chopin",
    city: "Warsaw",
    terminals: ["A", "B"],
    selectedTerminal: "A",
    wait: [14, 21],
    trend: "Stable",
    confidence: "Medium",
    reports: 18,
    updated: 6,
    status: "Normal",
    route: 31,
    checkin: 22,
    passport: 10,
    buffer: 20,
    trendData: [9, 11, 14, 19, 21, 20, 17, 15, 16, 18, 15, 12],
  },
];

let airports = cloneAirports(seedAirports);

const state = {
  selectedCode: "PRG",
  alertEnabled: false,
  apiOnline: false,
  apiReportCount: 0,
  apiEventCount: 0,
  waitlistCount: 0,
  latestReports: [],
  toastTimer: null,
};

const airportSelect = document.querySelector("#airport-select");
const reportAirport = document.querySelector("#report-airport");
const quickAirports = document.querySelector("#quick-airports");
const airportList = document.querySelector("#airport-list");
const plannerForm = document.querySelector("#planner-form");
const departureTime = document.querySelector("#departure-time");
const routeTime = document.querySelector("#route-time");
const tripResult = document.querySelector("#trip-result");
const timeline = document.querySelector("#timeline");
const timelineTotal = document.querySelector("#timeline-total");
const detailTitle = document.querySelector("#detail-title");
const terminalTabs = document.querySelector("#terminal-tabs");
const securitySummary = document.querySelector("#security-summary");
const waitChart = document.querySelector("#wait-chart");
const freshness = document.querySelector("#freshness");
const reportForm = document.querySelector("#report-form");
const reportAirportCode = document.querySelector("#report-airport-code");
const crowdLevel = document.querySelector("#crowd-level");
const crowdLabel = document.querySelector("#crowd-label");
const alertToggle = document.querySelector("#alert-toggle");
const toast = document.querySelector("#toast");
const premiumModal = document.querySelector("#premium-modal");
const reportLog = document.querySelector("#report-log");
const reportLogCount = document.querySelector("#report-log-count");
const validationStats = document.querySelector("#validation-stats");
const waitlistForm = document.querySelector("#waitlist-form");
const tripPassEmail = document.querySelector("#trip-pass-email");
const tripPassContext = document.querySelector("#trip-pass-context");

function cloneAirports(source) {
  return JSON.parse(JSON.stringify(source));
}

function acquisitionMetadata(extra = {}) {
  const params = new URLSearchParams(window.location.search);
  const explicitSource = params.get("src") || params.get("utm_source");
  const referrer = document.referrer || "";
  const referrerHost = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : "";
  const searchHosts = ["google.", "bing.", "duckduckgo.", "seznam.", "yahoo."];
  const acquisitionSource =
    explicitSource ||
    (searchHosts.some((host) => referrerHost.includes(host)) ? "organic_search" : referrerHost ? "referral" : "direct");

  return {
    acquisitionSource,
    referrerHost,
    path: window.location.pathname,
    query: window.location.search,
    ...extra,
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `API request failed with ${response.status}`);
  }

  return payload;
}

async function loadAirports() {
  try {
    const payload = await apiRequest("/api/airports");
    if (Array.isArray(payload.airports) && payload.airports.length > 0) {
      airports = payload.airports;
      state.apiOnline = true;
      state.apiReportCount = Number(payload.reportCount || 0);
      state.apiEventCount = Number(payload.eventCount || 0);
      state.waitlistCount = Number(payload.waitlistCount || 0);
      state.latestReports = Array.isArray(payload.latestReports) ? payload.latestReports : [];
    }
  } catch {
    airports = cloneAirports(seedAirports);
    state.apiOnline = false;
    state.latestReports = [];
  }
}

async function trackEvent(eventType, metadata = {}) {
  if (!state.apiOnline) return;

  try {
    const payload = await apiRequest("/api/events", {
      method: "POST",
      body: JSON.stringify({
        eventType,
        airportCode: state.selectedCode,
        metadata: acquisitionMetadata(metadata),
      }),
    });
    state.apiEventCount = Number(payload.eventCount || state.apiEventCount + 1);
    renderValidationStats();
  } catch {
    state.apiOnline = false;
    renderValidationStats();
  }
}

async function persistReport(airport, observedWait, crowd) {
  if (!state.apiOnline) {
    applyReportLocally(airport, observedWait);
    return;
  }

  const payload = await apiRequest("/api/reports", {
    method: "POST",
    body: JSON.stringify({
      airportCode: airport.code,
      terminal: airport.selectedTerminal,
      observedWait,
      crowdLevel: crowd,
    }),
  });

  airports = payload.airports;
  state.apiReportCount = Number(payload.reportCount || state.apiReportCount + 1);
  state.latestReports = Array.isArray(payload.latestReports) ? payload.latestReports : state.latestReports;
}

async function persistTripPlan(plan) {
  if (!state.apiOnline) return;

  await apiRequest("/api/trips", {
    method: "POST",
    body: JSON.stringify({
      airportCode: plan.airport.code,
      flight: document.querySelector("#flight-input").value,
      departureAt: plan.departAt.toISOString(),
      routeMinutes: plan.route,
      leaveAt: plan.leaveAt.toISOString(),
    }),
  });
}

async function joinWaitlist(email) {
  if (!state.apiOnline) {
    throw new Error("API is offline");
  }

  const payload = await apiRequest("/api/waitlist", {
    method: "POST",
    body: JSON.stringify({
      email,
      airportCode: state.selectedCode,
      plan: "trip_pass",
    }),
  });

  state.waitlistCount = Number(payload.waitlistCount || state.waitlistCount + 1);
  return payload;
}

function applyReportLocally(airport, observedWait) {
  airport.wait = [Math.max(0, observedWait - 4), observedWait + 5];
  airport.reports += 1;
  airport.updated = 0;
  airport.confidence = airport.reports >= 20 ? "High" : "Medium";
  airport.status = observedWait >= 35 ? "Severe" : observedWait >= 20 ? "Busy" : "Normal";
  airport.trendData = [...airport.trendData.slice(1), observedWait];
}

function selectedAirport() {
  return airports.find((airport) => airport.code === state.selectedCode) || airports[0];
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatLocalDateTime(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatRelativeTime(isoDate) {
  const createdAt = new Date(isoDate);
  const minutes = Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function minutesBetween(early, late) {
  return Math.max(0, Math.round((late.getTime() - early.getTime()) / 60000));
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function subtractMinutes(date, minutes) {
  return addMinutes(date, -minutes);
}

function riskFor(airport) {
  const upperWait = airport.wait[1];
  if (upperWait >= 35) return { label: "High risk", tone: "red", icon: "warning" };
  if (upperWait >= 22) return { label: "Medium risk", tone: "amber", icon: "error" };
  return { label: "Low risk", tone: "green", icon: "check_circle" };
}

function statusClass(status) {
  if (status === "Severe") return "red";
  if (status === "Busy") return "amber";
  return "green";
}

function waitText(airport) {
  return `${airport.wait[0]}-${airport.wait[1]} min`;
}

function totalAirportMinutes(airport) {
  return airport.checkin + airport.wait[1] + airport.passport + airport.buffer;
}

function computePlan() {
  const airport = selectedAirport();
  const departAt = new Date(departureTime.value || Date.now() + 4 * 3600000);
  const route = Number(routeTime.value || airport.route);
  const airportProcess = totalAirportMinutes(airport);
  const arriveAt = subtractMinutes(departAt, airportProcess);
  const leaveAt = subtractMinutes(arriveAt, route);
  const now = new Date();
  const minutesUntilLeave = minutesBetween(now, leaveAt);
  const risk = riskFor(airport);

  return {
    airport,
    departAt,
    route,
    airportProcess,
    arriveAt,
    leaveAt,
    minutesUntilLeave,
    risk,
    shouldLeaveNow: leaveAt <= now,
  };
}

function renderSelectors() {
  const options = airports
    .map((airport) => `<option value="${airport.code}">${airport.code} - ${airport.name}</option>`)
    .join("");
  airportSelect.innerHTML = options;
  reportAirport.innerHTML = options;
  airportSelect.value = state.selectedCode;
  reportAirport.value = state.selectedCode;

  quickAirports.innerHTML = airports
    .map(
      (airport) =>
        `<button type="button" class="${airport.code === state.selectedCode ? "is-selected" : ""}" data-select-airport="${airport.code}">${airport.code}</button>`
    )
    .join("");
}

function renderAirportList() {
  airportList.innerHTML = airports
    .map((airport) => {
      const tone = statusClass(airport.status);
      return `
        <button class="airport-card ${airport.code === state.selectedCode ? "is-selected" : ""}" type="button" data-select-airport="${airport.code}">
          <span class="airport-code">${airport.code}</span>
          <span>
            <strong>${airport.name}</strong>
            <small>${airport.city} - ${airport.confidence} confidence - ${airport.reports} reports</small>
          </span>
          <span>
            <span class="wait-number">${waitText(airport)}</span>
            <span class="status-chip ${tone}">${airport.status}</span>
          </span>
        </button>
      `;
    })
    .join("");
  const freshest = Math.min(...airports.map((airport) => airport.updated));
  freshness.textContent = state.apiOnline
    ? `API online - ${state.apiReportCount} saved reports - freshest ${freshest}m ago`
    : `Offline sample mode - freshest update ${freshest}m ago`;
}

function renderTripResult() {
  const plan = computePlan();
  const stateLabel = plan.shouldLeaveNow ? "Leave now" : "Leave at";
  const countdown =
    plan.minutesUntilLeave <= 0
      ? "You are at the departure threshold."
      : `${Math.floor(plan.minutesUntilLeave / 60)}h ${plan.minutesUntilLeave % 60}m until recommended departure.`;

  tripResult.innerHTML = `
    <div class="status-top">
      <div>
        <p class="eyebrow">${stateLabel}</p>
        <div class="leave-time">${formatTime(plan.leaveAt)}</div>
      </div>
      <span class="risk-chip">
        <span class="material-symbols-outlined" aria-hidden="true">${plan.risk.icon}</span>
        ${plan.risk.label}
      </span>
    </div>
    <p>${countdown} ${plan.airport.code} ${plan.airport.selectedTerminal} is ${plan.airport.status.toLowerCase()} with ${waitText(plan.airport)} security.</p>
    <div class="status-actions">
      <button type="button" data-open-premium>Trip Pass EUR 2.99</button>
      <button type="button" data-enable-alert>${state.alertEnabled ? "Alert enabled" : "Add leave-now alert"}</button>
    </div>
  `;

  const items = [
    { icon: "home", title: "Leave home", detail: `${plan.route} min travel time`, time: plan.leaveAt },
    { icon: "local_airport", title: `Arrive ${plan.airport.code}`, detail: `${plan.airport.name} ${plan.airport.selectedTerminal}`, time: plan.arriveAt },
    { icon: "luggage", title: "Check-in / bag drop", detail: `${plan.airport.checkin} min buffer`, time: addMinutes(plan.arriveAt, plan.airport.checkin) },
    { icon: "security", title: "Security", detail: `${waitText(plan.airport)} - ${plan.airport.trend.toLowerCase()}`, time: addMinutes(plan.arriveAt, plan.airport.checkin + plan.airport.wait[1]) },
    { icon: "flight_takeoff", title: "Boarding buffer", detail: `Depart ${formatTime(plan.departAt)}`, time: subtractMinutes(plan.departAt, plan.airport.buffer) },
  ];

  timelineTotal.textContent = `${plan.airportProcess + plan.route} min door-to-gate`;
  timeline.innerHTML = items
    .map(
      (item) => `
        <div class="timeline-item">
          <span class="timeline-icon"><span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span></span>
          <span><strong>${item.title}</strong><span>${item.detail}</span></span>
          <span class="timeline-time">${formatTime(item.time)}</span>
        </div>
      `
    )
    .join("");
}

function renderDetail() {
  const airport = selectedAirport();
  detailTitle.textContent = `${airport.name} ${airport.code}`;
  reportAirportCode.textContent = airport.code;
  alertToggle.checked = state.alertEnabled;

  terminalTabs.innerHTML = airport.terminals
    .map(
      (terminal) =>
        `<button type="button" class="${terminal === airport.selectedTerminal ? "is-active" : ""}" data-terminal="${terminal}">${terminal}</button>`
    )
    .join("");

  securitySummary.innerHTML = `
    <div class="metric">
      <span>Current estimate</span>
      <strong>${waitText(airport)}</strong>
    </div>
    <div class="metric">
      <span>Trend</span>
      <strong>${airport.trend}</strong>
    </div>
    <div class="metric">
      <span>Confidence</span>
      <strong>${airport.confidence}</strong>
    </div>
    <div class="metric">
      <span>Recent reports</span>
      <strong>${airport.reports}</strong>
    </div>
  `;

  const max = Math.max(...airport.trendData);
  waitChart.innerHTML = airport.trendData
    .map((value, index) => {
      const height = Math.max(12, Math.round((value / max) * 72));
      return `<span class="chart-bar ${index === 7 ? "is-current" : ""}" style="height: ${height}px" title="${value} minutes"></span>`;
    })
    .join("");
}

function renderReportLog() {
  reportLogCount.textContent = `${state.apiReportCount} reports`;

  if (!state.latestReports.length) {
    reportLog.innerHTML = `<p class="empty-state">No saved crowd reports yet. Submit one to validate whether people will contribute data.</p>`;
    return;
  }

  reportLog.innerHTML = state.latestReports
    .map(
      (report) => `
        <div class="report-row">
          <strong>${report.airportCode}</strong>
          <span>
            <strong>${report.observedWait} min</strong>
            <small>${report.terminal || "Terminal"} - crowd ${report.crowdLevel}/5 - ${formatRelativeTime(report.createdAt)}</small>
          </span>
          <strong>${report.crowdLevel >= 4 ? "Busy" : "Normal"}</strong>
        </div>
      `
    )
    .join("");
}

function renderValidationStats() {
  validationStats.innerHTML = `
    <div class="validation-stat">
      <span>Interaction events</span>
      <strong>${state.apiEventCount}</strong>
    </div>
    <div class="validation-stat">
      <span>Saved reports</span>
      <strong>${state.apiReportCount}</strong>
    </div>
    <div class="validation-stat">
      <span>Trip Pass waitlist</span>
      <strong>${state.waitlistCount}</strong>
    </div>
  `;
}

function renderAll() {
  renderSelectors();
  renderAirportList();
  renderTripResult();
  renderDetail();
  renderReportLog();
  renderValidationStats();
}

function selectAirport(code) {
  state.selectedCode = code;
  const airport = selectedAirport();
  routeTime.value = airport.route;
  airportSelect.value = code;
  reportAirport.value = code;
  renderAll();
  trackEvent("select_airport", { airportName: airport.name });
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function openPremium() {
  tripPassContext.textContent = `Airport: ${state.selectedCode} - Plan: Trip Pass`;
  premiumModal.hidden = false;
  trackEvent("open_trip_pass", { source: "modal" });
}

function closePremium() {
  premiumModal.hidden = true;
}

function updateCrowdLabel() {
  const labels = ["Very light", "Light crowding", "Normal crowding", "Busy", "Severe crowding"];
  crowdLabel.textContent = labels[Number(crowdLevel.value) - 1];
}

async function init() {
  const defaultDeparture = new Date(Date.now() + 4 * 3600000);
  defaultDeparture.setMinutes(Math.ceil(defaultDeparture.getMinutes() / 5) * 5, 0, 0);
  departureTime.value = formatLocalDateTime(defaultDeparture);
  await loadAirports();
  const initialAirport = new URLSearchParams(window.location.search).get("airport");
  if (initialAirport && airports.some((airport) => airport.code === initialAirport.toUpperCase())) {
    state.selectedCode = initialAirport.toUpperCase();
    routeTime.value = selectedAirport().route;
  }
  renderAll();
  updateCrowdLabel();
  trackEvent("page_view", { page: "planner" });

  document.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select-airport]");
    if (selectButton) {
      selectAirport(selectButton.dataset.selectAirport);
      return;
    }

    if (event.target.closest("[data-open-premium]")) {
      openPremium();
      return;
    }

    const offerButton = event.target.closest("[data-track-offer]");
    if (offerButton) {
      trackEvent("offer_click", { offer: offerButton.dataset.trackOffer });
      showToast("Offer click tracked for validation.");
      return;
    }

    if (event.target.closest("[data-close-premium]")) {
      closePremium();
      return;
    }

    if (event.target === premiumModal) {
      closePremium();
      return;
    }

    if (event.target.closest("[data-enable-alert]")) {
      state.alertEnabled = true;
      trackEvent("enable_alert", { source: "result_card" });
      showToast("Leave-now alert enabled for this trip.");
      renderTripResult();
      renderDetail();
      return;
    }

    const stepButton = event.target.closest("[data-route-step]");
    if (stepButton) {
      const next = Math.min(180, Math.max(5, Number(routeTime.value) + Number(stepButton.dataset.routeStep)));
      routeTime.value = next;
      renderTripResult();
      return;
    }

    if (event.target.closest("[data-jump-report]")) {
      document.querySelector("#report").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  airportSelect.addEventListener("change", (event) => selectAirport(event.target.value));
  reportAirport.addEventListener("change", (event) => selectAirport(event.target.value));
  routeTime.addEventListener("input", renderTripResult);
  departureTime.addEventListener("input", renderTripResult);
  crowdLevel.addEventListener("input", updateCrowdLabel);

  terminalTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal]");
    if (!button) return;
    selectedAirport().selectedTerminal = button.dataset.terminal;
    renderAll();
  });

  alertToggle.addEventListener("change", (event) => {
    state.alertEnabled = event.target.checked;
    showToast(state.alertEnabled ? "Leave-now alert enabled." : "Leave-now alert disabled.");
    renderTripResult();
  });

  plannerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const plan = computePlan();
    renderTripResult();
    try {
      await persistTripPlan(plan);
      await trackEvent("calculate_trip", {
        routeMinutes: plan.route,
        leaveAt: plan.leaveAt.toISOString(),
        flight: document.querySelector("#flight-input").value,
      });
    } catch {
      showToast("Trip plan calculated. API save failed, so it stayed local.");
      return;
    }
    document.querySelector(".result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(state.apiOnline ? "Trip plan saved and recalculated." : "Trip plan recalculated using sample data.");
  });

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(reportForm);
    const airport = selectedAirport();
    const observedWait = Number(formData.get("wait"));
    const crowd = Number(crowdLevel.value);
    try {
      await persistReport(airport, observedWait, crowd);
      await trackEvent("submit_report", {
        observedWait,
        crowdLevel: crowd,
        terminal: airport.selectedTerminal,
      });
    } catch {
      applyReportLocally(airport, observedWait);
      showToast("Report updated locally. API save failed.");
      renderAll();
      return;
    }
    renderAll();
    showToast(
      state.apiOnline
        ? `Thanks. ${airport.code} report saved to backend.`
        : `Thanks. ${airport.code} confidence improved in sample mode.`
    );
  });

  waitlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = tripPassEmail.value.trim();
    try {
      const payload = await joinWaitlist(email);
      await trackEvent("join_waitlist", { plan: "trip_pass", duplicate: Boolean(payload.duplicate) });
      renderValidationStats();
      tripPassEmail.value = "";
      showToast(payload.duplicate ? "You are already on the Trip Pass waitlist." : "Trip Pass waitlist signup saved.");
    } catch (error) {
      showToast(error.message || "Waitlist signup failed.");
    }
  });
}

init();
