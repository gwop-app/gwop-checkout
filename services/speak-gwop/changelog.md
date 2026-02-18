# speak-gwop API changelog

## 2026-02-18

- Runtime architecture changes (stateless API):
  - Removed in-memory state fallbacks for agents, balances, credit orders, and TTS jobs.
  - Postgres is now required for all persistent state.
  - Added Redis-backed async queue (BullMQ) for TTS job execution.
  - Split execution into API process (`src/index.ts`) and worker process (`src/worker.ts`).
  - Added `speak_tts_jobs` table for durable job lifecycle records.
  - `GET /v1/voices` now requires Speak session auth.
- Updated OpenAPI contract (`speak-openapi.yaml`) to match metered production behavior:
  - Added agent identity endpoints (`/v1/agents/init/preflight`, `/v1/agents/init`, `/v1/agents/login`, `/v1/agents/status`)
  - Added credit lifecycle endpoints (`/catalog.json`, `/v1/credits/invoices`, `/v1/orders/{id}`, `/v1/credits/claim`)
  - Added TTS provider/async endpoints (`/v1/voices`, `/v1/tts/jobs`, `/v1/tts/jobs/{id}`)
  - Updated webhook contract for mapped invoice transitions (`/webhooks/gwop`)
- Simplified discovery payloads for low-context agents:
  - `GET /v1/agents/init/preflight` now gives concise init/login/token flow and required endpoints.
  - `GET /help` now leads with a clean quickstart while preserving checkout and delivery semantics.
- Added `GET /speak-openapi.yaml` so agents/tools can fetch the live API contract directly from the running service.
- Added `GET /skill.md` to serve the full Speak agent skill/playbook directly from the service domain.
- Delivery/storage changes:
  - Added S3-compatible object storage backend for artifacts.
  - Job results now return signed object URLs when `STORAGE_BACKEND=s3`.
- Renamed service API contract file from `openapi.yaml` to `speak-openapi.yaml` to keep it clearly separated from platform OpenAPI surfaces.
- Auth consistency:
  - `GET /v1/voices` now requires Speak session auth, same as the rest of account-bound TTS operations.
