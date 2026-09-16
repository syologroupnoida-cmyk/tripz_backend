import { ApiError } from '../../utils/ApiError.js';
import * as blogRepo from '../../repositories/blog.repository.js';

const slugify = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 200);

const ensureSlugAvailable = async (slug, currentId) => {
  const existing = await blogRepo.findBlogBySlug(slug);
  if (existing && existing.id !== currentId) {
    throw ApiError.conflict('A blog with this slug already exists.');
  }
};

export const createBlog = async (data) => {
  const slug = data.slug ?? slugify(data.title);
  if (!slug) throw ApiError.badRequest('A valid title or slug is required.');
  await ensureSlugAvailable(slug);
  return blogRepo.createBlog({ ...data, slug });
};

export const getBlog = async (id) => {
  const blog = await blogRepo.findBlogById(id);
  if (!blog) throw ApiError.notFound('Blog not found.');
  return blog;
};

export const listBlogs = async (query, options) => {
  const { items, total } = await blogRepo.listBlogs(query, options);
  return { items, total, take: query.take, skip: query.skip };
};

export const getActiveBlogBySlug = async (slug) => {
  const blog = await blogRepo.findActiveBlogBySlug(slug);
  if (!blog) throw ApiError.notFound('Blog not found.');
  return blog;
};

export const updateBlog = async (id, data) => {
  const current = await getBlog(id);
  const patch = { ...data };
  if (data.slug) await ensureSlugAvailable(data.slug, id);
  if (data.title && !data.slug && data.title !== current.title) {
    patch.slug = slugify(data.title);
    await ensureSlugAvailable(patch.slug, id);
  }
  return blogRepo.updateBlog(id, patch);
};

export const deleteBlog = async (id) => {
  await getBlog(id);
  return blogRepo.deleteBlog(id);
};
