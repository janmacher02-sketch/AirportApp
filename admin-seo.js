const seoTotalsEl = document.querySelector("#seo-totals");
const seoChecklistEl = document.querySelector("#seo-checklist");
const seoLinksEl = document.querySelector("#seo-links");
const seoPagesEl = document.querySelector("#seo-pages");
const refreshSeoButton = document.querySelector("#refresh-seo");
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
    <a class="admin-row seo-link-row" href="${setup.searchConsoleProperty}" target="_blank" rel="noreferrer">
      <span>Search Console property<small>${setup.searchConsoleProperty}</small></span>
      <strong>URL</strong>
    </a>
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
  renderPages(data.landingPages);
}

refreshSeoButton.addEventListener("click", () => {
  loadSeo()
    .then(() => showToast("SEO checklist refreshed."))
    .catch((error) => showToast(error.message || "SEO refresh failed."));
});

loadSeo().catch((error) => showToast(error.message || "Could not load SEO checklist."));
