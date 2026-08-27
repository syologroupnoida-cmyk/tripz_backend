# Bulk Property Import — Data Spec & Flow

Purpose: hand this file to the data-generation/import team so generated JSON
matches the current Prisma schema and API validation for properties and rooms.
It defines the creation order, exact request-side fields, submission rules, and
batch shape required for bulk property creation.

Stack: Express + Prisma + PostgreSQL. Room prices are stored in **paise** in
the database, but property APIs accept prices in **rupees** and convert them to
paise automatically.

---

## 1. Dependency chain and creation order

A `Property` belongs to a vendor's `VendorProfile`, and each `PropertyRoom`
belongs to a property. Create data in this order:

```text
1) User (role=VENDOR, vendorType=PROPERTY_OWNER)
        ↓
2) VendorProfile (created automatically during vendor registration)
        ↓
3) Property with one or more embedded rooms
```

Important gates and behavior:

- Property routes accept only authenticated vendors whose JWT has
  `vendorType: "PROPERTY_OWNER"`.
- `TRAVEL_AGENT` vendors receive 403 `VENDOR_TYPE_MISMATCH`.
- There is currently **no active-subscription check or property-count limit**
  in the property creation service.
- Email verification and KYC are not checked by the property create service.
- Use `POST /api/v1/vendor/properties?draft=false` for complete bulk records.
  This creates the property and immediately submits it for admin review.
- Immediate submission requires at least one room. Rooms should therefore be
  embedded in the initial property request.
- The API generates `id`, `slug`, ownership, lifecycle fields, and timestamps.

Only three logical entities are involved: `User`, its automatically created
`VendorProfile`, and `Property` with nested `PropertyRoom` records. Amenities,
rules, highlights, and nearby places are string arrays, not foreign keys.

---

## 2. Entity 1 — Property-owner vendor `User`

Endpoint: `POST /api/v1/auth/register`.

| Field | Type | Required | Rule |
|---|---|---:|---|
| `firstName` | string | yes | Trimmed, 2–40 characters |
| `lastName` | string | yes | Trimmed, 2–40 characters |
| `email` | string | yes | Valid email, lowercased, unique |
| `phone` | string | yes | Digits only, 10–15 digits, unique |
| `password` | string | yes | 8–72 chars; at least one uppercase, lowercase, and digit |
| `role` | enum | yes | Exactly `"VENDOR"` |
| `vendorType` | enum | yes for this import | Exactly `"PROPERTY_OWNER"` |

The registration request is strict. Do not add database-owned fields.

```json
{
  "firstName": "Ananya",
  "lastName": "Kapoor",
  "email": "ananya.kapoor.stays1@example.com",
  "phone": "9812345601",
  "password": "Passw0rd123",
  "role": "VENDOR",
  "vendorType": "PROPERTY_OWNER"
}
```

Registration automatically creates the matching `VendorProfile` with
`vendorType: "PROPERTY_OWNER"` and initial `kycStatus: "PENDING"`. Do not
generate or import a separate vendor-profile payload when using the API.

---

## 3. Entity 2 — `Property` with embedded rooms

Endpoint: `POST /api/v1/vendor/properties?draft=false`  
Authentication: property owner's vendor JWT.

For complete bulk data, always send `draft=false`. A successful request ends
with status `SUBMITTED`, ready for admin moderation. It does not become public
until an admin changes it to `APPROVED`.

### 3a. Property field contract

| Request field | Type | Required for submitted bulk data | Constraints/default |
|---|---|---:|---|
| `title` | string | yes | 2–200 chars |
| `propertyType` | enum | yes | `HOTEL`, `VILLA`, `HOMESTAY`, `STUDIO`, `RESORT`, `GUEST_HOUSE` |
| `shortDescription` | string | yes | 20–500 chars for submission |
| `fullDescription` | string | yes | 50–20,000 chars for submission |
| `city` | string | yes | Max 80 chars |
| `state` | string | yes | Max 80 chars |
| `country` | string | no | Max 80 chars; DB default is `India`, but send it explicitly in generated data |
| `address` | string | yes | Max 500 chars |
| `landmark` | string | no | Max 120 chars |
| `pincode` | string | no | Max 20 chars |
| `latitude` | number/string | no | -90 to 90 |
| `longitude` | number/string | no | -180 to 180 |
| `mainImage` | string | yes | Non-empty, max 1,000 chars |
| `galleryImages` | string[] | yes | 2–30 non-empty strings; each max 1,000 chars |
| `amenities` | string[] | no | Default `[]`; max 50 items, each 1–60 chars |
| `houseRules` | string[] | no | Default `[]`; max 30 items, each 1–200 chars |
| `nearbyPlaces` | string[] | no | Default `[]`; max 30 items, each 1–200 chars |
| `highlights` | string[] | no | Default `[]`; max 30 items, each 1–200 chars |
| `starRating` | integer/string | no | Integer 1–5; primarily useful for hotels/resorts |
| `totalBedrooms` | integer/string | no | Integer 0–100 |
| `totalBathrooms` | integer/string | no | Integer 0–100 |
| `hostLivesOnsite` | boolean | no | Default `false` |
| `checkInTime` | string | no | `HH:mm` 24-hour format; default `14:00` |
| `checkOutTime` | string | no | `HH:mm` 24-hour format; default `11:00` |
| `minStayNights` | integer/string | no | Integer 1–365; default `1` |
| `contactPhone` | string | no | Max 20 chars |
| `contactEmail` | string | no | Valid email |
| `cancellationPolicy` | JSON | no | Any valid JSON value; recommended object shape below |
| `rooms` | object[] | yes | At least 1 for submission; maximum 50; room shape in §3b |

