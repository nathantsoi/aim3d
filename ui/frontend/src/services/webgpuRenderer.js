import { adaptViewportScene } from './viewportSceneAdapter';
import { cameraEye, cameraUp } from './viewportControls';

const GPU_BUFFER_USAGE = globalThis.GPUBufferUsage ?? {
  VERTEX: 1,
  INDEX: 2,
  COPY_DST: 8,
  UNIFORM: 16
};

const VERTEX_SHADER = `
struct Uniforms {
  viewProj: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct SolidIn {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
};

struct LineIn {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
};

struct Out {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn solid_main(input: SolidIn) -> Out {
  var out: Out;
  let light = normalize(vec3<f32>(0.4, 0.7, 0.9));
  let shade = max(dot(normalize(input.normal), light), 0.18);
  out.position = uniforms.viewProj * vec4<f32>(input.position, 1.0);
  out.color = vec4<f32>(input.color.rgb * shade, input.color.a);
  return out;
}

@vertex
fn plane_main(input: SolidIn) -> Out {
  var out: Out;
  out.position = uniforms.viewProj * vec4<f32>(input.position, 1.0);
  out.color = input.color;
  return out;
}

@vertex
fn line_main(input: LineIn) -> Out {
  var out: Out;
  out.position = uniforms.viewProj * vec4<f32>(input.position, 1.0);
  out.color = input.color;
  return out;
}

@fragment
fn fragment_main(input: Out) -> @location(0) vec4<f32> {
  return input.color;
}
`;

const mat4Multiply = (a, b) => {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[row * 4 + col] =
        a[row * 4 + 0] * b[0 * 4 + col] +
        a[row * 4 + 1] * b[1 * 4 + col] +
        a[row * 4 + 2] * b[2 * 4 + col] +
        a[row * 4 + 3] * b[3 * 4 + col];
    }
  }
  return out;
};

const perspective = (fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0
  ]);
};

const orthographic = (size, aspect, near, far) => {
  const right = Math.max(0.001, size * aspect);
  const top = Math.max(0.001, size);
  const nf = 1 / (near - far);
  return new Float32Array([
    1 / right, 0, 0, 0,
    0, 1 / top, 0, 0,
    0, 0, 2 * nf, 0,
    0, 0, (far + near) * nf, 1
  ]);
};

const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const lookAt = (eye, center, up) => {
  const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
};

const cameraMatrix = (camera, width, height) => {
  const target = camera?.target ?? [0, 0, 0];
  const distance = camera?.distance ?? 5;
  const eye = cameraEye(camera);
  const aspect = Math.max(1, width) / Math.max(1, height);
  const near = camera?.near ?? 0.01;
  const far = camera?.far ?? 100;
  const projection =
    camera?.projection === 'orthographic'
      ? orthographic(distance * 0.5, aspect, near, far)
      : perspective(Math.PI / 4, aspect, near, far);
  return mat4Multiply(lookAt(eye, target, cameraUp(camera)), projection);
};

const createBuffer = (device, data, usage) => {
  if (!data?.byteLength) return null;
  const buffer = device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage,
    mappedAtCreation: true
  });
  const target = data instanceof Uint32Array
    ? new Uint32Array(buffer.getMappedRange())
    : new Float32Array(buffer.getMappedRange());
  target.set(data);
  buffer.unmap();
  return buffer;
};

