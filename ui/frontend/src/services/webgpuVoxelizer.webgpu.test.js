// @vitest-environment node
//
// REAL-SHADER COVERAGE: launches headless Chromium with WebGPU enabled, runs the actual
// webgpuVoxelizer.js compute shaders (sdBox init + sdSweptTool cuts + marching cubes),
// reads the GPU density grid back via readGrid(), and compares it against the pure-JS
// reference in voxelSdf.js using intersection-over-union (IoU).
//
// This validates the WGSL shader end-to-end (not just the JS math): buffer layout, bind
// groups, dispatch dimensions, the sdSweptTool/sdBox implementations on the GPU, cut
// ordering, and grid indexing.
//
// Requirements: `playwright` devDependency + `npx playwright install chromium`. The test
// skips cleanly (not fails) when Playwright is missing or WebGPU is unavailable in the
// headless browser, so it does not block CI on environments without a WebGPU backend.
//
// Run: npx vitest run src/services/webgpuVoxelizer.webgpu.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES_DIR = join(__dirname);

// Harness HTML served at /harness.html. It imports the REAL voxelizer + JS reference as
// ES modules and exposes window.__runVoxelizerTest(config) for the Playwright page.
const HARNESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script type="module">
import { createWebGpuVoxelizer } from './webgpuVoxelizer.js';
import { computeDensityGrid, voxelIoU, countRemovedVoxels, countOccupiedVoxels } from './voxelSdf.js';

