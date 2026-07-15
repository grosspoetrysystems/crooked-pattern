# crooked-pattern-mcp

MCP server for [crooked-pattern](https://www.npmjs.com/package/crooked-pattern), the Agentic Readiness Score (ARS) scanner. This is a thin wrapper package so MCP client configs can launch the server directly:

```json
{
  "mcpServers": {
    "ars": {
      "command": "npx",
      "args": ["crooked-pattern-mcp"]
    }
  }
}
```

The server speaks MCP over stdio by default and exposes the `scan_site` tool. HTTP/SSE transport is opt-in only:

```sh
npx crooked-pattern-mcp --transport sse --port 3339
```

All functionality lives in the `crooked-pattern` package; this wrapper just re-exposes its `ars-mcp` bin.
