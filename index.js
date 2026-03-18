const { chromium } = require("playwright");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const DIRECT_URL = process.env.DIRECT_URL || "https://ifconfig.me/ip";
const PROXY_URL = process.env.PROXY_URL || "socks5://127.0.0.1:1080";
const PROXY_TEST_URL = process.env.PROXY_TEST_URL || "https://ifconfig.me/ip";

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
    proxy: {
      server: PROXY_URL,
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
  console.log("DIRECT_URL:", DIRECT_URL);
  console.log("PROXY_URL :", PROXY_URL);
  console.log("TEST_URL  :", PROXY_TEST_URL);

  await runCurl(["-sS", DIRECT_URL], "DIRECT CONTAINER IP");
  await runCurl(["-sS", "--proxy", PROXY_URL, PROXY_TEST_URL], "PROXIED IP THROUGH WARP SOCKS");

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
