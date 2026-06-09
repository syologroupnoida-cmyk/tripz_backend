import { PrismaClient } from '@prisma/client';
import { isProduction } from './env.js';

const prisma = new PrismaClient({
  log: isProduction ? ['error'] : ['warn', 'error'],
});

export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('[db] PostgreSQL connection established via Prisma.');
  } catch (error) {
    console.error('[db] Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
  console.log('[db] PostgreSQL connection closed.');
};

export default prisma;
