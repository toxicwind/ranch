#!/usr/bin/env node
// bench-keeper-cdp.js — Route A: keeper CDP :9223 (headed chromium on Xvnc :99).
// 5-step scripted flow, per-step ms. Part of barn/browserless/bench/.
const { chromium } = require("/home/toxic/.browserless/app/node_modules/playwright-core");
(async () => {
  const steps = {};
  let s = Date.now();
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { timeout: 15000 });
  steps.connect_ms = Date.now() - s;
  s = Date.now();
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  steps.goto_ms = Date.now() - s;
  s = Date.now();
  const title = await page.title();
  steps.title_ms = Date.now() - s;
  s = Date.now();
  await page.screenshot({ path: "/tmp/bench-keeper.png" });
  steps.screenshot_ms = Date.now() - s;
  s = Date.now();
  const evaled = await page.evaluate(() => document.title + "|" + document.querySelectorAll("a").length);
  await page.close();
  steps.eval_close_ms = Date.now() - s;

  steps.title = title;
  steps.evaled = evaled;
  steps.total_ms = Object.values(steps).filter((v) => typeof v === "number").reduce((a, b) => a + b, 0);
  console.log("ROUTE-A keeper-cdp: " + JSON.stringify(steps));
  process.exit(0);
})().catch((e) => { console.error("ROUTE-A FAIL: " + e.message); process.exit(1); });

