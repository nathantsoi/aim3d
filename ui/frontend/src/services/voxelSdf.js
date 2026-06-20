// Pure-JavaScript reference implementation of the WebGPU voxelizer's signed-distance
// field (SDF) cutting model. This mirrors webgpuVoxelizer.js WGSL shaders byte-for-byte
// (sdBox init, sdSweptTool cut, grid layout, padding, voxel indexing) so that:
//
//   1. The cutting math can be unit-tested at the command line WITHOUT a GPU/浏览器
//      (vitest + jsdom) via intersection-over-union (IoU) against analytic ground truth.
//   2. webgpuVoxelizer.parity.test.js guards against the WGSL drifting from this reference.
//   3. webgpuVoxelizer.webgpu.test.js compares the real GPU grid against this reference
//      to validate the actual shader (real-shader coverage via headless Chrome).
//
// IMPORTANT: If you change the SDF math in webgpuVoxelizer.js, update the matching
// function here AND keep sdSweptTool/sdBox identical. The parity test enforces this.
//
// Sign convention (matches the WGSL):
//   - density < 0  => voxel is INSIDE solid material
//   - density >= 0 => voxel is OUTSIDE (empty / carved)
//   - A cut pushes density toward positive: density = max(density, -sdSweptTool(...))
//     so any voxel inside the tool's swept volume (sdSweptTool < 0) becomes carved.

export const VOXEL_PADDING = 2;

/**
 * Signed distance to an axis-aligned box centered at the origin with half-extents b.
 * Identical to the WGSL sdBox.
 *   sdBox(p, b) = length(max(|p| - b, 0)) + min(max(p.x, p.y, p.z), 0)
 */
export function sdBox(px, py, pz, bx, by, bz) {
	const dx = Math.abs(px) - bx;
	const dy = Math.abs(py) - by;
	const dz = Math.abs(pz) - bz;
	const ox = Math.max(dx, 0);
	const oy = Math.max(dy, 0);
	const oz = Math.max(dz, 0);
	return (
		Math.sqrt(ox * ox + oy * oy + oz * oz) +
		Math.min(Math.max(dx, Math.max(dy, dz)), 0)
	);
}

/**
 * Signed distance to a swept flat-endmill tool segment from a to b with radius r.
 * The tool is modeled as a vertical (Z) cylinder of radius r whose tip follows the
 * segment a->b in the XY plane and which extends upward in +Z from the tip (z_tool).
 * Identical to the WGSL sdSweptTool.
 *
 *   pa = p.xy - a.xy
 *   ba = b.xy - a.xy
 *   h  = clamp(dot(pa,ba)/dot(ba,ba), 0, 1)   (0 when a==b)
 *   d_xy = length(pa - ba*h) - r
 *   d_z  = (a.z + h*(b.z - a.z)) - p.z
 *   d_out = length(max(d_xy,0), max(d_z,0))
 *   d_in  = min(max(d_xy, d_z), 0)
 *   return d_out + d_in
 */
export function sdSweptTool(px, py, pz, ax, ay, az, bx, by, bz, r) {
	const pax = px - ax;
	const pay = py - ay;
	const bax = bx - ax;
	const bay = by - ay;
	const ba2 = bax * bax + bay * bay;
	let h = 0;
	if (ba2 > 1e-6) {
		const dot = pax * bax + pay * bay;
		let hh = dot / ba2;
		if (hh < 0) hh = 0;
		else if (hh > 1) hh = 1;
		h = hh;
	}
	const dxy = Math.sqrt((pax - bax * h) ** 2 + (pay - bay * h) ** 2) - r;
	const zTool = az + h * (bz - az);
	const dz = zTool - pz;
	const dOutX = Math.max(dxy, 0);
	const dOutZ = Math.max(dz, 0);
	const dOut = Math.sqrt(dOutX * dOutX + dOutZ * dOutZ);
	const dIn = Math.min(Math.max(dxy, dz), 0);
	return dOut + dIn;
}

/** Flatten a 3D grid index, matching the WGSL layout: idx = x + y*gx + z*gx*gy. */
export function gridIndex(gridSize, x, y, z) {
	return x + y * gridSize[0] + z * gridSize[0] * gridSize[1];
}

/** World-space center of voxel (x,y,z). */
export function voxelCenter(gridOffset, voxelSize, x, y, z) {
	return [
		gridOffset[0] + x * voxelSize[0],
		gridOffset[1] + y * voxelSize[1],
		gridOffset[2] + z * voxelSize[2],
	];
}

/**
 * Compute the full SDF density grid in pure JS, exactly as the WebGPU init + cut
 * compute shaders would. Returns a Float32Array of length gridSize[0]*gridSize[1]*gridSize[2].
 *
 * @param {object} opts
 * @param {number[]} opts.userGridSize - [gx, gy, gz] resolution (before padding)
 * @param {number[]} opts.stockSize - [sx, sy, sz] in mm
 * @param {number[]} opts.stockLocation - [lx, ly, lz] in mm (box min corner)
 * @param {array}  opts.cuts - array of {startX,startY,startZ,radius,endX,endY,endZ}
 *                             (or {start:[x,y,z], end:[x,y,z], radius})
 * @returns {{ grid: Float32Array, gridSize: number[], voxelSize: number[], gridOffset: number[], padding: number }}
 */