export const createWebGpuViewportRenderer = async (canvas, onDiagnostics = () => {}) => {
  if (!globalThis.navigator?.gpu) {
    return {
      available: false,
      reason: 'WebGPU is unavailable in this webview.',
      updateScene() {},
      resize() {},
      render() {},
      destroy() {}
    };
  }

  const adapter = await globalThis.navigator.gpu.requestAdapter();
  if (!adapter) {
    return {
      available: false,
      reason: 'No compatible WebGPU adapter was found.',
      updateScene() {},
      resize() {},
      render() {},
      destroy() {}
    };
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = globalThis.navigator.gpu.getPreferredCanvasFormat();
  const shader = device.createShaderModule({ code: VERTEX_SHADER });
  let width = 1;
  let height = 1;
  let depthTexture = null;
  let adapted = adaptViewportScene(null);
  let buffers = {};
  let lastKey = null;
  let frameStarted = performance.now();

  const uniformBuffer = device.createBuffer({
    size: 64,
    usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: 1, buffer: { type: 'uniform' } }]
  });
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const solidPipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: 'solid_main',
      buffers: [{
        arrayStride: 40,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x4' }
        ]
      }]
    },
    fragment: {
      module: shader,
      entryPoint: 'fragment_main',
      targets: [{ format }]
    },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
  });

  const constructionPlanePipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: 'plane_main',
      buffers: [{
        arrayStride: 40,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x4' }
        ]
      }]
    },
    fragment: {
      module: shader,
      entryPoint: 'fragment_main',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
        }
      }]
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' }
  });

  const linePipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: 'line_main',
      buffers: [{
        arrayStride: 28,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x4' }
        ]
      }]
    },
    fragment: {
      module: shader,
      entryPoint: 'fragment_main',
      targets: [{ format }]
    },
    primitive: { topology: 'line-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' }
  });

  const resize = () => {
    const nextWidth = Math.max(1, Math.floor(canvas.clientWidth * (globalThis.devicePixelRatio || 1)));
    const nextHeight = Math.max(1, Math.floor(canvas.clientHeight * (globalThis.devicePixelRatio || 1)));
    if (nextWidth === width && nextHeight === height && depthTexture) return;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    context.configure({ device, format, alphaMode: 'opaque' });
    depthTexture?.destroy?.();
    depthTexture = device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: 16
    });
  };

  const updateScene = (scene, selectedEntityId, hoverEntityId = null) => {
    const nextAdapted = adaptViewportScene(scene, selectedEntityId, hoverEntityId);
    if (nextAdapted.key === lastKey) return;
    buffers.solidVertex?.destroy?.();
    buffers.solidIndex?.destroy?.();
    buffers.constructionVertex?.destroy?.();
    buffers.constructionIndex?.destroy?.();
    buffers.lineVertex?.destroy?.();
    adapted = nextAdapted;
    lastKey = nextAdapted.key;
    buffers = {
      solidVertex: createBuffer(device, adapted.solidVertices, GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST),
      solidIndex: createBuffer(device, adapted.solidIndices, GPU_BUFFER_USAGE.INDEX | GPU_BUFFER_USAGE.COPY_DST),
      constructionVertex: createBuffer(
        device,
        adapted.constructionVertices,
        GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST
      ),
      constructionIndex: createBuffer(
        device,
        adapted.constructionIndices,
        GPU_BUFFER_USAGE.INDEX | GPU_BUFFER_USAGE.COPY_DST
      ),
      lineVertex: createBuffer(device, adapted.lineVertices, GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST)
    };
  };

  const render = (scene) => {
    resize();
    device.queue.writeBuffer(uniformBuffer, 0, cameraMatrix(scene?.camera, width, height));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.45, g: 0.46, b: 0.48, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });
    pass.setBindGroup(0, bindGroup);
    if (buffers.solidVertex && buffers.solidIndex && adapted.solidIndices.length) {
      pass.setPipeline(solidPipeline);
      pass.setVertexBuffer(0, buffers.solidVertex);
      pass.setIndexBuffer(buffers.solidIndex, 'uint32');
      pass.drawIndexed(adapted.solidIndices.length);
    }
    if (buffers.constructionVertex && buffers.constructionIndex && adapted.constructionIndices.length) {
      pass.setPipeline(constructionPlanePipeline);
      pass.setVertexBuffer(0, buffers.constructionVertex);
      pass.setIndexBuffer(buffers.constructionIndex, 'uint32');
      pass.drawIndexed(adapted.constructionIndices.length);
    }
    if (buffers.lineVertex && adapted.lineVertices.length) {
      pass.setPipeline(linePipeline);
      pass.setVertexBuffer(0, buffers.lineVertex);
      pass.draw(adapted.lineVertices.length / 7);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);

    const now = performance.now();
    const frameTimeMs = now - frameStarted;
    frameStarted = now;
    onDiagnostics({
      webgpuAvailable: true,
      frameTimeMs,
      fps: frameTimeMs > 0 ? 1000 / frameTimeMs : 0,
      drawCount: adapted.drawCount,
      triangleCount: adapted.triangleCount,
      segmentCount: adapted.segmentCount
    });
  };

  resize();
  return {
    available: true,
    updateScene,
    resize,
    render,
    destroy() {
      buffers.solidVertex?.destroy?.();
      buffers.solidIndex?.destroy?.();
      buffers.constructionVertex?.destroy?.();
      buffers.constructionIndex?.destroy?.();
      buffers.lineVertex?.destroy?.();
      depthTexture?.destroy?.();
      uniformBuffer?.destroy?.();
    }
  };
};
