// @vitest-environment node
//
// Drift guard: asserts that the WGSL shaders in webgpuVoxelizer.js stay in sync with
// the pure-JS reference in voxelSdf.js. This is a TEXT-LEVEL check (no GPU) so it runs
// in plain vitest/node. The NUMERIC parity (GPU grid vs JS grid) is validated by
// webgpuVoxelizer.webgpu.test.js, which launches headless Chromium with WebGPU.
//
// If you change the SDF math in either file, update both to match and keep this test green.
//
// Assertions are matched against a whitespace-collapsed, quote-normalized view of the
// source so the guard survives code formatting (Prettier tabs / double quotes /
// line-wrapping) without losing its semantic meaning.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawSrc = readFileSync(join(__dirname, "webgpuVoxelizer.js"), "utf8");

// Collapse runs of whitespace to a single space and normalize quotes so the drift
// guard is insensitive to formatting (tabs vs spaces, single vs double quotes,
// line-wrapping). The WGSL shader body lives in a template literal and is not
// reformatted, but the JS scaffolding around it is.
const norm = (s) => s.replace(/["']/g, "'").replace(/\s+/g, " ").trim();

const voxelizerSrc = norm(rawSrc);
const N = (s) => norm(s);

describe("webgpuVoxelizer WGSL <-> voxelSdf parity (text guard)", () => {
	it("vendors marching-cubes tables locally (no runtime network fetch)", () => {
		expect(voxelizerSrc).not.toContain("raw.githubusercontent.com");
		expect(rawSrc).not.toMatch(/\bfetch\s*\(/);
		expect(voxelizerSrc).toContain(N("from './marchingCubesTables.js'"));
		expect(voxelizerSrc).toContain(N("import { edgeTable, triTable }"));
	});

	it("sdBox WGSL matches the reference formula", () => {
		// sdBox(p, b) = length(max(d, 0)) + min(max(d.x, max(d.y, d.z)), 0)  where d = abs(p) - b
		expect(voxelizerSrc).toContain(
			N("fn sdBox(p: vec3<f32>, b: vec3<f32>) -> f32"),
		);
		expect(voxelizerSrc).toContain(N("let d = abs(p) - b;"));
		expect(voxelizerSrc).toContain(
			N(
				"return length(max(d, vec3<f32>(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);",
			),
		);
	});

	it("sdSweptTool WGSL matches the reference formula", () => {
		expect(voxelizerSrc).toContain(
			N(
				"fn sdSweptTool(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32) -> f32",
			),
		);
		// XY projection of point onto segment a->b
		expect(voxelizerSrc).toContain(N("let pa = p.xy - a.xy;"));
		expect(voxelizerSrc).toContain(N("let ba = b.xy - a.xy;"));
		expect(voxelizerSrc).toContain(N("h = clamp(dot(pa, ba) / ba2, 0.0, 1.0)"));
		// flat-endmill: radius in XY, tip Z interpolated along segment, extends +Z
		expect(voxelizerSrc).toContain(N("let d_xy = length(pa - ba * h) - r;"));
		expect(voxelizerSrc).toContain(N("let z_tool = a.z + h * (b.z - a.z);"));
		expect(voxelizerSrc).toContain(N("let d_z = z_tool - p.z;"));
		// 2D SDF union (outside/inside)
		expect(voxelizerSrc).toContain(
			N("let d_out = length(vec2<f32>(max(d_xy, 0.0), max(d_z, 0.0)));"),
		);
		expect(voxelizerSrc).toContain(N("let d_in = min(max(d_xy, d_z), 0.0);"));
		expect(voxelizerSrc).toContain(N("return d_out + d_in;"));
	});

	it("cut pass applies density = max(density, -d) (carves where tool SDF < 0)", () => {
		expect(voxelizerSrc).toContain(
			N("let d = sdSweptTool(pos, cut.start, cut.end, cut.radius);"),
		);
		expect(voxelizerSrc).toContain(N("density = max(density, -d);"));
	});

	it("init pass writes sdBox density (inside material = negative)", () => {
		expect(voxelizerSrc).toContain(N("let boxSize = params.stockSize * 0.5;"));
		expect(voxelizerSrc).toContain(
			N("let center = params.stockLocation + boxSize;"),
		);
		expect(voxelizerSrc).toContain(
			N("grid[idx] = sdBox(pos - center, boxSize);"),
		);
	});

	it("uses the same grid layout as voxelSdf (padding=2, voxelSize = stockSize/userGridSize)", () => {
		expect(voxelizerSrc).toContain(N("const padding = 2;"));
		// voxelSize must divide by userGridSize, NOT the padded gridSize. Assert each
		// component separately so the check survives array line-wrapping.
		expect(voxelizerSrc).toContain(N("const voxelSize = ["));
		expect(voxelizerSrc).toContain(N("stockSize[0] / userGridSize[0]"));
		expect(voxelizerSrc).toContain(N("stockSize[1] / userGridSize[1]"));
		expect(voxelizerSrc).toContain(N("stockSize[2] / userGridSize[2]"));
		expect(voxelizerSrc).toContain(
			N("stockLocation[0] - padding * voxelSize[0]"),
		);
	});

	it("grid indexing matches voxelSdf (idx = x + y*gx + z*gx*gy)", () => {
		expect(voxelizerSrc).toContain(
			N(
				"let idx = global_id.x + global_id.y * params.gridSize.x + global_id.z * params.gridSize.x * params.gridSize.y;",
			),
		);
	});

	it("exposes readGrid() for real-shader IoU parity tests", () => {
		expect(voxelizerSrc).toContain(N("async readGrid()"));
		expect(voxelizerSrc).toContain(
			N("GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST"),
		);
		expect(voxelizerSrc).toContain(
			N(
				"encoder.copyBufferToBuffer(gridBuffer, 0, readBuffer, 0, numVoxels * 4)",
			),
		);
	});

	it("gridBuffer is COPY_SRC so the density grid can be read back", () => {
		expect(voxelizerSrc).toContain(
			N(
				"GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC",
			),
		);
	});
});
