# Frontend

Next.js, TypeScript, and Tailwind CSS frontend for the Pokémon price tracker MVP.

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local
```

Set `NEXT_PUBLIC_API_URL` if the backend is not running on `http://localhost:8000`.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Notes

- The homepage shows cards stored by the backend database.
- Portfolio pages require a local JWT from login or registration.
- If the backend sync has not extracted SNKRDUNK data yet, the homepage shows an empty state instead of claiming live data is available.
