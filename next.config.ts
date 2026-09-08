import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "1";
const githubPagesBasePath = isGithubPages
  ? process.env.GITHUB_PAGES_BASE_PATH ?? ""
  : "";

const nextConfig: NextConfig = {
  ...(isGithubPages
      ? {
        output: "export" as const,
        assetPrefix: githubPagesBasePath ? `${githubPagesBasePath}/` : undefined,
      }
    : {}),
};

export default nextConfig;
