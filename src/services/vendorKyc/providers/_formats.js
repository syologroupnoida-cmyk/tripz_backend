// Format regexes for Indian government identifiers. Shared across providers
// so we can short-circuit obviously-invalid input before hitting the network
// (or, for stub mode, before "pretending" to verify).

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const AADHAAR_REGEX = /^[0-9]{12}$/;
