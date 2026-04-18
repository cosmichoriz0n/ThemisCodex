# Railway Setup Guide — ThemisCodex

## 1. Create a New Project

Go to railway.app → New Project → Empty Project.

---

## 2. Add Services

You need **3 services** total:

| Service | Source | Root Dir |
|---|---|---|
| `imis-app` | GitHub repo | `imis-app/` |
| `legacy-simulators` | GitHub repo | `legacy-simulators/` |
| `postgres` | Railway plugin | — |

**To add each:**
- Click **"+ New"** → Deploy from GitHub repo → select `ThemisCodex` → set the root directory
- For Postgres: **"+ New"** → Database → PostgreSQL

---

## 3. PostgreSQL Database

After adding the Postgres plugin, Railway auto-generates `DATABASE_URL`. Reference this in `imis-app` env vars.

**Run migrations after first deploy:**
```bash
DATABASE_URL=<your-railway-postgres-url> npx drizzle-kit migrate
```

Then optionally seed:
```bash
DATABASE_URL=<url> npm run seed
```

---

## 4. Environment Variables

### `imis-app` service

| Variable | Value |
|---|---|
| `DATABASE_URL` | Click "Reference" → select Postgres `DATABASE_URL` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | From Firebase Console |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` |
| `FIREBASE_PROJECT_ID` | Same as above (no NEXT_PUBLIC prefix) |
| `FIREBASE_CLIENT_EMAIL` | From Firebase service account JSON |
| `FIREBASE_PRIVATE_KEY` | From Firebase service account JSON (keep full `"-----BEGIN...-----END..."` with quotes) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `N8N_WEBHOOK_SECRET` | Your n8n secret |
| `N8N_WEBHOOK_URL` | Your n8n webhook endpoint |
| `MIMS_API_URL` | `http://legacy-simulators.railway.internal:3001/mims` |
| `MIMS_API_KEY` | Any string you pick (must match simulators) |
| `EBS2000_API_URL` | `http://legacy-simulators.railway.internal:3001/ebs2000` |
| `EBS2000_API_KEY` | Any string (must match simulators) |
| `CAS2000_API_URL` | `http://legacy-simulators.railway.internal:3001/cas2000` |
| `CAS2000_API_KEY` | Any string (must match simulators) |
| `RESEND_API_KEY` | From resend.com |
| `ALERT_EMAIL_ADMIN` | Your admin email |
| `IMIS_APP_URL` | Railway-generated public URL for `imis-app` (set after deploy) |

### `legacy-simulators` service

| Variable | Value |
|---|---|
| `MIMS_API_KEY` | Must match what you set in `imis-app` |
| `EBS2000_API_KEY` | Must match |
| `CAS2000_API_KEY` | Must match |
| `PORT` | `3001` |

---

## 5. Internal Networking (Service-to-Service)

In `legacy-simulators` service → Settings → enable **Private Networking** → copy the internal hostname.

Use these for `imis-app` API URL vars:
```
MIMS_API_URL=http://legacy-simulators.railway.internal:3001/mims
EBS2000_API_URL=http://legacy-simulators.railway.internal:3001/ebs2000
CAS2000_API_URL=http://legacy-simulators.railway.internal:3001/cas2000
```

---

## 6. Custom Domains (Optional)

Each service → Settings → **Generate Domain** (free `*.railway.app` subdomain) or attach your own.

Set `IMIS_APP_URL` to the final public URL of `imis-app` after this step.

---

## 7. Deploy Order

1. Deploy **Postgres** first (instant)
2. Deploy **`legacy-simulators`**
3. Run migrations against the Postgres URL
4. Deploy **`imis-app`** last (depends on DB + simulators being up)

---

## Things to Have Ready Before Starting

- Firebase project with Auth enabled + a **service account JSON** (for Admin SDK vars)
- Resend account + API key (resend.com)
- n8n instance with a webhook URL (or skip if not using automation yet)
- GitHub repo connected to Railway
