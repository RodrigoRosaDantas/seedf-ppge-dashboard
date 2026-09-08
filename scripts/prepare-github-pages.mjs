import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("dist/client");

await mkdir(outputDirectory, { recursive: true });

for (const filename of ["index.html", "index.rsc", "404.html"]) {
  const filePath = path.join(outputDirectory, filename);
  try {
    await access(filePath);
  } catch {
    continue;
  }

  const content = await readFile(filePath, "utf8");
  const rewritten = content.replaceAll('"/assets/', '"./assets/');
  await writeFile(filePath, rewritten, "utf8");
}

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
