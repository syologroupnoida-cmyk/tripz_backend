# Offers and Coupons API

All monetary fields ending in `InPaise` use INR x 100. Admin endpoints accept
`ADMIN` and `SUPER_ADMIN` tokens. Customer validation and property booking
require a `CLIENT` token.

## Admin CRUD

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/admin/offers` | Create an offer |
| `GET` | `/api/v1/admin/offers` | List/filter offers |
| `GET` | `/api/v1/admin/offers/:id` | Get offer detail |
| `PATCH` | `/api/v1/admin/offers/:id` | Update fields and targets |
| `DELETE` | `/api/v1/admin/offers/:id` | Soft-delete an offer |
| `POST` | `/api/v1/admin/offers/:id/activate` | Activate a redeemable offer |
| `POST` | `/api/v1/admin/offers/:id/pause` | Pause an offer |

Create example:

```json
{
  "name": "Long Stay Deal",
  "couponCode": "LONGSTAY20",
  "discountType": "PERCENTAGE",
  "discountValue": 20,
  "maxDiscountInPaise": 500000,
  "applicableTo": "BOTH",
  "customerType": "ALL",
  "minimumStayNights": 5,
  "destinations": ["Goa"],
  "packageIds": [],
  "propertyIds": [],
  "validFrom": "2026-10-01",
  "validTo": "2027-03-31",
  "usageLimit": 1000,
  "perCustomerLimit": 1
}
```

Create and update bodies do not accept `status`. New offers always start as
`DRAFT`; use the dedicated activate and pause endpoints for lifecycle changes.

`discountValue` is a whole percentage for `PERCENTAGE` and paise for `FLAT`.
Empty target arrays mean every item of that product type. Supported active
price discounts are `PERCENTAGE` and `FLAT`; other imported campaign types
remain drafts until their fulfilment features exist.

## CSV Import

```http
POST /api/v1/admin/offers/import
Content-Type: multipart/form-data

file: offers.csv
mode: validate
```

Use `mode=validate` first. It parses every row and returns errors, warnings and
the normalized preview without writing. Use `mode=import` to upsert valid rows
by normalized coupon code. Imported offers always remain `DRAFT` for review.

The code-ready CSV uses the same camelCase names as the API. Multi-value fields
(`destinations`, `packageTypes`, `propertyTypes`, `packageIds`, `propertyIds`)
use `|` as the separator, for example `Goa|Mumbai` or `HOTEL|RESORT`. Flat
`discountValue` and all `InPaise` columns are stored in paise.
Use `ALL` for unrestricted list/segment fields and `N/A` for optional scalar
fields that do not apply; the importer normalizes these markers safely.

## Public Listing

```http
GET /api/v1/offers?applicableTo=PROPERTY&take=20&skip=0
```

Active current and upcoming offers are returned. Expired, paused, draft, and
deleted offers are excluded. Upcoming coupons still cannot be applied before
their `validFrom` date.

## Customer Validation

```http
POST /api/v1/client/offers/validate
```

Property example:

```json
{
  "couponCode": "LONGSTAY20",
  "productType": "PROPERTY",
  "propertyId": "property-id",
  "checkIn": "2026-11-10",
  "checkOut": "2026-11-16",
  "numGuests": 2,
  "items": [{ "roomId": "room-id", "unitsBooked": 1 }]
}
```

Package example:

```json
{
  "couponCode": "EARLY20",
  "productType": "PACKAGE",
  "packageId": "package-id",
  "numGuests": 2
}
```

Validation is a quote only. The server recalculates and atomically claims the
coupon when a property booking is created.

## Apply During Property Booking

Add the optional field below to the existing request:

```json
{
  "couponCode": "LONGSTAY20"
}
```

The booking response includes `subtotalAmountInPaise`,
`discountAmountInPaise`, `totalAmountInPaise`, `appliedOfferId`,
`appliedCouponCode`, and the redemption snapshot. Package validation is
available, but redemption awaits a package booking/checkout model.
