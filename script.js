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
      ${siteUrl ? `<a href="${siteUrl}" target="_blank" rel="noopener" class="visit-site">Visit Site</a>` : ""}
      <p class="description">${description}</p>
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

// --- Code Activity Chart ---

(function () {
  const weeks = ["Feb 9", "Feb 16"];

  const repos = [
    { name: "Visit Mariemont",       color: "#6366f1", data: [0, 7971] },
    { name: "Hugga Retreats Website", color: "#14b8a6", data: [0, 3444] },
    { name: "Viggo Agent",           color: "#ff6b6b", data: [0, 2188] },
    { name: "Pot of Hugga",          color: "#f59e0b", data: [0, 2041] },
    { name: "Alfred Agent",           color: "#ec4899", data: [0, 1505] },
    { name: "NC Agent Core",         color: "#0ea5e9", data: [0, 874] },
    { name: "The Daily Chase",       color: "#8b5cf6", data: [0, 606] },
    { name: "Guests First iOS",      color: "#10b981", data: [19789, 77] },
  ];

  const ctx = document.getElementById("code-activity-chart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: weeks,
      datasets: repos.map((r) => ({
        label: r.name,
        data: r.data,
        backgroundColor: r.color,
        borderRadius: 3,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.2,
      interaction: {
        mode: "index",
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 16,
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              size: 12,
            },
            color: "#64748b",
          },
        },
        tooltip: {
          backgroundColor: "#1a1a1a",
          titleFont: {
            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            size: 13,
            weight: "600",
          },
          bodyFont: {
            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            size: 12,
          },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function (context) {
              if (context.raw === 0) return null;
              return " " + context.dataset.label + ": " + context.raw.toLocaleString() + " lines";
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              size: 12,
              weight: "500",
            },
            color: "#64748b",
          },
        },
        y: {
          stacked: true,
          grid: { color: "#f0e6db" },
          border: { display: false },
          ticks: {
            font: {
              family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              size: 11,
            },
            color: "#64748b",
            callback: function (value) {
              return value >= 1000 ? (value / 1000).toFixed(0) + "k" : value;
            },
          },
        },
      },
    },
  });
})();
