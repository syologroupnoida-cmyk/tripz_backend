# Subscription Plans — Frontend Contract

Complete guide for the frontend team on how to integrate the Subscription Plans
API. Covers **admin panel** (creating/editing plans) and **vendor pricing page**
(displaying + buying plans).

**Base URL:** `{baseUrl}/api/v1`

**Auth:** All endpoints require a Bearer token. Admin endpoints need
`SUPER_ADMIN` or `ADMIN`; vendor endpoints need `VENDOR`.

---

## 1. Golden rules — how to think about this API

### Rule 1 — Backend is authoritative, frontend is a dumb renderer

The frontend never hardcodes plan names, colours, feature bullets, prices, or
badge text. Whatever the API returns for a plan, render it exactly. When admin
changes a plan, vendors see the change on next refresh — zero frontend deploy.

### Rule 2 — Prices are stored in **paise** (INR × 100)

- `29900` in DB = ₹299 on screen
- Divide by 100 for display: `plan.offerPriceInPaise / 100`
- Multiply by 100 when sending: user types "299", send `29900`
- Never use floats for money — paise is integer

### Rule 3 — Two price fields

- **`salePriceInPaise`** — MRP shown crossed-out (e.g., `39900` → ~~₹399~~)
- **`offerPriceInPaise`** — actual price the vendor pays (e.g., `29900` → **₹299**)
- Backend enforces `offerPriceInPaise <= salePriceInPaise`

### Rule 4 — `displayContent` is your rendering source

Every visual detail on the pricing card lives inside `displayContent` (JSONB).
Frontend iterates over these fields, no hardcoded switch/case per plan.

### Rule 5 — `rules` is for backend logic, not display

Ignore `plan.rules` unless you explicitly need a machine-readable value
(e.g., "5 credits remaining out of X"). For pricing card display, use
`displayContent.features[]` — admin writes human-readable copy there.

---

## 2. Vendor Pricing Page — the main use case

### Two endpoints, same response

| Use case                                          | Endpoint                          | Auth?          |
| ------------------------------------------------- | --------------------------------- | -------------- |
| Marketing site / anonymous pricing page           | `GET /subscription-plans`         | No             |
| Logged-in vendor's in-app upgrade / buy page      | `GET /vendor/subscription-plans`  | VENDOR bearer  |

Both endpoints return the **exact same shape** — only active + non-deleted plans,
ordered by `displayOrder`. Use the public one on the marketing site so visitors
can browse plans before signing up; switch to the authenticated one after
login so the app can associate the choice with the vendor's session.

### API — Fetch the plans catalog

```http
GET /vendor/subscription-plans
Authorization: Bearer {accessToken}
```

Or for the public marketing page:

```http
GET /subscription-plans
```

**Response shape:**

```json
{
  "success": true,
  "message": "Available subscription plans retrieved.",
  "data": {
    "items": [
      {
        "id": "uuid-basic",
        "name": "Basic Brown Plan",
        "slug": "basic-brown-plan",
        "description": "For agents starting with package marketplace creation.",

        "salePriceInPaise": 39900,
        "offerPriceInPaise": 29900,
        "billingCycle": "MONTHLY",
        "durationDays": 30,
        "trialDays": 0,

        "includedCredits": 100,
        "maxPackages": 5,
        "directLeadPriceCredits": 8,
        "priorityWeight": 0,

        "isFeatured": false,
        "displayOrder": 1,
        "isActive": true,

        "displayContent": {
          "badgeText": "Starter",
          "ribbonText": null,
          "iconUrl": "https://.../basic-icon.svg",
          "themeColor": "#8B4513",
          "ctaButtonText": "Choose Basic Brown",
          "features": [
            { "text": "Create 5 packages per month", "included": true },
            { "text": "Email support", "included": true }
          ]
        },
        "rules": {
          "marketplaceLeadUnlockPrice": 10
        },
        "isCurrentPlan": false,
        "action": "DOWNGRADE_BLOCKED"
      },
      { "...silver": "...", "isCurrentPlan": true, "action": "CURRENT" },
      { "...gold": "...", "isCurrentPlan": false, "action": "UPGRADE_TO" }
    ],
    "currentSubscription": {
      "id": "sub-uuid",
      "planId": "uuid-silver",
      "expiresAt": "2026-08-15T10:30:00.000Z",
      "effectiveStatus": "ACTIVE"
    },
    "total": 3
  }
}
```

