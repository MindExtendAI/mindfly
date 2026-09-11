# MindFly Rust/WASM neural engine

Rust/WASM is the only neural simulation engine. The browser loads
`public/wasm/neural-engine.wasm` through `lib/wasm-bpn.ts`; React, Three.js,
Bluetooth transport and the walking controller remain browser code. EEG
calculations run in a separate proprietary Rust/WASM module.

## Runtime

The default page uses Rust/WASM, with no engine selector or JavaScript fallback.
“How it works” reports the active engine. If loading or execution fails, control
stops and the page offers a retry. Unmounting frees the engine's allocations.

## Build

Install Rust from https://rustup.rs/. The crate pins Rust 1.98.1. From the app root:

```
rustup target add wasm32-unknown-unknown --toolchain 1.98.1
npm run build:wasm
npm test
npm run build
```

For Cargo outside PATH, set `CARGO` to its absolute path. The crate has no
third-party dependencies. Cargo.lock is committed. The numeric ABI passes graph
inputs and returns simulation outputs; the browser adapter validates graph
indices and refreshes memory views after growth. Each instance is freed once.

The compiled binary is committed so website builds do not require Rust.
Rebuild it and run the reference checks whenever the Rust source changes.
Model assumptions and attribution are preserved in `public/ATTRIBUTION.txt`
and `public/licenses/`.

## Validation

The tests instantiate the compiled WASM binary and check full-CNS reference
traces, interrupted stimulation, disconnected BPN outputs, reset, independent
instances, failed loads, cancellation and invalid graph/module rejection.

Browser checks cover loading, demo stimulation, walking and stopping. Live
Muse connection and calibration require a physical headset; synthetic tests
do not establish hardware or biological validation.