The service's final completeness check requires `title`, `propertyType`, the
description/location/media fields marked required above, and at least one
room. The API validator permits extra keys because this schema currently uses
`.passthrough()`, but generated data should still contain only documented keys.

Recommended cancellation-policy shape (the DB intentionally stores flexible
JSON and does not validate these child fields):

```json
{
  "type": "flexible",
  "fullRefundHours": 48,
  "partialRefundHours": 168
}
```

### 3b. Embedded `rooms` item contract

| Request field | Type | Required | Constraints/default |
|---|---|---:|---|
| `name` | string | yes | 2–80 chars |
| `description` | string | no | Max 2,000 chars |
| `category` | string | no | Max 40 chars; free text such as `DELUXE`, `SUITE`, `WHOLE_VILLA` |
| `pricePerNight` | number/string | yes | **Rupees**, 0–1,00,00,000; converted to paise |
| `extraGuestFee` | number/string | no | **Rupees**, same range; converted to paise |
| `maxGuests` | integer/string | yes | Integer 1–30 |
| `totalUnits` | integer/string | no | Integer 1–200; default `1` |
| `bedrooms` | integer/string | no | Integer 0–20 |
| `bathrooms` | integer/string | no | Integer 0–20 |
| `bedType` | string | no | Max 40 chars |
| `roomSizeSqft` | integer/string | no | Integer 0–100,000 |
| `amenities` | string[] | no | Default `[]`; max 30 items, each 1–60 chars |
| `images` | string[] | no | Default `[]`; max 15 non-empty strings, each max 1,000 chars |
| `isActive` | boolean | no | Default `true` |

Room category is not an enum. Keep vocabulary consistent across the generated
batch so filtering and UI labels remain clean.

Property-type guidance:

- `VILLA`, `STUDIO`, and many `HOMESTAY` properties normally have one room
  such as `Whole Villa` with `totalUnits: 1`.
- `HOTEL`, `RESORT`, and `GUEST_HOUSE` properties can have multiple room types,
  each with its own price, capacity, and inventory count.

### 3c. Price rule

Always generate `pricePerNight` and `extraGuestFee` in rupees without a
currency symbol or comma. The API multiplies by 100 and stores:

```text
pricePerNight: 5499.50 → pricePerNightInPaise: 549950
```

Do not send internal fields such as `pricePerNightInPaise`.

### 3d. Images

The current validator checks image values as non-empty strings with length
limits; it does not verify URL syntax or reachability. For useful production or
demo data, nevertheless use stable, reachable HTTPS image URLs. Upload owned
images first through the application's image-upload flow when appropriate.
Avoid invented placeholder URLs that will render as broken images.

### 3e. Fields the generator must not send

Property server-owned fields:

`id`, `ownerUserId`, `slug`, `status`, `hasPendingReview`, `submittedAt`,
`approvedAt`, `rejectedAt`, `rejectionReason`, `reviewedByAdminId`, `deletedAt`,
`createdAt`, `updatedAt`.

Room server/internal fields:

`id`, `propertyId`, `pricePerNightInPaise`, `extraGuestFeeInPaise`, `createdAt`,
`updatedAt`.

Use request names `pricePerNight` and `extraGuestFee`; the validator performs
the database-name conversion.

---

## 4. Full submitted-property sample

