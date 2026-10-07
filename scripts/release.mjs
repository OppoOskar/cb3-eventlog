// Tests, builds, tags and pushes the version from package.json. The pushed tag
// triggers .github/workflows/publish.yml, which publishes to GitHub Packages.
// Usage: bump "version" in package.json, commit, then `npm run release`.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

if (execSync("git status --porcelain").toString().trim()) {
  console.error("Uncommitted changes — commit them before releasing.");
  process.exit(1);
}
run("npm test");
run("npm run build");
run(`git tag v${version}`);
run("git push origin HEAD");
run(`git push origin v${version}`);
console.log(`\nPushed v${version} — GitHub Actions publishes it to GitHub Packages.`);
