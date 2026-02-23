import { QUESTIONNAIRE } from "./questionnaire.js";
import { computeReportModel } from "./scoring.js";
import {
  generateSummary,
  generateStrengths,
  generateWeaknesses,
  generateGuidance,
} from "./report.js";

const STORAGE_KEY = "ds_diag_wizard_state_v1";
const REPORTS_STORAGE_KEY = "ds_diag_reports_v1";
const MAX_SAVED_REPORTS = 25;
const TOTAL_STEPS = 3;
const FEEDBACK_FORM_URL = (document.body?.dataset.feedbackFormUrl || "").trim();

const state = {
  currentStep: 1,
  contextResponses: {},
  responses: {},
};

const wizardContent = document.getElementById("wizardContent");
const validationMessage = document.getElementById("validationMessage");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const stepLabel = document.getElementById("stepLabel");
const progressFill = document.getElementById("progressFill");

/** @type {{ maturity: Chart | null, dimensions: Chart | null }} */
const chartInstances = {
  maturity: null,
  dimensions: null,
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function restoreState() {
  try {
    const raw = readStorage(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    state.currentStep = Number(parsed.currentStep) || 1;
    if (state.currentStep < 1 || state.currentStep > TOTAL_STEPS) {
      state.currentStep = 1;
    }

    state.contextResponses = parsed.contextResponses || {};
    state.responses = parsed.responses || {};
  } catch {
    state.currentStep = 1;
    state.contextResponses = {};
    state.responses = {};
  }
}

function persistState() {
  writeStorage(
    STORAGE_KEY,
    JSON.stringify({
      currentStep: state.currentStep,
      contextResponses: state.contextResponses,
      responses: state.responses,
    })
  );
}

function titleCase(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clearValidation() {
  validationMessage.textContent = "";
}

function setValidation(message) {
  validationMessage.textContent = message;
}

function updateProgress() {
  stepLabel.textContent = `Step ${state.currentStep}/${TOTAL_STEPS}`;
  progressFill.style.width = `${(state.currentStep / TOTAL_STEPS) * 100}%`;

  backBtn.disabled = state.currentStep === 1;
  if (state.currentStep === 3) {
    nextBtn.textContent = "Start Over";
  } else if (state.currentStep === 2) {
    nextBtn.textContent = "View Results";
  } else {
    nextBtn.textContent = "Continue";
  }
}

function renderContextStep() {
  const { title, description, questions } = QUESTIONNAIRE.operationalContext;
  const html = `
    <h2 class="section-title">${title}</h2>
    <p class="section-subtitle">${description}</p>
    ${questions
      .map((q) => {
        const options = q.options
          .map((opt) => {
            const checked = Number(state.contextResponses[q.id]) === Number(opt.score);
            return `
              <label class="option">
                <input
                  type="radio"
                  name="${q.id}"
                  value="${opt.score}"
                  data-type="context"
                  data-id="${q.id}"
                  ${checked ? "checked" : ""}
                />
                <span>${opt.label}</span>
              </label>
            `;
          })
          .join("");

        return `
          <fieldset class="question">
            <legend class="question-title">${q.prompt}</legend>
            <p class="help-text">Choose the option that best reflects your current operating context.</p>
            <div class="option-list">
              ${options}
            </div>
          </fieldset>
        `;
      })
      .join("")}
  `;

  wizardContent.innerHTML = html;
}

function renderStructuralStep() {
  const { title, description, dimensions, behavioralQuestions } = QUESTIONNAIRE.structuralMaturity;

  const html = `
    <h2 class="section-title">${title}</h2>
    <p class="section-subtitle">${description}</p>
    ${dimensions
      .map((dimension) => {
        const key = dimension.toLowerCase();
        const questions = behavioralQuestions.filter(
          (q) => q.dimension.toLowerCase() === key
        );

        return `
          <section class="group">
            <h3 class="section-title">${dimension}</h3>
            ${questions
              .map((q) => {
                const labels = q.scoringLabels || {};
                const radioHtml = [0, 1, 2, 3]
                  .map((value) => {
                    const checked = Number(state.responses[q.id]) === value;
                    return `
                      <label class="option">
                        <input
                          type="radio"
                          name="${q.id}"
                          value="${value}"
                          data-type="maturity"
                          data-id="${q.id}"
                          ${checked ? "checked" : ""}
                        />
                        <span>${value} - ${labels[value]}</span>
                      </label>
                    `;
                  })
                  .join("");

                return `
                  <fieldset class="question">
                    <legend class="question-title">${q.prompt}</legend>
                    <p class="help-text">${q.helpText}</p>
                    <div class="option-list">
                      ${radioHtml}
                    </div>
                  </fieldset>
                `;
              })
              .join("")}
          </section>
        `;
      })
      .join("")}
  `;

  wizardContent.innerHTML = html;
}

function getAdequacyStatus(gap) {
  if (gap < -10) {
    return { label: "Underbuilt", className: "underbuilt" };
  }
  if (gap > 10) {
    return { label: "Overbuilt", className: "overbuilt" };
  }
  return { label: "Balanced", className: "balanced" };
}

/**
 * Returns a scriptable gradient fill callback for Chart.js datasets.
 * @param {string[]} colors
 * @returns {(context: { chart: Chart }) => CanvasGradient | string}
 */
function createGradientFill(colors) {
  return (context) => {
    const chart = context.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) {
      return colors[0];
    }
    const gradient = ctx.createLinearGradient(
      chartArea.left,
      chartArea.top,
      chartArea.right,
      chartArea.top
    );
    const step = colors.length > 1 ? 1 / (colors.length - 1) : 1;
    colors.forEach((color, index) => {
      gradient.addColorStop(step * index, color);
    });
    return gradient;
  };
}

function destroyCharts() {
  if (chartInstances.maturity) {
    chartInstances.maturity.destroy();
    chartInstances.maturity = null;
  }
  if (chartInstances.dimensions) {
    chartInstances.dimensions.destroy();
    chartInstances.dimensions = null;
  }
}

function getFeedbackEmbedUrl() {
  if (!FEEDBACK_FORM_URL) return "";
  try {
    const url = new URL(FEEDBACK_FORM_URL);
    if (!url.hostname.includes("google.com")) return FEEDBACK_FORM_URL;
    if (!url.pathname.includes("/forms/")) return FEEDBACK_FORM_URL;
    url.searchParams.set("embedded", "true");
    return url.toString();
  } catch {
    return FEEDBACK_FORM_URL;
  }
}

function getComputedReport() {
  const reportModel = computeReportModel({
    responses: state.responses,
    contextResponses: state.contextResponses,
    QUESTIONNAIRE,
  });

  const summary = generateSummary(reportModel);
  const guidance = generateGuidance(reportModel);
  const risks = reportModel?.risks?.flags || [];

  return { reportModel, summary, guidance, risks };
}

function getStateFingerprint() {
  const context = Object.entries(state.contextResponses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  const maturity = Object.entries(state.responses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  return `${context}::${maturity}`;
}

function loadSavedReports() {
  try {
    const raw = readStorage(REPORTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReportSnapshot(reportModel, summary, guidance) {
  const reports = loadSavedReports();
  const fingerprint = getStateFingerprint();
  const existing = reports[0];
  if (existing && existing.fingerprint === fingerprint) {
    return reports;
  }

  const record = {
    timestamp: new Date().toISOString(),
    fingerprint,
    summary,
    SSI: Number(reportModel.SSI || 0),
    OPI: Number(reportModel.operationalPressure?.OPI || 0),
    adequacyGap: Number(reportModel.adequacyGap || 0),
    risks: [...(reportModel.risks?.flags || [])],
    guidance: [...guidance],
  };

  const next = [record, ...reports].slice(0, MAX_SAVED_REPORTS);
  writeStorage(REPORTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function formatLocalTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function buildExportPayload(reportModel, guidance) {
  /** @type {Record<string, {avg: number, score100: number}>} */
  const dimensionScores = {};
  for (const [dimension, score] of Object.entries(reportModel.dimensionScores || {})) {
    dimensionScores[dimension] = {
      avg: Number(score.avg || 0),
      score100: Number(score.score100 || 0),
    };
  }

  return {
    timestamp: new Date().toISOString(),
    contextResponses: { ...state.contextResponses },
    dimensionScores,
    SSI: Number(reportModel.SSI || 0),
    OPI: Number(reportModel.operationalPressure?.OPI || 0),
    adequacyGap: Number(reportModel.adequacyGap || 0),
    riskFlags: [...(reportModel.risks?.flags || [])],
    guidanceTips: [...guidance],
  };
}

function downloadReportJson() {
  const { reportModel, guidance } = getComputedReport();
  const payload = buildExportPayload(reportModel, guidance);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = url;
  link.download = `ds-maturity-report-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildCopySummaryText(reportModel, summary) {
  const lines = [
    summary,
    "",
    `SSI: ${Number(reportModel.SSI || 0).toFixed(1)}`,
    `OPI: ${Number(reportModel.operationalPressure?.OPI || 0).toFixed(1)}`,
    `Adequacy Gap: ${Number(reportModel.adequacyGap || 0).toFixed(1)}`,
  ];
  return lines.join("\n");
}

async function copySummaryToClipboard() {
  const { reportModel, summary } = getComputedReport();
  const text = buildCopySummaryText(reportModel, summary);

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function renderResultsStep() {
  const { reportModel, summary, guidance, risks } = getComputedReport();
  const savedReports = saveReportSnapshot(reportModel, summary, guidance);
  const feedbackEmbedUrl = getFeedbackEmbedUrl();
  const feedbackConfigured = Boolean(feedbackEmbedUrl);
  const strengths = generateStrengths(reportModel);
  const weaknesses = generateWeaknesses(reportModel);
  const adequacyStatus = getAdequacyStatus(reportModel.adequacyGap);

  const strengthsHtml = strengths
    .map((item) => `<li>${item.dimension} (${item.score100.toFixed(1)})</li>`)
    .join("");
  const weaknessesHtml = weaknesses
    .map((item) => `<li>${item.dimension} (${item.score100.toFixed(1)})</li>`)
    .join("");
  const risksHtml = risks.length
    ? risks.map((risk) => `<li>${risk}</li>`).join("")
    : '<li class="good">No strong gap signals were detected in this response set.</li>';
  const guidanceHtml = guidance.map((tip) => `<li>${tip}</li>`).join("");
  const historyHtml = savedReports.length
    ? savedReports
        .map((item) => {
          const status = getAdequacyStatus(Number(item.adequacyGap || 0));
          return `<li>
            <strong>${formatLocalTimestamp(item.timestamp)}</strong>
            <span> · SSI ${Number(item.SSI || 0).toFixed(1)}</span>
            <span> · OPI ${Number(item.OPI || 0).toFixed(1)}</span>
            <span> · Gap ${Number(item.adequacyGap || 0).toFixed(1)}</span>
            <span class="chip ${status.className}">${status.label}</span>
          </li>`;
        })
        .join("")
    : "<li>No saved report yet.</li>";

  wizardContent.innerHTML = `
    <div class="results-grid">
      <h2 class="section-title">Results</h2>
      <p class="section-subtitle">${summary}</p>
      <p class="disclaimer">This tool describes alignment between system practices and operational pressure. It is a reflective diagnostic, not an audit.</p>

      <div class="kpis">
        <div class="kpi">
          <div class="kpi-label">SSI</div>
          <div class="kpi-value">${reportModel.SSI.toFixed(1)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">OPI</div>
          <div class="kpi-value">${reportModel.operationalPressure.OPI.toFixed(1)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Adequacy Gap</div>
          <div class="kpi-value ${reportModel.adequacyGap < 0 ? "risk" : "good"}">${reportModel.adequacyGap.toFixed(
            1
          )}</div>
          <div class="gap-indicator ${adequacyStatus.className}">
            <span class="gap-dot" aria-hidden="true"></span>
            <span>${adequacyStatus.label}</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Actual maturity vs operational pressure (OPI)</h3>
        <div class="chart-shell">
          <canvas id="resultsChart"></canvas>
        </div>
      </div>

      <div class="panel">
        <h3>Multi-dimension profile</h3>
        <div class="chart-shell chart-shell-radar">
          <canvas id="dimensionsChart"></canvas>
        </div>
      </div>

      <div class="panel">
        <h3>Stronger signals</h3>
        <ul>${strengthsHtml}</ul>
      </div>

      <div class="panel">
        <h3>Emerging signals</h3>
        <ul>${weaknessesHtml}</ul>
      </div>

      <div class="panel">
        <h3>Potential signals to monitor</h3>
        <ul>${risksHtml}</ul>
      </div>

      <div class="panel">
        <h3>Actionable next steps</h3>
        <ul>${guidanceHtml}</ul>
      </div>

      <div class="panel">
        <h3>Report actions</h3>
        <div class="inline-actions">
          <button id="downloadReportBtn" class="btn btn-secondary" type="button">
            Download report (JSON)
          </button>
          <button id="copySummaryBtn" class="btn btn-secondary" type="button">
            Copy summary
          </button>
          <button id="newResponseBtn" class="btn btn-secondary" type="button">
            New response
          </button>
          <button id="openFeedbackBtn" class="btn btn-secondary" type="button">
            Leave anonymous feedback
          </button>
        </div>
      </div>

      <div class="panel">
        <h3>Saved reports on this browser</h3>
        <ul class="history-list">${historyHtml}</ul>
      </div>
    </div>

    <div id="feedbackModal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle">
      <div class="modal-card">
        <h3 id="feedbackTitle">Anonymous feedback</h3>
        <p class="help-text">Your response will be submitted through Google Forms.</p>
        ${
          feedbackConfigured
            ? `<iframe
                id="feedbackFrame"
                class="feedback-iframe"
                src="${feedbackEmbedUrl}"
                title="Anonymous feedback form"
                loading="lazy"
              ></iframe>`
            : `<p class="risk">Feedback form is not configured yet. Add the form URL in <code>index.html</code> body <code>data-feedback-form-url</code>.</p>`
        }
        <div class="inline-actions">
          <button id="closeFeedbackBtn" class="btn btn-secondary" type="button">Close</button>
          ${
            feedbackConfigured
              ? `<a id="openFeedbackExternalLink" class="btn btn-primary feedback-link-btn" target="_blank" rel="noopener noreferrer" href="${FEEDBACK_FORM_URL}">Open in new tab</a>`
              : ""
          }
        </div>
      </div>
    </div>
  `;

  renderResultsChart(reportModel);
}

function renderResultsChart(reportModel) {
  const canvas = document.getElementById("resultsChart");
  const dimensionsCanvas = document.getElementById("dimensionsChart");
  if (!canvas) return;
  if (!dimensionsCanvas) return;
  if (typeof Chart === "undefined") {
    const panel = canvas.closest(".panel");
    if (panel) {
      panel.insertAdjacentHTML(
        "beforeend",
        '<p class="help-text">Chart unavailable. Your report metrics are still listed above.</p>'
      );
    }
    return;
  }

  destroyCharts();

  const dimensions = Object.keys(reportModel.dimensionScores || {});
  const actualScores = dimensions.map((key) => reportModel.dimensionScores[key].score100);
  const opiThreshold = dimensions.map(() => reportModel.operationalPressure.OPI);

  chartInstances.maturity = new Chart(canvas, {
    type: "bar",
    data: {
      labels: dimensions.map((d) => titleCase(d)),
      datasets: [
        {
          label: "Actual maturity",
          data: actualScores,
          backgroundColor: createGradientFill([
            "rgba(31, 111, 235, 0.75)",
            "rgba(56, 189, 248, 0.75)",
          ]),
          borderColor: "rgba(31, 111, 235, 1)",
          borderWidth: 1,
        },
        {
          label: "Operational pressure (OPI)",
          data: opiThreshold,
          backgroundColor: "rgba(180, 35, 24, 0.35)",
          borderColor: "rgba(180, 35, 24, 0.95)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: "Score (0-100)",
          },
        },
      },
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });

  chartInstances.dimensions = new Chart(dimensionsCanvas, {
    type: "radar",
    data: {
      labels: dimensions.map((d) => titleCase(d)),
      datasets: [
        {
          label: "Actual maturity",
          data: actualScores,
          fill: true,
          backgroundColor: "rgba(31, 111, 235, 0.22)",
          borderColor: "rgba(31, 111, 235, 0.95)",
          pointBackgroundColor: "rgba(31, 111, 235, 1)",
          pointRadius: 3,
        },
        {
          label: "Operational pressure (OPI)",
          data: opiThreshold,
          fill: true,
          backgroundColor: "rgba(180, 35, 24, 0.14)",
          borderColor: "rgba(180, 35, 24, 0.85)",
          pointBackgroundColor: "rgba(180, 35, 24, 0.95)",
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
          },
        },
      },
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}

function validateStep() {
  if (state.currentStep === 1) {
    const missing = QUESTIONNAIRE.operationalContext.questions.filter(
      (q) => state.contextResponses[q.id] === undefined
    );

    if (missing.length) {
      setValidation(`Please answer all context questions (${missing.length} left).`);
      return false;
    }
  }

  if (state.currentStep === 2) {
    const missing = QUESTIONNAIRE.structuralMaturity.behavioralQuestions.filter(
      (q) => state.responses[q.id] === undefined
    );

    if (missing.length) {
      setValidation(
        `Please answer all structural maturity questions (${missing.length} left).`
      );
      return false;
    }
  }

  clearValidation();
  return true;
}

function toggleFeedbackModal(open) {
  const modal = document.getElementById("feedbackModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !open);
}

function handleAnswerChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.dataset.type === "context") {
    state.contextResponses[target.dataset.id] = Number(target.value);
    persistState();
    clearValidation();
    return;
  }

  if (target.dataset.type === "maturity") {
    state.responses[target.dataset.id] = Number(target.value);
    persistState();
    clearValidation();
  }
}

async function handleWizardClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  if (target.id === "downloadReportBtn") {
    downloadReportJson();
    return;
  }

  if (target.id === "copySummaryBtn") {
    const originalLabel = target.textContent;
    try {
      await copySummaryToClipboard();
      target.textContent = "Copied";
    } catch {
      target.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      target.textContent = originalLabel;
    }, 1200);
    return;
  }

  if (target.id === "newResponseBtn") {
    state.currentStep = 1;
    state.contextResponses = {};
    state.responses = {};
    persistState();
    render();
    return;
  }

  if (target.id === "openFeedbackBtn") {
    if (!getFeedbackEmbedUrl()) {
      setValidation(
        "Feedback form is not configured. Add your Google Form URL to data-feedback-form-url in index.html."
      );
      return;
    }
    clearValidation();
    toggleFeedbackModal(true);
    return;
  }

  if (target.id === "closeFeedbackBtn") {
    toggleFeedbackModal(false);
    return;
  }
}

function render() {
  updateProgress();
  clearValidation();

  if (state.currentStep === 1) {
    destroyCharts();
    renderContextStep();
    return;
  }

  if (state.currentStep === 2) {
    destroyCharts();
    renderStructuralStep();
    return;
  }

  renderResultsStep();
}

function goBack() {
  if (state.currentStep <= 1) return;
  state.currentStep -= 1;
  persistState();
  render();
}

function goNext() {
  if (state.currentStep === 3) {
    state.currentStep = 1;
    persistState();
    render();
    return;
  }

  if (!validateStep()) return;

  state.currentStep += 1;
  persistState();
  render();
}

function bindEvents() {
  wizardContent.addEventListener("change", handleAnswerChange);
  wizardContent.addEventListener("click", handleWizardClick);
  wizardContent.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.id === "feedbackModal") {
      toggleFeedbackModal(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleFeedbackModal(false);
    }
  });
  backBtn.addEventListener("click", goBack);
  nextBtn.addEventListener("click", goNext);
}

restoreState();
bindEvents();
render();
