// @vitest-environment node
//
// Intersection-over-union (IoU) tests for the pure-JavaScript SDF cutting model in
// voxelSdf.js. These run at the command line WITHOUT a GPU/浏览器 (vitest + node) and
// validate the cutting math that moved out of the C++ material_simulator (OCCT boolean
// subtraction) into the WebGPU voxelizer. The WGSL shader in webgpuVoxelizer.js is
// guarded against drift by webgpuVoxelizer.parity.test.js, and the real GPU shader is
// validated against this same reference by webgpuVoxelizer.webgpu.test.js.
//
// Sign convention (matches WGSL): density < 0 = inside material, density >= 0 = carved.
// A voxel is carved iff it is inside the stock (sdBox < 0) AND inside the tool swept
// volume (sdSweptTool <= 0), because density = max(sdBox, -sdSweptTool) and max(a,b) >= 0
// iff a >= 0 OR b >= 0.

import { describe, it, expect } from "vitest";
import {
	sdBox,
	sdSweptTool,
	computeDensityGrid,
	countOccupiedVoxels,
	countRemovedVoxels,
	voxelIoU,
	gridIndex,
	VOXEL_PADDING,
} from "./voxelSdf";

// --- Independent geometric predicates (NOT reusing voxelSdf formulas) -------------
// These specify the expected tool/stock occupancy directly, so the IoU comparison is a
// real check of voxelSdf's formulas rather than a tautology.

function distPointSegment2D(px, py, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	let t = len2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
	if (t < 0) t = 0;
	else if (t > 1) t = 1;
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	return Math.hypot(px - cx, py - cy);
}

// The WGSL sdSweptTool models a flat-endmill whose tip follows segment a->b in XY and
// extends upward in +Z from the tip. Inside the tool iff within radius r of the XY
// segment AND at/above the interpolated tip Z.
function insideTool(px, py, pz, ax, ay, az, bx, by, bz, r) {
	const dxy = distPointSegment2D(px, py, ax, ay, bx, by);
	if (dxy > r) return false;
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	let t = len2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
	if (t < 0) t = 0;
	else if (t > 1) t = 1;
	const zTip = az + t * (bz - az);
	return pz >= zTip;
}

function insideStock(px, py, pz, loc, size) {
	// Strict interior to match sdBox < 0 (density < 0 = inside material). A voxel
	// exactly on the box face has sdBox == 0 -> outside (carved), so we use strict
	// inequalities rather than inclusive bounds.
	return (
		px > loc[0] &&
		px < loc[0] + size[0] &&
		py > loc[1] &&
		py < loc[1] + size[1] &&
		pz > loc[2] &&
		pz < loc[2] + size[2]
	);
}

// Build the expected occupancy grid (true = material present) from the independent
// predicates, on the same padded grid layout as computeDensityGrid.
function expectedOccupancy(userGridSize, stockSize, stockLocation, cuts) {
	const gx = userGridSize[0],
		gy = userGridSize[1],
		gz = userGridSize[2];
	const padding = VOXEL_PADDING;
	const gridSize = [gx + padding * 2, gy + padding * 2, gz + padding * 2];
	const voxelSize = [stockSize[0] / gx, stockSize[1] / gy, stockSize[2] / gz];
	const gridOffset = [
		stockLocation[0] - padding * voxelSize[0],
		stockLocation[1] - padding * voxelSize[1],
		stockLocation[2] - padding * voxelSize[2],
	];
	const grid = new Float32Array(gridSize[0] * gridSize[1] * gridSize[2]);
	for (let z = 0; z < gridSize[2]; z++) {
		for (let y = 0; y < gridSize[1]; y++) {
			for (let x = 0; x < gridSize[0]; x++) {
				const px = gridOffset[0] + x * voxelSize[0];
				const py = gridOffset[1] + y * voxelSize[1];
				const pz = gridOffset[2] + z * voxelSize[2];
				let carved = !insideStock(px, py, pz, stockLocation, stockSize);
				if (!carved) {
					for (const c of cuts) {
						if (
							insideTool(
								px,
								py,
								pz,
								c.startX,
								c.startY,
								c.startZ,
								c.endX,
								c.endY,
								c.endZ,
								c.radius,
							)
						) {
							carved = true;
							break;
						}
					}
				}
				grid[gridIndex(gridSize, x, y, z)] = carved ? 1.0 : -1.0;
			}
		}
	}
	return { grid, gridSize, voxelSize, gridOffset };
}

