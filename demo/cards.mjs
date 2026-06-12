// Branded intro/outro title cards rendered from docs/design navy tokens. We render
// HTML in a headless page and screenshot it — reuses Playwright, no design assets to
// wrangle. No "AI" on these consumer-facing cards (brand rule).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

function cardHtml(card) {
  return `<!doctype html><html><head><meta charset="utf8"><style>
    html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}
    .bg{width:1920px;height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:radial-gradient(1300px 760px at 50% 34%, ${CONFIG.accent}26, transparent 62%), linear-gradient(158deg, ${CONFIG.navy} 0%, ${CONFIG.navyDeep} 100%);color:#fff;}
    .eyebrow{letter-spacing:.34em;text-transform:uppercase;font-size:20px;color:#9DB8DC;margin-bottom:30px;}
    .word{font-size:120px;font-weight:700;letter-spacing:-2.5px;line-height:1;}
    .dot{color:${CONFIG.accent};}
    .rule{width:96px;height:4px;background:${CONFIG.accent};border-radius:2px;margin:36px 0;}
    .tag{font-size:40px;font-weight:300;color:#DCE6F4;max-width:1180px;text-align:center;line-height:1.34;}
    .contact{margin-top:52px;font-size:24px;color:#8FA8CC;letter-spacing:.05em;}
  </style></head><body><div class="bg">
    ${card.eyebrow ? `<div class="eyebrow">${card.eyebrow}</div>` : ""}
    ${card.layout === "outro"
      ? `<div class="word" style="font-size:88px;letter-spacing:-1.5px;max-width:1500px;text-align:center;">${card.headline}</div>
         <div class="rule"></div>
         <div class="word" style="font-size:64px;letter-spacing:-1px;">Transforma<span class="dot">.</span></div>`
      : `<div class="word">Transforma<span class="dot">.</span></div>
         <div class="rule"></div>
         <div class="tag">${card.tagline}</div>`}
    ${card.contact ? `<div class="contact">${card.contact}</div>` : ""}
  </div></body></html>`;
}

export async function renderCards(scenes) {
  fs.mkdirSync(CONFIG.dirs.cards, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: CONFIG.width, height: CONFIG.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const out = {};
  for (const s of scenes) {
    if (s.kind !== "card") continue;
    await page.setContent(cardHtml(s.card), { waitUntil: "networkidle" });
    await page.waitForTimeout(200);
    const p = path.join(CONFIG.dirs.cards, s.id + ".png");
    await page.screenshot({ path: p });
    out[s.id] = p;
  }
  await browser.close();
  return out;
}
