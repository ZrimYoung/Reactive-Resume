// Use the installed Puppeteer's matching Chrome revision, never an unrelated npx version.
require("./prepare")
  .prepareBrowser()
  .catch((error) => {
    console.error("[puppeteer:download]", error);
    process.exitCode = 1;
  });
