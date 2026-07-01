// @vitest-environment node
//
// End-to-end coverage of the single gcode -> motion -> cutting pipeline.
//
// The material-removal cutting model lives entirely in the frontend: the WASM
// C++ core (LinuxCncCompatParser -> TrajectoryPlanner -> MachineController.tick)
// produces swept cut segments, and the WebGPU voxelizer (webgpuVoxelizer.js)
// carves them via SDF + Marching Cubes. This test drives that whole pipeline in
// a real headless Chromium against the Vite dev server (`make run-frontend`) and
// asserts that material was actually removed.
//
// Requirements:
//   - dev server running on 127.0.0.1:1420 (make test-e2e starts it for you)
//   - `playwright` devDependency + `npx playwright install chromium`
//   - a WebGPU-capable headless Chromium (skips cleanly, not fails, if absent)
//
// Run: npx vitest run e2e/simulator.pipeline.test.js   (or: make test-e2e)

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// A simple plunge: rapid above the stock, center over it, then feed-plunge
// straight down through it. Tool diameter 4mm (radius 2mm) => a 4mm hole through
// a 20mm cube centered at (10,10). Stock is 20x20x20mm at the origin.
const GCODE = [
  "G21 G90 G54",
  "G0 Z25",
  "G0 X10 Y10",
  "G1 Z-2 F100",
  "M30",
].join("\n");

const APP_URL =
  process.env.AIM3D_E2E_URL ||
  "http://127.0.0.1:1420/?e2e=1&res=32&sx=20&sy=20&sz=20&td=4";

let browser = null;
let page = null;
let launchError = null;
let webgpuAvailable = true;

async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (_) {
    return { reason: "playwright not installed (run: npm i -D playwright && npx playwright install chromium)" };
  }
  const isMac = process.platform === "darwin";
  const gpuArgs = isMac
    ? ["--use-gl=angle", "--use-angle=metal"]
    : [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-features=Vulkan,UnsafeWebGPU,WebGPU",
      ];
  try {
    return await chromium.launch({
      headless: true,
      args: [
        "--enable-unsafe-webgpu",
        ...gpuArgs,
        "--disable-gpu-sandbox",
        "--no-sandbox",
      ],
    });
  } catch (e) {
    return { reason: "Chromium not installed (run: npx playwright install chromium): " + e.message };
  }
}

beforeAll(async () => {
  const launched = await launchChromium();
  if (launched.reason) {
    launchError = launched.reason;
    return;
  }
  browser = launched;
  page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page._aim3dErrors = errors;

  await page.goto(APP_URL, { waitUntil: "load", timeout: 30000 });

  // Wait for the dev-only test hook and the WASM core to be ready.
  await page.waitForFunction(
    () => typeof window.__aim3d === "object" && window.__aim3d !== null,
    { timeout: 20000 },
  );

  // Wait for the voxelizer to be mounted (WebGPU renderer created).
  const voxReady = await page.waitForFunction(
    () => window.__aim3d.getVoxelizer() !== null,
    { timeout: 20000 },
  ).catch(() => null);

  if (!voxReady) {
    webgpuAvailable = false;
  }
}, 60000);

afterAll(async () => {
  if (page) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
});

describe("gcode -> motion -> cutting pipeline (Playwright + WebGPU)", () => {
  it("removes material from the stock when a plunge program is run", async (ctx) => {
    if (launchError) {
      ctx.skip(true, launchError);
      return;
    }
    if (!webgpuAvailable) {
      ctx.skip(true, "WebGPU voxelizer not available in headless Chromium");
      return;
    }

    // Drive the real Pinia store: switch to the machine workspace, Auto task
    // mode, load the program, and start the simulation.
    await page.evaluate(async (gcode) => {
      const store = window.__aim3d.store;
      store.setMode("machine");
      store.setMachineTaskMode("auto");
      store.units = "mm";
      await store.setGcodeText(gcode);
      await store.startSimulation();
    }, GCODE);

    // Wait for the simulation to drain (status -> 'stopped') and the voxelizer
    // to have extracted a cut mesh. The render loop runs extractMesh() when the
    // sim is paused/stopped, so vertexCount becomes > 0 once cuts are applied.
    await page.waitForFunction(
      () => {
        const s = window.__aim3d.store;
        const v = window.__aim3d.getVoxelizer();
        return (
          s.simulationPlaybackStatus === "stopped" &&
          v !== null &&
          v.vertexCount > 0
        );
      },
      { timeout: 30000 },
    );

    const result = await page.evaluate(() => {
      const s = window.__aim3d.store;
      const v = window.__aim3d.getVoxelizer();
      return {
        totalSteps: s.simulationTotalSteps,
        currentStep: s.simulationCurrentStep,
        status: s.simulationPlaybackStatus,
        isSimulating: s.isSimulating,
        diagnostics: (s.lastPlanningDiagnostics || []).filter(
          (d) => d.severity === "error" || d.severity === "fatal",
        ),
        vertexCount: v ? v.vertexCount : 0,
        volumeRemoved: v ? v.volumeRemoved : 0,
      };
    });

    // The program must have planned real motion.
    expect(result.totalSteps).toBeGreaterThan(0);
    // ...and reached the end without leaving the sim "playing".
    expect(result.status).toBe("stopped");
    expect(result.diagnostics).toEqual([]);
    // The WebGPU voxelizer must have produced a cut mesh and removed volume.
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.volumeRemoved).toBeGreaterThan(0);
  }, 90000);
});
