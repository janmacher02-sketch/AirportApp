const seoTotalsEl = document.querySelector("#seo-totals");
const seoChecklistEl = document.querySelector("#seo-checklist");
const seoLinksEl = document.querySelector("#seo-links");
const googleSetupEl = document.querySelector("#google-setup");
const seoPagesEl = document.querySelector("#seo-pages");
const refreshSeoButton = document.querySelector("#refresh-seo");
const submitIndexNowButton = document.querySelector("#submit-indexnow");
const indexNowStatusEl = document.querySelector("#indexnow-status");
const toastEl = document.querySelector("#toast");

let toastTimer;

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

async function postApi(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.response || payload.error || `Request failed with ${response.status}`);
  return payload;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

function statusLabel(status) {
  const labels = {
    done: "Done",
    todo: "Todo",
    manual: "Manual",
    active: "Active",
    waiting: "Waiting",
  };
  return labels[status] || status || "Unknown";
}

function renderStats(data) {
  seoTotalsEl.innerHTML = `
    <div class="validation-stat"><span>Landing pages</span><strong>${data.totals.landingPages}</strong></div>
    <div class="validation-stat"><span>In sitemap</span><strong>${data.totals.indexedInSitemap}</strong></div>
    <div class="validation-stat"><span>Airports</span><strong>${data.totals.airports}</strong></div>
    <div class="validation-stat"><span>Organic events</span><strong>${data.totals.organicEvents}</strong></div>
    <div class="validation-stat"><span>Waitlist</span><strong>${data.totals.waitlist}</strong></div>
  `;
}

function renderChecklist(items) {
  seoChecklistEl.innerHTML = items
    .map(
      (item) => `
        <div class="admin-row">
          <span>${item.label}<small>${item.detail}</small></span>
          <strong class="status-pill status-${item.status}">${statusLabel(item.status)}</strong>
        </div>
      `
    )
    .join("");
}

function renderLinks(setup) {
  seoLinksEl.innerHTML = `
    <a class="admin-row seo-link-row" href="${setup.sitemapUrl}" target="_blank" rel="noreferrer">
      <span>Sitemap<small>${setup.sitemapUrl}</small></span>
      <strong>XML</strong>
    </a>
    <a class="admin-row seo-link-row" href="${setup.robotsUrl}" target="_blank" rel="noreferrer">
      <span>Robots<small>${setup.robotsUrl}</small></span>
      <strong>TXT</strong>
    </a>
    <div class="admin-row">
      <span>Google verification<small>GOOGLE_SITE_VERIFICATION env var</small></span>
      <strong class="status-pill ${setup.googleVerificationConfigured ? "status-done" : "status-todo"}">${
    setup.googleVerificationConfigured ? "Done" : "Todo"
  }</strong>
    </div>
    <a class="admin-row seo-link-row" href="${setup.indexNowKeyLocation}" target="_blank" rel="noreferrer">
      <span>IndexNow key file<small>${setup.indexNowKeyLocation}</small></span>
      <strong class="status-pill ${setup.indexNowConfigured ? "status-active" : "status-todo"}">${
    setup.indexNowConfigured ? "Active" : "Todo"
  }</strong>
    </a>
  `;
}

function renderGoogleSetup(setup) {
  googleSetupEl.innerHTML = `
    <a class="admin-row seo-link-row" href="${setup.googleSearchConsoleUrl}" target="_blank" rel="noreferrer">
      <span>Open Google Search Console<small>Create a URL-prefix property.</small></span>
      <strong>Open</strong>
    </a>
    <div class="admin-row">
      <span>Property URL<small>Paste this exact URL into Search Console.</small></span>
      <strong>${setup.searchConsoleProperty}</strong>
    </div>
    <a class="admin-row seo-link-row" href="${setup.renderDashboardUrl}" target="_blank" rel="noreferrer">
      <span>Open Render dashboard<small>Add Google token to the airportready service environment.</small></span>
      <strong>Open</strong>
    </a>
    <div class="admin-row">
      <span>Render env var<small>Paste only the token from content=&quot;...&quot;, not the whole meta tag.</small></span>
      <strong>${setup.googleVerificationEnvVar}</strong>
    </div>
    <div class="admin-row">
      <span>Verification status<small>Search Console can verify after Render redeploys.</small></span>
      <strong class="status-pill ${setup.googleVerificationConfigured ? "status-done" : "status-todo"}">${
    setup.googleVerificationConfigured ? "Done" : "Todo"
  }</strong>
    </div>
    <div class="admin-row">
      <span>Sitemap to submit<small>Submit after property verification.</small></span>
      <strong>${setup.sitemapUrl}</strong>
    </div>
  `;
}

function renderIndexNowStatus(message, result) {
  if (!result) {
    indexNowStatusEl.innerHTML = `
      <div class="admin-row">
        <span>${message}<small>Ready to submit current landing pages.</small></span>
        <strong class="status-pill status-waiting">Waiting</strong>
      </div>
    `;
    return;
  }

  indexNowStatusEl.innerHTML = `
    <div class="admin-row">
      <span>${message}<small>${result.host} / ${result.keyLocation}</small></span>
      <strong class="status-pill ${result.ok ? "status-done" : "status-todo"}">${result.status}</strong>
    </div>
    <div class="admin-row">
      <span>Submitted URLs<small>${result.submittedAt || "just now"} / ${result.durationMs}ms</small></span>
      <strong>${result.submitted}</strong>
    </div>
  `;
}

function renderPages(pages) {
  seoPagesEl.innerHTML = pages
    .map(
      (page) => `
        <article class="seo-page-row">
          <div>
            <a href="${page.path}" target="_blank" rel="noreferrer">${page.title}</a>
            <small>${page.intent} / ${page.eventPage} / CTA: ${page.cta}</small>
          </div>
          <div class="seo-page-metrics">
            <span>${page.inSitemap ? "Sitemap" : "Missing"}</span>
            <span>${page.events} events</span>
            <span>${page.waitlist} leads</span>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadSeo() {
  const data = await api("/api/admin/seo");
  renderStats(data);
  renderChecklist(data.checklist);
  renderLinks(data.setup);
  renderGoogleSetup(data.setup);
  renderPages(data.landingPages);
  renderIndexNowStatus(`${data.landingPages.length} URLs ready for IndexNow`, null);
}

refreshSeoButton.addEventListener("click", () => {
  loadSeo()
    .then(() => showToast("SEO checklist refreshed."))
    .catch((error) => showToast(error.message || "SEO refresh failed."));
});

submitIndexNowButton.addEventListener("click", () => {
  submitIndexNowButton.disabled = true;
  renderIndexNowStatus("Submitting URLs to IndexNow...", null);
  postApi("/api/admin/indexnow")
    .then((result) => {
      renderIndexNowStatus("IndexNow submission completed.", result);
      showToast(`Submitted ${result.submitted} URLs to IndexNow.`);
    })
    .catch((error) => {
      renderIndexNowStatus(error.message || "IndexNow submission failed.", {
        ok: false,
        status: "Error",
        submitted: 0,
        submittedAt: new Date().toISOString(),
        durationMs: 0,
        host: "-",
        keyLocation: "-",
      });
      showToast(error.message || "IndexNow submission failed.");
    })
    .finally(() => {
      submitIndexNowButton.disabled = false;
    });
});

loadSeo().catch((error) => showToast(error.message || "Could not load SEO checklist."));
