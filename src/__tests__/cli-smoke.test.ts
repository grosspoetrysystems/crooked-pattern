import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");

describe("built CLI", () => {
  it("has exactly one shebang after build", async () => {
    await execFileAsync("pnpm", ["build"], { cwd: root });
    const built = await readFile(path.join(root, "dist/cli.js"), "utf8");

    expect(built.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect([...built.matchAll(/^#!/gm)]).toHaveLength(1);
  }, 30_000);

  it("runs help and a minimal source scan from dist", async () => {
    await execFileAsync("pnpm", ["build"], { cwd: root });

    const help = await execFileAsync("node", ["dist/cli.js", "--help"], {
      cwd: root,
    });
    expect(help.stdout).toContain("scan");
    expect(help.stdout).toContain("diff");

    const outDir = path.join(root, ".tempor/test-cli-smoke");
    await rm(outDir, { force: true, recursive: true });
    await mkdir(outDir, { recursive: true });

    await execFileAsync(
      "node",
      ["dist/cli.js", "scan", "--source", ".", "--out", outDir],
      { cwd: root }
    );

    await expect(readFile(path.join(outDir, "ars.json"), "utf8")).resolves.toContain(
      '"schema_version": "ars.v1"'
    );
    await expect(readFile(path.join(outDir, "ars-report.md"), "utf8")).resolves.toContain(
      "Agentic Readiness Score Report"
    );
  }, 30_000);
});
