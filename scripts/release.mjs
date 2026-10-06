// Builds, commits dist/ and tags the version from package.json, so git
// dependents (cbp3, media-worker) get prebuilt files without a build step.
// Usage: bump "version" in package.json, then `npm run release`, then
// `git push && git push --tags`.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

run("npm test");
run("npm run build");
run("git add -f dist package.json");
run(`git commit -m "Release v${version}" --allow-empty`);
run(`git tag v${version}`);
console.log(`\nTagged v${version}. Push with: git push && git push --tags`);