window.__runVoxelizerTest = async (config) => {
  if (!navigator.gpu) return { supported: false, reason: 'navigator.gpu unavailable' };
  let adapter, device;
  try {
    adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: 'no adapter' };
    device = await adapter.requestDevice();
  } catch (e) {
    return { supported: false, reason: 'adapter/device error: ' + (e && e.message ? e.message : String(e)) };
  }
  try {
    const vox = await createWebGpuVoxelizer(
      device, config.userGridSize, config.stockSize, config.stockLocation
    );
    const refEmpty = computeDensityGrid({ ...config, cuts: [] });
    const gpuEmpty = await vox.readGrid();

    const refCut = computeDensityGrid({ ...config, cuts: config.cuts });
    vox.applyCuts(config.cuts);
    const gpuCut = await vox.readGrid();

    const result = {
      supported: true,
      gridSize: vox.gridSize,
      voxelSize: vox.voxelSize,
      gridOffset: vox.gridOffset,
      refGridSize: refEmpty.gridSize,
      iouEmpty: voxelIoU(gpuEmpty, refEmpty.grid),
      iouCut: voxelIoU(gpuCut, refCut.grid),
      removedGpu: countRemovedVoxels(gpuEmpty, gpuCut),
      removedRef: countRemovedVoxels(refEmpty.grid, refCut.grid),
      occupiedGpu: countOccupiedVoxels(gpuCut),
      occupiedRef: countOccupiedVoxels(refCut.grid)
    };
    vox.destroy();
    return result;
  } catch (e) {
    return { supported: true, error: (e && e.message ? e.message : String(e)), stack: e && e.stack };
  } finally {
    try { device.destroy(); } catch (_) {}
  }
};
</script></body></html>`;

let server, baseUrl;

beforeAll(async () => {
	server = http.createServer((req, res) => {
		try {
			if (req.url === "/" || req.url === "/harness.html") {
				res.setHeader("Content-Type", "text/html");
				res.end(HARNESS_HTML);
				return;
			}
			// Serve voxelizer/reference modules from src/services
			const filePath = join(SERVICES_DIR, req.url.replace(/\?.*$/, ""));
			const data = readFileSync(filePath);
			const ext = filePath.endsWith(".js")
				? "text/javascript"
				: "application/octet-stream";
			res.setHeader("Content-Type", ext);
			res.end(data);
		} catch (e) {
			res.statusCode = 404;
			res.end("not found: " + req.url);
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
	if (server) server.close();
});

async function launchChromium() {
	let chromium;
	try {
		({ chromium } = await import("playwright"));
	} catch (_) {
		return null;
	}
	// WebGPU in headless Chromium needs a GPU backend. macOS exposes it via ANGLE/Metal;
	// Linux CI runners (no physical GPU) need SwiftShader software rendering plus the
	// Vulkan feature flags. The test skips gracefully (not fails) if no adapter is found.
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
		return { error: e };
	}
}

describe("webgpuVoxelizer real-shader coverage (headless Chromium + WebGPU)", () => {
	it("GPU density grid matches the JS SDF reference (empty stock + cuts)", async (ctx) => {
		const browser = await launchChromium();
		if (browser === null) {
			// Playwright not installed -> skip, do not fail CI
			ctx.skip(
				true,
				"playwright not installed (run: npm i -D playwright && npx playwright install chromium)",
			);
			return;
		}
		if (browser.error) {
			ctx.skip(
				true,
				"Chromium not installed (run: npx playwright install chromium): " +
					browser.error.message,
			);
			return;
		}
		try {
			const page = await browser.newPage();
			const errors = [];
			page.on("console", (msg) => {
				if (msg.type() === "error") errors.push(msg.text());
			});
			page.on("pageerror", (err) => errors.push(String(err)));
			await page.goto(baseUrl + "/harness.html", { waitUntil: "load" });
			// Wait for the ESM harness to attach window.__runVoxelizerTest
			await page.waitForFunction(
				() => typeof window.__runVoxelizerTest === "function",
				{ timeout: 10000 },
			);

			const result = await page.evaluate(async () =>
				window.__runVoxelizerTest({
					userGridSize: [16, 16, 16],
					stockSize: [10, 10, 10],
					stockLocation: [0, 0, 0],
					cuts: [
						// stationary plunge at stock center
						{
							startX: 5,
							startY: 5,
							startZ: 2,
							endX: 5,
							endY: 5,
							endZ: 2,
							radius: 1.0,
						},
						// facing pass along X at z=3
						{
							startX: 2,
							startY: 5,
							startZ: 3,
							endX: 8,
							endY: 5,
							endZ: 3,
							radius: 0.8,
						},
					],
				}),
			);

			if (!result.supported) {
				// WebGPU not available in this headless build -> skip (not fail) so CI
				// environments without a WebGPU backend are not blocked.
				ctx.skip(
					true,
					"WebGPU not available in headless Chromium: " +
						(result.reason || "unknown"),
				);
				return;
			}
			if (result.error) {
				throw new Error(
					"GPU voxelizer error: " +
						result.error +
						(result.stack ? "\n" + result.stack : ""),
				);
			}
			if (errors.length) {
				throw new Error("page console errors: " + errors.join(" | "));
			}

			// Layout must match the JS reference exactly
			expect(result.gridSize).toEqual(result.refGridSize);

			// Empty stock: GPU sdBox init must match the JS reference voxel-for-voxel
			expect(result.iouEmpty, "empty-stock GPU vs JS IoU").toBeGreaterThan(
				0.999,
			);

			// After cuts: GPU sdSweptTool must match the JS reference (allow a few boundary
			// voxels to differ due to float rounding at the SDF zero-crossing)
			expect(result.iouCut, "cut-stock GPU vs JS IoU").toBeGreaterThan(0.97);

			// Both must report the same carved-voxel count (within ~3% boundary tolerance)
			expect(result.removedGpu, "removed-voxel count GPU > 0").toBeGreaterThan(
				0,
			);
			const tolerance = Math.max(4, Math.round(result.removedRef * 0.03));
			expect(
				Math.abs(result.removedGpu - result.removedRef),
				`removed count GPU=${result.removedGpu} JS=${result.removedRef}`,
			).toBeLessThanOrEqual(tolerance);
		} finally {
			await browser.close();
		}
	}, 60000);
});
