import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
const PORT = process.env.PORT || 3000;
const MAX_LINKS = parseInt(process.env.MAX_LINKS || "20", 10);
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || "10", 10);
const PAGE_TIMEOUT = parseInt(process.env.PAGE_TIMEOUT || "30000", 10);
const app = express();
app.use(cors());
const server = new Server({ name: "web-page-reader", version: "1.0.0" }, { capabilities: { tools: {} } });
let transport = null;
async function getPageData(url) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "networkidle0", timeout: PAGE_TIMEOUT });
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
    }
    finally {
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
        }],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "read_webpage") {
        const url = request.params.arguments?.url;
        try {
            const pageData = await getPageData(url);
            return { content: [{ type: "text", text: pageData }] };
        }
        catch (error) {
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
    }
    catch (err) {
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
    }
    catch (err) {
        if (!res.headersSent)
            res.status(500).send("Internal Error");
    }
});
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
