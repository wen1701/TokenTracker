"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("CPA scan stops on database or engine failures and records successful scan logs", (t) => {
  if (process.platform === "win32") return t.skip("requires a POSIX shell");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cpa-scan-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, "bin");
  const app = path.join(dir, "Token Tracker.app");
  const archives = path.join(dir, "archives");
  for (const target of [bin, app, archives]) fs.mkdirSync(target);
  fs.writeFileSync(path.join(bin, "freshclam"), '#!/bin/sh\necho "database fixture"\nexit "$SCAN_UPDATE_EXIT"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "clamscan"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "scanner fixture"; exit 0; fi\nprintf "%s\\n" "$@" > "$SCAN_ARGS_FILE"\necho "scan fixture"\nexit "$SCAN_ENGINE_EXIT"\n', { mode: 0o755 });
  const script = path.join(__dirname, "../scripts/scan-cpa-build.sh");
  for (const [update, engine, expected] of [[0, 0, 0], [2, 0, 2], [0, 1, 1], [0, 2, 2]]) {
    const report = path.join(dir, `report-${update}-${engine}`);
    const argsFile = path.join(dir, `args-${update}-${engine}`);
    const result = spawnSync("bash", [script, app, report, archives], { encoding: "utf8", env: {
      ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      SCAN_UPDATE_EXIT: String(update), SCAN_ENGINE_EXIT: String(engine), SCAN_ARGS_FILE: argsFile,
    } });
    assert.equal(result.status, expected, result.stderr || result.stdout);
    assert.ok(fs.existsSync(path.join(report, "database-update.log")));
    if (update !== 0) {
      assert.equal(fs.existsSync(argsFile), false, "failed signature update must prevent scanning");
    } else {
      const args = fs.readFileSync(argsFile, "utf8").split("\n");
      assert.ok(args.includes(app) && args.includes(archives));
      assert.ok(args.includes("--alert-exceeds-max=yes"));
      assert.ok(fs.existsSync(path.join(report, "scan.log")));
    }
  }
});
