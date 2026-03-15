# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server that exposes the Ed Discussion (edstem.org) API to Claude and other MCP clients. It runs over stdio transport and provides 22 tools and 2 resources for interacting with Ed courses, threads, comments, and users.

## Commands

```bash
npm run build        # TypeScript compile (tsc) → dist/
npm run dev          # Watch mode (tsc --watch)
npm run start        # Run the server (node dist/index.js)
npm run inspect      # Launch MCP Inspector for interactive testing
```

Always `npm run build` before `npm run start` — there's no dev server with hot reload.

## Environment Variables

- `ED_API_TOKEN` (required) — Ed API token from https://edstem.org/us/settings/api-tokens
- `ED_REGION` (optional, default `"us"`) — region prefix (e.g., `us`, `au`)

## Architecture

Four source files in `src/`, ESM (`"type": "module"`), strict TypeScript:

- **`index.ts`** — MCP server entry point. Registers all tools and resources using `@modelcontextprotocol/sdk`. Each tool handler follows the pattern: validate input via zod schemas → call `EdApiClient` → return `ok(data)` or `fail(err)`. Thread action tools (lock/unlock/pin/etc.) are registered in a loop.
- **`api.ts`** — `EdApiClient` class wrapping Ed's REST API with `fetch`. All HTTP goes through the private `request<T>()` method. `EdApiError` carries status + body for structured error reporting.
- **`content.ts`** — Bidirectional content conversion. `markdownToEdXml()` converts markdown to Ed's XML `<document>` format. `edXmlToPlainText()` strips XML tags for search. Content starting with `<document` bypasses conversion (raw XML passthrough).
- **`types.ts`** — TypeScript interfaces for Ed API request/response shapes (reverse-engineered, not from an official schema).

## Key Patterns

- Tool input schemas use `zod`; no separate validation layer.
- Content (threads/comments) always goes through markdown→XML conversion unless it already starts with `<document`.
- The `editThread` method in the API client fetches the current thread first, then merges changes — partial updates are supported at the tool level.
- The `search_threads` tool does client-side filtering (fetches threads, then filters by query) rather than using a server-side search endpoint.
