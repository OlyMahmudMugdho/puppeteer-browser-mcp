import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { DuckDuckGoSearchService } from "./duckduckgo-search.service.js";
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const PORT = process.env.PORT || 3000;
const MAX_LINKS = parseInt(process.env.MAX_LINKS || "20", 10);
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || "10", 10);
const PAGE_TIMEOUT = parseInt(process.env.PAGE_TIMEOUT || "60000", 10);
const DDG_MAX_RESULTS = parseInt(process.env.DDG_MAX_RESULTS || "10", 10);

const app = express();
app.use(cors());

const server = new Server(
  { name: "web-page-reader", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const searchService = new DuckDuckGoSearchService({ pageTimeout: PAGE_TIMEOUT });

let transport: SSEServerTransport | null = null;

async function getPageData(url: string) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT });
    
    const data = await page.evaluate((maxLinks, maxImages) => ({
      title: document.title,
      text: document.body.innerText.trim(),
      links: [...document.querySelectorAll("a")].slice(0, maxLinks).map(a => ({ 
        href: a.href, 
        text: a.textContent?.trim() || "" 
      })),
      images: [...document.querySelectorAll("img")].slice(0, maxImages).map(img => ({ 
        src: img.src, 
        alt: img.alt || null 
      })),
      language: document.documentElement.lang || "unknown"
    }), MAX_LINKS, MAX_IMAGES);

    return JSON.stringify({ 
      url, 
      ...data, 
      metadata: { scrapedAt: new Date().toISOString() } 
    }, null, 2);
  } finally {
    await browser.close();
  }
}

async function getPageMarkdown(url: string) {
  const browser = await puppeteer.launch({ 
    headless: true,
    protocolTimeout: 60000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-features=site-per-process",
      "--disable-features=IsolateOrigins",
      "--disable-web-security"
    ]
  });
  
  async function safeOperation<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (error.message?.includes('Navigating frame was detached') || 
            error.message?.includes('Execution context was destroyed') ||
            error.message?.includes('Target closed')) {
          console.log(`Retry ${i + 1}/${maxRetries} after error: ${error.message}`);
          if (i < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }
  
  try {
    return await safeOperation(async () => {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(PAGE_TIMEOUT);
      page.setDefaultTimeout(PAGE_TIMEOUT);
      
      const response = await page.goto(url, { 
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT
      });
      
      if (!response) {
        throw new Error("No response received from the server");
      }
      
      if (response.status() >= 400) {
        throw new Error(`HTTP error: ${response.status()}`);
      }
      
      if (page.url().startsWith("chrome-error://")) {
        throw new Error("Browser error page loaded");
      }
      
      await page.waitForFunction(() => document.readyState === "complete");
      
      const html = await page.content();
      
      const doc = new JSDOM(html, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();
      
      if (!article || !article.content) {
        throw new Error("Could not extract article content");
      }
      
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
      });
      const markdown = turndownService.turndown(article.content);

      return JSON.stringify({
        title: article.title,
        description: article.excerpt,
        markdown,
        url
      }, null, 2);
    });
  } finally {
    await browser.close();
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "read_webpage",
    description: "Fetches a URL and returns the text, links, and metadata as JSON.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL of the webpage to read" }
      },
      required: ["url"],
    },
  }, {
    name: "read_webpage_markdown",
    description: "Fetches a URL and returns the full page content converted to markdown format for detailed overview.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL of the webpage to read" }
      },
      required: ["url"],
    },
  }, {
    name: "duckduckgo_search",
    description: "Search DuckDuckGo and return URL and title for each result.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of search results to return",
          minimum: 1,
          maximum: 50,
          default: 10
        }
      },
      required: ["query"],
    },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "read_webpage") {
    const url = request.params.arguments?.url as string;
    try {
      const pageData = await getPageData(url);
      return { content: [{ type: "text", text: pageData }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }

  if (request.params.name === "read_webpage_markdown") {
    const url = request.params.arguments?.url as string;
    try {
      const pageData = await getPageMarkdown(url);
      return { content: [{ type: "text", text: pageData }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }

  if (request.params.name === "duckduckgo_search") {
    const query = request.params.arguments?.query as string;
    const maxResults = request.params.arguments?.maxResults as number;

    if (!query) {
      return {
        content: [{ type: "text", text: "Error: 'query' parameter is required" }],
        isError: true
      };
    }

    try {
      const results = await searchService.search(query, maxResults || DDG_MAX_RESULTS);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }

  throw new Error("Tool not found");
});

app.get("/sse", async (req, res) => {
  console.log("Client connecting to SSE...");
  transport = new SSEServerTransport("/messages", res);
  try {
    await server.connect(transport);
    console.log("MCP Server connected to SSE transport.");
  } catch (err) {
    console.error("Failed to connect:", err);
  }
  req.on("close", () => {
    transport = null;
  });
});

app.post("/messages", express.json(), async (req, res) => {
  if (!transport) {
    return res.status(400).json({ error: "No session" });
  }
  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(500).send("Internal Error");
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
