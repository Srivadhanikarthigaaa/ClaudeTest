import { useState } from 'react';
import { getToken, setToken } from '../api';

// There is no login/token-issuance endpoint anywhere in the FRD (Section 30
// item 6, escalated in Phase 9) — this is a placeholder for pasting in a
// manually-issued test token until that's resolved, not a real auth flow.
export default function ApiTokenInput() {
  const [token, setTokenValue] = useState(getToken());

  function handleChange(event) {
    const value = event.target.value;
    setTokenValue(value);
    setToken(value);
  }

  return (
    <div className="token-field">
      <label htmlFor="api-token">
        API Token <span className="token-hint">(manually issued — no login endpoint exists yet, FRD Section 30 item 6)</span>
      </label>
      <input
        id="api-token"
        type="password"
        value={token}
        onChange={handleChange}
        placeholder="Paste a Bearer token"
      />
    </div>
  );
}
