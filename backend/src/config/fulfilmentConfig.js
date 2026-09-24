// CHANGE1 requirement 2 — the partial-release threshold is configuration, not
// a literal buried in the decision logic.
//
// Source of truth is the environment variable PARTIAL_RELEASE_THRESHOLD_PERCENT
// (see .env.example). It is read on every call, not captured at module load,
// so a deployment can change it without a code change and so tests can vary it
// without reloading modules.
//
// Expressed as a whole-number percentage (70 means 70%) rather than a
// fraction, because the threshold comparison itself is done in integer
// arithmetic — `available * 100 >= requested * thresholdPercent` — to keep the
// exact-boundary case (requirement 6's "exact 70%" test) free of any
// floating-point rounding.
const DEFAULT_PARTIAL_RELEASE_THRESHOLD_PERCENT = 70;

function getPartialReleaseThresholdPercent() {
  const raw = process.env.PARTIAL_RELEASE_THRESHOLD_PERCENT;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_PARTIAL_RELEASE_THRESHOLD_PERCENT;
  }

  const value = Number(raw);
  // A misconfigured threshold must fail loudly at the point of use rather than
  // silently degrading to a default and quietly changing every order outcome.
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(
      `Invalid PARTIAL_RELEASE_THRESHOLD_PERCENT: ${raw}. Expected a number between 0 and 100 (percent).`
    );
  }
  return value;
}

module.exports = { getPartialReleaseThresholdPercent, DEFAULT_PARTIAL_RELEASE_THRESHOLD_PERCENT };
