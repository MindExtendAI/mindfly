import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(
  process.env.CARGO || "cargo",
  [
    "+1.98.1",
    "build",
    "--locked",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
    "--manifest-path",
    "rust/neural-engine/Cargo.toml",
  ],
  { cwd: root, stdio: "inherit" },
);
mkdirSync(new URL("../public/wasm/", import.meta.url), { recursive: true });
copyFileSync(
  new URL(
    "../rust/neural-engine/target/wasm32-unknown-unknown/release/mindfly_neural_engine.wasm",
    import.meta.url,
  ),
  new URL("../public/wasm/neural-engine.wasm", import.meta.url),
);
