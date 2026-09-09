import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import prisma from '../src/config/db.js';
import { importOffersCsv } from '../src/services/offer/index.js';
import { createOfferSchema, updateOfferSchema } from '../src/validators/offer.validator.js';
import { createBookingSchema } from '../src/validators/propertyBooking.validator.js';

test.after(async () => prisma.$disconnect());

test('offer input normalizes coupon codes and dates', () => {
  const result = createOfferSchema.parse({
    name: 'Long Stay Deal',
    couponCode: 'longstay20',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    applicableTo: 'BOTH',
    validFrom: '2026-10-01',
    validTo: '2027-03-31',
  });

  assert.equal(result.couponCode, 'LONGSTAY20');
  assert.equal(result.validFrom.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.deepEqual(result.packageIds, []);
  assert.deepEqual(result.propertyIds, []);
});

test('percentage discounts above 100 are rejected', () => {
  const result = createOfferSchema.safeParse({
    name: 'Invalid Deal', couponCode: 'INVALID500',
    discountType: 'PERCENTAGE', discountValue: 500,
    applicableTo: 'PROPERTY', validFrom: '2026-10-01', validTo: '2027-03-31',
  });
  assert.equal(result.success, false);
});

test('create and update bodies cannot change offer status', () => {
  assert.equal(updateOfferSchema.safeParse({ status: 'ACTIVE' }).success, false);
  assert.equal(createOfferSchema.safeParse({ status: 'ACTIVE' }).success, false);
});

test('the supplied 50-offer CSV validates and normalizes money', async () => {
  const filename = fs.readdirSync('docs').find((name) => name.includes('Customer_Offers_Deals') && name.endsWith('.csv'));
  assert.ok(filename);
  const result = await importOffersCsv({
    file: { buffer: fs.readFileSync(path.join('docs', filename)) },
    mode: 'validate',
    adminId: 'ADMIN-TEST',
  });

  assert.equal(result.totalRows, 50);
  assert.equal(result.validRows, 50);
  assert.equal(result.imported, 0);
  const welcome = result.rows.find((row) => row.couponCode === 'WELCOME1000');
  assert.equal(welcome.preview.discountValue, 100000);
  assert.equal(welcome.preview.customerType, 'NEW');
  assert.equal(welcome.preview.status, 'DRAFT');
});

test('property booking accepts and normalizes an optional coupon code', () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDay = new Date(tomorrow);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const date = (value) => value.toISOString().slice(0, 10);
  const result = createBookingSchema.parse({
    propertyId: 'property-1', checkIn: date(tomorrow), checkOut: date(nextDay),
    numGuests: 1, items: [{ roomId: 'room-1', unitsBooked: 1 }],
    guestName: 'Test Guest', guestPhone: '9999999999', guestEmail: 'test@example.com',
    couponCode: 'welcome1000',
  });
  assert.equal(result.couponCode, 'WELCOME1000');
});
