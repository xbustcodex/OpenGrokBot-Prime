# MCP stdio integration

Implements newline-delimited JSON-RPC 2.0 over stdio: initialize, notifications/initialized, paginated tools/list and tools/call. Request IDs, timeouts, cleanup, namespace isolation, JSON Schema validation (Ajv), concurrency and audit metadata are included.

Run offline integration tests with npm run test:mcp. The fixture runs only a local Node.js subprocess and does not contact external accounts.

All tool calls require approval; when MCP approval is disabled by configuration, calls fail closed.

Security limitations: the HTTP approvals resolve endpoint is unauthenticated, so never publicly expose the API. There is no API to register servers; an authenticated server management interface and model-tool integration are separate work.
