# Aether Chat — Finlatics Web Development Project 3

A production-style AI chatbot built with Next.js. It combines streaming chat, conversation memory, document RAG with citations, and multimodal image questions in one product.

## 1. Prerequisites

- Node.js **18.17+** (Node 20 recommended; see `.nvmrc`)
- npm
- PostgreSQL 14+
- PostgreSQL with the **pgvector** extension
- An [Anthropic](https://console.anthropic.com/) API key
- An [OpenAI](https://platform.openai.com/) API key (embeddings only)



## 2. Node version

```bash
node -v   # should be v18.17 or newer
```

If you use nvm:

```bash
nvm use
```

## 3. Install dependencies

```bash
cd finlaticswebdev_project3-main
npm install
```

`prisma generate` runs automatically after install.

## 4. Environment variables

Copy the example file and fill in real values. Never commit `.env` or `.env.local`.

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude chat, RAG, and image understanding |
| `ANTHROPIC_MODEL` | Optional model id (default `claude-sonnet-4-5`) |
| `ANTHROPIC_MAX_TOKENS` | Optional max tokens (default `1024`) |
| `OPENAI_API_KEY` | `text-embedding-3-small` embeddings |
| `OPENAI_EMBEDDING_MODEL` | Optional override |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for sessions |
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `ALLOWED_ORIGINS` | Optional comma-separated browser origins |

Generate a secret:

```bash
openssl rand -base64 32
```

Server keys are never exposed with `NEXT_PUBLIC_`.

## 5. PostgreSQL setup

Create a database:

```sql
CREATE DATABASE finlatics_chatbot;
```

Set `DATABASE_URL`, for example:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/finlatics_chatbot?schema=public"
```

This app stores users, conversations, messages, documents, chunk metadata, and OpenAI embeddings in PostgreSQL using **pgvector** with cosine similarity search and an HNSW index.
## 6. Prisma setup / migrations

```bash
npx prisma migrate dev --name init
```

If you prefer to push the schema without migration history:

```bash
npx prisma db push
```

Then:

```bash
npx prisma generate
```


## 8. Anthropic API setup

1. Create an API key in the Anthropic console.
2. Put it in `ANTHROPIC_API_KEY`.
3. Optionally set `ANTHROPIC_MODEL` to a model your account can use.

## 9. OpenAI API setup

1. Create an API key in the OpenAI dashboard.
2. Put it in `OPENAI_API_KEY`.
3. Embeddings use `text-embedding-3-small` unless you override `OPENAI_EMBEDDING_MODEL`.

## 10. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Create an account at `/register`, then sign in. Chat and documents are private to that user.

## 11. Test basic chat

1. Open **Start chatting**.
2. Send a short question.
3. Confirm a normal assistant reply (non-stream endpoint: `POST /api/chat`).

## 12. Test streaming

The UI uses `POST /api/chat/stream` (SSE).

1. Send a longer prompt.
2. Watch the assistant message grow token by token.
3. Press **Cancel** while it is generating.

## 13. Test document ingestion

1. Open **Documents**.
2. Upload a PDF, `.txt`, or Markdown file.
3. Wait for: `Document processed successfully — N chunks indexed.`

Pipeline: upload → extract → chunk (~800 characters, ~100 overlap) → batch OpenAI embeddings → PostgreSQL pgvector → status `processed`.

## 14. Test RAG

1. Open a processed document.
2. Ask a question that is actually in the file.
3. Confirm the answer stays grounded and **Sources** appear.
4. Ask something unrelated and confirm it says the information is not in the document.

`POST /api/documents/ask` is the non-streaming RAG endpoint.

## 15. Test image chat

1. In general chat, attach a JPEG/PNG/WEBP/GIF (max 4MB).
2. Ask a question about the image.
3. Confirm the mode badge shows **Image chat**.

## 16. Production build

```bash
npm run lint
npm run build
npm start
```

## 17. Deployment notes

The app is a single Next.js project (Pages Router). Deploy it as one service (for example Vercel, Railway, or a Node host).

Production checklist:

- Set every variable from `.env.example` on the host.
- Use a hosted PostgreSQL instance and run `npx prisma migrate deploy`.
- Use PostgreSQL with the pgvector extension enabled in production.
- Set `NEXTAUTH_URL` to the public HTTPS origin.
- Keep `ALLOWED_ORIGINS` aligned with that origin.
- Uploaded files are stored on local disk under `uploads/`. On ephemeral hosts (Vercel), switch storage to S3 or similar before relying on uploads in production.
- Serverless timeouts may be too short for large PDF ingestion. Prefer a Node host or a background worker for big files.

## API map

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/chat` | Non-streaming chat |
| POST | `/api/chat/stream` | SSE streaming chat / RAG / image |
| POST | `/api/upload` | Document upload |
| POST | `/api/process` | Extract + chunk preview |
| POST | `/api/documents/ingest` | Full ingestion pipeline |
| POST | `/api/documents/ask` | Non-streaming RAG |
| GET | `/api/documents` | List your documents |
| GET/DELETE | `/api/documents/:id` | Read or delete |
| GET/POST | `/api/conversations` | List or create |
| GET/DELETE | `/api/conversations/:id` | Read or delete |
| POST | `/api/register` | Create account |
| * | `/api/auth/*` | NextAuth (starter catch-all `[...newAuth]`) |

## Project layout

- `lib/ai.js` — Anthropic client, retries, streaming
- `lib/prompts.js` — Role / Task / Constraints / Format prompts
- `lib/embedder.js` — OpenAI embeddings
- `lib/vectorSearch.js` — PostgreSQL pgvector cosine similarity search
- `lib/claudeRAG.js` — retrieval + grounded generation
- `lib/chunker.js` — paragraph/sentence chunking
- `prisma/schema.prisma` — User, Conversation, Message, Document, DocumentChunk
