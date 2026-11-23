/**
 * Browser automation sandbox via Playwright.
 * Prefer a sandboxed browser per agent when possible.
 */
import { chromium, Browser, Page, BrowserContext } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { isIP } from "node:net";
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
      // Never disable Chromium sandbox for convenience.
      chromiumSandbox: true,
    });
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    await this.context.route("**/*", async route => {
      try {
        const target = new URL(route.request().url());
        if (!isPublicBrowserUrl(target)) return route.abort("blockedbyclient");
        return route.continue();
      } catch { return route.abort("blockedbyclient"); }
    });
  }

  async newPage(): Promise<Page> {
    await this.ensure();
    return this.context!.newPage();
  }

  async navigate(url: string, page?: Page): Promise<{ title: string; url: string; text: string }> {
    const p = page || (await this.newPage());
    const target = new URL(url);
    if (!isPublicBrowserUrl(target)) throw new Error("Browser navigation target blocked");
    const host = target.hostname;
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
    const allowed = await approvalGate.request("network_sensitive", "Browser click", { selector }, "high");
    if (!allowed) throw new Error("Browser click denied");
    await page.click(selector, { timeout: 10_000 });
  }

  async type(page: Page, selector: string, text: string) {
    const allowed = await approvalGate.request("network_sensitive", "Browser fill", { selector }, "high");
    if (!allowed) throw new Error("Browser fill denied");
    await page.fill(selector, text);
  }

  async evaluate(page: Page, script: string): Promise<unknown> {
    throw new Error("Arbitrary browser script evaluation is disabled");
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

/** Conservative URL gate for browser requests, including redirects/subresources. */
export function isPublicBrowserUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/\\.$/, "").replace(/^\\[|\\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host.endsWith(".test") || host.endsWith(".invalid")) return false;
  // Block all IP literals (including IPv6 and IPv4-mapped IPv6) rather than
  // trying to distinguish public from private address ranges.
  if (isIP(host)) return false;
  if (/^[0-9.]+$/.test(host)) return false;
  if (!host.includes(".")) return false;
  return true;
}
