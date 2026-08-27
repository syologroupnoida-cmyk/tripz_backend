# Bulk Package Import — Data Spec & Flow

Purpose: hand this file to the data-generation team so the JSON they produce
matches our schema/validation exactly and needs zero manual cleanup before
import. It covers **what order data must be created in** and **the exact
field-by-field contract** for each entity involved.

Stack: Express + Prisma + PostgreSQL. Prices are stored in **paise** in the
DB, but the API accepts **rupees** — see the price note in step 3.

---

## 1. Why order matters (the dependency chain)

A `Package` row cannot exist in isolation. It is owned by a vendor `User`,
and that vendor must have an **active subscription** before the API will let
a package be created at all. So bulk import must happen in this order, per
vendor:

```
1) User (role=VENDOR, vendorType=TRAVEL_AGENT)
        ↓
2) VendorSubscription (status=ACTIVE, expiresAt in the future)
        ↓
3) Package (as many as needed, owned by that vendor)
```

Notes on the gate (`assertCanCreatePackage`, `src/services/package/index.js`):
- No ACTIVE subscription → package creation fails with 403 `NO_ACTIVE_SUBSCRIPTION`.
- Each subscription plan has `maxPackages` (`-1` = unlimited). Once a vendor's
  live package count (DRAFT+SUBMITTED+APPROVED+PAUSED) hits that cap, creation
  fails with 403 `PACKAGE_LIMIT_REACHED`. Pick a plan with `maxPackages: -1`
  (unlimited) for bulk-import vendors, or cap how many packages/vendor the
  generator produces to match the plan.
- `PROPERTY_OWNER` vendors **cannot** create packages — only `TRAVEL_AGENT`.
- Email verification and KYC are **not** required for package creation.

Only 3 entities need generated data: **User**, **VendorSubscription**, **Package**.
There are no separate Category/Destination/Amenity tables to join against —
things like `destination`, `hotelCategory`, `inclusions` are plain
strings/string-arrays directly on `Package`.

---

## 2. Entity 1 — Vendor `User`

One of these per vendor. Endpoint: `POST /api/v1/auth/register`.

| Field | Type | Required | Rule |
|---|---|---|---|
| `firstName` | string | yes | 2–40 chars |
| `lastName` | string | yes | 2–40 chars |
| `email` | string | yes | valid email, **unique**, lowercased |
| `phone` | string | yes | regex `^\d{10,15}$` (digits only, 10–15 of them), unique |
| `password` | string | yes | 8–72 chars, must contain 1 uppercase + 1 lowercase + 1 digit |
| `role` | string | yes | must be exactly `"VENDOR"` |
| `vendorType` | string | yes (set explicitly) | must be exactly `"TRAVEL_AGENT"` (packages require this; `PROPERTY_OWNER` cannot own packages) |

Request body is `.strict()` — do not include any other fields (no `id`, no
`status`, no `kycStatus`; those are server-owned).

```json
{
  "firstName": "Ramesh",
  "lastName": "Sharma",
  "email": "ramesh.sharma.agency1@example.com",
  "phone": "9812345678",
  "password": "Passw0rd123",
  "role": "VENDOR",
  "vendorType": "TRAVEL_AGENT"
}
```

Generator guidance: `email` and `phone` **must be unique across the whole
batch** (DB-level unique constraints) — no duplicates, no reuse of real
emails/phone numbers.

---

## 3. Entity 2 — `VendorSubscription` (must exist before any package)

There is no public self-serve "buy subscription" endpoint suitable for bulk
seeding at volume — this is normally purchased. For bulk-import purposes,
tell the data-generator team this record just needs to exist per vendor with:

| Field | Type | Required | Notes |
|---|---|---|---|
| `vendorUserId` | string | yes | the vendor's `User.id` from step 2 |
| `planId` | string | yes | id of a `SubscriptionPlan` with `maxPackages: -1` (unlimited) — ask backend which plan id to use, or request one be seeded |
| `status` | string | yes | must be `"ACTIVE"` |
| `startsAt` | date | yes | e.g. now |
| `expiresAt` | date | yes | must be **in the future** relative to import time — use a far date (e.g. +5 years) so the batch doesn't expire mid-import |

This is not something the data-generator team needs to produce field-by-field
JSON for — it's a one-row-per-vendor housekeeping record. Flag it as **"1
active, non-expiring subscription per generated vendor"** as a requirement,
and backend engineering will provision the actual plan id / apply it during
import.

