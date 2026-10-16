"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("CPA workflow verifies real universal binaries and rejects an incomplete runtime", (t) => {
  if (process.platform !== "darwin") return t.skip("requires macOS clang and lipo");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cpa-arch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, "Token Tracker.app");
  const runtime = path.join(app, "Contents/Resources/EmbeddedServer");
  const binary = path.join(app, "Contents/MacOS/TokenTracker");
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.mkdirSync(runtime, { recursive: true });
  const compile = spawnSync("xcrun", ["clang", "-arch", "arm64", "-arch", "x86_64", "-x", "c", "-c", "-", "-o", binary], {
    input: "int cpa_arch_probe(void) { return 0; }\n", encoding: "utf8",
  });
  assert.equal(compile.status, 0, compile.stderr);
  fs.copyFileSync(binary, path.join(runtime, "node"));
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/build-cpa-macos.yml"), "utf8");
  const commands = workflow.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("lipo "));
  assert.equal(commands.length, 2, "both the app and embedded Node need architecture checks");
  const verify = () => spawnSync("bash", ["-euc", commands.join("\n")], { env: { ...process.env, app, runtime }, encoding: "utf8" });
  const valid = verify();
  assert.equal(valid.status, 0, valid.stderr);
  const thin = path.join(dir, "arm64.o");
  const extract = spawnSync("xcrun", ["lipo", binary, "-thin", "arm64", "-output", thin], { encoding: "utf8" });
  assert.equal(extract.status, 0, extract.stderr);
  fs.copyFileSync(thin, path.join(runtime, "node"));
  assert.notEqual(verify().status, 0, "an arm64-only Node must not pass a universal build check");
});
