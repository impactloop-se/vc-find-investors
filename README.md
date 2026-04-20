# VC Find Investors

Standalone Next.js app with the English investor search tool.

- `/embed/find-investors` — full search (for subscribers)
- `/embed/find-investors/preview` — paywalled/blurred preview

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000/embed/find-investors

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
OPENAI_API_KEY
PINECONE_API_KEY
```

## Deploy

Auto-deploy via Vercel from `main`.
