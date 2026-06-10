// Teaser-mode helpers. The marketplace API must never leak full contact info
// to vendors who haven't paid to unlock a lead - apply these on every lead in
// a teaser-mode response.

export const maskEmail = (email) => {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  const hidden = '*'.repeat(Math.max(local.length - 2, 3));
  return `${visible}${hidden}@${domain}`;
};

export const maskPhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  const tail = digits.slice(-4);
  return `${'*'.repeat(digits.length - 4)}${tail}`;
};