Items are ordered by `displayOrder` (1, 2, 3…) — render in the order received.

### Vendor-context CTA (`action` + `currentSubscription`)

Every plan carries an `action` string so the frontend can render the right CTA
without doing its own comparison against the current subscription. Values:

| `action` | Meaning | Suggested CTA |
| --- | --- | --- |
| `BUY` | Vendor has no active sub | `"Choose {plan.name}"` (from `displayContent.ctaButtonText`) |
| `CURRENT` | This IS the vendor's current plan | `"Your current plan"` (disabled + green tick) |
| `UPGRADE_TO` | Plan is priced above the current one | `"Upgrade to {plan.name}"` |
| `DOWNGRADE_BLOCKED` | Plan is priced at or below the current one | `"Downgrades not supported"` (disabled) |

Each plan also carries a boolean `isCurrentPlan` — handy for a highlighted
border/badge on the vendor's active card.

The top-level `currentSubscription` object mirrors the shape returned by
`GET /vendor/subscriptions/current` (see Section 5). Use it to render the
"expires in X days" pill without a second network call. It's `null` when
the vendor is between subscriptions (and on the public endpoint).

**Public endpoint (`GET /subscription-plans`, no auth):** every plan gets
`action: "BUY"` and `currentSubscription` is `null`.

**Rendering example:**

```tsx
const cta = ({
  BUY: `Choose ${plan.name}`,
  CURRENT: 'Your current plan',
  UPGRADE_TO: `Upgrade to ${plan.name}`,
  DOWNGRADE_BLOCKED: 'Downgrades not supported',
})[plan.action];

const isDisabled = plan.action === 'CURRENT' || plan.action === 'DOWNGRADE_BLOCKED';
```

### Rendering the pricing card — field by field

Match every card element to a specific API field:

| UI Element             | Field to read                            | Example                                       |
| ---------------------- | ---------------------------------------- | --------------------------------------------- |
| Card border/theme      | `displayContent.themeColor`              | `#8B4513`                                     |
| Circular icon          | `displayContent.iconUrl`                 | image URL                                     |
| Plan name              | `name`                                   | "Basic Brown Plan"                            |
| Small pill next to name | `displayContent.badgeText`              | "Starter"                                     |
| Top-right ribbon       | `displayContent.ribbonText`              | "Most Popular" (or `null` — hide the ribbon) |
| Subtitle (credits)     | `${includedCredits} credits`             | "100 credits"                                 |
| Description            | `description`                            | "For agents starting…"                        |
| Crossed price          | `salePriceInPaise / 100`                 | ~~₹399~~                                       |
| Actual price           | `offerPriceInPaise / 100`                | ₹299                                          |
| Billing suffix         | See mapping table below                  | "/month"                                      |
| Feature bullets        | `displayContent.features[]`              | list of `{ text, included }`                  |
| CTA button label       | `displayContent.ctaButtonText`           | "Choose Basic Brown"                          |
| Featured card style    | `isFeatured === true` → darker card + show ribbon | boolean flag                                  |

### Billing cycle → display suffix mapping

Only these four values will ever come in `billingCycle`:

```typescript
const BILLING_LABEL: Record<string, string> = {
  MONTHLY:     "/month",
  QUARTERLY:   "/quarter",
  HALF_YEARLY: "/6 months",
  YEARLY:      "/year",
};

// Usage
const suffix = BILLING_LABEL[plan.billingCycle] ?? "";
```

### Feature bullets

Each feature is `{ text: string, included: boolean }`. `included: true` shows a
green checkmark, `false` shows a grey/crossed-out state. Right now most plans
only send `true` features, but the field is there for future "not included"
comparison rows.

```jsx
{plan.displayContent.features.map((f, i) => (
  <li key={i} className={f.included ? "check" : "cross"}>
    {f.included ? "✅" : "❌"} {f.text}
  </li>
))}
```

---

## 3. Vendor — Buy a plan (fresh purchase)

```http
POST /vendor/subscriptions
Content-Type: application/json
Authorization: Bearer {vendorToken}

{
  "planId": "uuid-of-selected-plan"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Subscription activated.",
  "data": {
    "subscription": {
      "id": "sub-uuid",
      "planId": "uuid-of-selected-plan",
      "status": "ACTIVE",
      "startsAt": "2026-07-02T…",
      "expiresAt": "2026-08-01T…",
      "creditsGranted": 100,
      "bonusDays": 0,
      "plan": { "…the full plan object…": "" },
      "effectiveStatus": "ACTIVE"
    },
    "walletBalanceAfter": 100,
    "message": "Subscribed to Basic Brown Plan. 100 credits added."
  }
}
```