export function computeDensityGrid({
	userGridSize,
	stockSize,
	stockLocation,
	cuts,
}) {
	const gx = userGridSize[0];
	const gy = userGridSize[1];
	const gz = userGridSize[2];
	const padding = VOXEL_PADDING;
	const gridSize = [gx + padding * 2, gy + padding * 2, gz + padding * 2];

	// NOTE: voxelSize divides by userGridSize (NOT gridSize), matching the WGSL.
	const voxelSize = [stockSize[0] / gx, stockSize[1] / gy, stockSize[2] / gz];
	const gridOffset = [
		stockLocation[0] - padding * voxelSize[0],
		stockLocation[1] - padding * voxelSize[1],
		stockLocation[2] - padding * voxelSize[2],
	];

	const total = gridSize[0] * gridSize[1] * gridSize[2];
	const grid = new Float32Array(total);

	const cx = stockLocation[0] + stockSize[0] * 0.5;
	const cy = stockLocation[1] + stockSize[1] * 0.5;
	const cz = stockLocation[2] + stockSize[2] * 0.5;
	const hx = stockSize[0] * 0.5;
	const hy = stockSize[1] * 0.5;
	const hz = stockSize[2] * 0.5;

	// Init pass: sdBox
	for (let z = 0; z < gridSize[2]; z++) {
		for (let y = 0; y < gridSize[1]; y++) {
			for (let x = 0; x < gridSize[0]; x++) {
				const px = gridOffset[0] + x * voxelSize[0];
				const py = gridOffset[1] + y * voxelSize[1];
				const pz = gridOffset[2] + z * voxelSize[2];
				grid[gridIndex(gridSize, x, y, z)] = sdBox(
					px - cx,
					py - cy,
					pz - cz,
					hx,
					hy,
					hz,
				);
			}
		}
	}

	// Cut pass: density = max(density, -sdSweptTool(...))
	if (cuts && cuts.length > 0) {
		const normCuts = cuts.map((c) => ({
			ax: c.startX ?? c.start?.[0] ?? 0,
			ay: c.startY ?? c.start?.[1] ?? 0,
			az: c.startZ ?? c.start?.[2] ?? 0,
			bx: c.endX ?? c.end?.[0] ?? 0,
			by: c.endY ?? c.end?.[1] ?? 0,
			bz: c.endZ ?? c.end?.[2] ?? 0,
			r: c.radius ?? 0,
		}));
		for (let z = 0; z < gridSize[2]; z++) {
			for (let y = 0; y < gridSize[1]; y++) {
				for (let x = 0; x < gridSize[0]; x++) {
					const idx = gridIndex(gridSize, x, y, z);
					const px = gridOffset[0] + x * voxelSize[0];
					const py = gridOffset[1] + y * voxelSize[1];
					const pz = gridOffset[2] + z * voxelSize[2];
					let density = grid[idx];
					for (let i = 0; i < normCuts.length; i++) {
						const c = normCuts[i];
						const d = sdSweptTool(
							px,
							py,
							pz,
							c.ax,
							c.ay,
							c.az,
							c.bx,
							c.by,
							c.bz,
							c.r,
						);
						const neg = -d;
						if (neg > density) density = neg;
					}
					grid[idx] = density;
				}
			}
		}
	}

	return { grid, gridSize, voxelSize, gridOffset, padding };
}

/** Count voxels with density < threshold (inside material). */
export function countOccupiedVoxels(grid, threshold = 0) {
	let n = 0;
	for (let i = 0; i < grid.length; i++) {
		if (grid[i] < threshold) n++;
	}
	return n;
}

/**
 * Intersection-over-union of two density grids' occupied voxel sets.
 * occupied = density < threshold. Returns 1.0 for two empty grids.
 */
export function voxelIoU(gridA, gridB, threshold = 0) {
	if (gridA.length !== gridB.length) {
		throw new Error(
			`voxelIoU: grid length mismatch (${gridA.length} vs ${gridB.length})`,
		);
	}
	let inter = 0;
	let union = 0;
	for (let i = 0; i < gridA.length; i++) {
		const a = gridA[i] < threshold;
		const b = gridB[i] < threshold;
		if (a && b) inter++;
		if (a || b) union++;
	}
	return union === 0 ? 1.0 : inter / union;
}

/**
 * Count voxels that transitioned from inside-material (before < threshold) to
 * outside/carved (after >= threshold). Mirrors the WGSL volumeCounter update.
 */
export function countRemovedVoxels(gridBefore, gridAfter, threshold = 0) {
	if (gridBefore.length !== gridAfter.length) {
		throw new Error(
			`countRemovedVoxels: grid length mismatch (${gridBefore.length} vs ${gridAfter.length})`,
		);
	}
	let n = 0;
	for (let i = 0; i < gridBefore.length; i++) {
		if (gridBefore[i] < threshold && gridAfter[i] >= threshold) n++;
	}
	return n;
}