---

## 4. Entity 3 — `Package` (the bulk data)

Endpoint: `POST /api/v1/vendor/packages?draft=false` (creates the package
**already SUBMITTED**, i.e. ready for admin approval, skipping the draft
state — use this for bulk import). Auth: JWT of the owning vendor from step 2.

### 4a. Field contract

| Field (request name) | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | **yes** | 2–200 chars |
| `destination` | string | **yes** | 2–120 chars, free text (e.g. `"Manali, Himachal Pradesh"`) |
| `departureCity` | string | no | ≤120 chars, journey starting point (e.g. `"Delhi"`); omit when the package begins at the destination |
| `overview` | string | **yes** | 2–5000 chars, descriptive copy |
| `packageRegion` | enum | **yes** | `NATIONAL` \| `INTERNATIONAL` |
| `packageType` | enum | **yes** | one of: `HONEYMOON`, `FAMILY`, `HOLIDAY`, `COUPLE`, `SOLO`, `GROUP`, `ADVENTURE`, `RELIGIOUS`, `BEACH`, `HILL_STATION`, `WILDLIFE`, `CULTURAL`, `CORPORATE`, `NATURE`, `WATERACTIVITY`, `OTHER` |
| `price` | number/string | **yes** | **rupees**, not paise (e.g. `"14999"` = ₹14,999) — server multiplies ×100 for storage. Non-negative. |
| `mainImage` | string (URL) | **yes** | a real, reachable image URL (see image note below) |
| `agencyName` | string | no | ≤200 chars, e.g. `"Package by Ramesh Travels"` |
| `route` | string | no | ≤120 chars, e.g. `"Delhi - Manali - Delhi"` |
| `duration` | string | no | ≤60 chars, e.g. `"4N/5D"` |
| `otherDetails` | string | no | ≤5000 chars |
| `cancellationPolicy` | string | no | ≤10000 chars, plain text or simple HTML |
| `validityType` | enum | no (default `EVERGREEN`) | `EVERGREEN` \| `SEASONAL` |
| `startDate` | date (ISO) | required **only if** `validityType=SEASONAL` | e.g. `"2026-10-01"` |
| `endDate` | date (ISO) | required **only if** `validityType=SEASONAL` | must be ≥ `startDate` |
| `oldPrice` | number/string | no | rupees; if present must be **≥** `price` (used to show a strikethrough discount) |
| `discount` | number/string | no | 0–100, integer percent |
| `hotelCategory` | string | no | ≤40 chars, e.g. `"3 star"`, `"4 star"` |
| `transfers` | string | no | ≤120 chars, e.g. `"AC cab, airport pickup & drop"` |
| `meals` | string | no | ≤120 chars, e.g. `"Breakfast & dinner included"` |
| `sightseeing` | string | no | ≤500 chars |
| `images` | string[] (URLs) | no | max 20, gallery images (alias: `galleryImages`) |
| `highlights` | string[] | no | max 30 items, each ≤200 chars |
| `inclusions` | string[] | no | max 30 items, each ≤200 chars |
| `exclusions` | string[] | no | max 30 items, each ≤200 chars |
| `itinerary` | array of objects | no | max 60 entries, shape below |
| `offerTitle` | string | no | ≤120 chars |
| `offerDescription` | string | no | ≤2000 chars |

**`itinerary` item shape:**
```json
{ "day": "Day 1", "title": "Arrival in Manali", "text": "Check in to hotel, evening at leisure." }
```
`day` (1–60 chars, required), `title` (1–200 chars, required), `text` (≤2000 chars, optional, defaults to `""`).

### 4b. Fields the generator must NOT send

`id`, `slug`, `status`, `vendorUserId`, `agent`, `hasPendingReview`,
`submittedAt`, `reviewedAt`, `reviewedByAdminId`, `rejectionReason`,
`priceInPaise`/`oldPriceInPaise`/`discountPercent`/`mainImageUrl`/`galleryImageUrls`
(these are the internal DB names — always use the request-side names `price`,
`oldPrice`, `discount`, `mainImage`, `images` instead; the API renames them).
If sent, `agent`/`status` are silently dropped and everything else is
server-generated — don't waste generator effort on them.

### 4c. Images

