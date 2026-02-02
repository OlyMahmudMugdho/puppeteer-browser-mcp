# Puppeteer Browser MCP Server

This guide explains how to install, build, and run the **Puppeteer Browser MCP Server**, which allows Claude to fetch webpage content (text, links, images, and metadata) via an SSE transport.

---

## Features

* Reads any webpage and returns structured JSON:

  * Text content
  * Links
  * Images
  * Language and metadata
* Uses Puppeteer for headless browsing
* SSE transport to communicate with Claude
* Easy to build and run with TypeScript support

---

## Requirements

* Node.js v18+
* npm or yarn
* Puppeteer dependencies (bundled with npm install)

---

## Installation

1. **Clone the repository**:

```bash
git clone https://github.com/OlyMahmudMugdho/puppeteer-browser-mcp
cd puppeteer-browser-mcp
```

2. **Install dependencies**:

```bash
npm install
# or
yarn install
```

---

## Build and Run

The project is written in TypeScript. You can either run it directly in development mode or build it first.

### Development Mode (no build required)

```bash
npm run dev
# or
yarn dev
```

This uses `ts-node-esm` to run `index.ts` directly. You should see:

```
🚀 Server running on port 3000
```

### Production Mode (build first)

```bash
npm run build
# or
yarn build
```

Then start the built server:

```bash
npm start
# or
yarn start
```

The compiled code will run from `dist/index.js`.

---

## Connecting with Claude

To install this MCP server in Claude, run:

```bash
claude mcp add --transport sse --scope user read-webpage http://localhost:3000/sse/
```

Explanation:

* `--transport sse` → Uses SSE for communication
* `--scope user` → Grants user-level permissions
* `read-webpage` → MCP server name
* `http://localhost:3000/sse/` → URL where the server is running

---

## How It Works

1. **SSE Endpoint**: `/sse` handles SSE connections to Claude.
2. **Tool Registration**: `read_webpage` accepts a URL and returns structured webpage data as JSON.
3. **Page Scraping**:

   * Uses Puppeteer in headless mode
   * Captures page title, text, links, images, and language
   * Returns data with a `scrapedAt` timestamp
4. **Error Handling**: Any errors during scraping are returned in the `isError` field.

---

## Example Usage in Claude

Ask Claude:

```text
Read the page at http://example.com and summarize its content
```

Response JSON will include:

* `title`
* `text`
* `links`
* `images`
* `language`
* `metadata.scrapedAt`

---

## Notes

* Puppeteer may require additional Linux dependencies (`libnss3`, `libx11-xcb1`, etc.).
* By default, Puppeteer runs headless with sandbox disabled.
* Limits:

  * Max 20 links per page
  * Max 10 images per page
  * Page load timeout: 30s