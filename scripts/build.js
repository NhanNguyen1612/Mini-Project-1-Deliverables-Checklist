import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function removePath(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

removePath("app.js");
removePath("public/app.js");
removePath("public/style.css");
removePath("assets");
removePath("public/assets");
removePath("dist");

const rootFiles = fs.readdirSync(".");
for (const f of rootFiles) {
  if (f.startsWith("workbox-") && f.endsWith(".js")) removePath(f);
}
if (fs.existsSync("public")) {
  const pubFiles = fs.readdirSync("public");
  for (const f of pubFiles) {
    if (f.startsWith("workbox-") && f.endsWith(".js")) removePath("public/" + f);
  }
}

if (fs.existsSync("index.source.html")) {
  fs.copyFileSync("index.source.html", "index.html");
}

execSync("npx vite build", { stdio: "inherit" });

if (fs.existsSync("dist/index.html")) {
  fs.copyFileSync("dist/index.html", "index.html");
  if (!fs.existsSync("public")) fs.mkdirSync("public", { recursive: true });
  fs.copyFileSync("dist/index.html", "public/index.html");
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir("dist", "public");
copyDir("dist/assets", "assets");
if (fs.existsSync("dist/sw.js")) fs.copyFileSync("dist/sw.js", "sw.js");
if (fs.existsSync("dist/manifest.webmanifest")) fs.copyFileSync("dist/manifest.webmanifest", "manifest.webmanifest");
const workboxFiles = fs.readdirSync("dist").filter(f => f.startsWith("workbox-"));
for (const wb of workboxFiles) {
  fs.copyFileSync(path.join("dist", wb), wb);
}

console.log("Build cleaned up and synced successfully!");
