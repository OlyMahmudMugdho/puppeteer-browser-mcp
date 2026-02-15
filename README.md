# Puppeteer Browser MCP Server

This guide explains how to install, build, and run the **Puppeteer Browser MCP Server**, which allows Claude to fetch webpage content (text, links, images, and metadata) via an SSE transport.

---

## Features

* **read_webpage** - Reads any webpage and returns structured JSON:
  * Text content
  * Links
  * Images
  * Language and metadata
* **read_webpage_markdown** - Converts webpage to clean markdown format:
  * Uses Mozilla Readability for content extraction
  * Removes navigation, sidebar, footer, ads
  * Returns clean article content with title and description
  * Ideal for detailed page overviews and LLM processing
* **duckduckgo_search** - Search DuckDuckGo and return results
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

## Configuration

You can configure the server using the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the server listens on | `3000` |
| `MAX_LINKS` | Max links to scrape per page | `20` |
| `MAX_IMAGES` | Max images to scrape per page | `10` |
| `PAGE_TIMEOUT` | Page load timeout in milliseconds | `60000` (60s) |
| `DDG_MAX_RESULTS` | Maximum search results per query | `10` |

Example:

```bash
PORT=4000 MAX_LINKS=50 npm start
```

---

## Build and Run

The project is written in TypeScript. Source code is located in the `src` directory. You can either run it directly in development mode or build it first.

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
2. **Tool Registration**: The server provides three tools:
   * `read_webpage` - Accepts a URL and returns structured webpage data as JSON
   * `read_webpage_markdown` - Converts a URL to clean markdown using Mozilla Readability
   * `duckduckgo_search` - Searches DuckDuckGo and returns search results with URLs and titles
3. **Page Scraping** (for `read_webpage`):
   * Uses Puppeteer in headless mode
   * Captures page title, text, links, images, and language
   * Returns data with a `scrapedAt` timestamp
4. **Markdown Conversion** (for `read_webpage_markdown`):
   * Uses Puppeteer to fetch fully rendered page
   * Extracts main content using Mozilla Readability
   * Converts to markdown using Turndown
   * Returns: title, description, markdown, url
5. **Search Functionality** (for `duckduckgo_search`):
   * Constructs DuckDuckGo search URL with encoded query
   * Uses Puppeteer to navigate to search results
   * Extracts URLs and titles from result links
   * Returns up to `DDG_MAX_RESULTS` search results
6. **Error Handling**: Any errors during operations are returned in the `isError` field.

---

## Example Usage in Claude

### Search Tool Example
Ask Claude:
```text
Search for TypeScript best practices and give me the top 5 results
```

Response JSON will include:
```json
[
  {
    "url": "https://www.typescriptlang.org/docs/best-practices.html",
    "title": "TypeScript - Best Practices"
  },
  {
    "url": "https://www.typescriptlang.org/docs/cheatsheets.html",
    "title": "TypeScript - Cheatsheets"
  }
]
```

### Reading Webpages Example
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

### Reading Webpages as Markdown Example
Ask Claude:
```text
Read the page at https://example.com and give me the full content in markdown
```

Response JSON will include:
* `title` - Page title
* `description` - Article excerpt/description
* `markdown` - Full page content in markdown format
* `url` - The URL that was scraped

This tool uses Mozilla Readability to extract clean article content, making it ideal for getting detailed page overviews.

---

## Notes

* Puppeteer may require additional Linux dependencies (`libnss3`, `libx11-xcb1`, etc.).
* By default, Puppeteer runs headless with sandbox disabled.
* Configurable Limits (defaults):
  * Max 20 links per page (`MAX_LINKS`)
  * Max 10 images per page (`MAX_IMAGES`)
  * Page load timeout: 60s (`PAGE_TIMEOUT`)