import { chromium } from "playwright";
import path from "node:path";

const userDataDir =
  process.env.SNKRDUNK_PLAYWRIGHT_USER_DATA_DIR ||
  path.resolve(process.cwd(), ".snkrdunk-playwright-profile");

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: process.env.SNKRDUNK_PLAYWRIGHT_CHANNEL || "chrome",
  headless: false,
  locale: "en-US",
  timezoneId: "Asia/Hong_Kong",
});

const page = context.pages()[0] || await context.newPage();
await page.goto("https://snkrdunk.com/en/login", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});

console.log("");
console.log("SNKRDUNK login browser is open.");
console.log(`Profile dir: ${userDataDir}`);
console.log("Log in, open this card page, confirm sale history loads, then press Enter here:");
console.log("https://snkrdunk.com/en/trading-cards/674424");

process.stdin.resume();
process.stdin.once("data", async () => {
  try {
    await page.goto("https://snkrdunk.com/en/trading-cards/674424", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const result = await page.evaluate(async () => {
      const response = await fetch(
        "https://snkrdunk.com/en/v1/products/SW---674424/sale-prices?range=all&used=true",
        {
          method: "GET",
          credentials: "include",
          headers: {
            accept: "application/json",
          },
        }
      );
      const body = await response.text();
      return {
        status: response.status,
        body: body.slice(0, 300),
      };
    });
    console.log("");
    console.log(`SNKRDUNK API test status: ${result.status}`);
    console.log(result.body);
    if (result.status !== 200) {
      console.log("");
      console.log("The browser profile still cannot access sale-prices. Keep this login profile open, refresh the card page, and verify you are actually logged in.");
    }
  } catch (error) {
    console.log("");
    console.log(`SNKRDUNK API test failed: ${error.message}`);
  }
  await context.close();
  process.exit(0);
});