// Convert a density grid to a boolean occupancy grid (true = material) for IoU.
function toOccupied(densityGrid) {
	const out = new Uint8Array(densityGrid.length);
	for (let i = 0; i < densityGrid.length; i++)
		out[i] = densityGrid[i] < 0 ? 1 : 0;
	return out;
}

function booleanIoU(a, b) {
	let inter = 0,
		union = 0;
	for (let i = 0; i < a.length; i++) {
		const A = a[i] === 1,
			B = b[i] === 1;
		if (A && B) inter++;
		if (A || B) union++;
	}
	return union === 0 ? 1.0 : inter / union;
}

const STOCK = [10, 10, 10];
const LOC = [0, 0, 0];
const GRID = [16, 16, 16];

describe("voxelSdf sdBox", () => {
	it("is negative inside the box and positive outside", () => {
		expect(sdBox(0, 0, 0, 5, 5, 5)).toBeCloseTo(-5, 5);
		expect(sdBox(10, 0, 0, 5, 5, 5)).toBeCloseTo(5, 5);
		expect(sdBox(4.9, -4.9, 4.9, 5, 5, 5)).toBeLessThan(0);
		expect(sdBox(5.1, 5.1, 5.1, 5, 5, 5)).toBeGreaterThan(0);
	});
});

describe("voxelSdf sdSweptTool", () => {
	it("carves the half-space above the tool tip within radius (stationary tool)", () => {
		const r = 1.0;
		const ax = 5,
			ay = 5,
			az = 5,
			bx = 5,
			by = 5,
			bz = 5;
		// Above tip, within radius -> inside (d < 0)
		expect(sdSweptTool(5, 5, 6, ax, ay, az, bx, by, bz, r)).toBeLessThan(0);
		// At tip center -> boundary (d ~ 0)
		expect(sdSweptTool(5, 5, 5, ax, ay, az, bx, by, bz, r)).toBeCloseTo(0, 4);
		// Below tip -> outside (d > 0): tool extends +Z only
		expect(sdSweptTool(5, 5, 4, ax, ay, az, bx, by, bz, r)).toBeGreaterThan(0);
		// Above tip, outside radius -> outside
		expect(sdSweptTool(7, 5, 6, ax, ay, az, bx, by, bz, r)).toBeGreaterThan(0);
	});

	it("radius zero carves nothing (degenerate to a line, measure-zero volume)", () => {
		const r = 0;
		const ax = 5,
			ay = 5,
			az = 5,
			bx = 8,
			by = 5,
			bz = 5;
		// Along the segment line, above tip: d_xy = 0 (on line), d_z can be < 0, but
		// d_in = min(max(0, d_z), 0) = 0, and d_out = length(max(0,d_z)) so d >= 0.
		expect(
			sdSweptTool(6, 5, 6, ax, ay, az, bx, by, bz, r),
		).toBeGreaterThanOrEqual(0);
		expect(
			sdSweptTool(5, 5, 6, ax, ay, az, bx, by, bz, r),
		).toBeGreaterThanOrEqual(0);
	});
});

