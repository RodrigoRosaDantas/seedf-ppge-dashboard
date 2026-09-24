import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const roots = ["app","lib","scripts","public",".github"];
const ignored = new Set(["node_modules",".next","dist",".git","artifacts"]);
const findings = [];
const patterns = [
  { name: "private-key", rx: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "notion-secret", rx: /\b(?:secret_|ntn_)[A-Za-z0-9_-]{20,}\b/ },
  { name: "openai-secret", rx: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "service-role", rx: /\bservice[_-]?role\b\s*[:=]\s*["'][A-Za-z0-9._-]{20,}["']/i },
  { name: "generic-token", rx: /\b(?:NOTION_TOKEN|GITHUB_TOKEN)\b\s*[:=]\s*["'][^"'$]{12,}["']/ },
];

async function walk(entry) {
  let info;
  try { info = await stat(entry); } catch { return; }
  if (info.isDirectory()) {
    if (ignored.has(path.basename(entry))) return;
    for (const child of await readdir(entry)) await walk(path.join(entry, child));
    return;
  }
  if (!/\.(?:js|mjs|ts|tsx|json|yml|yaml|md|html|css|webmanifest)$/i.test(entry)) return;
  const content = await readFile(entry, "utf8");
  for (const pattern of patterns) {
    if (pattern.rx.test(content)) findings.push(entry + " · " + pattern.name);
  }
}
for (const root of roots) await walk(root);
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("Auditoria de segurança: nenhum secret/token privado detectado nos arquivos públicos versionados.");
