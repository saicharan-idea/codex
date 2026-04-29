# Zomato + Blinkit MCP Implementation Blueprint

## CONFIRMED vs INFERRED
- **CONFIRMED (reference MCP docs):** 3 MCP servers (Food, Instamart, Dineout), streamable HTTP MCP, OAuth 2.1 + PKCE, server endpoints pattern (`/food`, `/im`, `/dineout`), tool-driven agent loop.
- **INFERRED (engineering design):** Equivalent architecture for Zomato/Blinkit, exact tool names/schemas below, internal microservice boundaries, resilience/security controls.

### 1. SYSTEM OVERVIEW
- LLM agent acts as planner; MCP server acts as policy + execution facade; domain services execute commerce operations.
- Split MCP by domain for isolation and independent scaling: `/food` (Zomato-like), `/grocery` (Blinkit-like), optional `/dineout`.
- Client performs OAuth 2.1 + PKCE, obtains access token, calls MCP JSON-RPC methods.
- Agent loop: `list_tools` → choose tool by intent/state → invoke → inspect result/errors → decide next tool.
- Tool registry is runtime-queryable and versioned (`v1`, `v2`) to support safe evolution.
- Tool execution engine enforces authz, schema validation, idempotency, and domain invariants.
- Domain services are stateless APIs backed by carts/orders/inventory/payment providers.
- Read tools return normalized DTOs; write tools return operation receipts + next allowed actions.
- Observability captures per-tool latency, failure code, and business outcome (conversion/fallback).
- Safety rails enforce explicit user confirmation before irreversible actions (order placement/payment).

### 2. ARCHITECTURE DIAGRAM (ASCII)
```text
User
  ↓
LLM Agent (planner, policy prompt)
  ↓
MCP Client SDK (tool discovery + JSON-RPC)
  ↓
Auth Layer (OAuth2.1/PKCE, token vault, session)
  ↓
Transport Layer (HTTP + JSON-RPC 2.0)
  ↓
MCP API Gateway
  ├── /food (Zomato MCP Server)
  │     ├── Tool Registry
  │     ├── Dispatcher/Validator
  │     └── Food Domain Adapters
  ├── /grocery (Blinkit MCP Server)
  │     ├── Tool Registry
  │     ├── Dispatcher/Validator
  │     └── Grocery Domain Adapters
  └── /dineout (optional)
        └── ...

Domain Services:
  RestaurantService | MenuService | CartService | OrderService
  TrackingService | InventoryService | Pricing/PromoService

Data/External:
  PostgreSQL/Redis | Search index | Payment gateway | Maps/Geo | Notification providers
```

### 3. CORE MCP SERVER DESIGN
#### 3.1 Server Layer
- `POST /food` → JSON-RPC endpoint (all food tools).
- `POST /grocery` → JSON-RPC endpoint (all grocery tools).
- `POST /dineout` → optional reservation flow.
- `GET /.well-known/oauth-authorization-server` and `GET /.well-known/openid-configuration` for auth metadata.
- `GET /health`, `GET /ready`, `GET /metrics`.

#### 3.2 Tool Registry
- Dynamic registry interface:
  - `tools.list(domain, version, userContext)`
  - `tools.get(name)`
- JSON schema contract:
```json
{
  "name": "restaurant_search",
  "description": "Search restaurants by query/location/cuisine",
  "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
  "output_schema": {"type": "object", "properties": {"results": {"type": "array"}}},
  "read_only": true,
  "version": "1.0.0"
}
```

