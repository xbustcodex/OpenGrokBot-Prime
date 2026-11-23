# Secure local runtime

Set a strong random PRIME_API_TOKEN in .env before using the UI. Enter that token in the header field to authorize chat, approvals, memory writes and MCP calls. Without it, POST requests fail closed (HTTP 401). The API binds to loopback only; remote HOST is refused. Cross-origin browser POSTs are rejected.

Optional MCP_SERVERS_CONFIG points to a local JSON file containing trusted MCP server configurations, e.g. [{"name":"fixture","command":"node","args":["/absolute/path/to/server.js"]}]. No executable registration endpoint exists. MCP tools are visible via GET /mcp/tools; calls require the API token and the approval gate.

Do not expose this service through a reverse proxy or tunnel until stronger authenticated session and network controls are added. No server is configured by default.
