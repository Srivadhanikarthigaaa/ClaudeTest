// FRD Section 11/27 (FR-AUTH-01/02, FR-SEC-01) — verifies a JWT bearer token
// on every route mounted behind it. Rejects missing/invalid/expired tokens
// with 401, no route-specific bypass.
//
// This does NOT issue tokens. FRD Section 30 item 6 (open question): neither
// source document specifies a login/token-issuance endpoint or a role model,
// even though JWT validation is clearly required. Until that's confirmed,
// this only verifies tokens minted out-of-band (e.g. for manual/test use)
// with the same JWT_SECRET — escalate before this app is used by anyone else.
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    // CHANGE1 requirement 1: lowerCamelCase error field, as everywhere else.
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
