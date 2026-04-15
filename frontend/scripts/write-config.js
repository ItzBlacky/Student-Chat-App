const fs = require("fs");
const path = require("path");

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const config = {
  API_BASE_URL: cleanUrl(process.env.FRONTEND_API_BASE_URL),
  SOCKET_URL: cleanUrl(process.env.FRONTEND_SOCKET_URL || process.env.FRONTEND_API_BASE_URL)
};

const output = `window.STUDYMATE_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(path.join(__dirname, "..", "js", "config.js"), output);

console.log("Wrote frontend/js/config.js");
