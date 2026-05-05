const airportCode = document.body.dataset.airportCode;
const waitEl = document.querySelector("#airport-wait");
const statusEl = document.querySelector("#airport-status");
const confidenceEl = document.querySelector("#airport-confidence");
const updatedEl = document.querySelector("#airport-updated");
const metricsEl = document.querySelector("#airport-metrics");
const chartEl = document.querySelector("#airport-chart");
const reportLogEl = document.querySelector("#airport-report-log");
const reportCountEl = document.querySelector("#airport-report-count");
const reportForm = document.querySelector("#airport-report-form");
const waitlistEmail = document.querySelector("#airport-page-email");
const toastEl = document.querySelector("#toast");

let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

function waitText(airport) {
  return `${airport.wait[0]}-${airport.wait[1]} min`;
}

function relativeTime(isoDate) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3200);
}

function renderAirport(airport, reports) {
  waitEl.textContent = waitText(airport);
  statusEl.textContent = airport.status;
  confidenceEl.textContent = airport.confidence;
  updatedEl.textContent = `${airport.updated}m ago`;
  reportCountEl.textContent = `${reports.length} recent`;

  metricsEl.innerHTML = `
    <div class="metric"><span>Terminal</span><strong>${airport.selectedTerminal}</strong></div>
    <div class="metric"><span>Trend</span><strong>${airport.trend}</strong></div>
    <div class="metric"><span>Reports</span><strong>${airport.reports}</strong></div>
    <div class="metric"><span>Status</span><strong>${airport.status}</strong></div>
  `;

  const max = Math.max(...airport.trendData);
  chartEl.innerHTML = airport.trendData
    .map((value, index) => {
      const height = Math.max(12, Math.round((value / max) * 72));
      return `<span class="chart-bar ${index === 7 ? "is-current" : ""}" style="height: ${height}px"></span>`;
    })
    .join("");

  if (!reports.length) {
    reportLogEl.innerHTML = `<p class="empty-state">No saved reports for ${airport.code} yet.</p>`;
    return;
  }

  reportLogEl.innerHTML = reports
    .map(
      (report) => `
        <div class="report-row">
          <strong>${report.airportCode}</strong>
          <span>
            <strong>${report.observedWait} min</strong>
            <small>${report.terminal || "Terminal"} - crowd ${report.crowdLevel}/5 - ${relativeTime(report.createdAt)}</small>
          </span>
          <strong>${report.crowdLevel >= 4 ? "Busy" : "Normal"}</strong>
        </div>
      `
    )
    .join("");
}

async function loadAirport() {
  const payload = await api(`/api/airports/${airportCode}`);
  renderAirport(payload.airport, payload.reports);
}

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(reportForm);
  const observedWait = Number(formData.get("wait"));

  try {
    await api("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        airportCode,
        terminal: "Main",
        observedWait,
        crowdLevel: observedWait >= 35 ? 5 : observedWait >= 20 ? 4 : 3,
      }),
    });
    await api("/api/events", {
      method: "POST",
      body: JSON.stringify({ eventType: "submit_report", airportCode, metadata: { source: "airport_page" } }),
    });

    const email = waitlistEmail.value.trim();
    if (email) {
      await api("/api/waitlist", {
        method: "POST",
        body: JSON.stringify({ email, airportCode, plan: "trip_pass" }),
      });
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify({ eventType: "join_waitlist", airportCode, metadata: { source: "airport_page" } }),
      });
      waitlistEmail.value = "";
    }

    await loadAirport();
    showToast("Airport report saved.");
  } catch (error) {
    showToast(error.message || "Could not save report.");
  }
});

loadAirport().catch(() => showToast("Could not load airport data."));
