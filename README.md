# Tripz Backend

Multi-panel travel platform API. Four user roles:

- **SUPER_ADMIN** — full control, distributes leads, manages vendor plans
- **ADMIN** — second-in-command
- **VENDOR** — travel agencies subscribing to receive leads
- **CLIENT** — end-users who generate trip request leads

---

## Tech Stack

- **Runtime:** Node.js (>= 18.18) with ES Modules
- **Framework:** Express 4
- **Database:** PostgreSQL
- **ORM:** Prisma 6 (multi-file schema)
- **Auth:** JWT (access + refresh tokens with rotation)
- **Validation:** Zod
- **Security:** Helmet, CORS, bcrypt

---

## Folder Structure

```
TRIPZ/
├── prisma/
│   └── schema/                    one .prisma file per model
│       ├── main.prisma            generator + datasource
│       ├── enums.prisma           shared enums
│       ├── user.prisma
│       └── refreshToken.prisma
├── src/
│   ├── config/                    env + db setup
│   ├── routes/                    route definitions
│   ├── controllers/               req/res handlers
│   ├── services/                  business logic
│   ├── repositories/              direct Prisma DB access
│   ├── middlewares/               auth, validation, error
│   ├── validators/                Zod schemas
│   ├── utils/                     jwt, password, response helpers
│   ├── app.js                     express setup
│   └── server.js                  entry point
├── .env.example
├── package.json
└── README.md
```

Layered architecture (not feature-modular) — chosen so cross-entity services stay simple.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in your real values — especially `DATABASE_URL` and the two JWT secrets.

### 3. Start PostgreSQL locally

Make sure PostgreSQL is running and a database called `tripz` exists.

### 4. Run the first migration

```bash
npm run prisma:migrate -- --name init
```

This creates all tables and generates the Prisma Client.

### 5. Start the dev server

```bash
npm run dev
```

API runs at `http://localhost:4000`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload on file changes |
| `npm start` | Start in production mode |
| `npm run prisma:migrate -- --name <name>` | Create a new migration (dev) |
| `npm run prisma:deploy` | Apply pending migrations (production / CI) |
| `npm run prisma:generate` | Regenerate Prisma Client manually |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |
| `npm run prisma:format` | Format all `.prisma` files |

---

## API Endpoints

Base URL: `http://localhost:4000/api/v1`

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register a new CLIENT or VENDOR |
| POST | `/auth/login` | — | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | — | Rotate refresh token, get new access token |
| POST | `/auth/logout` | — | Revoke a refresh token |
| GET | `/auth/me` | Bearer | Get current logged-in user profile |

### Role-protected sample routes

| Method | Path | Required role |
|---|---|---|
| GET | `/super-admin/ping` | SUPER_ADMIN |
| GET | `/admin/ping` | SUPER_ADMIN, ADMIN |
| GET | `/vendor/ping` | VENDOR |
| GET | `/client/ping` | CLIENT |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | API uptime |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | no | `development` or `production` |
| `PORT` | no | API port (default `4000`) |
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | **yes** | Secret for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | **yes** | Secret for refresh tokens (must differ from access secret) |
| `JWT_ACCESS_EXPIRES_IN` | no | Access token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | no | Refresh token TTL (default `7d`) |
| `BCRYPT_SALT_ROUNDS` | no | Password hashing cost (default `12`) |
| `CORS_ORIGIN` | no | Allowed frontend origin(s) |

---

## How to Add a New Table

1. Create a new file in `prisma/schema/`, e.g. `vendor.prisma`:

   ```prisma
   model Vendor {
     id          String   @id @default(uuid())
     userId      String   @unique
     companyName String
     createdAt   DateTime @default(now())

     user User @relation(fields: [userId], references: [id], onDelete: Cascade)

     @@map("vendors")
   }
   ```

2. Add the reverse side of the relation in `user.prisma`:

   ```prisma
   vendor Vendor?
   ```

3. Run the migration:

   ```bash
   npm run prisma:migrate -- --name add_vendor_table
   ```

4. Create the corresponding repository, service, controller, and route files in `src/`.

5. Use it anywhere:

   ```js
   import prisma from '../config/db.js';
   await prisma.vendor.create({ data: { ... } });
   ```

---

## Conventions

- **One model per `.prisma` file.** Don't bundle multiple models in one file.
- **Repositories own Prisma.** Controllers and services never import `prisma` directly.
- **`process.env` is read only in [src/config/env.js](src/config/env.js).** Everything else imports from `env`.
- **Migrations are append-only.** Never edit a migration after it's applied to any shared environment.
- **Commit the entire `prisma/` folder** (schema + migrations) to git.
- **Don't commit `.env`** — only `.env.example`.

---

## Auth Flow Summary

```
Register → POST /auth/register { name, email, password, role }
   ↓
Login    → POST /auth/login { email, password }
            response: { accessToken, refreshToken, user }
   ↓
Use      → Authorization: Bearer <accessToken>     (valid 15 min)
   ↓
Refresh  → POST /auth/refresh { refreshToken }
            response: { new accessToken, new refreshToken }
            (old refresh token is revoked — rotation)
   ↓
Logout   → POST /auth/logout { refreshToken }
            (refresh token is revoked in DB)
```

Refresh tokens are hashed (SHA-256) before storage. If a previously-rotated refresh token is reused, all of that user's tokens are revoked automatically (replay-attack protection).

---

## License

Private — Tripz internal project.


const knownRulesSchema = z.object({
  // Marketplace pricing
  marketplaceLeadUnlockPrice: z.number().int().min(0).max(1000).optional(),
  marketplaceLeadDiscountPercent: z.number().int().min(0).max(100).optional(),
  freeUnlocksPerMonth: z.number().int().min(0).max(1000).optional(),
  
  // Support
  supportTier: z.enum(['EMAIL', 'PRIORITY', 'DEDICATED']).optional(),
  supportSlaHours: z.number().int().min(1).max(168).optional(),
  phoneSupport: z.boolean().optional(),
  
  // Package features (Phase 2)
  packageBoostSlots: z.number().int().min(0).max(100).optional(),
  packageAnalyticsEnabled: z.boolean().optional(),
  
  // Analytics/Data
  analyticsRetentionDays: z.number().int().min(1).max(3650).optional(),
  dataExportEnabled: z.boolean().optional(),
  
  // Branding
  customBrandingAllowed: z.boolean().optional(),
  hideTripzBranding: z.boolean().optional(),
})
.passthrough();  // future flex: unknown fields pass but not validated
