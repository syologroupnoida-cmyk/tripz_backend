import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

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

  const user = await prisma.user.create({
    data: {
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
