import prisma from '../config/db.js';

export const createBlog = (data) => prisma.blog.create({ data });

export const findBlogById = (id) => prisma.blog.findFirst({
  where: { id, deletedAt: null },
});

export const findBlogBySlug = (slug) => prisma.blog.findUnique({ where: { slug } });

export const findActiveBlogBySlug = (slug) => prisma.blog.findFirst({
  where: { slug, isActive: true, deletedAt: null },
});

export const updateBlog = (id, data) => prisma.blog.update({
  where: { id },
  data,
});

export const deleteBlog = (id) => prisma.blog.update({
  where: { id },
  data: { deletedAt: new Date() },
});

export const listBlogs = async ({ search, category, isActive, take, skip, sortBy, order }, { publicOnly = false } = {}) => {
  const where = { deletedAt: null };
  if (publicOnly) where.isActive = true;
  else if (isActive !== undefined) where.isActive = isActive;
  if (category) where.category = { equals: category, mode: 'insensitive' };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { excerpt: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.blog.findMany({ where, take, skip, orderBy: { [sortBy]: order } }),
    prisma.blog.count({ where }),
  ]);
  return { items, total };
};
