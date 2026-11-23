/**
 * Browser automation sandbox via Playwright.
 * Prefer a sandboxed browser per agent when possible.
 */
import { chromium, Browser, Page, BrowserContext } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { approvalGate } from "../approval/gate.js";

export class BrowserSandbox {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private dataDir: string;
  private headless: boolean;

  constructor() {
    this.dataDir = process.env.BROWSER_DATA_DIR || "./data/browser";
    this.headless = process.env.BROWSER_HEADLESS !== "false";
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  async ensure() {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  }

  async newPage(): Promise<Page> {
    await this.ensure();
    return this.context!.newPage();
  }

  async navigate(url: string, page?: Page): Promise<{ title: string; url: string; text: string }> {
    const p = page || (await this.newPage());
    const host = new URL(url).hostname;
    if (this.isSensitive(host)) {
      const ok = await approvalGate.request(
        "network_sensitive",
        `Navigate browser to ${url}`,
        { url },
        "medium"
      );
      if (!ok) throw new Error("Navigation denied by approval gate");
    }

    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await p.title();
    const text = await p.evaluate(() => document.body?.innerText?.slice(0, 8000) || "");
    return { title, url: p.url(), text };
  }

  async screenshot(page: Page, name = "shot"): Promise<string> {
    const out = path.join(this.dataDir, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: out, fullPage: false });
    return out;
  }

  async click(page: Page, selector: string) {
    await page.click(selector, { timeout: 10_000 });
  }

  async type(page: Page, selector: string, text: string) {
    await page.fill(selector, text);
  }

  async evaluate(page: Page, script: string): Promise<unknown> {
    return page.evaluate(script);
  }

  private isSensitive(host: string): boolean {
    const sensitive = ["bank", "paypal", "stripe", "admin", "login", "account"];
    return sensitive.some((s) => host.includes(s));
  }

  async close() {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }
}

export const browserSandbox = new BrowserSandbox();
