// Tests, builds and tags the version from package.json. Deploys build this
// package from source (see the Dockerfiles in cbp3 and media-worker), so the
// tag is a marker of what was released, not something they install from.
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
console.log(`\nTagged v${version}.`);
