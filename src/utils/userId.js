// =============================================================================
//   User ID generator — typed, human-readable IDs
// =============================================================================
//
// Format: <PREFIX>-<6-digit zero-padded random>
//
//   Role         | Prefix   | Example
//   -------------|----------|-----------------
//   VENDOR       | VEND     | VEND-273728
//   CLIENT       | CLIENT   | CLIENT-003434
//   ADMIN        | ADMIN    | ADMIN-918273
//   SUPER_ADMIN  | SUDO     | SUDO-100000
//
// Why 6 digits?
//   - 1,000,000 possibilities per role
//   - Easy to communicate verbally ("V-E-N-D dash 2-7-3-7-2-8")
//   - Padding keeps IDs same length for sorting / scanning
//
// Collision strategy:
//   At small scale (<10k users per role), collision rate is ~0.5%.
//   We catch the Prisma P2002 unique-violation error and retry up to 5 times.
//   Practically guarantees a unique ID without locking.
//
// To change the format later:
//   Only this file changes. All FKs use User.id as a String — they don't
//   care about the format. Existing IDs in DB stay valid.
// =============================================================================

const PREFIX_BY_ROLE = {
  VENDOR: 'VEND',
  CLIENT: 'CLIENT',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUDO',
};

const ID_DIGITS = 6;
const ID_MAX = 10 ** ID_DIGITS; // exclusive upper bound, e.g. 1_000_000
const MAX_RETRIES = 5;

/**
 * Build a single candidate ID for the given role.
 * Pure function — no DB access. Random number, padded.
 */
export const buildUserId = (role) => {
  const prefix = PREFIX_BY_ROLE[role] ?? 'USER';
  const num = Math.floor(Math.random() * ID_MAX);
  return `${prefix}-${String(num).padStart(ID_DIGITS, '0')}`;
};

/**
 * Run an async user-create function with a generated ID, retrying on collision.
 *
 * The `createFn` receives a partial `{ id }` object plus whatever else you pass.
 * On unique-constraint violation against `id`, we generate a new ID and retry.
 *
 * Usage:
 *   return createUserWithGeneratedId(
 *     'CLIENT',
 *     (idFields) => prisma.user.create({ data: { ...idFields, ...other }, ... }),
 *   );
 */
export const createUserWithGeneratedId = async (role, createFn) => {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const id = buildUserId(role);
    try {
      return await createFn({ id });
    } catch (err) {
      const isCollision =
        err?.code === 'P2002' &&
        Array.isArray(err?.meta?.target) &&
        err.meta.target.includes('id');
      if (isCollision) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  // Should be statistically impossible at any realistic scale.
  console.error('[userId] Failed to generate unique ID after retries:', lastError?.message);
  throw new Error('Could not generate a unique user ID. Please try again.');
};
