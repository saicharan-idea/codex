# MCP Commerce Server (Zomato + Blinkit developer platform)
Mock-first developer MCP platform for food + grocery domains.

## Architecture
User/Agent -> JSON-RPC MCP -> Tool Registry -> Domain Services -> In-memory mocks.

## Endpoints
- GET /health
- GET /version
- GET /docs
- GET /llms.txt
- GET /llms-full.txt
- POST /mcp/food
- POST /mcp/grocery
- POST /mcp/combined
- GET /events (SSE realtime updates)

## Setup
```bash
cp .env.example .env
npm install
npm run dev
```

## Auth
Bearer token required for MCP routes. Use `DEV_AUTH_TOKEN` value.

## Protocol
Methods: `tools/list`, `tools/meta`, `tools/call`.

## Testing
```bash
npm run typecheck
npm test
npm run build
```

## Deployment
- Dockerfile and docker-compose included.

## Safety guarantees
- Mock-mode only: no real payment/order execution.
- High-risk tools require `user_confirmation=true`.
- Input validation via Zod.
- Rate limit + audit logging + masked tokens.

## Replace mocks
Swap `src/services/*` internals with real provider adapters.


## Real-time support
Use `GET /events` (Server-Sent Events) to receive cart/order/checkout updates emitted by mutating tools.
