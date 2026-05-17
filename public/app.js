const refreshButton = document.querySelector("#refreshButton");
const autoRefreshToggle = document.querySelector("#autoRefreshToggle");
const minScoreInput = document.querySelector("#minScoreInput");
const statusFilter = document.querySelector("#statusFilter");

const elements = {
  healthStatus: document.querySelector("#healthStatus"),
  loginState: document.querySelector("#loginState"),
  lastPoll: document.querySelector("#lastPoll"),
  latestPostId: document.querySelector("#latestPostId"),
  signalCount: document.querySelector("#signalCount"),
  signalThresholdLabel: document.querySelector("#signalThresholdLabel"),
  analysisCount: document.querySelector("#analysisCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  latestPostLink: document.querySelector("#latestPostLink"),
  latestPostText: document.querySelector("#latestPostText"),
  latestCreatedAt: document.querySelector("#latestCreatedAt"),
  latestDetectedAt: document.querySelector("#latestDetectedAt"),
  latestAnalysis: document.querySelector("#latestAnalysis"),
  signalsState: document.querySelector("#signalsState"),
  analysesState: document.querySelector("#analysesState"),
  signalsList: document.querySelector("#signalsList"),
  analysesList: document.querySelector("#analysesList")
};

const emptyTemplate = document.querySelector("#emptyTemplate");
let refreshTimer = null;
let isRefreshing = false;

function api(path) {
  return fetch(path, { cache: "no-store" }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error ?? `Request failed with ${response.status}`);
    }
    return body;
  });
}

function formatTime(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatRelative(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < 60) {
    return formatter.format(seconds, "second");
  }
  if (abs < 3600) {
    return formatter.format(Math.round(seconds / 60), "minute");
  }
  if (abs < 86400) {
    return formatter.format(Math.round(seconds / 3600), "hour");
  }
  return formatter.format(Math.round(seconds / 86400), "day");
}

function scoreClass(score) {
  if (score >= 80) {
    return "score hot";
  }
  if (score >= 55) {
    return "score warn";
  }
  return "score";
}

function setState(element, label, kind = "") {
  element.textContent = label;
  element.className = `state-pill ${kind}`.trim();
}

function renderEmpty(target, message = "No rows found") {
  const node = emptyTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = message;
  target.replaceChildren(node);
}

function shortId(postId) {
  return postId ? `${postId.slice(0, 6)}...${postId.slice(-4)}` : "Unknown post";
}

function xPostUrl(postId) {
  return `https://x.com/Polymarket/status/${encodeURIComponent(postId)}`;
}

