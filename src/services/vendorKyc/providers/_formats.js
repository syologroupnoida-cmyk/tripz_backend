// Format regexes for Indian government identifiers. Shared across providers
// so we can short-circuit obviously-invalid input before hitting the network
// (or, for stub mode, before "pretending" to verify).

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const AADHAAR_REGEX = /^[0-9]{12}$/;

// GSTIN: 15 chars — 2-digit state + 10-char PAN + entity code + Z + checksum
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// CIN: 21 chars — section + 5-digit industry code + 2 letters + 4-digit year +
// 3 letters + 6-digit registration number.
export const CIN_REGEX = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