#### 3.3 Tool Execution Engine
- Pipeline: authenticate → authorize scopes → validate input → dispatch → map result → policy filter.
- Dispatcher map:
```ts
const HANDLERS = {
  restaurant_search: foodHandlers.restaurantSearch,
  menu_fetch: foodHandlers.menuFetch,
  cart_update: commonHandlers.cartUpdate,
  place_order: commonHandlers.placeOrder,
};
```
- Validation: AJV/Zod; reject unknown fields; strict enum/format checks.
- Error model: typed error envelope (`INVALID_ARGUMENT`, `UNAUTHORIZED`, `OUT_OF_STOCK`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`).

#### 3.4 Auth Layer
- OAuth 2.1 + PKCE (Auth Code flow):
  1. Client generates `code_verifier`, `code_challenge`.
  2. Browser redirect to auth server with scopes (`food.read`, `food.write`, `grocery.read`, etc.).
  3. Callback exchanges code + verifier for tokens.
  4. Access token attached as `Bearer` for MCP calls.
- Token storage: encrypted at rest (KMS), per-user key wrapping, short-lived access tokens + refresh rotation.
- Session handling: device/session binding, revocation endpoint, inactivity timeout.

#### 3.5 Transport
- JSON-RPC 2.0 over HTTP POST.
- Request:
```json
{"jsonrpc":"2.0","id":"req-123","method":"tools/call","params":{"name":"product_search","arguments":{"query":"milk"}}}
```
- Response:
```json
{"jsonrpc":"2.0","id":"req-123","result":{"items":[{"name":"Amul Milk 500ml"}]}}
```
- Error:
```json
{"jsonrpc":"2.0","id":"req-123","error":{"code":4001,"message":"OUT_OF_STOCK","data":{"sku":"..."}}}
```

### 4. TOOL DEFINITIONS (TABLES)
#### FOOD (Zomato equivalent)
| Tool name | Input schema | Output schema | Type | Validation rules |
|---|---|---|---|---|
| restaurant_search | `{query:string, location:{lat:number,lng:number}, cuisine?:string[], page?:number}` | `{restaurants:[{public_id,name,eta_min,rating,cost_for_two}], next_page?:number}` | read | query 2–80 chars; lat/lng required; page>=1 |
| menu_fetch | `{restaurant_public_id:string, page?:number, category?:string}` | `{restaurant:{public_id,name}, menu_items:[{item_public_id,name,price,variants?,addons?}]}` | read | restaurant id opaque/public only |
| cart_update | `{cart_id?:string, restaurant_public_id:string, ops:[{op:add\|remove\|set_qty,item_public_id:string,qty?:number,variant_id?:string,addon_ids?:string[]}]}` | `{cart_id, items:[...], subtotal, taxes, delivery_fee, total, currency}` | write | single restaurant/cart; qty 1–20; variant compatibility |
| place_order | `{cart_id:string, address_public_id:string, payment_mode:COD\|ONLINE, user_confirmed:boolean}` | `{order_public_id,status,eta_min,payable_amount}` | write | `user_confirmed=true` required; cart freshness <2 min |
| track_order | `{order_public_id:string}` | `{order_public_id,status,timeline:[{state,ts}], rider?:{name,phone_masked,location?}}` | read | ownership check; rate-limit polling |

#### GROCERY (Blinkit equivalent)
| Tool name | Input schema | Output schema | Type | Validation rules |
|---|---|---|---|---|
| product_search | `{query:string, location:{lat:number,lng:number}, filters?:{brand?:string,category?:string}, page?:number}` | `{products:[{sku_public_id,name,size,price,mrp,inventory_status}], next_page?:number}` | read | query 2–80; location mandatory |
| cart_ops | `{cart_id?:string, ops:[{op:add\|remove\|set_qty,sku_public_id:string,qty?:number,substitution_pref?:allow\|deny}]}` | `{cart_id, lines:[...], subtotal, surge_fee?, delivery_fee, total}` | write | qty cap per SKU; stock re-check each op |
| checkout | `{cart_id:string, address_public_id:string, slot_id?:string, payment_mode:COD\|ONLINE, user_confirmed:boolean}` | `{order_public_id,status,packed_items:[...], substituted_items?:[...]}` | write | address serviceability; user_confirmed true |
| tracking | `{order_public_id:string}` | `{order_public_id,status,picker_stage,rider_stage,eta_min}` | read | owner-only visibility |

### 5. BACKEND SERVICE DESIGN
- **RestaurantService**
  - Responsibilities: discovery, ranking, serviceability.
  - Methods: `searchRestaurants(ctx, query)`, `getRestaurant(publicId)`.
  - Dependencies: GeoService, SearchIndex, Rating store.
- **MenuService**
  - Responsibilities: menu catalog, variants/add-ons, availability windows.
  - Methods: `getMenu(restaurantId, page, category)`, `validateSelection(item, variant, addons)`.
  - Dependencies: Catalog DB, PricingService.
- **CartService**
  - Responsibilities: cart state machine, pricing snapshots, coupon application.
  - Methods: `mutateCart(cartId, ops)`, `reprice(cartId)`, `getCart(cartId)`.
  - Dependencies: Redis/Postgres, PromoService, TaxService.
- **OrderService**
  - Responsibilities: pre-checkout validation, order creation, payment orchestration.
  - Methods: `createOrder(cartId, addressId, paymentMode)`, `confirmPayment(orderId)`.
  - Dependencies: CartService, PaymentGateway, FraudService.
- **TrackingService**
  - Responsibilities: status timeline and rider updates.
  - Methods: `getOrderStatus(orderId)`, `subscribeUpdates(orderId)`.
  - Dependencies: Dispatch system, Event bus.
- **InventoryService (Blinkit)**
  - Responsibilities: per-dark-store stock, reservations, substitutions.
  - Methods: `checkAvailability(sku, location)`, `reserve(sku, qty)`, `suggestSubstitutes(sku)`.
  - Dependencies: Warehouse OMS, Forecasting service.

### 6. ZOMATO MCP IMPLEMENTATION
- Endpoints: `POST /food` with tools `{restaurant_search, menu_fetch, cart_update, place_order, track_order}`.
- Tool mapping:
  - `restaurant_search` → RestaurantService.search + geofencing.
  - `menu_fetch` → MenuService.getMenu.
  - `cart_update` → CartService.mutate + MenuService.validateSelection.
  - `place_order` → OrderService.createOrder (+ payment initiation if ONLINE).
  - `track_order` → TrackingService.getOrderStatus.
- Cart/order lifecycle:
  1. Resolve address + serviceability.
  2. Build cart with strict single-merchant constraint.
  3. Reprice + lock totals for short TTL.
  4. Require explicit confirmation.
  5. Create order idempotently (`Idempotency-Key`).
- API integration strategy:
  - If official partner APIs unavailable, implement adapter boundary to swap mocked connectors with official SDK/API later.
  - Use anti-corruption layer to normalize partner payloads into MCP DTOs.
- Constraints:
  - OAuth redirect whitelist exact-match URIs.
  - API restrictions (rate caps, allowed scopes, sandbox/prod split).
  - Payment limitations: if partner disallows payment-token pass-through, support COD-first + hosted payment URL handoff.

### 7. BLINKIT MCP IMPLEMENTATION
- Inventory-aware flow: every read/write depends on `location -> store -> SKU availability`.
- Location-based availability: mandatory lat/lng or address id before meaningful search/cart.
- SKU + variants: represent each sellable as `sku_public_id` + pack size/brand attrs; enforce min/max quantity rules.
- Substitution logic:
  - At cart time capture preference (`allow/deny`).
  - At pick-pack time auto-suggest top substitutes by brand/price/size similarity.
  - Expose substitutions in checkout/tracking results with acceptance workflow.

### 8. AGENT LOGIC (IMPORTANT)
**System prompt (recommended):**
```text
You are a commerce orchestration agent using MCP tools.
Rules:
1) Never place an order unless user has explicitly confirmed the final cart and payable amount in this chat turn.
2) Before checkout/place_order, always call get_cart/cart read tool to refresh totals and availability.
3) Offer at most 3-5 options for restaurants/products unless user asks for more.
4) On tool failures, explain succinctly, recover with next-best tool/action, and ask one focused follow-up question.
5) Never reveal internal/private IDs; only expose public references and user-friendly labels.
6) If inventory/pricing changed, inform user and request reconfirmation.
7) Use idempotency key semantics for retries on write tools.
8) Respect scope boundaries: food tools for food, grocery tools for grocery.
```

### 9. REPO STRUCTURE
```text
/mcp-server
  /src
    server.ts
    config.ts
    auth/
      oauth.ts
      tokenStore.ts
      session.ts
    transport/
      jsonRpc.ts
      http.ts
    registry/
      toolRegistry.ts
      schemas.ts
    engine/
      dispatcher.ts
      validator.ts
      errors.ts
    tools/
      food/*.ts
      grocery/*.ts
    services/
      RestaurantService.ts
      MenuService.ts
      CartService.ts
      OrderService.ts
      TrackingService.ts
      InventoryService.ts
    adapters/
      zomatoAdapter.ts
      blinkitAdapter.ts
      paymentAdapter.ts
    middleware/
      authz.ts
      rateLimit.ts
      audit.ts
    observability/
      logs.ts
      metrics.ts
      tracing.ts
  package.json
  tsconfig.json
```
- Language: **TypeScript (preferred)**.
- Frameworks: Fastify/NestJS (HTTP), Ajv or Zod (schemas), pino (logging), OpenTelemetry (tracing), Redis + Postgres.

### 10. SECURITY
- OAuth: PKCE mandatory, strict redirect URI matching, scope minimization, refresh-token rotation + revocation.
- Token storage: envelope encryption (KMS), hashed token lookup, no plaintext tokens in logs.
- PII safety: field-level redaction (phone/address), least-privilege access, audit trails.
- Rate limiting: per-user + per-client + per-tool quotas, adaptive throttling with `Retry-After`.
- Abuse prevention: bot heuristics, velocity checks, suspicious order challenge, idempotency on writes.
- Prompt-injection protection: tool argument allowlists, schema enforcement, deny raw instruction injection into downstream APIs.

### 11. MVP PLAN (4 WEEKS)
- **Week 1**: Foundation
  - MCP server skeleton (`/food`, `/grocery`), JSON-RPC transport, OAuth PKCE stub, tool registry + 2 read tools.
- **Week 2**: Food journey
  - Implement restaurant_search/menu_fetch/cart_update; pricing + cart persistence; basic agent policy tests.
- **Week 3**: Grocery journey
  - product_search/cart_ops/checkout/tracking; inventory + substitution engine; location serviceability.
- **Week 4**: Hardening + go-live prep
  - Security controls, observability dashboards, load tests, runbooks, sandbox pilot with failure drills.

## BONUS
### Minimal MCP tool handler (TypeScript)
```ts
export async function callTool(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { name, arguments: args } = req.params;
  const tool = registry.get(name);
  validator.assert(tool.inputSchema, args);
  const result = await dispatcher.execute(name, args, req.context);
  return ok(req.id, result);
}
```

### Example JSON-RPC call
```json
{"jsonrpc":"2.0","id":"42","method":"tools/call","params":{"name":"restaurant_search","arguments":{"query":"biryani","location":{"lat":12.93,"lng":77.62}}}}
```

### Sample tool schema
```json
{
  "name": "checkout",
  "input_schema": {
    "type": "object",
    "required": ["cart_id", "address_public_id", "payment_mode", "user_confirmed"],
    "properties": {
      "cart_id": {"type": "string"},
      "address_public_id": {"type": "string"},
      "payment_mode": {"type": "string", "enum": ["COD", "ONLINE"]},
      "user_confirmed": {"type": "boolean", "const": true}
    },
    "additionalProperties": false
  }
}
```