`mainImage` and `images` must be real URLs. There's no bypass — either:
- Upload real files first via `POST /api/v1/uploads/image` (multipart, auth
  required) and use the returned Cloudinary URL, or
- Point at stable stock-photo URLs (e.g. a fixed pool of Unsplash URLs) if
  this is just test/demo data rather than production content.

Do **not** invent fake `https://example.com/img.jpg`-style placeholders if
this data will ever be shown in a real UI — they'll render broken.

### 4d. Full sample package payload

```json
{
  "title": "Magical Manali Getaway",
  "destination": "Manali, Himachal Pradesh",
  "departureCity": "Delhi",
  "overview": "A refreshing 5-day escape to the mountains, covering Solang Valley, Old Manali, and Kasol, with comfortable stays and guided sightseeing.",
  "packageRegion": "NATIONAL",
  "packageType": "HILL_STATION",
  "price": "14999",
  "oldPrice": "18999",
  "discount": 21,
  "mainImage": "https://res.cloudinary.com/demo/image/upload/manali-main.jpg",
  "images": [
    "https://res.cloudinary.com/demo/image/upload/manali-1.jpg",
    "https://res.cloudinary.com/demo/image/upload/manali-2.jpg"
  ],
  "agencyName": "Package by Ramesh Travels",
  "route": "Delhi - Manali - Delhi",
  "duration": "4N/5D",
  "hotelCategory": "3 star",
  "transfers": "AC cab, airport pickup & drop",
  "meals": "Breakfast & dinner included",
  "sightseeing": "Solang Valley, Hadimba Temple, Old Manali, Kasol day trip",
  "validityType": "EVERGREEN",
  "highlights": ["Snow activities at Solang Valley", "Riverside camping in Kasol", "Free early check-in"],
  "inclusions": ["Hotel stay", "Daily breakfast", "Airport transfers", "Sightseeing as per itinerary"],
  "exclusions": ["Airfare/train fare", "Personal expenses", "Adventure activity charges"],
  "itinerary": [
    { "day": "Day 1", "title": "Arrival in Manali", "text": "Check in, evening at leisure." },
    { "day": "Day 2", "title": "Solang Valley excursion", "text": "Full-day trip to Solang Valley for snow/adventure activities." },
    { "day": "Day 3", "title": "Old Manali & Kasol", "text": "Explore cafes in Old Manali, day trip to Kasol." },
    { "day": "Day 4", "title": "Leisure day", "text": "Free day for local shopping and relaxation." },
    { "day": "Day 5", "title": "Departure", "text": "Check out and departure." }
  ],
  "offerTitle": "Early Bird Offer",
  "offerDescription": "Book 15 days in advance and save an extra 5%."
}
```

**Seasonal variant** — add these two and set `validityType: "SEASONAL"`:
```json
{ "validityType": "SEASONAL", "startDate": "2026-10-01", "endDate": "2027-03-31" }
```

---

## 5. Batch file format to request from the data-generator team

Ask for one JSON file (or one file per vendor) shaped like this — an array
of vendors, each with their own package list, so the import script can walk
it top to bottom in dependency order:

```json
[
  {
    "vendor": {
      "firstName": "Ramesh",
      "lastName": "Sharma",
      "email": "ramesh.sharma.agency1@example.com",
      "phone": "9812345678",
      "password": "Passw0rd123",
      "role": "VENDOR",
      "vendorType": "TRAVEL_AGENT"
    },
    "packages": [
      { "...one package object as in 4d...": "" }
    ]
  }
]
```

Constraints to hand the generator team explicitly:
- `email` / `phone` unique across the **entire file**, not just per vendor.
- Every enum value must be copy-exact (case-sensitive) from the lists in §4a.
- `price` / `oldPrice` in **rupees**, no currency symbols, no commas (e.g.
  `"14999"` not `"₹14,999"`).
- Dates as ISO `YYYY-MM-DD`.
- Respect all max-length/max-item limits in §4a — validation will reject the
  whole request otherwise (all-or-nothing per package, not partial-save).

---

## 6. What's still needed on our side before running the actual import

This file only defines the **data contract**. Turning a generated JSON batch
into DB rows still needs a small import script that, per vendor: registers
the user, provisions an ACTIVE unlimited-plan subscription, then calls the
package-create endpoint (or `prisma.package.create`) once per package. That
script isn't part of this spec — build it once the generator team's sample
file is available so it can be tested against real output shape.
