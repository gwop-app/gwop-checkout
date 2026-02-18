---
name: speak-gwop
version: 1.0.0
description: Full agent playbook for using Speak end-to-end: discovery, init/login, credits, invoices, claims, TTS jobs, polling, and audio retrieval.
homepage: https://speak.gwop.io
metadata: {"category":"voice","skill_type":"store","payment":"gwop-checkout"}
---

# Speak Skill

Use this skill to operate `speak.gwop.io` as an agent user with zero prior context.

## What Speak Is

Speak is an agent-native TTS store:
- identity/auth lives in Speak (`agent_id`, `login_code`, session token)
- checkout settlement uses Gwop invoice infrastructure
- credits are prepaid characters
- TTS jobs are async (`queued -> running -> done|failed`)

## Non-Negotiable Rules

- Always call `GET /help` first.
- Optionally fetch full contract at `GET /speak-openapi.yaml`.
- Speak auth is separate from Gwop wallet auth.
- `login_code` is shown once from `POST /v1/agents/init`; persist immediately.
- Never send Gwop private keys to Speak endpoints.
- Protected endpoints require Speak session token.

## Endpoints You Must Know

Discovery/public:
- `GET /help`
- `GET /speak-openapi.yaml`
- `GET /health`
- `GET /v1/agents/init/preflight`
- `POST /v1/agents/init`
- `POST /v1/agents/login`
- `GET /catalog.json`

Session-required:
- `GET /v1/agents/status`
- `POST /v1/credits/invoices`
- `GET /v1/orders/{order_id}`
- `POST /v1/credits/claim`
- `GET /v1/voices`
- `POST /v1/tts/jobs`
- `GET /v1/tts/jobs/{job_id}`

Infra:
- `POST /webhooks/gwop` (store internal)

## Auth Model

Primary session header:
- `Authorization: Bearer <speak_access_token>`

Alternate session header:
- `x-speak-access-token: <speak_access_token>`

Optional deployment gate:
- `x-api-key: <MASTER_API_KEY>` only if `/help` says it is required.

## Persistence Contract (Do This Exactly)

Persist at minimum:
- `base_url`
- `agent_id`
- `login_code`
- `session.token`
- `session.expires_at`
- `orders[order_id]` with `invoice_id`, `sku`, `quantity`, `status`
- `jobs[job_id]` with `status`, `estimated_chars`, `result.download_url` when ready

Suggested state shape:

```json
{
  "base_url": "https://speak.gwop.io",
  "agent": {
    "agent_id": "spk_agent_...",
    "login_code": "spk_lc_...",
    "token": "spk_at_...",
    "token_expires_at": "2026-02-19T00:00:00.000Z"
  },
  "orders": {},
  "jobs": {}
}
```

## Decision Workflow

1. Bootstrap
- Call `GET /help`.
- If available, call `GET /v1/agents/init/preflight` and `GET /speak-openapi.yaml`.

2. Ensure identity
- If no `agent_id/login_code`: call `POST /v1/agents/init`.
- Persist both immediately.

3. Ensure session
- If no token or token expired: call `POST /v1/agents/login`.
- Persist token and expiry.

4. Check balance
- Call `GET /v1/agents/status`.
- Use `characters_remaining` for spend decisions.

5. Buy credits when needed
- Call `GET /catalog.json`.
- Select SKU by required chars.
- Call `POST /v1/credits/invoices`.
- Persist `order_id`, `invoice_id`, `pay_url`, `expires_at`.

6. Confirm/claim credits
- After payment, call `POST /v1/credits/claim` with `invoice_id`.
- If `INVOICE_NOT_PAID`, wait and retry or check order state.
- Use `GET /v1/orders/{order_id}` for reconciliation.

7. Create TTS job
- Call `POST /v1/tts/jobs` with text/options.
- Persist `job_id`, `estimated_chars`, `poll_url`.

8. Poll result
- Poll `GET /v1/tts/jobs/{job_id}` every 2-5s.
- Terminal states: `done`, `failed`.
- On `done`, use `result.download_url`.

9. Download artifact
- Retrieve audio from `result.download_url`.
- If URL expired, poll job endpoint again for refreshed signed URL.

## Request/Response Patterns

Create account:

```bash
curl -sS -X POST "$BASE_URL/v1/agents/init" \
  -H "Content-Type: application/json" \
  -d '{"agent_name":"my-agent"}'
```

Login:

```bash
curl -sS -X POST "$BASE_URL/v1/agents/login" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"spk_agent_...","login_code":"spk_lc_..."}'
```

Create credit invoice:

```bash
curl -sS -X POST "$BASE_URL/v1/credits/invoices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"tts-1k","quantity":1}'
```

Claim credits:

```bash
curl -sS -X POST "$BASE_URL/v1/credits/claim" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invoice_id":"..."}'
```

Create TTS job:

```bash
curl -sS -X POST "$BASE_URL/v1/tts/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text":"Hello from Speak.",
    "voice_id":"JBFqnCBsd6RMkjVDRZzb",
    "model_id":"eleven_multilingual_v2",
    "output_format":"mp3_44100_128"
  }'
```

Poll job:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/v1/tts/jobs/$JOB_ID"
```

## Pricing and Metering

Use `GET /catalog.json` as source of truth.
- Prices are in USDC minor units.
- Credits are character-based.
- `POST /v1/tts/jobs` reserves estimated chars.
- Worker reconciles final usage after provider response.

## Operational Limits

- Max text length per TTS request: 5000 chars.
- Insufficient credits returns HTTP `402` with required vs remaining details.
- Job completion depends on worker availability.

## Error Handling Guide

- `401 UNAUTHORIZED` / `INVALID_TOKEN`: re-login and retry.
- `402 INSUFFICIENT_CREDITS`: buy+claim more credits.
- `404 SKU_NOT_FOUND`: refresh catalog and retry with valid SKU.
- `404 INVOICE_NOT_FOUND`: verify persisted invoice/order mapping.
- `409 INVOICE_NOT_PAID`: payment not settled yet; retry claim later.
- `404 JOB_NOT_FOUND`: verify job_id and owning agent.
- `403 FORBIDDEN`: resource does not belong to current agent.
- `5xx`: transient failure; retry with backoff.

## Recovery Playbook

If process crashes mid-flow:
- Recover token with `agent_id + login_code` via login.
- Recover order state via persisted `order_id` and `GET /v1/orders/{order_id}`.
- Recover job state via persisted `job_id` and `GET /v1/tts/jobs/{job_id}`.

## Final Checklist Before Autonomous Use

- Can initialize agent and persist one-time `login_code`.
- Can obtain/re-obtain session token.
- Can purchase, pay, and claim credits.
- Can create and poll async TTS jobs.
- Can retrieve and store final audio URL.
