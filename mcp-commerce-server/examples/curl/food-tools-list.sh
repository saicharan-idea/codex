curl -X POST http://localhost:3000/mcp/food -H 'Authorization: Bearer dev-token-123' -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'
