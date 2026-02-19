(async function () {
  const GITHUB_API = "https://api.github.com/users/cbeachiv/repos?sort=updated&per_page=100";
  const CACHE_KEY = "tdc_repos";
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour
  const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

  const grid = document.getElementById("projects-grid");

  // --- Helpers ---

  function timeAgo(dateString) {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    const intervals = [
      { label: "year", seconds: 31536000 },
      { label: "month", seconds: 2592000 },
      { label: "week", seconds: 604800 },
      { label: "day", seconds: 86400 },
      { label: "hour", seconds: 3600 },
      { label: "minute", seconds: 60 },
    ];
    for (const { label, seconds: s } of intervals) {
      const count = Math.floor(seconds / s);
      if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
    }
    return "just now";
  }

  function titleCase(str) {
    return str
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // --- Data fetching ---

  async function fetchConfig() {
    try {
      const res = await fetch("project-config.json");
      return res.ok ? await res.json() : {};
    } catch {
      return {};
    }
  }

  function getCached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { timestamp, data } = JSON.parse(raw);
      if (Date.now() - timestamp < CACHE_TTL) return data;
    } catch { /* ignore bad cache */ }
    return null;
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch { /* storage full or unavailable */ }
  }

  async function fetchRepos() {
    const cached = getCached();
    if (cached) return cached;

    const res = await fetch(GITHUB_API);
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    setCache(data);
    return data;
  }

  // --- Rendering ---

  function renderCard(repo, config) {
    const cfg = config[repo.name] || {};
    const displayName = cfg.displayName || titleCase(repo.name);
    const description = cfg.description || repo.description || "No description provided.";
    const siteUrl = cfg.siteUrl;

    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <h3><a href="${repo.html_url}" target="_blank" rel="noopener">${displayName}</a></h3>
      <p class="description">${description}</p>
      ${siteUrl ? `<a href="${siteUrl}" target="_blank" rel="noopener" class="visit-site">Visit Site</a>` : ""}
      <span class="updated">Updated ${timeAgo(repo.updated_at)}</span>
    `;
    return card;
  }

  // --- Main ---

  try {
    const [repos, config] = await Promise.all([fetchRepos(), fetchConfig()]);

    const cutoff = Date.now() - ONE_YEAR;
    const recent = repos
      .filter((r) => new Date(r.updated_at).getTime() > cutoff)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    grid.innerHTML = "";

    if (recent.length === 0) {
      grid.innerHTML = '<div class="empty">No projects updated in the past year.</div>';
      return;
    }

    for (const repo of recent) {
      grid.appendChild(renderCard(repo, config));
    }
  } catch (err) {
    console.error("Failed to load projects:", err);
    grid.innerHTML = '<div class="error">Could not load projects. Please try again later.</div>';
  }
})();
