import puppeteer from "puppeteer";

class DuckDuckGoSearchService {
  private readonly baseUrl: string;
  private readonly pageTimeout: number;

  constructor(config: { pageTimeout?: number } = {}) {
    this.baseUrl = "https://duckduckgo.com/";
    this.pageTimeout = config.pageTimeout || 30000;
  }

  async search(query: string, maxResults: number = 10): Promise<any[]> {
    const searchUrl = `${this.baseUrl}?q=${encodeURIComponent(query)}`;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();
      
      // Professional standard: Set a real User-Agent to avoid bot-blocking
      await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

      await page.goto(searchUrl, {
        waitUntil: "networkidle2",
        timeout: this.pageTimeout
      });

      // Wait for modern React results or fall back immediately
      await page.waitForSelector('article[data-testid="result"]', { timeout: 5000 }).catch(() => {
        console.log("Modern UI not detected, checking legacy selectors...");
      });

      const results = await page.evaluate((max) => {
        // Try Modern React UI Selectors
        let items = Array.from(document.querySelectorAll('article[data-testid="result"]'));
        
        // Try Legacy/Simplified UI Selectors if React isn't present
        if (items.length === 0) {
          items = Array.from(document.querySelectorAll('.result__body'));
        }

        return items.slice(0, max).map(el => {
          const anchor = el.querySelector('a[data-testid="result-title-a"]') || el.querySelector('.result__a');
          const snippet = el.querySelector('[data-result-snippet-container="true"]') || el.querySelector('.result__snippet');
          
          return {
            title: anchor?.textContent?.trim() || "No title",
            url: (anchor as HTMLAnchorElement)?.href || "",
            description: snippet?.textContent?.trim() || ""
          };
        });
      }, maxResults);

      return results;
    } finally {
      await browser.close();
    }
  }
}

export { DuckDuckGoSearchService };
export default DuckDuckGoSearchService;
