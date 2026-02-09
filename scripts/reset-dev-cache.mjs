import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  ".next",
  "tsconfig.tsbuildinfo",
  path.join("node_modules", ".vite"),
  path.join("node_modules", ".cache"),
];

for (const relativeTarget of targets) {
  const target = path.join(root, relativeTarget);
  if (!fs.existsSync(target)) {
    continue;
  }
  fs.rmSync(target, { recursive: true, force: true });
  process.stdout.write(`removed ${relativeTarget}\n`);
}

process.stdout.write("dev cache reset complete\n");
