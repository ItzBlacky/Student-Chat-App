const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 5173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(url) {
  const parsedUrl = new URL(url, `https://student-chat-application.onrender.com`);
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root)) {
    return path.join(root, "index.html");
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequestPath(req.url);
  const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(root, "index.html");
  const extension = path.extname(targetPath).toLowerCase();

  res.setHeader("Content-Type", contentTypes[extension] || "application/octet-stream");
  fs.createReadStream(targetPath)
    .on("error", () => {
      res.writeHead(500);
      res.end("Unable to read file");
    })
    .pipe(res);
});

server.listen(port, () => {
  console.log(`Frontend running on https://student-chat-application.onrender.com`);
});
