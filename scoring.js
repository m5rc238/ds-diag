const OPERATIONAL_WEIGHTS = {
  teamSize: 0.25,
  productComplexity: 0.25,
  aiUsage: 0.2,
  releaseFrequency: 0.15,
  toolingFragmentation: 0.15,
};

const CONTEXT_KEY_ALIASES = {
  teamSize: ["teamSize", "oc_team_size"],
  productComplexity: ["productComplexity", "oc_product_complexity"],
  aiUsage: ["aiUsage", "oc_ai_usage"],
  releaseFrequency: ["releaseFrequency", "oc_release_frequency"],
  toolingFragmentation: ["toolingFragmentation", "oc_tooling_fragmentation"],
};

/**
 * Coerces a value to a number and clamps to a range.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function toClampedNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Converts a 0-3 maturity score to a 0-100 score.
 * @param {number} score0to3
 * @returns {number}
 */
export function normalize0to3To100(score0to3) {
  const clamped = toClampedNumber(score0to3, 0, 3);
  return (clamped / 3) * 100;
}

/**
 * Converts a 1-4 context option score to a 0-100 score.
 * @param {number} score1to4
 * @returns {number}
 */
function normalize1to4To100(score1to4) {
  const clamped = toClampedNumber(score1to4, 1, 4);
  return ((clamped - 1) / 3) * 100;
}

/**
 * Resolves a context value from multiple supported key names.
 * @param {Record<string, number>} contextResponses
 * @param {string[]} aliases
 * @returns {number}
 */
function resolveContextValue(contextResponses, aliases) {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(contextResponses, key)) {
      return Number(contextResponses[key]);
    }
  }
  return 1;
}

/**
 * Builds dimension maturity scores from behavioral responses.
 * @param {Record<string, number>} responses
 * @param {{ structuralMaturity?: { behavioralQuestions?: Array<{id: string, dimension: string}> } }} QUESTIONNAIRE
 * @returns {Record<string, {avg: number, score100: number, answered: number, total: number}>}
 */
export function computeDimensionScores(responses, QUESTIONNAIRE) {
  const questions = QUESTIONNAIRE?.structuralMaturity?.behavioralQuestions ?? [];
  /** @type {Record<string, {sum: number, count: number, total: number}>} */
  const accum = {};

  for (const q of questions) {
    const key = String(q.dimension || "").toLowerCase();
    if (!accum[key]) accum[key] = { sum: 0, count: 0, total: 0 };
    accum[key].total += 1;

    if (Object.prototype.hasOwnProperty.call(responses, q.id)) {
      const value = toClampedNumber(responses[q.id], 0, 3);
      accum[key].sum += value;
      accum[key].count += 1;
    }
  }

  /** @type {Record<string, {avg: number, score100: number, answered: number, total: number}>} */
  const out = {};
  for (const [dimension, stats] of Object.entries(accum)) {
    const avg = stats.count > 0 ? stats.sum / stats.count : 0;
    out[dimension] = {
      avg,
      score100: normalize0to3To100(avg),
      answered: stats.count,
      total: stats.total,
    };
  }

  return out;
}

/**
 * Computes Operational Pressure Index (OPI) from context responses.
 * @param {Record<string, number>} contextResponses
 * @returns {{
 *   OPI: number,
 *   breakdown: Record<string, {raw: number, score100: number, weight: number, contribution: number}>
 * }}
 */
export function computeOperationalPressure(contextResponses) {
  /** @type {Record<string, {raw: number, score100: number, weight: number, contribution: number}>} */
  const breakdown = {};
  let OPI = 0;

  for (const [factor, weight] of Object.entries(OPERATIONAL_WEIGHTS)) {
    const raw = resolveContextValue(contextResponses, CONTEXT_KEY_ALIASES[factor]);
    const score100 = normalize1to4To100(raw);
    const contribution = score100 * weight;

    breakdown[factor] = { raw, score100, weight, contribution };
    OPI += contribution;
  }

  return { OPI, breakdown };
}

/**
 * Computes Structural Strength Index as average score across dimensions.
 * @param {Record<string, {score100: number}>} dimensionScores
 * @returns {number}
 */
export function computeSSI(dimensionScores) {
  const values = Object.values(dimensionScores || {});
  if (!values.length) return 0;
  const total = values.reduce((sum, d) => sum + Number(d.score100 || 0), 0);
  return total / values.length;
}

/**
 * Computes overall adequacy gap against operational pressure.
 * @param {number} SSI
 * @param {number} OPI
 * @returns {number}
 */
export function computeAdequacyGap(SSI, OPI) {
  return Number(SSI || 0) - Number(OPI || 0);
}

/**
 * Computes per-dimension gaps against operational pressure.
 * @param {Record<string, {score100: number}>} dimensionScores
 * @param {number} OPI
 * @returns {Record<string, number>}
 */