describe("voxelSdf computeDensityGrid (IoU vs analytic ground truth)", () => {
	it("empty stock matches the analytic box occupancy (IoU 1.0)", () => {
		const cuts = [];
		const ref = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts,
		});
		const exp = expectedOccupancy(GRID, STOCK, LOC, cuts);
		const iou = booleanIoU(toOccupied(ref.grid), toOccupied(exp.grid));
		expect(iou).toBeCloseTo(1.0, 5);
		expect(countOccupiedVoxels(ref.grid)).toBeGreaterThan(0);
	});

	it("a single plunge carves a vertical column above the tip (IoU >= 0.98)", () => {
		const cuts = [
			{
				startX: 5,
				startY: 5,
				startZ: 2,
				endX: 5,
				endY: 5,
				endZ: 2,
				radius: 1.0,
			},
		];
		const ref = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts,
		});
		const exp = expectedOccupancy(GRID, STOCK, LOC, cuts);
		const iou = booleanIoU(toOccupied(ref.grid), toOccupied(exp.grid));
		expect(iou).toBeGreaterThanOrEqual(0.98);
		// Voxels removed (flipped inside->outside) must be > 0
		const empty = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [],
		});
		expect(countRemovedVoxels(empty.grid, ref.grid)).toBeGreaterThan(0);
		// All removed voxels must be at/above z=2 (tip) and within radius of (5,5)
		const vs = ref.voxelSize;
		const go = ref.gridOffset;
		for (let z = 0; z < ref.gridSize[2]; z++) {
			for (let y = 0; y < ref.gridSize[1]; y++) {
				for (let x = 0; x < ref.gridSize[0]; x++) {
					const idx = gridIndex(ref.gridSize, x, y, z);
					if (empty.grid[idx] < 0 && ref.grid[idx] >= 0) {
						const px = go[0] + x * vs[0],
							py = go[1] + y * vs[1],
							pz = go[2] + z * vs[2];
						expect(pz).toBeGreaterThanOrEqual(2 - 1e-6);
						expect(Math.hypot(px - 5, py - 5)).toBeLessThanOrEqual(1.0 + 1e-6);
					}
				}
			}
		}
	});

	it("a facing pass carves a trench along the segment (IoU >= 0.95)", () => {
		const cuts = [
			{
				startX: 2,
				startY: 5,
				startZ: 3,
				endX: 8,
				endY: 5,
				endZ: 3,
				radius: 0.8,
			},
		];
		const ref = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts,
		});
		const exp = expectedOccupancy(GRID, STOCK, LOC, cuts);
		const iou = booleanIoU(toOccupied(ref.grid), toOccupied(exp.grid));
		expect(iou).toBeGreaterThanOrEqual(0.95);
		expect(countOccupiedVoxels(ref.grid)).toBeGreaterThan(0);
		expect(countOccupiedVoxels(ref.grid)).toBeLessThan(
			countOccupiedVoxels(
				computeDensityGrid({
					userGridSize: GRID,
					stockSize: STOCK,
					stockLocation: LOC,
					cuts: [],
				}).grid,
			),
		);
	});

	it("overlapping passes remove more material than a single pass", () => {
		const one = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [
				{
					startX: 2,
					startY: 4,
					startZ: 3,
					endX: 8,
					endY: 4,
					endZ: 3,
					radius: 0.8,
				},
			],
		});
		const two = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [
				{
					startX: 2,
					startY: 4,
					startZ: 3,
					endX: 8,
					endY: 4,
					endZ: 3,
					radius: 0.8,
				},
				{
					startX: 2,
					startY: 6,
					startZ: 3,
					endX: 8,
					endY: 6,
					endZ: 3,
					radius: 0.8,
				},
			],
		});
		const empty = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [],
		});
		expect(countRemovedVoxels(empty.grid, two.grid)).toBeGreaterThan(
			countRemovedVoxels(empty.grid, one.grid),
		);
	});

	it("a radius-zero cut carves only the zero-thickness boundary line (far less than r=1)", () => {
		// sdSweptTool with r=0 is degenerate: d_xy = 0 exactly on the segment line, so
		// voxels whose centers land on the line and at/above the tip get d = 0, which the
		// shader treats as carved (density = max(density, -0) >= 0). This is measure-zero
		// in continuous space but can hit discrete voxel centers. The independent predicate
		// (insideTool with dxy <= r) agrees, so IoU stays high; we only assert that r=0
		// removes far fewer voxels than r=1 (a line vs a column) and matches the reference.
		const empty = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [],
		});
		const cut0 = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [
				{
					startX: 2,
					startY: 5,
					startZ: 3,
					endX: 8,
					endY: 5,
					endZ: 3,
					radius: 0,
				},
			],
		});
		const cut1 = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [
				{
					startX: 2,
					startY: 5,
					startZ: 3,
					endX: 8,
					endY: 5,
					endZ: 3,
					radius: 1.0,
				},
			],
		});
		const removed0 = countRemovedVoxels(empty.grid, cut0.grid);
		const removed1 = countRemovedVoxels(empty.grid, cut1.grid);
		expect(removed0).toBeGreaterThanOrEqual(0);
		expect(removed1).toBeGreaterThan(0);
		expect(removed0).toBeLessThan(removed1);
		// Must still match the independent analytic occupancy
		const exp = expectedOccupancy(GRID, STOCK, LOC, [
			{ startX: 2, startY: 5, startZ: 3, endX: 8, endY: 5, endZ: 3, radius: 0 },
		]);
		expect(
			booleanIoU(toOccupied(cut0.grid), toOccupied(exp.grid)),
		).toBeGreaterThanOrEqual(0.97);
	});

	it("a cut entirely above the stock removes no material (no-op)", () => {
		const empty = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [],
		});
		const cut = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [
				{
					startX: 2,
					startY: 5,
					startZ: 100,
					endX: 8,
					endY: 5,
					endZ: 100,
					radius: 1.0,
				},
			],
		});
		expect(countRemovedVoxels(empty.grid, cut.grid)).toBe(0);
		expect(voxelIoU(empty.grid, cut.grid)).toBeCloseTo(1.0, 5);
	});

	it("respects stockLocation offset (cut only affects the offset stock)", () => {
		const loc = [50, 50, 0];
		const cuts = [
			{
				startX: 55,
				startY: 55,
				startZ: 2,
				endX: 55,
				endY: 55,
				endZ: 2,
				radius: 1.0,
			},
		];
		const ref = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: loc,
			cuts,
		});
		const exp = expectedOccupancy(GRID, STOCK, loc, cuts);
		const iou = booleanIoU(toOccupied(ref.grid), toOccupied(exp.grid));
		expect(iou).toBeGreaterThanOrEqual(0.98);
		// A cut at the origin (not over the offset stock) must remove nothing
		const away = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: loc,
			cuts: [
				{
					startX: 5,
					startY: 5,
					startZ: 2,
					endX: 5,
					endY: 5,
					endZ: 2,
					radius: 1.0,
				},
			],
		});
		const empty = computeDensityGrid({
			userGridSize: GRID,
			stockSize: STOCK,
			stockLocation: loc,
			cuts: [],
		});
		expect(countRemovedVoxels(empty.grid, away.grid)).toBe(0);
	});

	it("grid layout matches the WGSL padding/voxelSize/gridOffset convention", () => {
		const ref = computeDensityGrid({
			userGridSize: [8, 8, 8],
			stockSize: STOCK,
			stockLocation: LOC,
			cuts: [],
		});
		expect(ref.padding).toBe(VOXEL_PADDING);
		expect(ref.gridSize).toEqual([
			8 + VOXEL_PADDING * 2,
			8 + VOXEL_PADDING * 2,
			8 + VOXEL_PADDING * 2,
		]);
		// voxelSize divides by userGridSize, NOT gridSize
		expect(ref.voxelSize).toEqual([STOCK[0] / 8, STOCK[1] / 8, STOCK[2] / 8]);
		expect(ref.gridOffset).toEqual([
			LOC[0] - VOXEL_PADDING * (STOCK[0] / 8),
			LOC[1] - VOXEL_PADDING * (STOCK[1] / 8),
			LOC[2] - VOXEL_PADDING * (STOCK[2] / 8),
		]);
	});
});
