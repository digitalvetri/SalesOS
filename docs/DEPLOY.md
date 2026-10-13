# Deploying SalesOS (Coolify + PostgreSQL)

Stack: the Next.js app in Docker (`Dockerfile`) and one PostgreSQL 16 database.
Login is built into the app (scrypt password hashes plus database sessions), so there is no Supabase.

## 1. Coolify
1. **PostgreSQL:** + New → Database → **PostgreSQL 16**, in the SalesOS project. Leave it **not public**.
2. **App:** + New → Public/Private GitHub repo `digitalvetri/SalesOS`, branch `main`, build pack **Dockerfile**, port **3000**.
   - Health check path: `/api/health`.
   - Persistent storage: mount a volume at `/app/data` so uploaded photos survive deploys.
3. **App environment variables:**

| Name | Value | Build var? |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` | yes |
| `DATABASE_URL` | the PostgreSQL resource's **internal** URL | no |
| `DIRECT_URL` | same as `DATABASE_URL` | no |
| `APP_ENCRYPTION_KEY` | a new value from `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | no |
| `MIGRATE_ON_START` | `true` | no |
| `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD` | first admin login (remove after the first sign-in) | no |
| `BOOTSTRAP_OWNER_NAME` / `BOOTSTRAP_COMPANY_NAME` | optional | no |

4. **Deploy.** On first start the container applies the migrations and `extra.sql`, then creates the company, the KI/KFM entities and the Owner login.
5. **Check:** `https://<your-domain>/api/health` should return `{"ok":true,"db":"up"}`.

## 2. After the first sign-in
- Remove the `BOOTSTRAP_*` variables.
- Add employees in **Employees → + Add employee**, or with `scripts/seed-pilot-team.ts`.
- Use a real domain with HTTPS. Login cookies are only marked Secure when `NEXT_PUBLIC_APP_URL` is `https://`.

## 3. Backups
Turn on scheduled backups for the PostgreSQL resource in Coolify (Backups tab). That database holds everything except uploaded photos, which live in the `/app/data` volume.
