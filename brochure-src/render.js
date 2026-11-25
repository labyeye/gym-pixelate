const { chromium } = require("../frontend/node_modules/playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const p = await b.newPage();
  await p.goto("file:///" + path.resolve(__dirname, "brochure.html").replace(/\\/g, "/"));
  await p.waitForTimeout(2500);
  await p.pdf({ path: path.resolve(__dirname, "../NestGym_Brochure.pdf"), width: "794px", height: "1123px", printBackground: true });
  await b.close();
})();
