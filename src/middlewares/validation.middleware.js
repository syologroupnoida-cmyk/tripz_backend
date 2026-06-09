import { ZodError } from 'zod';
import { sendError } from '../utils/response.js';

export const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];
      const parsed = schema.parse(dataToValidate);
      req[source] = parsed;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
          code: issue.code,
        }));
        return sendError(res, {
          statusCode: 400,
          message: 'Validation failed',
          details,
        });
      }
      return next(error);
    }
  };
};