**Errors:**

- `404` — plan not found or inactive
- `409 ACTIVE_SUBSCRIPTION_EXISTS` — vendor already has an active sub → show
  Upgrade CTA instead of Buy

---

## 4. Vendor — Upgrade to a pricier plan

```http
POST /vendor/subscriptions/upgrade
Content-Type: application/json

{
  "planId": "uuid-of-new-plan"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "subscription": { "…new active sub…": "" },
    "previousSubscriptionId": "sub-old-uuid",
    "bonusDaysGranted": 7,
    "walletBalanceAfter": 320,
    "message": "Upgraded to Advance Silver Plan. 7 bonus day(s) added from remaining Basic Brown Plan value."
  }
}
```

**Add-Days upgrade formula:** the remaining value of the old sub is converted
into bonus days on the new plan at the new plan's daily rate. Vendor pays full
new-plan price and gets extra time — no partial refund logic.

**Errors:**

- `400 DOWNGRADE_BLOCKED` — new plan is cheaper than current
- `400` — no active sub to upgrade / already on this plan
- `404` — plan not found
- `409 CONCURRENT_UPGRADE` — another request touched the sub mid-upgrade → retry

---

## 5. Vendor — See current subscription + history

**Current active sub:**

```http
GET /vendor/subscriptions/current
```

Returns `{ subscription: {…} | null }`. If `subscription.effectiveStatus === "EXPIRED"`
even though `status === "ACTIVE"`, treat it as expired — the daily cron hasn't
flipped the DB status yet.

**Full history:**

```http
GET /vendor/subscriptions/history?page=0&size=20
```

Returns paginated list including `UPGRADED`, `EXPIRED`, `CANCELLED` rows.
`UPGRADED` rows have `replacedBySubscriptionId` pointing to the successor.

---

## 6. Admin Panel — Create a plan

```http
POST /super-admin/subscription-plans
Content-Type: application/json
Authorization: Bearer {superAdminToken}

{
  "name": "Basic Brown Plan",
  "description": "For agents starting with package marketplace creation.",
  "salePriceInPaise": 39900,
  "offerPriceInPaise": 29900,
  "billingCycle": "MONTHLY",
  "durationDays": 30,
  "trialDays": 0,
  "includedCredits": 100,
  "maxPackages": 5,
  "directLeadPriceCredits": 8,
  "priorityWeight": 0,
  "isFeatured": false,
  "displayOrder": 1,
  "isActive": true,
  "displayContent": {
    "badgeText": "Starter",
    "ribbonText": null,
    "iconUrl": "",
    "themeColor": "#8B4513",
    "ctaButtonText": "Choose Basic Brown",
    "features": [
      { "text": "Create 5 packages per month", "included": true },
      { "text": "Email support", "included": true }
    ]
  },
  "rules": {
    "marketplaceLeadUnlockPrice": 10
  }
}
```

`slug` is auto-generated from `name` — do **not** send it.

### Admin form field breakdown

Use structured inputs — **never a raw JSON textarea**. Group them into
sections so the admin knows what affects what.

**Section 1 — Identity**

| Form field  | Type   | Sends as                    | Notes                                       |
| ----------- | ------ | --------------------------- | ------------------------------------------- |
| Plan name   | text   | `name` (2-60 chars)         | Slug auto-generated                         |
| Description | textarea | `description` (2-500 chars) | Pitch line under the name                   |

**Section 2 — Pricing**

| Form field         | Type            | Sends as               | Notes                                 |
| ------------------ | --------------- | ---------------------- | ------------------------------------- |
| MRP (₹)            | number (rupees) | `salePriceInPaise` (× 100) | Crossed-out on card                 |
| Offer price (₹)    | number (rupees) | `offerPriceInPaise` (× 100) | Must be ≤ MRP                       |
| Billing cycle      | dropdown        | `billingCycle`         | MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY |
| Duration (days)    | number          | `durationDays`         | 30 for monthly, 90 for quarterly, etc. |
| Free trial days    | number          | `trialDays`            | 0 for no trial                        |

**Section 3 — Backend logic**

