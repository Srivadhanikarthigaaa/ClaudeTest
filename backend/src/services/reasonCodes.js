// FRD Section 30 item 2 (open question): only "blocked-credit" is a confirmed
// literal. The other two are labeled placeholders pending confirmation,
// centralized here so a confirmed literal only needs to change in one place.
module.exports = {
  BLOCKED_CREDIT: 'blocked-credit',
  BLOCKED_INSUFFICIENT_INVENTORY: 'blocked-insufficient-inventory',
  BLOCKED_DELIVERY_DATE: 'blocked-delivery-date',
};
