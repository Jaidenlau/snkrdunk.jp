import { chromium } from "playwright";

function cookieHeaderToCookies(cookieHeader) {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return null;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) return null;
      return {
        name,
        value,
        domain: ".snkrdunk.com",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
      };
    })
    .filter(Boolean);
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const input = await readInput();
const headers = input.headers || {};
const cookieHeader = headers.Cookie || headers.cookie || "";
const userAgent = headers["User-Agent"] || headers["user-agent"];
const referer = headers.Referer || headers.referer || "https://snkrdunk.com/";

const extraHTTPHeaders = {};
for (const [key, value] of Object.entries(headers)) {
  const lower = key.toLowerCase();
  if (lower === "cookie" || lower === "user-agent" || lower === "host") continue;
  extraHTTPHeaders[key] = String(value);
}
extraHTTPHeaders.referer = referer;

const usePersistentProfile = Boolean(input.userDataDir);
const contextHeaders = usePersistentProfile
  ? { "accept-language": headers["accept-language"] || headers["Accept-Language"] || "en-US,en;q=0.9" }
  : extraHTTPHeaders;
const fetchHeaders = usePersistentProfile
  ? { accept: "application/json" }
  : extraHTTPHeaders;

let browser;
let context;

try {
  const contextOptions = {
    extraHTTPHeaders: contextHeaders,
    locale: "en-US",
    timezoneId: "Asia/Hong_Kong",
  };
  if (!usePersistentProfile && userAgent) {
    contextOptions.userAgent = userAgent;
  }

  if (usePersistentProfile) {
    context = await chromium.launchPersistentContext(input.userDataDir, {
      ...contextOptions,
      channel: input.channel || undefined,
      headless: input.headless !== false,
    });
  } else {
    browser = await chromium.launch({
      channel: input.channel || undefined,
      headless: input.headless !== false,
    });
    context = await browser.newContext(contextOptions);
  }

  const cookies = usePersistentProfile ? [] : cookieHeaderToCookies(cookieHeader);
  if (cookies.length) {
    await context.addCookies(cookies);
  }

  const page = await context.newPage();
  page.setDefaultTimeout(input.timeoutMs || 30000);
  page.setDefaultNavigationTimeout(input.timeoutMs || 30000);

  // Warm the same-origin browser context before hitting JSON endpoints. This
  // mirrors a real user opening a SNKRDUNK page and then the app fetching XHRs.
  try {
    await page.goto(referer, { waitUntil: "domcontentloaded", timeout: input.timeoutMs || 30000 });
    await page.waitForTimeout(input.warmupMs || 5000);
  } catch {
    // The API call below is the important response; warming is best-effort.
  }

  const result = await page.evaluate(
    async ({ url, headers }) => {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers,
      });
      const body = await response.text();
      const outHeaders = {};
      response.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      return {
        status: response.status,
        headers: outHeaders,
        body,
        url: response.url,
      };
    },
    { url: input.url, headers: fetchHeaders }
  );

  process.stdout.write(
    JSON.stringify({
      status: result.status,
      headers: result.headers,
      body: result.body,
      url: result.url,
    })
  );
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
}
