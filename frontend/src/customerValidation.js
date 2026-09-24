// Mirrors backend/src/validators/customerValidator.js (FRD Section 15.2) —
// client-side convenience only, never a substitute for server validation.
const ELIGIBILITY_STATUSES = ['Eligible', 'CreditHold', 'Unknown'];

export function validateCustomerForm(values) {
  const errors = {};
  if (!values.CustomerId) errors.CustomerId = 'is required';
  if (!values.EligibilityStatus) {
    errors.EligibilityStatus = 'is required';
  } else if (!ELIGIBILITY_STATUSES.includes(values.EligibilityStatus)) {
    errors.EligibilityStatus = `must be one of: ${ELIGIBILITY_STATUSES.join(', ')}`;
  }
  return errors;
}

export { ELIGIBILITY_STATUSES };
