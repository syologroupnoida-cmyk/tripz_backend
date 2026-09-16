import { PrismaClient } from '@prisma/client';
import { blogs } from '../docs/blogs.js';

const prisma = new PrismaClient();

const main = async () => {
  for (const blog of blogs) {
    await prisma.blog.upsert({
      where: { slug: blog.slug },
      create: blog,
      update: { ...blog, deletedAt: null },
    });
  }
  console.log(`[blogs] Imported ${blogs.length} blogs.`);
};

main()
  .catch((error) => {
    console.error('[blogs] Import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
