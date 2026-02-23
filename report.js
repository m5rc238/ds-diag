/**
 * @typedef {{ avg: number, score100: number, answered?: number, total?: number }} DimensionScore
 * @typedef {{
 *   context?: { raw?: Record<string, number> },
 *   operationalPressure?: { OPI: number },
 *   SSI?: number,
 *   adequacyGap?: number,
 *   dimensionScores?: Record<string, DimensionScore>,
 *   risks?: { flags?: string[] }
 * }} ReportModel
 */

/**
 * Converts a dimension key into a friendly title.
 * @param {string} key
 * @returns {string}
 */
function toTitle(key) {
  if (!key) return "";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Returns dimensions sorted by score (descending).
 * @param {Record<string, DimensionScore>} dimensionScores
 * @returns {Array<{dimension: string, avg: number, score100: number}>}
 */
function sortedDimensions(dimensionScores = {}) {
  return Object.entries(dimensionScores)
    .map(([dimension, value]) => ({
      dimension,
      avg: Number(value?.avg || 0),
      score100: Number(value?.score100 || 0),
    }))
    .sort((a, b) => b.score100 - a.score100);
}

/**
 * Generates a short summary paragraph about alignment and context pressure.
 * @param {ReportModel} reportModel
 * @returns {string}
 */
export function generateSummary(reportModel) {
  const SSI = Number(reportModel?.SSI || 0);
  const OPI = Number(reportModel?.operationalPressure?.OPI || 0);
  const AG = Number(reportModel?.adequacyGap ?? SSI - OPI);
  const context = reportModel?.context?.raw || {};

  const relationship =
    AG >= 10
      ? "tends to sit above current operational pressure"
      : AG >= 0
        ? "is slightly above current operational pressure"
        : AG >= -10
          ? "is slightly below current operational pressure"
          : "may indicate a notable gap to current operational pressure";

  return `Current maturity signals (SSI ${SSI.toFixed(1)}) ${relationship} (OPI ${OPI.toFixed(
    1
  )}, AG ${AG.toFixed(1)}). With team size level ${Number(
    context.teamSize || 1
  )} and AI usage level ${Number(
    context.aiUsage || 1
  )}, this tends to indicate where practice consistency may need reinforcement as delivery pace changes.`;
}

/**
 * Returns the top 2 dimensions by score.
 * @param {ReportModel} reportModel
 * @returns {Array<{dimension: string, score100: number, avg: number}>}
 */
export function generateStrengths(reportModel) {
  return sortedDimensions(reportModel?.dimensionScores)
    .slice(0, 2)
    .map((d) => ({
      dimension: toTitle(d.dimension),
      score100: d.score100,
      avg: d.avg,
    }));
}

/**
 * Returns the bottom 2 dimensions by score.
 * @param {ReportModel} reportModel
 * @returns {Array<{dimension: string, score100: number, avg: number}>}
 */
export function generateWeaknesses(reportModel) {
  return sortedDimensions(reportModel?.dimensionScores)
    .reverse()
    .slice(0, 2)
    .map((d) => ({
      dimension: toTitle(d.dimension),
      score100: d.score100,
      avg: d.avg,
    }));
}

/**
 * Generates actionable, behavior-focused guidance tips based on risks and weakest dimensions.
 * @param {ReportModel} reportModel
 * @returns {string[]}
 */
export function generateGuidance(reportModel) {
  const tips = [];
  const riskFlags = reportModel?.risks?.flags || [];
  const weakest = generateWeaknesses(reportModel);
  const weakestKeys = weakest.map((d) => d.dimension.toLowerCase());

  if (riskFlags.includes("Entropy risk (AI velocity > governance)")) {
    tips.push(
      "Add a contribution RFC template + review gate so AI-assisted changes are triaged with clear owners and decision criteria."
    );
    tips.push(
      "Create a weekly governance check-in that reviews incoming system changes, exceptions, and follow-up actions."
    );
  }

  if (riskFlags.includes("Drift risk (scale > release discipline)")) {
    tips.push(
      "Publish system releases on a fixed cadence with release notes and a lightweight migration checklist for consuming teams."
    );
    tips.push(
      "Track package adoption and breakages after each release so distribution issues are visible within one sprint."
    );
  }

  if (weakestKeys.includes("governance")) {
    tips.push(
      "Define who approves token/component changes and add a simple intake form so requests follow one visible path."
    );
  }

  if (weakestKeys.includes("distribution")) {
    tips.push(
      "Set up one repeatable publish workflow (version, notes, package release) and treat failed releases as a tracked incident."
    );
  }

  if (weakestKeys.includes("documentation")) {
    tips.push(
      "Update docs in the same pull request as component changes, including examples for loading, empty, and error states."
    );
  }

  if (weakestKeys.includes("components")) {
    tips.push(
      "Standardize component API patterns (states, variants, naming) and add a pre-merge check for accessibility basics."
    );
  }

  if (weakestKeys.includes("foundations")) {
    tips.push(
      "Move core style values into shared tokens and add a lint/review check to reduce hard-coded color and spacing values."
    );
  }

  if (weakestKeys.includes("adoption")) {
    tips.push(
      "Set a quarterly adoption target for two high-traffic flows and review progress with concrete usage metrics."
    );
  }

  if (tips.length === 0) {
    tips.push(
      "Pick one low-scoring behavior per dimension and run a 2-week improvement sprint with a clear owner and observable success signal."
    );
  }

  return Array.from(new Set(tips));
}
