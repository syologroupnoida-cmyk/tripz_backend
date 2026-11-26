-- PostgreSQL requires a newly added enum value to be committed before it can
-- be referenced by a column default in a later transaction.
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'CONFIRMED';
