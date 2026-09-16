import * as blogService from '../services/blog/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const createBlog = asyncHandler(async (req, res) => {
  const data = await blogService.createBlog({ ...req.body, isActive: req.query.isActive });
  return sendSuccess(res, { statusCode: 201, message: 'Blog created.', data });
});

export const listBlogs = asyncHandler(async (req, res) => {
  const data = await blogService.listBlogs(req.query);
  return sendSuccess(res, { message: 'Blogs retrieved.', data });
});

export const getBlog = asyncHandler(async (req, res) => {
  const data = await blogService.getBlog(req.params.id);
  return sendSuccess(res, { message: 'Blog retrieved.', data });
});

export const updateBlog = asyncHandler(async (req, res) => {
  const data = await blogService.updateBlog(req.params.id, req.body);
  return sendSuccess(res, { message: 'Blog updated.', data });
});

export const deleteBlog = asyncHandler(async (req, res) => {
  const data = await blogService.deleteBlog(req.params.id);
  return sendSuccess(res, { message: 'Blog deleted.', data });
});

export const listBlogsPublic = asyncHandler(async (req, res) => {
  const data = await blogService.listBlogs(req.query, { publicOnly: true });
  return sendSuccess(res, { message: 'Blogs retrieved.', data });
});

export const getBlogPublic = asyncHandler(async (req, res) => {
  const data = await blogService.getActiveBlogBySlug(req.params.slug);
  return sendSuccess(res, { message: 'Blog retrieved.', data });
});
