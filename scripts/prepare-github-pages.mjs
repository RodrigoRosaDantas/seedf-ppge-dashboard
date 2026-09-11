import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("dist/client");

await mkdir(outputDirectory, { recursive: true });

function rewriteAssets(content, prefix) {
  return content.replaceAll("/assets/", `${prefix}assets/`);
}

async function rewriteIfPresent(filename, prefix = "./") {
  const filePath = path.join(outputDirectory, filename);
  try {
    await access(filePath);
  } catch {
    return false;
  }

  const content = await readFile(filePath, "utf8");
  await writeFile(filePath, rewriteAssets(content, prefix), "utf8");
  return true;
}

for (const filename of ["index.html", "index.rsc", "404.html"]) {
  await rewriteIfPresent(filename, "./");
}

const entries = await readdir(outputDirectory, { withFileTypes: true });
const routeHtmlFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html") && !["index.html", "404.html"].includes(entry.name))
  .map((entry) => entry.name);

for (const filename of routeHtmlFiles) {
  const routeName = filename.slice(0, -".html".length);
  const sourcePath = path.join(outputDirectory, filename);
  const routeDirectory = path.join(outputDirectory, routeName);
  const nestedIndexPath = path.join(routeDirectory, "index.html");

  const source = await readFile(sourcePath, "utf8");
  const nested = rewriteAssets(source, "../");

  await mkdir(routeDirectory, { recursive: true });
  await writeFile(nestedIndexPath, nested, "utf8");

  const matchingRsc = `${routeName}.rsc`;
  const matchingRscPath = path.join(outputDirectory, matchingRsc);
  try {
    const rsc = await readFile(matchingRscPath, "utf8");
    await writeFile(path.join(routeDirectory, "index.rsc"), rewriteAssets(rsc, "../"), "utf8");
    await writeFile(matchingRscPath, rewriteAssets(rsc, "./"), "utf8");
  } catch {
    // RSC output is optional for a statically published route.
  }

  const redirect = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./${routeName}/"><script>location.replace("./${routeName}/" + location.search + location.hash)</script></head><body><a href="./${routeName}/">Abrir ${routeName}</a></body></html>`;
  await writeFile(sourcePath, redirect, "utf8");

  console.log(`GitHub Pages route prepared: /${routeName}/ -> ${routeName}/index.html`);
}

if (routeHtmlFiles.includes("leis.html")) {
  const expectedRoute = path.join(outputDirectory, "leis", "index.html");
  await access(expectedRoute);
  const published = await readFile(expectedRoute, "utf8");
  if (published.includes('"/assets/') || published.includes("'/assets/")) {
    throw new Error("Leis Primeiro still contains root-relative /assets references.");
  }
}

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
