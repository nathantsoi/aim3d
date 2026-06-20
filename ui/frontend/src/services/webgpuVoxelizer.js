import { edgeTable, triTable } from "./marchingCubesTables.js";

// Cutting-model reference: see voxelSdf.js for a pure-JS mirror of the sdBox / sdSweptTool
// SDF math. webgpuVoxelizer.parity.test.js enforces that the WGSL below stays in sync with
// that reference, and webgpuVoxelizer.webgpu.test.js compares the real GPU density grid
// against computeDensityGrid() for real-shader coverage (headless Chrome + WebGPU).
export const createWebGpuVoxelizer = async (
	device,
	userGridSize = [512, 512, 128],
	stockSize = [100, 100, 25],
	stockLocation = [0, 0, 0],
	uiScale = 1.0,
) => {
	// Marching-cubes tables are vendored locally (./marchingCubesTables.js) so the voxelizer
	// has no runtime network dependency. This is required for offline/CI use and for the
	// headless WebGPU parity tests.
	const edgeTableData = edgeTable;
	const triTableData = triTable;

	const padding = 2;
	const gridSize = [
		userGridSize[0] + padding * 2,
		userGridSize[1] + padding * 2,
		userGridSize[2] + padding * 2,
	];

	const numVoxels = gridSize[0] * gridSize[1] * gridSize[2];
	const maxTriangles = Math.floor(numVoxels * 0.2); // Estimate up to 20% of voxels contain triangles
	const maxVertices = maxTriangles * 3;

	// COPY_SRC so readGrid() can copy the SDF density grid back to the CPU for IoU parity
	// tests and debugging.
	const gridBuffer = device.createBuffer({
		size: numVoxels * 4,
		usage:
			GPUBufferUsage.STORAGE |
			GPUBufferUsage.COPY_DST |
			GPUBufferUsage.COPY_SRC,
	});

	const edgeTableBuffer = device.createBuffer({
		size: 256 * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		mappedAtCreation: true,
	});
	new Int32Array(edgeTableBuffer.getMappedRange()).set(edgeTableData);
	edgeTableBuffer.unmap();

	const triTableBuffer = device.createBuffer({
		size: 4096 * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		mappedAtCreation: true,
	});
	new Int32Array(triTableBuffer.getMappedRange()).set(triTableData);
	triTableBuffer.unmap();

	const vertexBuffer = device.createBuffer({
		size: maxVertices * 10 * 4, // 10 floats per vertex: 3 pos, 3 norm, 4 color
		usage:
			GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
	});

	const indexBuffer = device.createBuffer({
		size: maxVertices * 4,
		usage:
			GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX | GPUBufferUsage.COPY_SRC,
	});

	const counterBuffer = device.createBuffer({
		size: 4,
		usage:
			GPUBufferUsage.STORAGE |
			GPUBufferUsage.COPY_DST |
			GPUBufferUsage.COPY_SRC,
	});

	const volumeCounterBuffer = device.createBuffer({
		size: 4,
		usage:
			GPUBufferUsage.STORAGE |
			GPUBufferUsage.COPY_DST |
			GPUBufferUsage.COPY_SRC,
	});
	device.queue.writeBuffer(volumeCounterBuffer, 0, new Uint32Array([0]));

	const paramsBuffer = device.createBuffer({
		size: 128, // Padded for 32 floats
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const cutBuffer = device.createBuffer({
		size: 1000 * 32, // Up to 1000 cuts per batch
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const voxelSize = [
		stockSize[0] / userGridSize[0],
		stockSize[1] / userGridSize[1],
		stockSize[2] / userGridSize[2],
	];
	const gridOffset = [
		stockLocation[0] - padding * voxelSize[0],
		stockLocation[1] - padding * voxelSize[1],
		stockLocation[2] - padding * voxelSize[2],
	];

	const updateParams = (numCuts) => {
		const data = new Float32Array(32);
		const udata = new Uint32Array(data.buffer);
		udata[0] = gridSize[0];
		udata[1] = gridSize[1];
		udata[2] = gridSize[2];
		udata[3] = numCuts;
		data[4] = voxelSize[0];
		data[5] = voxelSize[1];
		data[6] = voxelSize[2];
		data[7] = 0; // pad
		data[8] = gridOffset[0];
		data[9] = gridOffset[1];
		data[10] = gridOffset[2];
		data[11] = 0; // pad
		data[12] = stockSize[0];
		data[13] = stockSize[1];
		data[14] = stockSize[2];
		data[16] = stockLocation[0];
		data[17] = stockLocation[1];
		data[18] = stockLocation[2];
		data[19] = uiScale;
		device.queue.writeBuffer(paramsBuffer, 0, data);
	};
	updateParams(0);

	const initCode = `
    struct Params {
      gridSize: vec3<u32>, numCuts: u32,
      voxelSize: vec3<f32>, pad1: f32,
      gridOffset: vec3<f32>, pad2: f32,
      stockSize: vec3<f32>, pad3: f32,
      stockLocation: vec3<f32>, uiScale: f32,
    };
    @group(0) @binding(0) var<storage, read_write> grid: array<f32>;
    @group(0) @binding(1) var<uniform> params: Params;

    fn sdBox(p: vec3<f32>, b: vec3<f32>) -> f32 {
      let d = abs(p) - b;
      return length(max(d, vec3<f32>(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
    }

    @compute @workgroup_size(8, 8, 4)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      if (global_id.x >= params.gridSize.x || global_id.y >= params.gridSize.y || global_id.z >= params.gridSize.z) { return; }
      let idx = global_id.x + global_id.y * params.gridSize.x + global_id.z * params.gridSize.x * params.gridSize.y;
      let pos = params.gridOffset + vec3<f32>(global_id) * params.voxelSize;
      let boxSize = params.stockSize * 0.5;
      let center = params.stockLocation + boxSize;
      grid[idx] = sdBox(pos - center, boxSize);
    }
  `;

	const cutCode = `
    struct Params {
      gridSize: vec3<u32>, numCuts: u32,
      voxelSize: vec3<f32>, pad1: f32,
      gridOffset: vec3<f32>, pad2: f32,
      stockSize: vec3<f32>, pad3: f32,
      stockLocation: vec3<f32>, uiScale: f32,
    };
    struct Cut {
      start: vec3<f32>, radius: f32,
      end: vec3<f32>, pad: f32,
    };
    @group(0) @binding(0) var<storage, read_write> grid: array<f32>;
    @group(0) @binding(1) var<storage, read> cuts: array<Cut>;
    @group(0) @binding(2) var<uniform> params: Params;
    @group(0) @binding(3) var<storage, read_write> volumeCounter: atomic<u32>;

    fn sdSweptTool(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
      let pa = p.xy - a.xy;
      let ba = b.xy - a.xy;
      let ba2 = dot(ba, ba);
      var h: f32 = 0.0;
      if (ba2 > 0.000001) {
        h = clamp(dot(pa, ba) / ba2, 0.0, 1.0);
      }
      let d_xy = length(pa - ba * h) - r;
      let z_tool = a.z + h * (b.z - a.z);
      let d_z = z_tool - p.z;
      
      let d_out = length(vec2<f32>(max(d_xy, 0.0), max(d_z, 0.0)));
      let d_in = min(max(d_xy, d_z), 0.0);
      return d_out + d_in;
    }

    @compute @workgroup_size(8, 8, 4)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      if (global_id.x >= params.gridSize.x || global_id.y >= params.gridSize.y || global_id.z >= params.gridSize.z) { return; }
      let idx = global_id.x + global_id.y * params.gridSize.x + global_id.z * params.gridSize.x * params.gridSize.y;
      let pos = params.gridOffset + vec3<f32>(global_id) * params.voxelSize;
      var density = grid[idx];
      let originalDensity = density;
      for (var i = 0u; i < params.numCuts; i = i + 1u) {
        let cut = cuts[i];
        let d = sdSweptTool(pos, cut.start, cut.end, cut.radius);
        density = max(density, -d);
      }
      if (originalDensity < 0.0 && density >= 0.0) {
        atomicAdd(&volumeCounter, 1u);
      }
      grid[idx] = density;
    }
  `;

	const mcCode = `
    struct Params {
      gridSize: vec3<u32>, numCuts: u32,
      voxelSize: vec3<f32>, pad1: f32,
      gridOffset: vec3<f32>, pad2: f32,
      stockSize: vec3<f32>, pad3: f32,
      stockLocation: vec3<f32>, uiScale: f32,
    };
    struct Vertex {
      px: f32, py: f32, pz: f32,
      nx: f32, ny: f32, nz: f32,
      cr: f32, cg: f32, cb: f32, ca: f32,
    };
    @group(0) @binding(0) var<storage, read> grid: array<f32>;
    @group(0) @binding(1) var<storage, read> edgeTable: array<i32>;
    @group(0) @binding(2) var<storage, read> triTable: array<i32>;
    @group(0) @binding(3) var<storage, read_write> vertices: array<Vertex>;
    @group(0) @binding(4) var<storage, read_write> indices: array<u32>;
    @group(0) @binding(5) var<storage, read_write> counter: atomic<u32>;
    @group(0) @binding(6) var<uniform> params: Params;

    fn getDensity(x: u32, y: u32, z: u32) -> f32 {
      let idx = x + y * params.gridSize.x + z * params.gridSize.x * params.gridSize.y;
      return grid[idx];
    }
    fn getPos(x: u32, y: u32, z: u32) -> vec3<f32> {
      return params.gridOffset + vec3<f32>(f32(x), f32(y), f32(z)) * params.voxelSize;
    }

    @compute @workgroup_size(8, 8, 4)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      if (global_id.x >= params.gridSize.x - 1u || global_id.y >= params.gridSize.y - 1u || global_id.z >= params.gridSize.z - 1u) { return; }
      
      let x = global_id.x; let y = global_id.y; let z = global_id.z;
      var val = array<f32, 8>(
        getDensity(x, y, z), getDensity(x+1u, y, z),
        getDensity(x+1u, y+1u, z), getDensity(x, y+1u, z),
        getDensity(x, y, z+1u), getDensity(x+1u, y, z+1u),
        getDensity(x+1u, y+1u, z+1u), getDensity(x, y+1u, z+1u)
      );
      
      var p = array<vec3<f32>, 8>(
        getPos(x, y, z), getPos(x+1u, y, z),
        getPos(x+1u, y+1u, z), getPos(x, y+1u, z),
        getPos(x, y, z+1u), getPos(x+1u, y, z+1u),
        getPos(x+1u, y+1u, z+1u), getPos(x, y+1u, z+1u)
      );

      var cubeIndex = 0u;
      if (val[0] < 0.0) { cubeIndex |= 1u; }
      if (val[1] < 0.0) { cubeIndex |= 2u; }
      if (val[2] < 0.0) { cubeIndex |= 4u; }
      if (val[3] < 0.0) { cubeIndex |= 8u; }
      if (val[4] < 0.0) { cubeIndex |= 16u; }
      if (val[5] < 0.0) { cubeIndex |= 32u; }
      if (val[6] < 0.0) { cubeIndex |= 64u; }
      if (val[7] < 0.0) { cubeIndex |= 128u; }

      let edges = edgeTable[cubeIndex];
      if (edges == 0) { return; }

      var vertList = array<vec3<f32>, 12>();
      if ((edges & 1) != 0) { vertList[0] = mix(p[0], p[1], val[0] / (val[0] - val[1])); }
      if ((edges & 2) != 0) { vertList[1] = mix(p[1], p[2], val[1] / (val[1] - val[2])); }
      if ((edges & 4) != 0) { vertList[2] = mix(p[2], p[3], val[2] / (val[2] - val[3])); }
      if ((edges & 8) != 0) { vertList[3] = mix(p[3], p[0], val[3] / (val[3] - val[0])); }
      if ((edges & 16) != 0) { vertList[4] = mix(p[4], p[5], val[4] / (val[4] - val[5])); }
      if ((edges & 32) != 0) { vertList[5] = mix(p[5], p[6], val[5] / (val[5] - val[6])); }
      if ((edges & 64) != 0) { vertList[6] = mix(p[6], p[7], val[6] / (val[6] - val[7])); }
      if ((edges & 128) != 0) { vertList[7] = mix(p[7], p[4], val[7] / (val[7] - val[4])); }
      if ((edges & 256) != 0) { vertList[8] = mix(p[0], p[4], val[0] / (val[0] - val[4])); }
      if ((edges & 512) != 0) { vertList[9] = mix(p[1], p[5], val[1] / (val[1] - val[5])); }
      if ((edges & 1024) != 0) { vertList[10] = mix(p[2], p[6], val[2] / (val[2] - val[6])); }
      if ((edges & 2048) != 0) { vertList[11] = mix(p[3], p[7], val[3] / (val[3] - val[7])); }

      for (var i = 0u; i < 16u; i = i + 3u) {
        let e0 = triTable[cubeIndex * 16u + i];
        if (e0 == -1) { break; }
        let e1 = triTable[cubeIndex * 16u + i + 1u];
        let e2 = triTable[cubeIndex * 16u + i + 2u];
        
        let tIdx = atomicAdd(&counter, 3u);
        let n = normalize(cross(vertList[e1] - vertList[e0], vertList[e2] - vertList[e0]));
        
        vertices[tIdx] = Vertex(vertList[e0].x * params.uiScale, vertList[e0].y * params.uiScale, vertList[e0].z * params.uiScale, n.x, n.y, n.z, 0.5, 0.5, 0.5, 1.0);
        vertices[tIdx+1u] = Vertex(vertList[e1].x * params.uiScale, vertList[e1].y * params.uiScale, vertList[e1].z * params.uiScale, n.x, n.y, n.z, 0.5, 0.5, 0.5, 1.0);
        vertices[tIdx+2u] = Vertex(vertList[e2].x * params.uiScale, vertList[e2].y * params.uiScale, vertList[e2].z * params.uiScale, n.x, n.y, n.z, 0.5, 0.5, 0.5, 1.0);
        
        indices[tIdx] = tIdx;
        indices[tIdx+1u] = tIdx+1u;
        indices[tIdx+2u] = tIdx+2u;
      }
    }
  `;

	const createCompute = (code, bindGroupLayouts) => {
		const module = device.createShaderModule({ code });
		return device.createComputePipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts }),
			compute: { module, entryPoint: "main" },
		});
	};

	const initPipeline = createCompute(initCode, [
		device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "uniform" },
				},
			],
		}),
	]);
	const initBindGroup = device.createBindGroup({
		layout: initPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: gridBuffer } },
			{ binding: 1, resource: { buffer: paramsBuffer } },
		],
	});

	const cutPipeline = createCompute(cutCode, [
		device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "read-only-storage" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "uniform" },
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" },
				},
			],
		}),
	]);
	const cutBindGroup = device.createBindGroup({
		layout: cutPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: gridBuffer } },
			{ binding: 1, resource: { buffer: cutBuffer } },
			{ binding: 2, resource: { buffer: paramsBuffer } },
			{ binding: 3, resource: { buffer: volumeCounterBuffer } },
		],
	});

	const mcPipeline = createCompute(mcCode, [
		device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "read-only-storage" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "read-only-storage" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "read-only-storage" },
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" },
				},
				{
					binding: 4,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" },
				},
				{
					binding: 5,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" },
				},
				{
					binding: 6,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "uniform" },
				},
			],
		}),
	]);
	const mcBindGroup = device.createBindGroup({
		layout: mcPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: gridBuffer } },
			{ binding: 1, resource: { buffer: edgeTableBuffer } },
			{ binding: 2, resource: { buffer: triTableBuffer } },
			{ binding: 3, resource: { buffer: vertexBuffer } },
			{ binding: 4, resource: { buffer: indexBuffer } },
			{ binding: 5, resource: { buffer: counterBuffer } },
			{ binding: 6, resource: { buffer: paramsBuffer } },
		],
	});

	// Run init
	const encoder = device.createCommandEncoder();
	const pass = encoder.beginComputePass();
	pass.setPipeline(initPipeline);
	pass.setBindGroup(0, initBindGroup);
	pass.dispatchWorkgroups(
		Math.ceil(gridSize[0] / 8),
		Math.ceil(gridSize[1] / 8),
		Math.ceil(gridSize[2] / 4),
	);
	pass.end();
	device.queue.submit([encoder.finish()]);

	let vertexCount = 0;
	let totalVolumeRemoved = 0;
	let lastLoggedVolume = -1;
	const countReadBuffer = device.createBuffer({
		size: 8,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
	});

	return {
		vertexBuffer,
		indexBuffer,
		get vertexCount() {
			return vertexCount;
		},
		get volumeRemoved() {
			return totalVolumeRemoved;
		},

		applyCuts(cuts) {
			if (!cuts || cuts.length === 0) return;
			if (cuts.length > 0) {
				console.log(
					`[Voxelizer] applying ${cuts.length} cuts. First cut: ${JSON.stringify(cuts[0])}`,
				);
			}
			const data = new Float32Array(cuts.length * 8);
			for (let i = 0; i < cuts.length; i++) {
				data[i * 8 + 0] = cuts[i].startX;
				data[i * 8 + 1] = cuts[i].startY;
				data[i * 8 + 2] = cuts[i].startZ;
				data[i * 8 + 3] = cuts[i].radius;
				data[i * 8 + 4] = cuts[i].endX;
				data[i * 8 + 5] = cuts[i].endY;
				data[i * 8 + 6] = cuts[i].endZ;
				data[i * 8 + 7] = 0;
			}
			device.queue.writeBuffer(cutBuffer, 0, data);
			updateParams(cuts.length);

			const encoder = device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			pass.setPipeline(cutPipeline);
			pass.setBindGroup(0, cutBindGroup);
			pass.dispatchWorkgroups(
				Math.ceil(gridSize[0] / 8),
				Math.ceil(gridSize[1] / 8),
				Math.ceil(gridSize[2] / 4),
			);
			pass.end();
			device.queue.submit([encoder.finish()]);
		},

		async extractMesh() {
			// Reset counter
			device.queue.writeBuffer(counterBuffer, 0, new Uint32Array([0]));

			const encoder = device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			pass.setPipeline(mcPipeline);
			pass.setBindGroup(0, mcBindGroup);
			pass.dispatchWorkgroups(
				Math.ceil(gridSize[0] / 8),
				Math.ceil(gridSize[1] / 8),
				Math.ceil(gridSize[2] / 4),
			);
			pass.end();

			encoder.copyBufferToBuffer(counterBuffer, 0, countReadBuffer, 0, 4);
			encoder.copyBufferToBuffer(volumeCounterBuffer, 0, countReadBuffer, 4, 4);
			device.queue.submit([encoder.finish()]);

			await countReadBuffer.mapAsync(GPUMapMode.READ);
			const counts = new Uint32Array(countReadBuffer.getMappedRange());
			vertexCount = counts[0];
			const voxelsRemoved = counts[1];
			countReadBuffer.unmap();

			totalVolumeRemoved =
				voxelsRemoved * (voxelSize[0] * voxelSize[1] * voxelSize[2]);
			if (voxelsRemoved > 0 && totalVolumeRemoved !== lastLoggedVolume) {
				lastLoggedVolume = totalVolumeRemoved;
				console.log(
					`[Voxelizer] Volume removed: ${totalVolumeRemoved.toFixed(2)} mm³ (${voxelsRemoved} voxels)`,
				);
			}
		},

		// Layout getters (mirror voxelSdf.js computeDensityGrid) for parity tests/debug.
		get gridSize() {
			return gridSize;
		},
		get voxelSize() {
			return voxelSize;
		},
		get gridOffset() {
			return gridOffset;
		},
		get padding() {
			return padding;
		},

		/**
		 * Copy the SDF density grid back to the CPU. Returns a Float32Array of length
		 * gridSize[0]*gridSize[1]*gridSize[2]. Used by webgpuVoxelizer.webgpu.test.js to
		 * compute IoU against voxelSdf.computeDensityGrid() for real-shader coverage.
		 * Sign convention: density < 0 = inside material, density >= 0 = carved/empty.
		 */
		async readGrid() {
			const readBuffer = device.createBuffer({
				size: numVoxels * 4,
				usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
			});
			const encoder = device.createCommandEncoder();
			encoder.copyBufferToBuffer(gridBuffer, 0, readBuffer, 0, numVoxels * 4);
			device.queue.submit([encoder.finish()]);
			await readBuffer.mapAsync(GPUMapMode.READ);
			const mapped = readBuffer.getMappedRange();
			const out = new Float32Array(mapped.slice(0));
			readBuffer.unmap();
			readBuffer.destroy();
			return out;
		},

		destroy() {
			gridBuffer.destroy();
			edgeTableBuffer.destroy();
			triTableBuffer.destroy();
			vertexBuffer.destroy();
			indexBuffer.destroy();
			counterBuffer.destroy();
			volumeCounterBuffer.destroy();
			paramsBuffer.destroy();
			cutBuffer.destroy();
			countReadBuffer.destroy();
		},
	};
};