function renderNames(names) {
  if (!Array.isArray(names) || names.length === 0) {
    return '<span class="tag">No names</span>';
  }

  return names
    .slice(0, 5)
    .map((item) => {
      const ticker = item.ticker ? `$${escapeHtml(item.ticker)}` : "No ticker";
      return `<span class="tag">${escapeHtml(item.name)} ${ticker}</span>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHealth(health) {
  elements.healthStatus.textContent = health.status ?? "Unknown";
  elements.loginState.textContent = `Login ${health.loginState ?? "unknown"}`;
  elements.lastPoll.textContent = formatRelative(health.lastSuccessfulPollAt);
  elements.latestPostId.textContent = health.latestPostId ? `Latest ${shortId(health.latestPostId)}` : "No latest post";
}

function renderLatestPost(post, analysis) {
  elements.latestPostText.textContent = post.text ?? "No latest post text available.";
  elements.latestPostLink.href = xPostUrl(post.postId);
  elements.latestPostLink.hidden = !post.postId;
  elements.latestCreatedAt.textContent = `Created: ${formatTime(post.createdAt)}`;
  elements.latestDetectedAt.textContent = `Detected: ${formatTime(post.detectedAt)}`;

  if (!analysis) {
    elements.latestAnalysis.textContent = "No AI analysis found for the latest post yet.";
    return;
  }

  if (analysis.status === "error") {
    elements.latestAnalysis.textContent = `AI error: ${analysis.errorMessage ?? "Unknown error"}`;
    return;
  }

  elements.latestAnalysis.textContent =
    `AI: score ${analysis.signalScore}, ${analysis.recommendedAction}. ${analysis.whySignal || analysis.narrative || "No rationale returned."}`;
}

function renderSignals(signals) {
  elements.signalCount.textContent = String(signals.length);
  elements.signalThresholdLabel.textContent = `Score >= ${minScoreInput.value || 0}`;

  if (signals.length === 0) {
    setState(elements.signalsState, "Empty");
    renderEmpty(elements.signalsList, "No positive signals at this threshold");
    return;
  }

  setState(elements.signalsState, `${signals.length} rows`, "good");
  elements.signalsList.replaceChildren(
    ...signals.map((signal) => {
      const card = document.createElement("article");
      card.className = "signal-card";
      const title = signal.possibleNames?.[0]?.name ?? signal.narrative ?? "Signal candidate";
      card.innerHTML = `
        <div class="${scoreClass(signal.signalScore)}">${escapeHtml(signal.signalScore)}</div>
        <div>
          <h3><a class="post-link" href="${xPostUrl(signal.postId)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a></h3>
          <p>${escapeHtml(signal.whySignal || signal.narrative || "No rationale returned.")}</p>
          <div class="tag-row">
            <span class="tag action">${escapeHtml(signal.recommendedAction)}</span>
            <span class="tag">${escapeHtml(signal.confidence)} confidence</span>
            <span class="tag">${escapeHtml(signal.urgency)} urgency</span>
            ${renderNames(signal.possibleNames)}
          </div>
        </div>
      `;
      return card;
    })
  );
}

function renderAnalyses(analyses) {
  elements.analysisCount.textContent = String(analyses.length);

  if (analyses.length === 0) {
    setState(elements.analysesState, "Empty");
    renderEmpty(elements.analysesList, "No analyses found");
    return;
  }

  setState(elements.analysesState, `${analyses.length} rows`, "good");
  elements.analysesList.replaceChildren(
    ...analyses.map((analysis) => {
      const row = document.createElement("article");
      row.className = "analysis-row";
      const isError = analysis.status === "error";
      const summary = isError
        ? analysis.errorMessage ?? "AI analysis failed"
        : analysis.whySignal || analysis.narrative || "No rationale returned.";
      row.innerHTML = `
        <div>
          <h3><a class="post-link" href="${xPostUrl(analysis.postId)}" target="_blank" rel="noreferrer">${escapeHtml(shortId(analysis.postId))}</a></h3>
          <p>${escapeHtml(summary)}</p>
          <div class="tag-row">
            <span class="tag ${isError ? "error" : "action"}">${escapeHtml(analysis.status)}</span>
            <span class="tag">${escapeHtml(analysis.recommendedAction ?? "none")}</span>
            <span class="tag">${formatTime(analysis.createdAt)}</span>
            ${renderNames(analysis.possibleNames)}
          </div>
        </div>
        <div class="${scoreClass(analysis.signalScore ?? 0)}">${escapeHtml(analysis.signalScore ?? 0)}</div>
      `;
      return row;
    })
  );
}

async function refresh() {
  if (isRefreshing) {
    return;
  }

  isRefreshing = true;
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing";
  setState(elements.signalsState, "Loading");
  setState(elements.analysesState, "Loading");

  try {
    const minScore = Math.max(0, Math.min(100, Number.parseInt(minScoreInput.value, 10) || 0));
    minScoreInput.value = String(minScore);
    const status = statusFilter.value ? `&status=${encodeURIComponent(statusFilter.value)}` : "";

    const [health, latestPost, signals, analyses] = await Promise.all([
      api("/api/health"),
      api("/api/posts/latest"),
      api(`/api/meme-signals?min_score=${minScore}&limit=20`),
      api(`/api/meme-analyses?limit=25${status}`)
    ]);

    let latestAnalysis = null;
    if (latestPost?.postId) {
      latestAnalysis = await api(`/api/posts/${encodeURIComponent(latestPost.postId)}/meme-analysis`).catch(() => null);
    }

    renderHealth(health);
    renderLatestPost(latestPost, latestAnalysis);
    renderSignals(signals);
    renderAnalyses(analyses);
    elements.lastUpdated.textContent = `Updated ${formatRelative(new Date().toISOString())}`;
  } catch (error) {
    setState(elements.signalsState, "Error", "bad");
    setState(elements.analysesState, "Error", "bad");
    renderEmpty(elements.signalsList, error.message);
    renderEmpty(elements.analysesList, error.message);
  } finally {
    isRefreshing = false;
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
}

function scheduleAutoRefresh() {
  window.clearInterval(refreshTimer);
  if (autoRefreshToggle.checked) {
    refreshTimer = window.setInterval(refresh, 30_000);
  }
}

refreshButton.addEventListener("click", refresh);
autoRefreshToggle.addEventListener("change", scheduleAutoRefresh);
minScoreInput.addEventListener("change", refresh);
statusFilter.addEventListener("change", refresh);

scheduleAutoRefresh();
void refresh();
