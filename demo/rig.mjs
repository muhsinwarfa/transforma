// Playwright recording helpers: a fresh recorded context per scene, an injected
// glide-cursor (the OS cursor isn't captured in video, so we draw one), smooth
// mouse moves, human-paced clicks/typing, and login. Records against the LIVE app.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

// Injected on every page: a navy arrow cursor that follows real mouse events
// (page.mouse.move dispatches them), so glides + clicks are visible in the capture.
const CURSOR_JS = `(() => {
  if (window.__demoCursorInstalled) return;
  window.__demoCursorInstalled = true;
  const mk = () => {
    if (!document.body) return requestAnimationFrame(mk);
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;width:24px;height:24px;pointer-events:none;will-change:transform;transform:translate(-80px,-80px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));';
    c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 2.5l13.5 7.2-5.9 1.7-1.7 5.9L5 2.5z" fill="#1F3A5F" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const move = (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mousedown', () => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;width:34px;height:34px;border-radius:50%;border:2px solid #3E6FB0;pointer-events:none;transition:transform .35s ease,opacity .35s ease;opacity:.9;';
      r.style.transform = 'translate(' + (parseFloat(c.style.transform.split('(')[1]) - 5) + 'px,' + (parseFloat(c.style.transform.split(',')[1]) - 5) + 'px) scale(.4)';
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = r.style.transform.replace('scale(.4)', 'scale(1.3)'); r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 400);
    }, true);
  };
  mk();
})();`;

export async function launch() {
  return chromium.launch({
    headless: true,
    slowMo: CONFIG.slowMo,
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-blink-features=AutomationControlled"],
  });
}

export async function newScene(browser, sceneId) {
  const rawDir = path.join(CONFIG.dirs.raw, sceneId);
  fs.mkdirSync(rawDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: CONFIG.width, height: CONFIG.height },
    recordVideo: { dir: rawDir, size: { width: CONFIG.width, height: CONFIG.height } },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(CURSOR_JS);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { context, page };
}

// Close the context (finalizes the webm) and return the saved video path.
export async function finishScene(scene, sceneId) {
  const page = scene.context.pages()[0];
  let vpath = null;
  try { vpath = page ? await page.video().path() : null; } catch { /* no video */ }
  await scene.context.close();
  if (!vpath || !fs.existsSync(vpath)) return null;
  const dest = path.join(CONFIG.dirs.raw, sceneId + ".webm");
  fs.renameSync(vpath, dest);
  try { fs.rmSync(path.join(CONFIG.dirs.raw, sceneId), { recursive: true, force: true }); } catch {}
  return dest;
}

// ── interaction helpers (human-paced + cursor-visible) ───────────────────────
export const dwell = (page, ms = CONFIG.dwellMs) => page.waitForTimeout(ms);

export async function gotoApp(page, pathname) {
  await page.goto(CONFIG.siteUrl + pathname, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
}

export async function login(page, email) {
  await page.goto(CONFIG.siteUrl + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#lg-email", email);
  await page.waitForTimeout(250);
  await page.fill("#lg-pw", CONFIG.password);
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/home(\?|$|\/)/, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

export async function glideTo(page, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 26 });
  await page.waitForTimeout(220);
  return true;
}

export async function clickEl(page, locator, { before = 350 } = {}) {
  await glideTo(page, locator);
  await page.waitForTimeout(before);
  await locator.click({ timeout: 15000 });
}

export async function typeSlow(page, locator, text) {
  await glideTo(page, locator);
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(text, { delay: 16 });
}

// Smooth wheel scroll to reveal a long document, with a brief settle.
export async function smoothScroll(page, totalPx, { step = 90, ms = 70 } = {}) {
  const sign = Math.sign(totalPx) || 1;
  let moved = 0;
  while (Math.abs(moved) < Math.abs(totalPx)) {
    await page.mouse.wheel(0, sign * step);
    moved += sign * step;
    await page.waitForTimeout(ms);
  }
  await page.waitForTimeout(400);
}
