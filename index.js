const { chromium } = require("playwright");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const DIRECT_URL = process.env.DIRECT_URL || "https://ifconfig.me/ip";
const CURL_PROXY_URL = process.env.CURL_PROXY_URL || "socks5h://127.0.0.1:1080";
const PLAYWRIGHT_PROXY_URL = process.env.PLAYWRIGHT_PROXY_URL || "socks5://127.0.0.1:1080";
const PROXY_TEST_URL = process.env.PROXY_TEST_URL || "https://ifconfig.me/ip";
const PLAYWRIGHT_PROXY_HOST = process.env.PLAYWRIGHT_PROXY_HOST || "127.0.0.1";
const DISABLE_PLAYWRIGHT_LOCAL_DNS = process.env.DISABLE_PLAYWRIGHT_LOCAL_DNS === "1";

function getPlaywrightLaunchArgs() {
  if (DISABLE_PLAYWRIGHT_LOCAL_DNS) {
    return [];
  }

  // Allow Chromium to reach the local SOCKS proxy, but force destination
  // hostname resolution away from the local resolver.
  const hostResolverRules = `MAP * ~NOTFOUND , EXCLUDE ${PLAYWRIGHT_PROXY_HOST}`;
  return [`--host-resolver-rules=${hostResolverRules}`];
}

async function runCurl(args, label) {
  try {
    const { stdout, stderr } = await execFileAsync("curl", args, { timeout: 60000 });
    console.log(`\n=== ${label} ===`);
    if (stderr && stderr.trim()) {
      console.log("stderr:", stderr.trim());
    }
    console.log((stdout || "").trim());
    return { ok: true, output: (stdout || "").trim() };
  } catch (error) {
    console.log(`\n=== ${label} FAILED ===`);
    console.log(error.message);
    if (error.stdout) console.log("stdout:", String(error.stdout).trim());
    if (error.stderr) console.log("stderr:", String(error.stderr).trim());
    return { ok: false, output: "" };
  }
}

async function runPlaywright() {
  const browser = await chromium.launch({
    headless: true,
    args: getPlaywrightLaunchArgs(),
    proxy: {
      server: PLAYWRIGHT_PROXY_URL,
    },
  });

  try {
    const page = await browser.newPage();
    await page.goto(PROXY_TEST_URL, { waitUntil: "load", timeout: 60000 });
    const body = (await page.textContent("body")) || "";
    console.log("\n=== PLAYWRIGHT BROWSER IP THROUGH WARP SOCKS ===");
    console.log(body.trim());
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("DIRECT_URL :", DIRECT_URL);
  console.log("CURL_PROXY_URL      :", CURL_PROXY_URL);
  console.log("PLAYWRIGHT_PROXY_URL:", PLAYWRIGHT_PROXY_URL);
  console.log("DISABLE_PLAYWRIGHT_LOCAL_DNS:", DISABLE_PLAYWRIGHT_LOCAL_DNS ? "1" : "0");
  console.log("TEST_URL            :", PROXY_TEST_URL);

  await runCurl(["-sS", DIRECT_URL], "DIRECT CONTAINER IP");
  await runCurl(["-sS", "--proxy", CURL_PROXY_URL, PROXY_TEST_URL], "PROXIED IP THROUGH WARP SOCKS");

  try {
    await runPlaywright();
  } catch (error) {
    console.log("\n=== PLAYWRIGHT FAILED ===");
    console.log(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
