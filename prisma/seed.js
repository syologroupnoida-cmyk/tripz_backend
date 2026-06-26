import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Local mirror of the generator (can't import ES modules here trivially from
// the seed script, so keep this in sync with src/utils/userId.js).
const buildSuperAdminId = () => {
  const num = Math.floor(Math.random() * 1_000_000);
  return `SUDO-${String(num).padStart(6, '0')}`;
};

const required = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`[seed] ${name} is required in .env to seed the SuperAdmin.`);
  }
  return v.trim();
};

const seedSuperAdmin = async () => {
  const email = required('SUPERADMIN_EMAIL').toLowerCase();
  const password = required('SUPERADMIN_PASSWORD');
  const firstName = required('SUPERADMIN_FIRST_NAME');
  const lastName = required('SUPERADMIN_LAST_NAME');
  const phone = required('SUPERADMIN_PHONE');
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === 'SUPER_ADMIN') {
      console.log(`[seed] SuperAdmin already exists (${email}). Skipping.`);
      return;
    }
    throw new Error(
      `[seed] An account with ${email} exists but role is ${existing.role}, not SUPER_ADMIN. Refusing to overwrite.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Retry on collision (rare with 6-digit random space)
  let user;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      user = await prisma.user.create({
        data: {
          id: buildSuperAdminId(),
          firstName,
          lastName,
          email,
          phone,
          password: passwordHash,
          role: 'SUPER_ADMIN',
          isActive: true,
          emailVerifiedAt: new Date(),
        },
        select: { id: true, email: true, role: true },
      });
      break;
    } catch (err) {
      const isCollision =
        err?.code === 'P2002' && err.meta?.target?.includes('id');
      if (!isCollision || attempt === 4) throw err;
    }
  }

  console.log(`[seed] SuperAdmin created: ${user.email} (id: ${user.id})`);
};

const main = async () => {
  await seedSuperAdmin();
};

main()
  .catch((err) => {
    console.error('[seed] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
