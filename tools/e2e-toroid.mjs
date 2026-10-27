import { chromium } from "playwright";

const URL = "http://127.0.0.1:8731/app/toroid-inductor.html";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(URL, { waitUntil: "load" });
await sleep(2500); // let three.js module + CDN settle

async function snapshot(label) {
  const s = await page.evaluate(() => ({
    resBoxLen: document.getElementById("resBox")?.innerHTML.length,
    sugRows: document.querySelectorAll("#sugTable tbody tr").length,
    indNoteLen: document.getElementById("indNote")?.textContent.length,
    vizCapLen: document.getElementById("vizCap")?.textContent.length,
    coreMetaLen: document.getElementById("coreMeta")?.innerHTML.length,
    heroText: document.querySelector(".res-hero")?.textContent.trim(),
    canvasPresent: !!document.querySelector("#vizBox canvas"),
    fillLabel: document.getElementById("fillLabel")?.textContent,
  }));
  console.log(label, JSON.stringify(s));
  return s;
}

const before = await snapshot("before");

// simulate typing into target inductance
await page.fill("#lval", "47");
await page.$eval("#lval", el => el.dispatchEvent(new Event("input", { bubbles: true })));
await sleep(400);
const afterType = await snapshot("after-type-47");

// change AWG select
await page.selectOption("#awg", "6");
await sleep(400);
const afterAwg = await snapshot("after-awg");

// change core select
await page.selectOption("#toroid", "5");
await sleep(400);
const afterCore = await snapshot("after-core");

// drag fill slider to 40
await page.$eval("#fill", el => { el.value = "40"; el.dispatchEvent(new Event("input", { bubbles: true })); });
await sleep(400);
const afterFill = await snapshot("after-fill");

console.log("\n--- diff checks ---");
console.log("results changed on type :", before.resBoxLen !== afterType.resBoxLen);
console.log("results changed on awg  :", afterType.resBoxLen !== afterAwg.resBoxLen || afterAwg.heroText !== afterType.heroText);
console.log("results changed on core :", afterAwg.resBoxLen !== afterCore.resBoxLen);
console.log("results changed on fill :", afterCore.resBoxLen !== afterFill.resBoxLen);
console.log("viz caption changed     :", afterType.vizCapLen > 0);
console.log("JS errors               :", errors.length ? errors : "none");

await browser.close();
if (errors.length) process.exitCode = 1;