| Form field                  | Type            | Sends as                  | Notes                        |
| --------------------------- | --------------- | ------------------------- | ---------------------------- |
| Credits included            | number          | `includedCredits`         | Granted to wallet on purchase |
| Max packages allowed        | number (or -1)  | `maxPackages`             | -1 = unlimited               |
| Direct lead price (credits) | number          | `directLeadPriceCredits`  | Cost of a package-inquiry lead |
| Marketplace lead price      | number          | `rules.marketplaceLeadUnlockPrice` | Per-plan override; blank/null = use lead's base price |
| Priority weight             | number          | `priorityWeight`          | Marketplace ranking boost    |

**Section 4 — Display flags**

| Form field         | Type      | Sends as        | Notes                              |
| ------------------ | --------- | --------------- | ---------------------------------- |
| Featured plan?     | checkbox  | `isFeatured`    | Shows the "Most Popular" ribbon    |
| Display order      | number    | `displayOrder`  | 1, 2, 3 (left-to-right on catalog) |
| Active?            | toggle    | `isActive`      | False = hides from vendor catalog  |

**Section 5 — Card design (`displayContent`)**

| Form field       | Type         | Sends as                       |
| ---------------- | ------------ | ------------------------------ |
| Badge text       | text (max 40)| `displayContent.badgeText`     |
| Ribbon text      | text (max 40, nullable) | `displayContent.ribbonText` |
| Icon URL         | text         | `displayContent.iconUrl`       |
| Theme colour     | colour picker | `displayContent.themeColor` (hex) |
| CTA button text  | text (max 40) | `displayContent.ctaButtonText` |
| Feature list     | repeater `{ text, included }` | `displayContent.features` |

---

## 7. Admin Panel — Update a plan

```http
PATCH /super-admin/subscription-plans/{planId}
Content-Type: application/json

{
  "offerPriceInPaise": 27900,
  "displayContent": {
    "badgeText": "Starter",
    "themeColor": "#8B4513",
    "ctaButtonText": "Choose Basic Brown",
    "features": [
      { "text": "New refreshed offer!", "included": true }
    ]
  }
}
```

**Important:**

- Send only the fields you're changing (partial update).
- **`displayContent` is REPLACED wholesale** — always send the full object you
  want stored, not a partial patch. Same for `rules`.
- Changing `name` auto-regenerates the slug.

**Errors:**

- `404` — plan not found
- `400 PLAN_DELETED` — plan was soft-deleted (retired forever, cannot be edited)
- `400` — `offerPriceInPaise > salePriceInPaise` (only checked when both sent)

### Deactivate / reactivate — no separate endpoint

Toggle via update:

```json
{ "isActive": false }   // deactivate — reversible
{ "isActive": true  }   // reactivate
```

---

## 8. Admin Panel — Delete a plan (soft delete)

```http
DELETE /super-admin/subscription-plans/{planId}
Content-Type: application/json

{
  "reason": "Retiring — replaced by new tier."
}
```

- Soft delete only — the row stays for audit, `deletedAt` is stamped.
- Existing vendor subs on this plan **keep running** to their natural expiry.
- Deleted plans **cannot be reactivated**.
- Idempotent — calling twice returns the same state.
- Admin list hides deleted plans by default; pass `?includeDeleted=true` for
  audit view.

---

## 9. Admin Panel — List plans

```http
GET /admin/subscription-plans?page=0&size=20&sortBy=displayOrder&order=asc
```

**Query params:**

- `isActive` — `true` / `false` (filter)
- `includeDeleted` — `true` to include soft-deleted plans (audit view)
- `sortBy` — `createdAt` | `updatedAt` | `name` | `offerPriceInPaise` |
  `salePriceInPaise` | `durationDays` | `displayOrder`
- `order` — `asc` | `desc`
- `page` + `size` OR `take` + `skip`

---

## 10. Utility snippets

### Paise ↔ Rupees

```typescript
export const paiseToRupees = (paise: number): number => paise / 100;
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

// Formatted for display
export const formatPrice = (paise: number): string =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

// formatPrice(29900) → "₹299"
// formatPrice(299900) → "₹2,999"
```

### Billing suffix

```typescript
export const billingSuffix = (cycle: string): string => {
  const map: Record<string, string> = {
    MONTHLY: "/month",
    QUARTERLY: "/quarter",
    HALF_YEARLY: "/6 months",
    YEARLY: "/year",
  };
  return map[cycle] ?? "";
};
```

### Discount % for the "Save X%" badge

```typescript
export const discountPercent = (sale: number, offer: number): number => {
  if (sale <= 0 || offer >= sale) return 0;
  return Math.round(((sale - offer) / sale) * 100);
};
// discountPercent(39900, 29900) → 25 (for "Save 25%" badge)
```

