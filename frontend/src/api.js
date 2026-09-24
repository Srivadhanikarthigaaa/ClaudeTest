// Thin fetch wrapper for the backend API (FRD Section 22). Attaches the
// JWT bearer token from Phase 9's auth middleware on every request.
//
// There is no login/token-issuance endpoint anywhere in the FRD (Section 30
// item 6, escalated in Phase 9) — until that's resolved, the token is
// whatever a caller pastes in via setToken() (see components/ApiTokenInput.jsx),
// e.g. one minted manually for local testing with backend/.env's JWT_SECRET.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function getToken() {
  try {
    return localStorage.getItem('apiToken') || '';
  } catch {
    return '';
  }
}

function setToken(token) {
  try {
    localStorage.setItem('apiToken', token);
  } catch {
    // Per-viewer convenience only — if storage is unavailable, the token
    // just won't persist across reloads.
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.Error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

// FRD Section 22.1 — first-time submission (201) or idempotent replay (200);
// both resolve here identically, the caller doesn't need to distinguish them.
export function submitOrder(order) {
  return request('/orders', { method: 'POST', body: JSON.stringify(order) });
}

// FRD Section 22.2
export function getOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}`);
}

// FRD Section 9.1 / 22.3 (inferred contract, Section 30 item 10)
export function listCustomers() {
  return request('/customers');
}

export function createCustomer(customer) {
  return request('/customers', { method: 'POST', body: JSON.stringify(customer) });
}

export function updateCustomerEligibility(customerId, eligibilityStatus) {
  return request(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'PUT',
    body: JSON.stringify({ EligibilityStatus: eligibilityStatus }),
  });
}

// FRD Section 9.2 / 22.3 (inferred contract, Section 30 item 10)
export function listInventory({ warehouseId, productId } = {}) {
  const params = new URLSearchParams();
  if (warehouseId) params.set('warehouseId', warehouseId);
  if (productId) params.set('productId', productId);
  const query = params.toString();
  return request(`/inventory${query ? `?${query}` : ''}`);
}

export function createInventory(inventory) {
  return request('/inventory', { method: 'POST', body: JSON.stringify(inventory) });
}

export function updateInventory(productId, warehouseId, { availableQuantity, earliestDispatchDate }) {
  return request(`/inventory/${encodeURIComponent(productId)}/${encodeURIComponent(warehouseId)}`, {
    method: 'PUT',
    body: JSON.stringify({ AvailableQuantity: availableQuantity, EarliestDispatchDate: earliestDispatchDate }),
  });
}

export { getToken, setToken };
