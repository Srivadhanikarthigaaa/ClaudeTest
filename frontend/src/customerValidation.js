// Mirrors backend/src/validators/customerValidator.js (FRD Section 15.2) —
// client-side convenience only, never a substitute for server validation.
// CHANGE1 requirement 1: lowerCamelCase field names, matching the API.
const ELIGIBILITY_STATUSES = ['Eligible', 'CreditHold', 'Unknown'];

export function validateCustomerForm(values) {
  const errors = {};
  if (!values.customerId) errors.customerId = 'is required';
  if (!values.eligibilityStatus) {
    errors.eligibilityStatus = 'is required';
  } else if (!ELIGIBILITY_STATUSES.includes(values.eligibilityStatus)) {
    errors.eligibilityStatus = `must be one of: ${ELIGIBILITY_STATUSES.join(', ')}`;
  }
  return errors;
}

export { ELIGIBILITY_STATUSES };