export function computeDimensionGaps(dimensionScores, OPI) {
  /** @type {Record<string, number>} */
  const gaps = {};
  for (const [dimension, scores] of Object.entries(dimensionScores || {})) {
    gaps[dimension] = Number(scores.score100 || 0) - Number(OPI || 0);
  }
  return gaps;
}

/**
 * Classifies risk signals from gaps and scale context.
 * @param {{
 *   dimensionGaps: Record<string, number>,
 *   context: { aiUsage?: number, teamSize?: number, governanceAvg?: number, distributionAvg?: number }
 * }} input
 * @returns {{
 *   byDimension: Record<string, {gap: number, risk: boolean}>,
 *   flags: string[],
 *   hasRisk: boolean
 * }}
 */
export function classifyRisks({ dimensionGaps, context }) {
  /** @type {Record<string, {gap: number, risk: boolean}>} */
  const byDimension = {};
  const flags = [];

  for (const [dimension, gap] of Object.entries(dimensionGaps || {})) {
    const isRisk = gap < -15;
    byDimension[dimension] = { gap, risk: isRisk };
    if (isRisk) {
      flags.push(`${dimension} risk (gap < -15)`);
    }
  }

  const aiUsage = Number(context?.aiUsage || 0);
  const governanceAvg = Number(context?.governanceAvg || 0);
  if (aiUsage >= 3 && governanceAvg < 2) {
    flags.push("Entropy risk (AI velocity > governance)");
  }

  const teamSize = Number(context?.teamSize || 0);
  const distributionAvg = Number(context?.distributionAvg || 0);
  if (teamSize >= 3 && distributionAvg < 2) {
    flags.push("Drift risk (scale > release discipline)");
  }

  return {
    byDimension,
    flags,
    hasRisk: flags.length > 0,
  };
}

/**
 * Computes a full report model for UI rendering.
 * @param {{
 *   responses: Record<string, number>,
 *   contextResponses: Record<string, number>,
 *   QUESTIONNAIRE: {
 *     operationalContext?: { questions?: Array<{id: string}> },
 *     structuralMaturity?: { dimensions?: string[] }
 *   }
 * }} input
 * @returns {{
 *   context: { raw: Record<string, number>, normalized100: Record<string, number> },
 *   operationalPressure: { OPI: number, breakdown: Record<string, {raw: number, score100: number, weight: number, contribution: number}> },
 *   dimensionScores: Record<string, {avg: number, score100: number, answered: number, total: number}>,
 *   SSI: number,
 *   adequacyGap: number,
 *   dimensionGaps: Record<string, number>,
 *   risks: { byDimension: Record<string, {gap: number, risk: boolean}>, flags: string[], hasRisk: boolean }
 * }}
 */
export function computeReportModel({ responses, contextResponses, QUESTIONNAIRE }) {
  const dimensionScores = computeDimensionScores(responses, QUESTIONNAIRE);
  const operationalPressure = computeOperationalPressure(contextResponses);
  const SSI = computeSSI(dimensionScores);
  const adequacyGap = computeAdequacyGap(SSI, operationalPressure.OPI);
  const dimensionGaps = computeDimensionGaps(dimensionScores, operationalPressure.OPI);

  const teamSize = resolveContextValue(contextResponses, CONTEXT_KEY_ALIASES.teamSize);
  const aiUsage = resolveContextValue(contextResponses, CONTEXT_KEY_ALIASES.aiUsage);
  const governanceAvg = Number(dimensionScores.governance?.avg || 0);
  const distributionAvg = Number(dimensionScores.distribution?.avg || 0);

  const risks = classifyRisks({
    dimensionGaps,
    context: { teamSize, aiUsage, governanceAvg, distributionAvg },
  });

  /** @type {Record<string, number>} */
  const normalized100 = {};
  for (const [factor, aliases] of Object.entries(CONTEXT_KEY_ALIASES)) {
    const raw = resolveContextValue(contextResponses, aliases);
    normalized100[factor] = normalize1to4To100(raw);
  }

  return {
    context: {
      raw: {
        teamSize,
        productComplexity: resolveContextValue(
          contextResponses,
          CONTEXT_KEY_ALIASES.productComplexity
        ),
        aiUsage,
        releaseFrequency: resolveContextValue(
          contextResponses,
          CONTEXT_KEY_ALIASES.releaseFrequency
        ),
        toolingFragmentation: resolveContextValue(
          contextResponses,
          CONTEXT_KEY_ALIASES.toolingFragmentation
        ),
      },
      normalized100,
    },
    operationalPressure,
    dimensionScores,
    SSI,
    adequacyGap,
    dimensionGaps,
    risks,
  };
}

/**
 * Alias export for consumers expecting a `reportModel` function name.
 * @param {{
 *   responses: Record<string, number>,
 *   contextResponses: Record<string, number>,
 *   QUESTIONNAIRE: object
 * }} input
 * @returns {ReturnType<typeof computeReportModel>}
 */
export function reportModel(input) {
  return computeReportModel(input);
}
