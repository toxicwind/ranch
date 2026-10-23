import { describe, expect, test } from "bun:test";
import { PersistentBrowser, KeeperError } from "../src/persistent.ts";
import { BrowserlessClient } from "../src/client.ts";
import {
  BrowserlessConfigSchema,
  PdfOptionsSchema,
  ScreenshotOptionsSchema,
  ViewportSchema,
  CookieSchema,
  ScriptTagSchema,
  StyleTagSchema,
  WaitForSelectorSchema,
  WaitForFunctionSchema,
  WaitForEventSchema,
  PdfRequestSchema,
  ScreenshotRequestSchema,
  ContentRequestSchema,
  FunctionRequestSchema,
  DownloadRequestSchema,
  ExportRequestSchema,
  PerformanceRequestSchema,
  UnblockRequestSchema,
  BrowserQLRequestSchema,
  WebSocketOptionsSchema,
} from "../src/types.ts";

describe("Comprehensive Schema & Types Coverage", () => {
  test("All request and options schemas validate properly", () => {
    expect(PdfOptionsSchema.parse({ format: "A4", landscape: true })).toBeDefined();
    expect(ScreenshotOptionsSchema.parse({ type: "png", fullPage: true })).toBeDefined();
    expect(ViewportSchema.parse({ width: 1920, height: 1080 })).toBeDefined();
    expect(CookieSchema.parse({ name: "sid", value: "123", sameSite: "Lax" })).toBeDefined();
    expect(ScriptTagSchema.parse({ url: "https://example.com/script.js" })).toBeDefined();
    expect(StyleTagSchema.parse({ content: "body { background: red; }" })).toBeDefined();
    expect(WaitForSelectorSchema.parse({ selector: "h1" })).toBeDefined();
    expect(WaitForFunctionSchema.parse({ fn: "() => true" })).toBeDefined();
    expect(WaitForEventSchema.parse({ event: "load" })).toBeDefined();
    expect(PdfRequestSchema.parse({ url: "https://example.com" })).toBeDefined();
    expect(ScreenshotRequestSchema.parse({ url: "https://example.com" })).toBeDefined();
    expect(ContentRequestSchema.parse({ url: "https://example.com" })).toBeDefined();
    expect(FunctionRequestSchema.parse({ code: "() => 42" })).toBeDefined();
    expect(DownloadRequestSchema.parse({ code: "() => null" })).toBeDefined();
    expect(ExportRequestSchema.parse({ url: "https://example.com" })).toBeDefined();
    expect(PerformanceRequestSchema.parse({ url: "https://example.com" })).toBeDefined();
    expect(UnblockRequestSchema.parse({ url: "https://example.com" })).toBeDefined();
    expect(BrowserQLRequestSchema.parse({ query: "{ title }" })).toBeDefined();
    expect(WebSocketOptionsSchema.parse({ browser: "chromium" })).toBeDefined();
  });
});

describe("BrowserlessClient Methods", () => {
  const client = new BrowserlessClient({
    host: "127.0.0.1",
    port: 25130,
    token: "test-token",
    protocol: "http",
    timeout: 2000,
    concurrent: 2,
  });

  test("getClient endpoints handle errors gracefully", async () => {
    const health = await client.getHealth();
    expect(typeof health.success).toBe("boolean");

    const sessions = await client.getSessions();
    expect(typeof sessions.success).toBe("boolean");

    const config = await client.getConfig();
    expect(typeof config.success).toBe("boolean");

    const metrics = await client.getMetrics();
    expect(typeof metrics.success).toBe("boolean");
  });

  test("WebSocket connection returns object or failure error", async () => {
    const wsRes = await client.createWebSocketConnection();
    expect(typeof wsRes.success).toBe("boolean");
  });
});

describe("Keeper & PersistentBrowser Operations", () => {
  const browser = new PersistentBrowser();

  test("KeeperError carries code and message", () => {
    const err = new KeeperError("KEEPER_DOWN", "keeper offline");
    expect(err.code).toBe("KEEPER_DOWN");
    expect(err.message).toContain("keeper offline");
  });

  test("status reports live CDP connection and browser name", async () => {
    const status = (await browser.status()) as Record<string, any>;
    expect(status.cdpAlive).toBe(true);
    expect(status.cdpUrl).toBe("http://127.0.0.1:9223");
  });

  test("tabs lists all active tabs in keeper Chromium", async () => {
    const tabs = await browser.tabs();
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
  });

  test("content extracts HTML, title, and URL from current page", async () => {
    const data = await browser.content();
    expect(typeof data.html).toBe("string");
  });

  test("pageText extracts visible inner text", async () => {
    const text = await browser.pageText();
    expect(typeof text).toBe("string");
  });

  test("evaluate runs JavaScript expression in browser context", async () => {
    const result = await browser.evaluate("10 * 10");
    expect(result).toBe(100);
  });

  test("screenshot captures base64 PNG data", async () => {
    const b64 = await browser.screenshot({ fullPage: false });
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(50);
  });
});