```json
{
  "title": "Cedar View Boutique Stay",
  "propertyType": "HOMESTAY",
  "shortDescription": "A peaceful mountain homestay with cedar forest views and warm local hospitality.",
  "fullDescription": "Cedar View Boutique Stay offers comfortable private rooms, home-cooked regional meals, and quiet balconies overlooking the hills. It is suitable for couples, families, and remote workers seeking a relaxed stay close to local attractions.",
  "city": "Manali",
  "state": "Himachal Pradesh",
  "country": "India",
  "address": "Village Nasogi, Near Hadimba Road, Manali",
  "landmark": "Near Hadimba Temple",
  "pincode": "175131",
  "latitude": 32.2491,
  "longitude": 77.1887,
  "mainImage": "https://res.cloudinary.com/your-cloud/image/upload/cedar-view-main.jpg",
  "galleryImages": [
    "https://res.cloudinary.com/your-cloud/image/upload/cedar-view-1.jpg",
    "https://res.cloudinary.com/your-cloud/image/upload/cedar-view-2.jpg",
    "https://res.cloudinary.com/your-cloud/image/upload/cedar-view-3.jpg"
  ],
  "amenities": ["WiFi", "Parking", "Hot Water", "Mountain View"],
  "houseRules": ["No smoking indoors", "Quiet hours after 10 PM"],
  "nearbyPlaces": ["Hadimba Temple - 1 km", "Mall Road - 2.5 km"],
  "highlights": ["Private balcony", "Home-cooked breakfast", "Cedar forest view"],
  "totalBedrooms": 4,
  "totalBathrooms": 4,
  "hostLivesOnsite": true,
  "checkInTime": "14:00",
  "checkOutTime": "11:00",
  "minStayNights": 1,
  "contactPhone": "9812345601",
  "contactEmail": "stay@cedarview.example",
  "cancellationPolicy": {
    "type": "flexible",
    "fullRefundHours": 48,
    "partialRefundHours": 168
  },
  "rooms": [
    {
      "name": "Mountain View King Room",
      "description": "Private king room with an attached bathroom and balcony.",
      "category": "DELUXE",
      "pricePerNight": 5499,
      "extraGuestFee": 900,
      "maxGuests": 3,
      "totalUnits": 4,
      "bedrooms": 1,
      "bathrooms": 1,
      "bedType": "King",
      "roomSizeSqft": 320,
      "amenities": ["WiFi", "TV", "Balcony", "Attached Bathroom"],
      "images": [
        "https://res.cloudinary.com/your-cloud/image/upload/cedar-room-1.jpg",
        "https://res.cloudinary.com/your-cloud/image/upload/cedar-room-2.jpg"
      ],
      "isActive": true
    }
  ]
}
```

---

## 5. Batch file format for the generator team

Ask for one JSON array. Group properties under their owner so an importer can
register/login once and then create all properties with that owner's JWT.

```json
[
  {
    "vendor": {
      "firstName": "Ananya",
      "lastName": "Kapoor",
      "email": "ananya.kapoor.stays1@example.com",
      "phone": "9812345601",
      "password": "Passw0rd123",
      "role": "VENDOR",
      "vendorType": "PROPERTY_OWNER"
    },
    "properties": [
      {
        "title": "Cedar View Boutique Stay",
        "propertyType": "HOMESTAY",
        "shortDescription": "A complete description of at least twenty characters.",
        "fullDescription": "A complete property description containing at least fifty characters for submission.",
        "city": "Manali",
        "state": "Himachal Pradesh",
        "country": "India",
        "address": "Village Nasogi, Near Hadimba Road, Manali",
        "mainImage": "https://cdn.example.test/property-main.jpg",
        "galleryImages": [
          "https://cdn.example.test/property-1.jpg",
          "https://cdn.example.test/property-2.jpg"
        ],
        "rooms": [
          {
            "name": "Deluxe Room",
            "pricePerNight": 5499,
            "maxGuests": 3,
            "totalUnits": 4
          }
        ]
      }
    ]
  }
]
```

The `.example.test` image values above demonstrate file structure only. Replace
them with reachable asset URLs before importing display-ready data.

Batch-wide generator constraints:

- Make every vendor `email` and `phone` unique across the entire batch.
- Copy enum values exactly and preserve uppercase spelling.
- Give every submitted property at least two gallery images and one room.
- Use rupees without `₹` or commas for room price fields.
- Use real JSON booleans (`true`/`false`), not strings.
- Keep latitude/longitude consistent with the generated address.
- Avoid duplicate or near-duplicate property titles for the same owner. Slugs
  are generated from titles and made unique automatically, but unique titles
  produce cleaner marketplace URLs.
- Respect all item and length limits; validation rejects the whole HTTP request
  rather than partially accepting fields.

---

## 6. Import execution flow

For each batch entry, an importer should:

1. Register the `PROPERTY_OWNER` vendor, or locate/login the existing vendor.
2. Obtain the vendor JWT containing `vendorType: "PROPERTY_OWNER"`.
3. For each property, call
   `POST /api/v1/vendor/properties?draft=false` with the complete property and
   embedded rooms payload.
4. Record the returned property `id`, generated `slug`, and result status.
5. Treat HTTP success with `status: "SUBMITTED"` as a completed import row.
6. Send imported properties through the normal admin approve/reject workflow.

Important failure behavior: property creation first writes a `DRAFT` row and
then runs the final completeness check. If `draft=false` data is incomplete,
the API returns 400 `PROPERTY_INCOMPLETE`, but the draft row remains saved and
the error includes its `propertyId`. An importer must log that id and update the
existing draft instead of blindly retrying creation, otherwise it can create
duplicates.

---

## 7. What remains to build before a real import

This document defines the data contract only. The executable importer should
still add authentication, per-row validation, retry/idempotency handling,
error reporting, and a mapping of generated vendor/property keys to returned
database ids. Test it first with one vendor and one property before processing
the full batch.
