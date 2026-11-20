# LabLend

Lab equipment loan management for a university lab. Students borrow oscilloscopes, microcontroller kits, multimeters, 3D printers and similar equipment. Technicians approve loans and register returns. Admins manage users, review the audit log and export reports.

## Requirements

- Node.js 20 (see `engines` in `package.json`)
- npm

## Setup and run

```bash
npm install          # installs pinned dependencies from package-lock.json
npm run seed         # (re)creates ./data/lablend.db with demo data
npm start            # http://localhost:3000
npm test             # Jest + supertest suite (in-memory SQLite, no network)
```

`npm run seed` wipes the existing data before inserting demo data.

### Seed accounts

| Role       | Email                       | Password      |
|------------|-----------------------------|---------------|
| ADMIN      | admin@lablend.edu           | Admin@12345   |
| TECHNICIAN | tech@lablend.edu            | Tech@12345    |
| STUDENT    | ana@student.lablend.edu     | Student@123   |
| STUDENT    | bruno@student.lablend.edu   | Student@123   |
| STUDENT    | carla@student.lablend.edu   | Student@123   |

The seed data covers every loan status. Ana is at the 3-open-loan limit and Bruno has an overdue loan, so both are blocked from new requests.

### Docker

```bash
docker build -t lablend .
docker run --rm -v lablend-data:/app/data lablend node scripts/seed.js   # first run only
docker run --rm -p 3000:3000 -v lablend-data:/app/data -v lablend-uploads:/app/uploads lablend
```

### Configuration (environment variables)

| Variable             | Default                                         |
|----------------------|-------------------------------------------------|
| `PORT`               | `3000`                                          |
| `DB_PATH`            | `./data/lablend.db`                             |
| `UPLOAD_DIR`         | `./uploads`                                     |
| `SESSION_SECRET`     | dev default; **set in production**              |
| `JWT_SECRET`         | dev default; **set in production**              |
| `COOKIE_SECURE`      | `false`; set `true` only when served over HTTPS |
| `JWT_EXPIRES_IN`     | `2h`                                            |
| `HOLIDAY_API_URL`    | `https://date.nager.at/api/v3/PublicHolidays`   |
| `HOLIDAY_COUNTRY`    | `BR`                                            |
| `HOLIDAY_TIMEOUT_MS` | `3000`                                          |

## Architecture

```
HTTP ──► routes (web.js / api.js)
          │  middleware: session/JWT auth, role checks, multer upload, error handler
          ▼
        controllers  (parse request, choose view / JSON, flash messages)
          ▼
        services     (all business rules, transactions, audit logging)
          ▼
        repositories (raw SQL via better-sqlite3)
          ▼
        SQLite  ./data/lablend.db
```

- **Web UI**: server-rendered EJS views with plain CSS and a little vanilla JS (`src/public`). Uses session auth (`express-session`, cookie `lablend.sid`) and bcrypt password hashes.
- **REST API** (`/api`): a JWT bearer token is issued by `POST /api/auth/login`.
  - `GET /api/equipment`, `GET /api/equipment/:id`
  - `GET /api/loans`: students get their own loans; staff get all loans
  - `POST /api/loans`
  - `PATCH /api/loans/:id/status` with body `{ "status": "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED", "reason"?: "..." }`
- **Services**:
  - `loanService` implements the loan state machine, limits, overlap checks, activation and overdue processing, and late fees.
  - `holidayService` fetches public holidays with axios from Nager.Date and caches them per year. If the call fails or times out, it falls back to a hardcoded list of Brazilian national holidays (Easter-based dates are computed).
  - `equipmentService` handles CRUD, photos and Markdown rendering with `marked`.
  - `userService` handles registration, login lockout, JWTs, roles, and preference merging with `lodash.merge`.
  - `auditService` writes to `audit_logs`.
- **Scheduled checks**: `loanService.runScheduledChecks()` turns APPROVED loans ACTIVE on their start date (equipment becomes LOANED). It also flags ACTIVE loans past their due date as OVERDUE and refreshes late fees. It runs at startup and hourly. It also runs on demand when the technician dashboard, "My loans" or `GET /api/loans` is loaded, and from the "Run checks" button.
- **Reports**: `GET /admin/reports/loans.csv?from=&to=&status=` uses csv-stringify. The date filter applies to the loan start date.
- **Testability**: `src/utils/clock.js` provides "now" so tests can pin the date. axios is mocked in tests.

### Loan lifecycle

```
PENDING ──approve──► APPROVED ──start date──► ACTIVE ──past due date──► OVERDUE
   │ └─reject (reason)─► REJECTED                │                          │
   │                                             └──────return──────┐       │
   └─cancel (owner; also from APPROVED)─► CANCELLED                  ▼       │
                                                               RETURNED ◄───┘
```

### Database schema

- `users(id, name, email UNIQUE, password_hash, role, preferences JSON, failed_login_attempts, locked_until, created_at)`
- `equipment(id, name, description, category, serial_number UNIQUE, status, photo_path, created_at)`
- `loans(id, user_id, equipment_id, status, requested_start, due_date, returned_at, notes, late_fee_cents, created_at)`
- `audit_logs(id, user_id, action, entity, entity_id, details, created_at)`

Loan period dates are stored as `YYYY-MM-DD` local calendar dates. Timestamps are stored in UTC.

## Project layout

```
src/
  app.js, server.js
  config/          index.js (settings), database.js (connection + schema)
  routes/          web.js, api.js
  controllers/     auth, equipment, loan, admin, profile, api
  services/        loanService, equipmentService, userService, holidayService, auditService
  repositories/    user, equipment, loan, audit (raw SQL)
  middleware/      auth, roles, upload, errorHandler
  utils/           clock, dates, errors, http helpers
  views/           EJS templates
  public/          css, js
tests/             Jest + supertest
scripts/seed.js
.github/workflows/ (intentionally empty)
```