---

## 11. Common pitfalls — what NOT to do

- ❌ **Don't hardcode plan names, colours, features, or CTAs.** Whatever the
  API returns, render exactly. New plans should appear without a deploy.
- ❌ **Don't treat prices as rupees in code.** DB and API are all paise.
  Only convert when displaying or when the user types in a form field.
- ❌ **Don't send `slug`** on create. Backend generates it from `name`.
- ❌ **Don't hardcode `/month`** — read `billingCycle` and map it.
- ❌ **Don't send partial `displayContent`.** It's replaced wholesale. Always
  send the whole object.
- ❌ **Don't try to interpret `rules`** for display. Use `features[]` for the
  human-readable copy. `rules` is machine-readable for backend logic only.
- ❌ **Don't ignore `effectiveStatus`.** A subscription may still be
  `status: ACTIVE` in DB but `effectiveStatus: EXPIRED` if past `expiresAt`.
  Use `effectiveStatus` for gating.

---

## 12. Sample TypeScript types (drop into your project)

```typescript
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

export type SubscriptionStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED"
  | "UPGRADED";

export interface FeatureItem {
  text: string;
  included: boolean;
}

export interface DisplayContent {
  badgeText?: string;
  ribbonText?: string | null;
  iconUrl?: string;
  themeColor?: string; // hex
  ctaButtonText?: string;
  features?: FeatureItem[];
}

export interface PlanRules {
  marketplaceLeadUnlockPrice?: number;
  // Add more rules here as the backend introduces them
  [key: string]: unknown; // future rules pass through
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string;

  salePriceInPaise: number;
  offerPriceInPaise: number;
  billingCycle: BillingCycle;
  durationDays: number;
  trialDays: number;

  includedCredits: number;
  maxPackages: number; // -1 = unlimited
  directLeadPriceCredits: number;
  priorityWeight: number;

  isFeatured: boolean;
  displayOrder: number;
  isActive: boolean;
  deletedAt: string | null;

  displayContent: DisplayContent;
  rules: PlanRules;

  createdAt: string;
  updatedAt: string;
}

export interface VendorSubscription {
  id: string;
  vendorUserId: string;
  planId: string;
  status: SubscriptionStatus;
  effectiveStatus: SubscriptionStatus; // honours on-the-fly expiry
  startsAt: string;
  expiresAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  replacedBySubscriptionId: string | null;
  creditsGranted: number;
  bonusDays: number;
  paymentRef: string | null;
  plan: SubscriptionPlan;
  createdAt: string;
  updatedAt: string;
}
```

---

## 13. Quick reference — endpoints table

| Method | Endpoint                                            | Role         | Purpose                          |
| ------ | --------------------------------------------------- | ------------ | -------------------------------- |
| GET    | `/subscription-plans`                               | Public       | Active plans (marketing / anonymous pricing page) |
| POST   | `/super-admin/subscription-plans`                   | SUPER_ADMIN  | Create plan                      |
| PATCH  | `/super-admin/subscription-plans/:id`               | SUPER_ADMIN  | Update (fields + isActive)       |
| DELETE | `/super-admin/subscription-plans/:id`               | SUPER_ADMIN  | Soft delete                      |
| GET    | `/admin/subscription-plans`                         | ADMIN + SA   | List all plans                   |
| GET    | `/admin/subscription-plans/:id`                     | ADMIN + SA   | Plan detail                      |
| GET    | `/admin/subscriptions`                              | ADMIN + SA   | List all vendor subs             |
| GET    | `/admin/subscriptions/:id`                          | ADMIN + SA   | Subscription detail              |
| POST   | `/super-admin/subscriptions/:id/cancel`             | SUPER_ADMIN  | Force cancel (reason required)   |
| GET    | `/vendor/subscription-plans`                        | VENDOR       | Active plans catalog             |
| POST   | `/vendor/subscriptions`                             | VENDOR       | Buy a plan                       |
| POST   | `/vendor/subscriptions/upgrade`                     | VENDOR       | Upgrade to a pricier plan        |
| GET    | `/vendor/subscriptions/current`                     | VENDOR       | Current active subscription      |
| GET    | `/vendor/subscriptions/history`                     | VENDOR       | Past subscriptions               |

---

**Questions?** Ping the backend team on the shared channel — this doc will
evolve as the API grows.
