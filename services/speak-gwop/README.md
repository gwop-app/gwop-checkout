# speak-gwop (Metered Phase)

Standalone, clone-friendly agent TTS API demo for `speak.gwop.io`.

This phase is **metered**:
- Agents buy prepaid character credits via Gwop invoices
- Claim credits to balance
- TTS requests reserve/reconcile character spend
- Async TTS jobs + downloadable audio links are working

Runtime architecture is now split:
- API service (stateless HTTP + auth + checkout + enqueue)
- Worker service (Redis queue consumer + TTS generation + artifact upload)

No in-memory fallback is used for state.

## Run

```bash
cd services/speak-gwop
npm install
cp .env.example .env
npm run dev            # API on :3020
npm run dev:worker     # Worker process
```

Server runs on `http://localhost:3020`.

## Configuration

See `.env.example`.

Key vars:
- `PORT=3020` (local default; Railway sets this automatically in production)
- `GWOP_CHECKOUT_API_KEY` (enables checkout bridge + SDK client)
- `GWOP_API_BASE` (defaults to `https://api.gwop.io`)
- `DATABASE_URL` (preferred) OR `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` (required)
- `DB_SSL` (`true` by default; set `false` for local plain Postgres)
- `REDIS_URL` (required)
- `TTS_PROVIDER=mock|elevenlabs`
- `ELEVENLABS_API_KEY` (required for `elevenlabs` mode)
- `STORAGE_BACKEND=local|s3`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (required when `STORAGE_BACKEND=s3`)
- `S3_SIGNED_URL_TTL_SECONDS` (download URL TTL, default `3600`)
- `MASTER_API_KEY` (optional global request gate)
- `AGENT_SESSION_TTL_SECONDS` (default `86400`)

## Endpoints

- `GET /help`
- `GET /skill.md`
- `GET /health`
- `GET /speak-openapi.yaml`
- `GET /v1/agents/init/preflight`
- `POST /v1/agents/init`
- `POST /v1/agents/login`
- `GET /v1/agents/status`
- `GET /catalog.json`
- `POST /v1/credits/invoices`
- `POST /v1/credits/claim`
- `GET /v1/orders/:id`
- `GET /v1/voices`
- `POST /v1/tts/jobs`
- `GET /v1/tts/jobs/:id`
- `POST /webhooks/gwop` (maps invoice events to local order status)

## Quick demo

```bash
# 1) Help
curl -sS http://localhost:3020/help | jq

# 2) Read agent skill playbook
curl -sS http://localhost:3020/skill.md | head -40

# 3) Read OpenAPI contract
curl -sS http://localhost:3020/speak-openapi.yaml | head -40

# 4) Check catalog
curl -sS http://localhost:3020/catalog.json | jq

# 5) Create speak agent identity (login code shown once)
agent_init=$(curl -sS -X POST http://localhost:3020/v1/agents/init \
  -H 'Content-Type: application/json' \
  -d '{"agent_name":"demo-agent"}')
echo "$agent_init" | jq
agent_id=$(echo "$agent_init" | jq -r '.agent_id')
login_code=$(echo "$agent_init" | jq -r '.login_code')

# 6) Login to get Bearer token
agent_login=$(curl -sS -X POST http://localhost:3020/v1/agents/login \
  -H 'Content-Type: application/json' \
  -d "{\"agent_id\":\"$agent_id\",\"login_code\":\"$login_code\"}")
echo "$agent_login" | jq
token=$(echo "$agent_login" | jq -r '.token')

# 7) Create credit invoice (requires GWOP_CHECKOUT_API_KEY)
invoice=$(curl -sS -X POST http://localhost:3020/v1/credits/invoices \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d '{
    "sku": "tts-5k",
    "quantity": 1
  }')
echo "$invoice" | jq
invoice_id=$(echo "$invoice" | jq -r '.invoice_id')
order_id=$(echo "$invoice" | jq -r '.order_id')

# 8) After payment, claim credits (bound to speak_agent_id + invoice_id)
curl -sS -X POST http://localhost:3020/v1/credits/claim \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d "{\"invoice_id\":\"$invoice_id\"}" | jq

# 9) Check order state
curl -sS -H "Authorization: Bearer $token" \
  http://localhost:3020/v1/orders/$order_id | jq

# 10) Create TTS job (consumes reserved chars)
curl -sS -X POST http://localhost:3020/v1/tts/jobs \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Hello from speak dot gwop dot io",
    "voice_id": "JBFqnCBsd6RMkjVDRZzb",
    "model_id": "eleven_multilingual_v2",
    "output_format": "mp3_44100_128"
  }' | jq

# 11) Poll job
curl -sS -H "Authorization: Bearer $token" \
  http://localhost:3020/v1/tts/jobs/<job_id> | jq

# 12) Download artifact when status=done
curl -L -o output.mp3 "$(curl -sS -H \"Authorization: Bearer $token\" http://localhost:3020/v1/tts/jobs/<job_id> | jq -r '.result.download_url')"
```

## Notes

- Queue backend is Redis (BullMQ).
- API nodes are stateless and safe to scale horizontally.
- Worker nodes can scale independently using `MAX_CONCURRENT_JOBS`.
- Postgres is required for all persistent store state.
- Artifacts are written locally when `STORAGE_BACKEND=local`.
- When `STORAGE_BACKEND=s3`, artifacts are uploaded to your S3-compatible bucket and `download_url` is a signed URL.
- Worker process is `src/worker.ts`.
- Store <-> checkout SDK bridge lives in:
  - `src/integrations/gwop.ts` (SDK boot/config)
  - `src/integrations/checkoutBridge.ts` (store-level billing helpers)
- API contract:
  - `speak-openapi.yaml`

## Next phase

- Webhook signature hardening and replay protection
- SQL migration/versioning workflow for Speak schema
- Durable TTS job history table for cross-process workers
