import {
  resolveGpuInteractionActionAtUv,
} from "@plasius/gpu-interaction";
import {
  createGpuRenderer,
  supportsWebGpu,
  type GpuRenderer,
  type RendererEncodeFrameEvent,
} from "@plasius/gpu-renderer";
import type { SystemDemoModuleId } from "../index.js";
import { resolvePlayerLook, type PlayerLookState } from "./look.js";
import {
  createSystemSceneRayTracingPlan,
  type SystemSceneRayTracingPlan,
} from "./rayTracing.js";
import {
  rasterizeSystemPanels,
  type SystemPanelAction,
  type SystemPanelKind,
  type SystemPanelRaster,
  type SystemSceneSurfaceState,
} from "./surfaceRasterizer.js";

export interface SystemSceneController {
  readonly rendererMode: "webgpu" | "canvas";
  readonly setFocus: (moduleId: SystemDemoModuleId) => void;
  readonly setSurfaceState: (state: SystemSceneSurfaceState) => void;
  readonly getDiagnostics: () => SystemSceneDiagnostics;
  readonly getActions: () => readonly SystemPanelAction[];
  readonly pickAction: (clientX: number, clientY: number) => SystemPanelAction | undefined;
  readonly renderFrame: (timeMs: number) => void;
  readonly waitForFrame: () => Promise<void>;
  readonly getLookState: (timeMs?: number) => PlayerLookState;
  readonly dispose: () => void;
}

export type SystemSceneQualityMode = "standard" | "ultra";
export type SystemScenePresentationMode = "geometry" | "ray-traced";
export type SystemSceneRayDebugMode = "off" | "hits" | "solid";

export interface SystemSceneDiagnostics {
  readonly panelRasterCount: number;
  readonly traceTriangleCount: number;
  readonly traceNodeCount: number;
  readonly raySampleCount?: number;
  readonly rayDebugMode: SystemSceneRayDebugMode;
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly pixelRatio?: number;
  readonly requestedPixelRatio?: number;
  readonly maxTextureDimension2D?: number;
  readonly gpuError?: string;
  readonly shaderDiagnostics?: readonly string[];
}

export interface SystemSceneOptions {
  readonly allowCanvasFallback?: boolean;
  readonly manualFrame?: boolean;
  readonly qualityMode?: SystemSceneQualityMode;
  readonly presentationMode?: SystemScenePresentationMode;
  readonly rayDebugMode?: SystemSceneRayDebugMode;
  readonly raySamples?: number;
  readonly renderScale?: number;
}

type Vec3 = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

interface AmbientParticle {
  readonly position: Vec3;
  readonly phase: number;
  readonly speed: number;
  readonly scale: number;
  readonly tone: number;
}

interface EncodedSceneFrame {
  readonly timeMs: number;
  readonly focus: SystemDemoModuleId;
  readonly look: PlayerLookState;
}

interface RenderEncodeEvent {
  readonly device: GPUDevice;
  readonly pass: GPURenderPassEncoder;
  readonly canvas: HTMLCanvasElement;
}

interface SceneGpuResources {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly uniformBuffer: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
  readonly trianglePipeline: GPURenderPipeline;
  readonly linePipeline: GPURenderPipeline;
  readonly texturedPipeline: GPURenderPipeline;
  readonly rayTracePipeline: GPURenderPipeline;
  readonly rayTraceHitDebugPipeline: GPURenderPipeline;
  readonly solidDebugPipeline: GPURenderPipeline;
  readonly denoisePipeline: GPURenderPipeline;
  readonly textureBindGroupLayout: GPUBindGroupLayout;
  readonly rayTraceBindGroupLayout: GPUBindGroupLayout;
  readonly denoiseBindGroupLayout: GPUBindGroupLayout;
  readonly textureSampler: GPUSampler;
  readonly rayTraceSampler: GPUSampler;
  readonly rayTraceUniformBuffer: GPUBuffer;
  readonly fallbackPanelTexture: GPUTexture;
  readonly fallbackPanelTextureView: GPUTextureView;
  readonly shaderDiagnostics: string[];
  triangleBuffer?: GPUBuffer;
  triangleCapacity: number;
  traceTriangleBuffer?: GPUBuffer;
  traceTriangleCapacity: number;
  traceTriangleCount: number;
  traceNodeBuffer?: GPUBuffer;
  traceNodeCapacity: number;
  traceNodeCount: number;
  lineBuffer?: GPUBuffer;
  lineCapacity: number;
  sceneTexture?: GPUTexture;
  sceneTextureView?: GPUTextureView;
  sceneTextureWidth: number;
  sceneTextureHeight: number;
  rayTraceTexture?: GPUTexture;
  rayTraceTextureView?: GPUTextureView;
  rayTraceTextureWidth: number;
  rayTraceTextureHeight: number;
}

interface PanelGpuSurface {
  readonly kind: SystemPanelKind;
  readonly versionKey: string;
  readonly texture: GPUTexture;
  readonly textureView: GPUTextureView;
  readonly bindGroup: GPUBindGroup;
  readonly vertexBuffer: GPUBuffer;
  readonly vertexCount: number;
}

interface ProjectedTextureVertex {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly u: number;
  readonly v: number;
}

interface SceneRenderSettings {
  readonly qualityMode: SystemSceneQualityMode;
  readonly presentationMode: SystemScenePresentationMode;
  readonly rayDebugMode: SystemSceneRayDebugMode;
  readonly raySamples?: number;
  readonly renderScale: number;
  readonly particleCount: number;
  readonly backgroundParticleCount: number;
  readonly lightingBoost: number;
  readonly accentBoost: number;
  readonly rayTracing: SystemSceneRayTracingPlan;
}

interface SceneResizeDiagnostics {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly pixelRatio: number;
  readonly requestedPixelRatio: number;
  readonly maxTextureDimension2D: number;
}

const vertexFloats = 7;
const textureVertexFloats = 9;
const traceTriangleFloats = 24;
const traceNodeFloats = 12;
const traceMeshLeafSize = 8;
const matrixBytes = 64;
const rayTraceUniformBytes = 192;
const gpuBufferUsage = {
  copyDst: 0x0008,
  vertex: 0x0020,
  uniform: 0x0040,
  storage: 0x0080,
} as const;
const gpuTextureUsage = {
  copyDst: 0x0002,
  textureBinding: 0x0004,
  renderAttachment: 0x0010,
} as const;
const gpuShaderStage = {
  vertex: 0x0001,
  fragment: 0x0002,
} as const;
const focusColors: Record<SystemDemoModuleId, Rgba> = {
  "missions-quests": [0.894, 0.706, 0.373, 1],
  "mcc-core": [0.388, 0.78, 0.741, 1],
  "spell-creation": [0.89, 0.506, 0.435, 1],
};

const materialUnknown = 0;
const materialGround = 1;
const materialLeaf = 3;
const materialBark = 4;
const materialEmitter = 5;
const materialFlora = 6;
const traceMaterialsByGeometry = new WeakMap<number[], number[]>();

const gpuClearColor: Rgba = [0.025, 0.065, 0.092, 1];

const shaderSource = `
struct Uniforms {
  viewProjection: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.viewProjection * vec4<f32>(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`;

const texturedShaderSource = `
struct Uniforms {
  viewProjection: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(0) var screenTexture: texture_2d<f32>;
@group(1) @binding(1) var screenSampler: sampler;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) tint: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.viewProjection * vec4<f32>(input.position, 1.0);
  output.uv = input.uv;
  output.tint = input.tint;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let sampled = textureSample(screenTexture, screenSampler, input.uv);
  if (sampled.a < 0.01) {
    discard;
  }
  return vec4<f32>(sampled.rgb * input.tint.rgb, sampled.a * input.tint.a);
}
`;

const rayTraceShaderSource = `
struct RayTraceUniforms {
  frame: vec4<f32>,
  camera0: vec4<f32>,
  camera1: vec4<f32>,
  camera2: vec4<f32>,
  camera3: vec4<f32>,
  lighting: vec4<f32>,
  params: vec4<f32>,
  accent: vec4<f32>,
  panelFlags: vec4<f32>,
  mesh: vec4<f32>,
};

struct MeshTriangle {
  p0: vec4<f32>,
  p1: vec4<f32>,
  p2: vec4<f32>,
  c0: vec4<f32>,
  c1: vec4<f32>,
  c2: vec4<f32>,
};

struct MeshBvhNode {
  boundsMin: vec4<f32>,
  boundsMax: vec4<f32>,
  payload: vec4<f32>,
};

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: RayTraceUniforms;
@group(0) @binding(3) var navTexture: texture_2d<f32>;
@group(0) @binding(4) var screenTexture: texture_2d<f32>;
@group(0) @binding(5) var contextTexture: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> meshTriangles: array<MeshTriangle>;
@group(0) @binding(7) var<storage, read> meshNodes: array<MeshBvhNode>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(3.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );
  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return output;
}

fn luminance(color: vec3<f32>) -> f32 {
  return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn saturation(color: vec3<f32>) -> f32 {
  let high = max(color.r, max(color.g, color.b));
  let low = min(color.r, min(color.g, color.b));
  return high - low;
}

fn safeUv(uv: vec2<f32>) -> vec2<f32> {
  return clamp(uv, vec2<f32>(0.001, 0.001), vec2<f32>(0.999, 0.999));
}

fn hash11(value: f32) -> f32 {
  return fract(sin(value * 12.9898 + value * value * 0.0017) * 43758.5453);
}

fn hash21(cell: vec2<f32>) -> f32 {
  return fract(sin(dot(cell, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn mixColor(a: vec3<f32>, b: vec3<f32>, amount: f32) -> vec3<f32> {
  return a + (b - a) * clamp(amount, 0.0, 1.0);
}

fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let lower = vec3<f32>(0.035, 0.08, 0.105);
  let horizon = vec3<f32>(0.57, 0.71, 0.62);
  let middle = vec3<f32>(0.34, 0.6, 0.75);
  let zenith = vec3<f32>(0.105, 0.27, 0.49);
  let vertical = (dir.y + 1.0) * 0.5;
  var base = mixColor(lower, horizon, smoothstep(0.08, 0.46, vertical));
  if (vertical >= 0.46) {
    base = mixColor(horizon, middle, smoothstep(0.46, 0.76, vertical));
  }
  if (vertical >= 0.76) {
    base = mixColor(middle, zenith, smoothstep(0.76, 1.0, vertical));
  }
  let sunAlignment = dot(dir, uniforms.lighting.xyz);
  let sunDisc = smoothstep(0.9991, 0.99986, sunAlignment);
  let sunCorona = smoothstep(0.88, 0.999, sunAlignment);
  let horizonGlow = smoothstep(-0.1, 0.16, dir.y) * (1.0 - smoothstep(0.32, 0.68, dir.y));
  let coronaColor = mixColor(base, vec3<f32>(1.0, 0.72, 0.38), horizonGlow * 0.1 + sunCorona * 0.38);
  return mixColor(coronaColor, vec3<f32>(1.0, 0.86, 0.52), sunDisc * 0.74);
}

fn groundHeight(x: f32, z: f32) -> f32 {
  let radius = length(vec2<f32>(x * 0.78, z * 0.92));
  let broadUndulation =
    sin(x * 0.08 + z * 0.045) * 0.055 +
    sin(x * 0.035 - z * 0.105 + 1.2) * 0.075;
  let nearRise = exp(-((x + 10.0) * (x + 10.0) + (z - 3.0) * (z - 3.0)) / 360.0) * 0.15;
  let distantRise = exp(-((x - 18.0) * (x - 18.0) + (z + 18.0) * (z + 18.0)) / 520.0) * 0.22;
  let curvature = -radius * radius * 0.000075;
  return -0.54 + broadUndulation + nearRise + distantRise + curvature;
}

fn groundNormal(position: vec3<f32>) -> vec3<f32> {
  let stepSize = 0.18;
  let hx0 = groundHeight(position.x - stepSize, position.z);
  let hx1 = groundHeight(position.x + stepSize, position.z);
  let hz0 = groundHeight(position.x, position.z - stepSize);
  let hz1 = groundHeight(position.x, position.z + stepSize);
  return normalize(vec3<f32>(hx0 - hx1, stepSize * 2.0, hz0 - hz1));
}

fn grassColor(position: vec3<f32>) -> vec3<f32> {
  let x = position.x;
  let z = position.z;
  let radius = length(vec2<f32>(x * 0.78, z * 0.92));
  let base = vec3<f32>(0.075, 0.235, 0.11);
  let lit = vec3<f32>(0.18, 0.38, 0.15);
  let far = vec3<f32>(0.105, 0.235, 0.15);
  let noise = sin(x * 0.16 + z * 0.11) * 0.5 + sin(x * 0.07 - z * 0.18 + 0.6) * 0.5;
  let grassPatch = mixColor(base, lit, clamp(0.42 + noise * 0.18, 0.0, 1.0));
  return mixColor(grassPatch, far, smoothstep(38.0, 104.0, radius));
}

fn vegetationDensity(position: vec3<f32>) -> f32 {
  let ground = groundHeight(position.x, position.z);
  let height = position.y - ground;
  if (height < 0.0 || height > 2.6) {
    return 0.0;
  }
  let meadowBand = smoothstep(0.2, 1.0, position.z) * (1.0 - smoothstep(11.8, 16.0, position.z));
  let cell = floor(position.xz * vec2<f32>(1.8, 2.2));
  let local = fract(position.xz * vec2<f32>(1.8, 2.2)) - vec2<f32>(0.5, 0.5);
  let flowerHash = hash21(cell);
  let flowerMask = smoothstep(0.76, 0.99, flowerHash) *
    (1.0 - smoothstep(0.08, 0.22, length(local))) *
    smoothstep(0.08, 0.18, height) *
    (1.0 - smoothstep(0.22, 0.48, height));
  return meadowBand * flowerMask;
}

struct Hit {
  hit: f32,
  t: f32,
  position: vec3<f32>,
  normal: vec3<f32>,
  color: vec3<f32>,
  roughness: f32,
  reflectance: f32,
  emission: f32,
  material: f32,
};

fn missHit() -> Hit {
  return Hit(0.0, 99999.0, vec3<f32>(0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0), 1.0, 0.0, 0.0, 0.0);
}

fn betterHit(current: Hit, candidate: Hit) -> Hit {
  if (candidate.hit > 0.5 && candidate.t < current.t) {
    return candidate;
  }
  return current;
}

fn materialWeight(material: f32, targetMaterial: f32) -> f32 {
  return 1.0 - smoothstep(0.08, 0.22, abs(material - targetMaterial));
}

fn explicitMaterialSurface(material: f32) -> vec4<f32> {
  if (materialWeight(material, 1.0) > 0.5) {
    return vec4<f32>(0.97, uniforms.params.y * 0.026, 0.0, 1.0);
  }
  if (materialWeight(material, 3.0) > 0.5) {
    return vec4<f32>(0.91, uniforms.params.y * 0.006, 0.0, 3.0);
  }
  if (materialWeight(material, 4.0) > 0.5) {
    return vec4<f32>(0.86, uniforms.params.y * 0.004, 0.0, 4.0);
  }
  if (materialWeight(material, 5.0) > 0.5) {
    return vec4<f32>(1.0, 0.0, 1.0, 5.0);
  }
  if (materialWeight(material, 6.0) > 0.5) {
    return vec4<f32>(0.94, 0.0, 0.0, 6.0);
  }
  return vec4<f32>(0.92, 0.0, 0.0, 0.0);
}

fn meshSurfaceProperties(position: vec3<f32>, normal: vec3<f32>, color: vec3<f32>, explicitMaterial: f32) -> vec4<f32> {
  if (explicitMaterial > 0.5) {
    let surface = explicitMaterialSurface(explicitMaterial);
    if (surface.w > 0.5) {
      return surface;
    }
  }

  let heightAboveGround = position.y - groundHeight(position.x, position.z);
  let groundLike =
    smoothstep(0.58, 0.86, normal.y) *
    (1.0 - smoothstep(0.1, 0.34, heightAboveGround));
  let greenDominance = color.g - max(color.r, color.b);
  let leafLike =
    smoothstep(0.035, 0.18, greenDominance) *
    smoothstep(0.2, 0.72, heightAboveGround) *
    (1.0 - groundLike);
  let barkLike =
    smoothstep(0.035, 0.16, color.r - color.g) *
    smoothstep(0.08, 0.7, heightAboveGround) *
    (1.0 - groundLike);
  let meadowFloraLike =
    smoothstep(-0.5, 1.2, position.z) *
    (1.0 - smoothstep(0.08, 0.68, heightAboveGround)) *
    (1.0 - groundLike);
  let skyShellLike = smoothstep(108.0, 126.0, length(position - vec3<f32>(0.0, 2.2, 0.0)));
  let brightEmitterLike =
    smoothstep(0.62, 0.9, luminance(color)) *
    smoothstep(0.12, 0.34, saturation(color)) *
    smoothstep(7.0, 24.0, position.y);

  var roughness = 0.92;
  var reflectance = 0.0;
  var emission = 0.0;
  var material = 4.0;

  if (groundLike > 0.35) {
    roughness = 0.97;
    reflectance = uniforms.params.y * 0.026;
    material = 1.0;
  }
  if (leafLike > 0.22) {
    roughness = 0.91;
    reflectance = uniforms.params.y * 0.006;
    material = 3.0;
  }
  if (barkLike > 0.42 && leafLike < 0.26) {
    roughness = 0.86;
    reflectance = uniforms.params.y * 0.004;
    material = 4.0;
  }
  if (meadowFloraLike > 0.35) {
    roughness = 0.94;
    reflectance = 0.0;
    material = 6.0;
  }
  if (skyShellLike > 0.55) {
    roughness = 1.0;
    reflectance = 0.0;
    emission = 0.88;
    material = 5.0;
  }
  if (brightEmitterLike > 0.62) {
    roughness = 1.0;
    reflectance = 0.0;
    emission = 1.3;
    material = 5.0;
  }

  return vec4<f32>(roughness, reflectance, emission, material);
}

fn safeDirectionComponent(value: f32) -> f32 {
  if (abs(value) >= 0.00001) {
    return value;
  }
  if (value < 0.0) {
    return -0.00001;
  }
  return 0.00001;
}

fn intersectAabb(origin: vec3<f32>, direction: vec3<f32>, boundsMin: vec3<f32>, boundsMax: vec3<f32>, maxT: f32) -> f32 {
  let invDirection = vec3<f32>(
    1.0 / safeDirectionComponent(direction.x),
    1.0 / safeDirectionComponent(direction.y),
    1.0 / safeDirectionComponent(direction.z)
  );
  let t0 = (boundsMin - origin) * invDirection;
  let t1 = (boundsMax - origin) * invDirection;
  let tNear3 = min(t0, t1);
  let tFar3 = max(t0, t1);
  let nearT = max(max(tNear3.x, tNear3.y), max(tNear3.z, 0.0));
  let farT = min(min(tFar3.x, tFar3.y), min(tFar3.z, maxT));
  if (farT >= nearT) {
    return nearT;
  }
  return 99999.0;
}

fn intersectMeshTriangle(triangle: MeshTriangle, origin: vec3<f32>, direction: vec3<f32>, maxT: f32) -> Hit {
  let edge1 = triangle.p1.xyz - triangle.p0.xyz;
  let edge2 = triangle.p2.xyz - triangle.p0.xyz;
  let pvec = cross(direction, edge2);
  let determinant = dot(edge1, pvec);
  if (abs(determinant) < 0.000001) {
    return missHit();
  }

  let inverseDeterminant = 1.0 / determinant;
  let tvec = origin - triangle.p0.xyz;
  let u = dot(tvec, pvec) * inverseDeterminant;
  if (u < 0.0 || u > 1.0) {
    return missHit();
  }

  let qvec = cross(tvec, edge1);
  let v = dot(direction, qvec) * inverseDeterminant;
  if (v < 0.0 || u + v > 1.0) {
    return missHit();
  }

  let t = dot(edge2, qvec) * inverseDeterminant;
  if (t < 0.035 || t > maxT) {
    return missHit();
  }

  let w = 1.0 - u - v;
  let position = origin + direction * t;
  let rawNormal = normalize(cross(edge1, edge2));
  let normal = select(-rawNormal, rawNormal, dot(rawNormal, -direction) > 0.0);
  let color =
    triangle.c0.rgb * w +
    triangle.c1.rgb * u +
    triangle.c2.rgb * v;
  let alpha =
    triangle.c0.a * w +
    triangle.c1.a * u +
    triangle.c2.a * v;
  if (alpha < 0.015) {
    return missHit();
  }

  let material = max(triangle.p0.w, max(triangle.p1.w, triangle.p2.w));
  let surface = meshSurfaceProperties(position, normal, color, material);
  return Hit(1.0, t, position, normal, color, surface.x, surface.y, surface.z, surface.w);
}

fn intersectMesh(origin: vec3<f32>, direction: vec3<f32>, maxT: f32) -> Hit {
  if (uniforms.mesh.x < 0.5 || uniforms.mesh.y < 0.5) {
    return missHit();
  }

  var best = missHit();
  var stack = array<u32, 64>();
  var stackSize: i32 = 1;
  stack[0] = 0u;

  for (var iteration = 0; iteration < 1536; iteration = iteration + 1) {
    if (stackSize <= 0) {
      break;
    }

    stackSize = stackSize - 1;
    let nodeIndex = stack[u32(stackSize)];
    if (f32(nodeIndex) >= uniforms.mesh.y) {
      continue;
    }

    let node = meshNodes[nodeIndex];
    let nodeT = intersectAabb(origin, direction, node.boundsMin.xyz, node.boundsMax.xyz, min(maxT, best.t));
    if (nodeT >= min(maxT, best.t)) {
      continue;
    }

    let triangleCount = u32(node.payload.w + 0.5);
    if (triangleCount > 0u) {
      let firstTriangle = u32(node.payload.z + 0.5);
      for (var triangleOffset = 0u; triangleOffset < 8u; triangleOffset = triangleOffset + 1u) {
        if (triangleOffset >= triangleCount) {
          break;
        }
        let triangleIndex = firstTriangle + triangleOffset;
        if (f32(triangleIndex) >= uniforms.mesh.x) {
          break;
        }
        best = betterHit(best, intersectMeshTriangle(meshTriangles[triangleIndex], origin, direction, min(maxT, best.t)));
      }
      continue;
    }

    let left = u32(node.payload.x + 0.5);
    let right = u32(node.payload.y + 0.5);
    if (stackSize < 62) {
      stack[u32(stackSize)] = right;
      stackSize = stackSize + 1;
      stack[u32(stackSize)] = left;
      stackSize = stackSize + 1;
    }
  }

  return best;
}

fn panelRight(yaw: f32) -> vec3<f32> {
  return vec3<f32>(cos(yaw), 0.0, -sin(yaw));
}

fn panelUp(yaw: f32, pitch: f32) -> vec3<f32> {
  return vec3<f32>(sin(pitch) * sin(yaw), cos(pitch), sin(pitch) * cos(yaw));
}

fn samplePanelTexture(panelIndex: f32, uv: vec2<f32>) -> vec4<f32> {
  if (panelIndex < 0.5) {
    return textureSampleLevel(navTexture, sceneSampler, safeUv(uv), 0.0);
  }
  if (panelIndex < 1.5) {
    return textureSampleLevel(screenTexture, sceneSampler, safeUv(uv), 0.0);
  }
  return textureSampleLevel(contextTexture, sceneSampler, safeUv(uv), 0.0);
}

fn intersectPanel(
  origin: vec3<f32>,
  direction: vec3<f32>,
  center: vec3<f32>,
  width: f32,
  height: f32,
  yaw: f32,
  pitch: f32,
  enabled: f32,
  panelIndex: f32
) -> Hit {
  let right = panelRight(yaw);
  let up = panelUp(yaw, pitch);
  let normal = normalize(cross(right, up));
  let denom = dot(normal, direction);
  if (abs(denom) < 0.0001) {
    return missHit();
  }
  let t = dot(center - origin, normal) / denom;
  if (t < 0.03 || t > uniforms.params.z) {
    return missHit();
  }
  let position = origin + direction * t;
  let local = position - center;
  let lx = dot(local, right);
  let ly = dot(local, up);
  if (abs(lx) > width * 0.5 || abs(ly) > height * 0.5) {
    return missHit();
  }
  let uv = vec2<f32>(lx / width + 0.5, 0.5 - ly / height);
  let sampled = samplePanelTexture(panelIndex, uv);
  let glassBase = vec3<f32>(0.055, 0.13, 0.145);
  let sampledMix = smoothstep(0.006, 0.12, sampled.a);
  let panelColor = mixColor(glassBase, sampled.rgb, sampledMix);
  let facingNormal = select(-normal, normal, dot(normal, -direction) > 0.0);
  return Hit(1.0, t, position, facingNormal, panelColor, 0.42, 0.0, 1.34, 2.0);
}

fn intersectGround(origin: vec3<f32>, direction: vec3<f32>, maxT: f32) -> Hit {
  var previousT = 0.06;
  var previousPoint = origin + direction * previousT;
  var previousDistance = previousPoint.y - groundHeight(previousPoint.x, previousPoint.z);
  var t = previousT;

  for (var index = 0; index < 84; index = index + 1) {
    t = t + max(0.045, t * 0.045);
    if (t > maxT) {
      break;
    }
    let point = origin + direction * t;
    let distance = point.y - groundHeight(point.x, point.z);
    if (distance <= 0.0 && previousDistance > 0.0) {
      var low = previousT;
      var high = t;
      for (var refine = 0; refine < 6; refine = refine + 1) {
        let mid = (low + high) * 0.5;
        let midPoint = origin + direction * mid;
        let midDistance = midPoint.y - groundHeight(midPoint.x, midPoint.z);
        if (midDistance > 0.0) {
          low = mid;
        } else {
          high = mid;
        }
      }
      let hitT = (low + high) * 0.5;
      let hitPosition = origin + direction * hitT;
      let normal = groundNormal(hitPosition);
      return Hit(1.0, hitT, hitPosition, normal, grassColor(hitPosition), 0.98, uniforms.params.y * 0.018, 0.0, 1.0);
    }
    previousT = t;
    previousDistance = distance;
  }
  return missHit();
}

fn intersectVegetation(origin: vec3<f32>, direction: vec3<f32>, maxT: f32) -> Hit {
  var t = 0.18;
  for (var index = 0; index < 78; index = index + 1) {
    if (t > maxT) {
      break;
    }
    let point = origin + direction * t;
    let density = vegetationDensity(point);
    if (density > 0.34) {
      let ground = groundHeight(point.x, point.z);
      let height = point.y - ground;
      let flowerTone = hash21(floor(point.xz * vec2<f32>(1.8, 2.2)));
      let flowerColor = mixColor(vec3<f32>(0.95, 0.86, 0.42), uniforms.accent.rgb, smoothstep(0.82, 1.0, flowerTone));
      let stemColor = vec3<f32>(0.24, 0.45 + flowerTone * 0.08, 0.15);
      let color = mixColor(stemColor, flowerColor, smoothstep(0.1, 0.23, height));
      let normal = normalize(vec3<f32>(
        sin(point.x * 3.1 + uniforms.frame.z),
        0.7 + height * 0.2,
        cos(point.z * 2.7 - uniforms.frame.z)
      ));
      return Hit(1.0, t, point, normal, color, 0.88, 0.0, 0.0, 3.0);
    }
    t = t + max(0.07, t * 0.058);
  }
  return missHit();
}

fn traceScene(origin: vec3<f32>, direction: vec3<f32>, maxT: f32) -> Hit {
  var hit = missHit();
  let meshHit = intersectMesh(origin, direction, min(maxT, hit.t));
  hit = betterHit(hit, meshHit);
  let groundHit = intersectGround(origin, direction, min(maxT, hit.t));
  hit = betterHit(hit, groundHit);
  let vegetationHit = intersectVegetation(origin, direction, min(maxT, hit.t));
  hit = betterHit(hit, vegetationHit);
  return hit;
}

fn tracePanelShadow(origin: vec3<f32>, direction: vec3<f32>, maxT: f32) -> Hit {
  var hit = missHit();
  hit = betterHit(hit, intersectPanel(
    origin,
    direction,
    vec3<f32>(-2.95, 2.08, 1.06),
    1.48,
    2.64,
    0.32,
    -0.16,
    uniforms.panelFlags.x,
    0.0
  ));
  hit = betterHit(hit, intersectPanel(
    origin,
    direction,
    vec3<f32>(0.0, 2.08, 0.72),
    3.6,
    2.64,
    0.0,
    -0.16,
    uniforms.panelFlags.y,
    1.0
  ));
  hit = betterHit(hit, intersectPanel(
    origin,
    direction,
    vec3<f32>(3.02, 2.08, 1.06),
    1.64,
    2.64,
    -0.32,
    -0.16,
    uniforms.panelFlags.z,
    2.0
  ));
  return hit;
}

fn traceShadow(origin: vec3<f32>, normal: vec3<f32>) -> f32 {
  let shadowDirection = normalize(uniforms.lighting.xyz);
  let start = origin + normal * 0.045 + shadowDirection * 0.03;
  let meshOccluder = intersectMesh(start, shadowDirection, 240.0);
  if (meshOccluder.hit < 0.5 || materialWeight(meshOccluder.material, 5.0) > 0.5) {
    return 1.0;
  }

  let leafOccluder = materialWeight(meshOccluder.material, 3.0);
  let barkOccluder = materialWeight(meshOccluder.material, 4.0);
  let floraOccluder = materialWeight(meshOccluder.material, 6.0);
  let groundOccluder = materialWeight(meshOccluder.material, 1.0);
  let treeOccluder = max(leafOccluder, barkOccluder);
  let occluderWeight = max(treeOccluder, max(floraOccluder, groundOccluder));
  let softDistance = smoothstep(0.12, 16.0, meshOccluder.t);
  let treeVisibility = mix(0.12, 0.62, softDistance);
  let floraVisibility = mix(0.72, 0.92, smoothstep(0.04, 3.2, meshOccluder.t));
  let groundVisibility = mix(0.34, 0.78, softDistance);
  let treeFloraWeight = floraOccluder / max(0.0001, treeOccluder + floraOccluder);
  let vegetationVisibility = mix(treeVisibility, floraVisibility, treeFloraWeight);
  let groundMix = groundOccluder / max(0.0001, groundOccluder + max(treeOccluder, floraOccluder));
  let bvhVisibility = mix(vegetationVisibility, groundVisibility, groundMix);
  return mix(1.0, bvhVisibility, occluderWeight * clamp(uniforms.params.x, 0.0, 1.0));
}

fn shadeHitWithShadow(hit: Hit, viewDirection: vec3<f32>, shadow: f32) -> vec3<f32> {
  let materialColor = hit.color;
  let sunAmount = max(dot(hit.normal, uniforms.lighting.xyz), 0.0);
  let skyAmount = 0.24 + hit.normal.y * 0.18;
  let groundWeight = materialWeight(hit.material, 1.0);
  let panelWeight = materialWeight(hit.material, 2.0);
  let leafWeight = materialWeight(hit.material, 3.0);
  let emitterWeight = materialWeight(hit.material, 5.0);
  let matteWeight = 1.0 - emitterWeight;
  let roughDiffuse = mix(1.08, 0.86, clamp(1.0 - hit.roughness, 0.0, 1.0));
  let leafWrap = leafWeight * smoothstep(-0.32, 0.5, dot(hit.normal, uniforms.lighting.xyz));
  let ambient = vec3<f32>(0.21, 0.27, 0.22) * mix(0.74, 1.0, shadow) * roughDiffuse;
  let warmSun = vec3<f32>(1.0, 0.82, 0.55) * (sunAmount + leafWrap * 0.22) * shadow * uniforms.lighting.w;
  let coolSky = vec3<f32>(0.27, 0.49, 0.66) * skyAmount * mix(0.48, 0.96, shadow);
  let rim = pow(max(dot(reflect(viewDirection, hit.normal), uniforms.lighting.xyz), 0.0), 12.0);
  let rimWeight = (1.0 - groundWeight * 0.86 - panelWeight * 0.78 - leafWeight * 0.48) * matteWeight;
  let diffuse = materialColor * (ambient + coolSky + warmSun) * matteWeight;
  let panelEmission = materialColor * hit.emission * (1.0 + panelWeight * 0.28);
  return diffuse + rim * vec3<f32>(1.0, 0.76, 0.42) * 0.11 * rimWeight + panelEmission;
}

fn shadeHit(hit: Hit, viewDirection: vec3<f32>) -> vec3<f32> {
  return shadeHitWithShadow(hit, viewDirection, traceShadow(hit.position, hit.normal));
}

fn reflectedBounceLight(hit: Hit, bounceDirection: vec3<f32>) -> vec3<f32> {
  let sky = skyColor(bounceDirection);
  if (hit.hit < 0.5) {
    return sky;
  }

  if (hit.material > 1.5) {
    return shadeHitWithShadow(hit, bounceDirection, 1.0);
  }

  return shadeHit(hit, bounceDirection);
}

struct TraceResult {
  color: vec3<f32>,
  shadow: f32,
  material: f32,
};

fn traceWithBounce(origin: vec3<f32>, direction: vec3<f32>) -> TraceResult {
  let primary = traceScene(origin, direction, uniforms.params.z);
  if (primary.hit < 0.5) {
    return TraceResult(skyColor(direction), 1.0, 0.0);
  }

  let groundReceiver = materialWeight(primary.material, 1.0);
  let leafReceiver = materialWeight(primary.material, 3.0) * 0.7;
  let barkReceiver = materialWeight(primary.material, 4.0) * 0.82;
  let shadowReceiver = max(groundReceiver, max(leafReceiver, barkReceiver));
  let primaryShadow = mix(1.0, traceShadow(primary.position, primary.normal), shadowReceiver);
  var color = shadeHitWithShadow(primary, direction, primaryShadow);
  let fresnel = pow(1.0 - max(dot(primary.normal, -direction), 0.0), 5.0);
  let roughnessReflection = pow(clamp(1.0 - primary.roughness, 0.0, 1.0), 2.0);
  let reflectance = primary.reflectance * roughnessReflection * (0.36 + fresnel * 0.64);
  if (reflectance > 0.01) {
    let bounceDirection = normalize(reflect(direction, primary.normal));
    let bounceHit = traceScene(primary.position + primary.normal * 0.055, bounceDirection, 52.0);
    let bounceColor = reflectedBounceLight(bounceHit, bounceDirection);
    let roughnessFade = 1.0 - primary.roughness * 0.42;
    color = mixColor(color, bounceColor, clamp(reflectance * roughnessFade, 0.0, 0.22));
  }
  return TraceResult(color, primaryShadow, primary.material);
}

fn makeCameraRay(uv: vec2<f32>) -> vec3<f32> {
  let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let tanHalfFov = tan(uniforms.camera0.w * 0.5);
  return normalize(
    uniforms.camera1.xyz +
    uniforms.camera2.xyz * ndc.x * uniforms.camera1.w * tanHalfFov +
      uniforms.camera3.xyz * ndc.y * tanHalfFov
  );
}

fn debugHitColor(origin: vec3<f32>, direction: vec3<f32>) -> vec4<f32> {
  let meshHit = intersectMesh(origin, direction, uniforms.params.z);
  if (meshHit.hit > 0.5) {
    return vec4<f32>(0.05, 1.0, 0.15, 1.0);
  }

  let vegetationHit = intersectVegetation(origin, direction, uniforms.params.z);
  if (vegetationHit.hit > 0.5) {
    return vec4<f32>(1.0, 0.85, 0.05, 1.0);
  }

  let groundHit = intersectGround(origin, direction, uniforms.params.z);
  if (groundHit.hit > 0.5) {
    return vec4<f32>(0.05, 0.25, 1.0, 1.0);
  }

  return vec4<f32>(0.15, 0.15, 0.18, 1.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let resolution = max(uniforms.frame.xy, vec2<f32>(1.0, 1.0));
  let jitter0 = vec2<f32>(-0.375, -0.125) / resolution;
  let jitter1 = vec2<f32>(0.125, -0.375) / resolution;
  let jitter2 = vec2<f32>(-0.125, 0.375) / resolution;
  let jitter3 = vec2<f32>(0.375, 0.125) / resolution;
  let jitter4 = vec2<f32>(-0.375, 0.375) / resolution;
  let jitter5 = vec2<f32>(0.375, -0.375) / resolution;
  let jitter6 = vec2<f32>(-0.125, -0.125) / resolution;
  let jitter7 = vec2<f32>(0.125, 0.125) / resolution;

  let origin = uniforms.camera0.xyz;
  if (uniforms.mesh.w > 0.5 && uniforms.mesh.w < 1.5) {
    return debugHitColor(origin, makeCameraRay(safeUv(input.uv)));
  }

  let sample0 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter0)));
  let sampleCount = clamp(uniforms.mesh.z, 1.0, 8.0);
  var traced = sample0.color;
  var tracedWeight = 1.0;
  if (sampleCount > 1.5) {
    let sample1 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter1)));
    traced = traced + sample1.color;
    tracedWeight = tracedWeight + 1.0;
  }
  if (sampleCount > 2.5) {
    let sample2 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter2)));
    traced = traced + sample2.color;
    tracedWeight = tracedWeight + 1.0;
  }
  if (sampleCount > 3.5) {
    let sample3 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter3)));
    traced = traced + sample3.color;
    tracedWeight = tracedWeight + 1.0;
  }
  if (sampleCount > 4.5) {
    let sample4 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter4)));
    traced = traced + sample4.color;
    tracedWeight = tracedWeight + 1.0;
  }
  if (sampleCount > 5.5) {
    let sample5 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter5)));
    traced = traced + sample5.color;
    tracedWeight = tracedWeight + 1.0;
  }
  if (sampleCount > 6.5) {
    let sample6 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter6)));
    traced = traced + sample6.color;
    tracedWeight = tracedWeight + 1.0;
  }
  if (sampleCount > 7.5) {
    let sample7 = traceWithBounce(origin, makeCameraRay(safeUv(input.uv + jitter7)));
    traced = traced + sample7.color;
    tracedWeight = tracedWeight + 1.0;
  }
  traced = traced / tracedWeight;

  let color = traced;
  let contrast = (color - vec3<f32>(0.5)) * 1.045 + vec3<f32>(0.5);
  return vec4<f32>(clamp(contrast, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

const denoiseShaderSource = `
struct RayTraceUniforms {
  frame: vec4<f32>,
  camera0: vec4<f32>,
  camera1: vec4<f32>,
  camera2: vec4<f32>,
  camera3: vec4<f32>,
  lighting: vec4<f32>,
  params: vec4<f32>,
  accent: vec4<f32>,
  panelFlags: vec4<f32>,
};

@group(0) @binding(0) var rayTexture: texture_2d<f32>;
@group(0) @binding(1) var rasterTexture: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> uniforms: RayTraceUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(3.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );
  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return output;
}

fn luminance(color: vec3<f32>) -> f32 {
  return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn detailAwareWeight(
  centerRaster: vec3<f32>,
  sampleRaster: vec3<f32>,
  centerRay: vec3<f32>,
  sampleRay: vec3<f32>,
  radius: f32
) -> f32 {
  let rasterDelta = abs(luminance(centerRaster) - luminance(sampleRaster));
  let rasterChromaDelta = length(centerRaster - sampleRaster);
  let rayDelta = abs(luminance(centerRay) - luminance(sampleRay));
  let rayChromaDelta = length(centerRay - sampleRay);
  let rasterEdgeStop = smoothstep(0.03, 0.16, rasterDelta + rasterChromaDelta * 0.34);
  let rayDetailStop = smoothstep(0.018, 0.095, rayDelta + rayChromaDelta * 0.48);
  let radiusFalloff = 1.0 / (1.0 + radius * 0.62);
  return (1.0 - rasterEdgeStop) * (1.0 - rayDetailStop * 0.86) * radiusFalloff;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let resolution = max(uniforms.frame.xy, vec2<f32>(1.0, 1.0));
  let texel = 1.0 / resolution;
  let centerRaster = textureSample(rasterTexture, linearSampler, input.uv).rgb;
  let centerRay = textureSample(rayTexture, linearSampler, input.uv).rgb;
  let denoiseStrength = select(0.46, 0.62, uniforms.frame.w > 0.5);

  var sum = centerRay;
  var weightSum = 1.0;
  var strongestRayDetail = 0.0;
  for (var y = -2; y <= 2; y = y + 1) {
    for (var x = -2; x <= 2; x = x + 1) {
      if (x == 0 && y == 0) {
        continue;
      }
      let offset = vec2<f32>(f32(x), f32(y));
      let sampleUv = clamp(input.uv + offset * texel, vec2<f32>(0.001), vec2<f32>(0.999));
      let rasterSample = textureSample(rasterTexture, linearSampler, sampleUv).rgb;
      let raySample = textureSample(rayTexture, linearSampler, sampleUv).rgb;
      let radius = length(offset);
      let rayDetail = abs(luminance(centerRay) - luminance(raySample)) + length(centerRay - raySample) * 0.42;
      strongestRayDetail = max(strongestRayDetail, rayDetail / max(1.0, radius));
      let weight = detailAwareWeight(centerRaster, rasterSample, centerRay, raySample, radius);
      sum = sum + raySample * weight;
      weightSum = weightSum + weight;
    }
  }

  let filtered = sum / max(weightSum, 0.0001);
  let edgeAmount = smoothstep(
    0.04,
    0.18,
    length(centerRaster - textureSample(rasterTexture, linearSampler, clamp(input.uv + vec2<f32>(texel.x * 1.5, 0.0), vec2<f32>(0.001), vec2<f32>(0.999))).rgb)
  );
  let rayDetailAmount = smoothstep(0.026, 0.12, strongestRayDetail);
  let resolved = mix(centerRay, filtered, denoiseStrength * (1.0 - edgeAmount * 0.58) * (1.0 - rayDetailAmount * 0.78));
  return vec4<f32>(clamp(resolved, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

function createRayTraceHitDebugShaderSource(source: string): string {
  const fragmentStart =
    "@fragment\nfn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {";
  const startIndex = source.lastIndexOf(fragmentStart);
  if (startIndex < 0) {
    return source;
  }

  return `${source.slice(0, startIndex)}${fragmentStart}
  let origin = uniforms.camera0.xyz;
  return debugHitColor(origin, makeCameraRay(safeUv(input.uv)));
}
`;
}

const rayTraceHitDebugShaderSource = createRayTraceHitDebugShaderSource(rayTraceShaderSource);

const solidDebugShaderSource = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(3.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );
  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let band = select(0.18, 0.42, fract(input.uv.x * 18.0) > 0.5);
  return vec4<f32>(1.0, band, 0.92, 1.0);
}
`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveExplicitRaySamples(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(clamp(value, 1, 8));
}

function resolveSceneSettings(options: SystemSceneOptions): SceneRenderSettings {
  const qualityMode = options.qualityMode === "ultra" ? "ultra" : "standard";
  const presentationMode =
    options.presentationMode ??
    (qualityMode === "ultra" ? "ray-traced" : "geometry");
  const rayDebugMode =
    options.rayDebugMode === "hits" || options.rayDebugMode === "solid"
      ? options.rayDebugMode
      : "off";
  const rayTracing = createSystemSceneRayTracingPlan(qualityMode);
  const parsedRenderScale = Number(options.renderScale);
  const renderScale = Number.isFinite(parsedRenderScale)
    ? clamp(parsedRenderScale, 0.5, qualityMode === "ultra" ? 3 : 2)
    : 1;
  const raySamples = resolveExplicitRaySamples(options.raySamples);

  if (qualityMode === "ultra") {
    return {
      qualityMode,
      presentationMode,
      rayDebugMode,
      raySamples,
      renderScale,
      particleCount: 720,
      backgroundParticleCount: 380,
      lightingBoost: 1.5,
      accentBoost: 1.28,
      rayTracing,
    };
  }

  return {
    qualityMode,
    presentationMode,
    rayDebugMode,
    raySamples,
    renderScale,
    particleCount: 420,
    backgroundParticleCount: 160,
    lightingBoost: 1,
    accentBoost: 1,
    rayTracing,
  };
}

function boostAlpha(alpha: number, settings: SceneRenderSettings, multiplier = 1): number {
  return clamp(alpha * settings.lightingBoost * multiplier, 0, 0.92);
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + seed * seed * 0.0017) * 43758.5453;
  return value - Math.floor(value);
}

function colorWithAlpha(color: Rgba, alpha: number): Rgba {
  return [color[0], color[1], color[2], alpha];
}

function shade(color: Rgba, amount: number, alpha = color[3]): Rgba {
  return [
    clamp(color[0] * amount, 0, 1),
    clamp(color[1] * amount, 0, 1),
    clamp(color[2] * amount, 0, 1),
    alpha,
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixRgba(a: Rgba, b: Rgba, amount: number): Rgba {
  const t = clamp(amount, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function recordTraceMaterial(target: number[], material: number): void {
  let materials = traceMaterialsByGeometry.get(target);
  if (!materials) {
    materials = [];
    traceMaterialsByGeometry.set(target, materials);
  }
  materials.push(material);
}

function pushVertex(target: number[], point: Vec3, color: Rgba): void {
  target.push(point[0], point[1], point[2], color[0], color[1], color[2], color[3]);
}

function pushTriangle(
  target: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  color: Rgba,
  material = materialUnknown
): void {
  pushVertex(target, a, color);
  pushVertex(target, b, color);
  pushVertex(target, c, color);
  recordTraceMaterial(target, material);
}

function pushGradientTriangle(
  target: number[],
  a: Vec3,
  colorA: Rgba,
  b: Vec3,
  colorB: Rgba,
  c: Vec3,
  colorC: Rgba,
  material = materialUnknown
): void {
  pushVertex(target, a, colorA);
  pushVertex(target, b, colorB);
  pushVertex(target, c, colorC);
  recordTraceMaterial(target, material);
}

function pushGradientQuad(
  target: number[],
  a: Vec3,
  colorA: Rgba,
  b: Vec3,
  colorB: Rgba,
  c: Vec3,
  colorC: Rgba,
  d: Vec3,
  colorD: Rgba,
  material = materialUnknown
): void {
  pushGradientTriangle(target, a, colorA, b, colorB, c, colorC, material);
  pushGradientTriangle(target, a, colorA, c, colorC, d, colorD, material);
}

function pushQuad(
  target: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Rgba,
  material = materialUnknown
): void {
  pushTriangle(target, a, b, c, color, material);
  pushTriangle(target, a, c, d, color, material);
}

function pushLine(target: number[], a: Vec3, b: Vec3, color: Rgba): void {
  pushVertex(target, a, color);
  pushVertex(target, b, color);
}

function pushBox(
  target: number[],
  center: Vec3,
  size: Vec3,
  color: Rgba,
  material = materialUnknown
): void {
  const [x, y, z] = center;
  const halfX = size[0] / 2;
  const halfY = size[1] / 2;
  const halfZ = size[2] / 2;
  const left = x - halfX;
  const right = x + halfX;
  const bottom = y - halfY;
  const top = y + halfY;
  const back = z - halfZ;
  const front = z + halfZ;

  const lbf: Vec3 = [left, bottom, front];
  const rbf: Vec3 = [right, bottom, front];
  const rtf: Vec3 = [right, top, front];
  const ltf: Vec3 = [left, top, front];
  const lbb: Vec3 = [left, bottom, back];
  const rbb: Vec3 = [right, bottom, back];
  const rtb: Vec3 = [right, top, back];
  const ltb: Vec3 = [left, top, back];

  pushQuad(target, lbf, rbf, rtf, ltf, shade(color, 1.08), material);
  pushQuad(target, rbf, rbb, rtb, rtf, shade(color, 0.78), material);
  pushQuad(target, rbb, lbb, ltb, rtb, shade(color, 0.6), material);
  pushQuad(target, lbb, lbf, ltf, ltb, shade(color, 0.86), material);
  pushQuad(target, ltf, rtf, rtb, ltb, shade(color, 1.2), material);
}

function pushSphere(
  target: number[],
  center: Vec3,
  radius: number,
  color: Rgba,
  rows = 8,
  columns = 18,
  material = materialUnknown
): void {
  for (let row = 0; row < rows; row += 1) {
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    const phi0 = v0 * Math.PI;
    const phi1 = v1 * Math.PI;
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const theta0 = u0 * Math.PI * 2;
      const theta1 = u1 * Math.PI * 2;
      const p00 = spherePoint(center, radius, phi0, theta0);
      const p01 = spherePoint(center, radius, phi0, theta1);
      const p10 = spherePoint(center, radius, phi1, theta0);
      const p11 = spherePoint(center, radius, phi1, theta1);
      const rowShade = 0.72 + (1 - Math.abs(v0 - 0.5) * 2) * 0.18;
      pushTriangle(target, p00, p10, p11, shade(color, rowShade), material);
      pushTriangle(target, p00, p11, p01, shade(color, rowShade * 0.94), material);
    }
  }
}

function pushEllipsoid(
  target: number[],
  center: Vec3,
  radius: Vec3,
  color: Rgba,
  rows = 7,
  columns = 14,
  material = materialUnknown
): void {
  for (let row = 0; row < rows; row += 1) {
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    const phi0 = v0 * Math.PI;
    const phi1 = v1 * Math.PI;
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const theta0 = u0 * Math.PI * 2;
      const theta1 = u1 * Math.PI * 2;
      const p00 = ellipsoidPoint(center, radius, phi0, theta0);
      const p01 = ellipsoidPoint(center, radius, phi0, theta1);
      const p10 = ellipsoidPoint(center, radius, phi1, theta0);
      const p11 = ellipsoidPoint(center, radius, phi1, theta1);
      const rowShade = 0.66 + (1 - Math.abs(v0 - 0.42) * 2) * 0.22;
      pushTriangle(target, p00, p10, p11, shade(color, rowShade), material);
      pushTriangle(target, p00, p11, p01, shade(color, rowShade * 0.92), material);
    }
  }
}

function spherePoint(center: Vec3, radius: number, phi: number, theta: number): Vec3 {
  const sinPhi = Math.sin(phi);
  return [
    center[0] + Math.cos(theta) * sinPhi * radius,
    center[1] + Math.cos(phi) * radius,
    center[2] + Math.sin(theta) * sinPhi * radius,
  ];
}

function ellipsoidPoint(center: Vec3, radius: Vec3, phi: number, theta: number): Vec3 {
  const sinPhi = Math.sin(phi);
  return [
    center[0] + Math.cos(theta) * sinPhi * radius[0],
    center[1] + Math.cos(phi) * radius[1],
    center[2] + Math.sin(theta) * sinPhi * radius[2],
  ];
}

function pushConeShellAt(
  target: number[],
  centerX: number,
  centerZ: number,
  apexY: number,
  baseY: number,
  radius: number,
  color: Rgba,
  segments = 36,
  material = materialUnknown
): void {
  const apex: Vec3 = [centerX, apexY, centerZ];
  for (let index = 0; index < segments; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const shadeAmount = 0.68 + Math.max(0, Math.cos(a0 - 0.65)) * 0.28;
    pushTriangle(
      target,
      apex,
      [centerX + Math.cos(a0) * radius, baseY, centerZ + Math.sin(a0) * radius],
      [centerX + Math.cos(a1) * radius, baseY, centerZ + Math.sin(a1) * radius],
      shade(color, shadeAmount),
      material
    );
  }
}

function irregularRingPoint(
  x: number,
  z: number,
  y: number,
  radius: number,
  angle: number,
  seed: number,
  verticalNoise: number
): Vec3 {
  const wave =
    Math.sin(angle * 3 + seed * 0.37) * 0.09 +
    Math.sin(angle * 5 + seed * 0.19) * 0.055;
  const resolvedRadius = radius * (1 + wave);
  return [
    x + Math.cos(angle) * resolvedRadius,
    y + Math.sin(angle * 4 + seed * 0.23) * verticalNoise,
    z + Math.sin(angle) * resolvedRadius,
  ];
}

function pushConiferTier(
  target: number[],
  x: number,
  z: number,
  baseY: number,
  height: number,
  radius: number,
  color: Rgba,
  seed: number,
  segments: number,
  material = materialUnknown
): void {
  const topY = baseY + height;
  const topRadius = radius * 0.15;
  const underside: Vec3 = [x, baseY - height * 0.12, z];

  for (let index = 0; index < segments; index += 1) {
    const angle0 = (index / segments) * Math.PI * 2;
    const angle1 = ((index + 1) / segments) * Math.PI * 2;
    const top0 = irregularRingPoint(x, z, topY, topRadius, angle0, seed + 17, height * 0.025);
    const top1 = irregularRingPoint(x, z, topY, topRadius, angle1, seed + 17, height * 0.025);
    const base0 = irregularRingPoint(x, z, baseY, radius, angle0, seed, height * 0.055);
    const base1 = irregularRingPoint(x, z, baseY, radius, angle1, seed, height * 0.055);
    const lightFacing = Math.max(0, Math.cos(angle0 - 0.62)) * 0.24;
    const shadeAmount = 0.64 + lightFacing + (index % 2) * 0.035;
    pushQuad(target, top0, top1, base1, base0, shade(color, shadeAmount), material);
    pushTriangle(target, base0, base1, underside, shade(color, shadeAmount * 0.56), material);
  }
}

function pushTieredConifer(
  target: number[],
  x: number,
  z: number,
  scale: number,
  baseY: number,
  color: Rgba,
  tone: number
): void {
  const seed = Math.floor((x * 31.7 + z * 19.3 + tone * 101) * 10);
  const segments = scale > 0.42 ? 12 : 9;
  const layers = [
    { base: 0.44, height: 0.56, radius: 0.82, shade: 0.72 },
    { base: 0.76, height: 0.58, radius: 0.68, shade: 0.82 },
    { base: 1.06, height: 0.56, radius: 0.54, shade: 0.94 },
    { base: 1.34, height: 0.5, radius: 0.38, shade: 1.04 },
    { base: 1.58, height: 0.4, radius: 0.22, shade: 1.16 },
  ] as const;

  for (const [index, layer] of layers.entries()) {
    pushConiferTier(
      target,
      x,
      z,
      baseY + layer.base * scale,
      layer.height * scale,
      layer.radius * scale,
      shade(color, layer.shade),
      seed + index * 37,
      segments,
      materialLeaf
    );
  }

  pushConeShellAt(
    target,
    x,
    z,
    baseY + 2.14 * scale,
    baseY + 1.62 * scale,
    0.24 * scale,
    shade(color, 1.18),
    segments,
    materialLeaf
  );
}

function pushDistantConifer(
  target: number[],
  x: number,
  z: number,
  scale: number,
  baseY: number,
  color: Rgba,
  tone: number
): void {
  const seed = Math.floor((x * 21.1 + z * 17.9 + tone * 77) * 10);
  const sway = (Math.sin(seed * 0.17) * 0.04 + Math.sin(seed * 0.031) * 0.025) * scale;
  const layers = [
    { base: 0.46, height: 0.72, radius: 0.72, shade: 0.76 },
    { base: 0.86, height: 0.64, radius: 0.5, shade: 0.94 },
    { base: 1.22, height: 0.52, radius: 0.28, shade: 1.1 },
  ] as const;

  for (const [index, layer] of layers.entries()) {
    pushConeShellAt(
      target,
      x + sway * (index + 1),
      z,
      baseY + (layer.base + layer.height) * scale,
      baseY + layer.base * scale,
      layer.radius * scale,
      shade(color, layer.shade),
      7,
      materialLeaf
    );
  }
}

function pushTree(
  triangles: number[],
  x: number,
  z: number,
  scale: number,
  tone: number,
  baseY = 0.1
): void {
  const trunk: Rgba = [0.19 + tone * 0.035, 0.11, 0.055, 0.96];
  const canopy: Rgba = [0.026 + tone * 0.018, 0.145 + tone * 0.055, 0.07 + tone * 0.032, 0.98];
  pushBox(
    triangles,
    [x, baseY + scale * 0.5, z],
    [0.13 * scale, 1.0 * scale, 0.13 * scale],
    trunk,
    materialBark
  );

  if (scale < 0.52 || z < -32) {
    pushDistantConifer(triangles, x, z, scale, baseY, canopy, tone);
  } else {
    pushTieredConifer(triangles, x, z, scale, baseY, canopy, tone);
  }
  pushBox(
    triangles,
    [x, baseY + scale * 0.18, z],
    [0.19 * scale, 0.36 * scale, 0.19 * scale],
    shade(trunk, 0.82),
    materialBark
  );
}

function pushStemRibbon(
  target: number[],
  bottom: Vec3,
  top: Vec3,
  width: number,
  color: Rgba
): void {
  const halfWidth = width / 2;
  pushQuad(
    target,
    [bottom[0] - halfWidth, bottom[1], bottom[2]],
    [bottom[0] + halfWidth, bottom[1], bottom[2]],
    [top[0] + halfWidth, top[1], top[2]],
    [top[0] - halfWidth, top[1], top[2]],
    color,
    materialFlora
  );
  pushQuad(
    target,
    [bottom[0], bottom[1], bottom[2] - halfWidth],
    [bottom[0], bottom[1], bottom[2] + halfWidth],
    [top[0], top[1], top[2] + halfWidth],
    [top[0], top[1], top[2] - halfWidth],
    shade(color, 0.86),
    materialFlora
  );
}

function pushGrassBladeRibbon(
  target: number[],
  bottom: Vec3,
  middle: Vec3,
  top: Vec3,
  right: Vec3,
  baseWidth: number,
  topWidth: number,
  baseColor: Rgba,
  middleColor: Rgba,
  tipColor: Rgba
): void {
  const middleWidth = (baseWidth + topWidth) * 0.44;
  const baseLeft: Vec3 = [
    bottom[0] - right[0] * baseWidth,
    bottom[1],
    bottom[2] - right[2] * baseWidth,
  ];
  const baseRight: Vec3 = [
    bottom[0] + right[0] * baseWidth,
    bottom[1],
    bottom[2] + right[2] * baseWidth,
  ];
  const middleLeft: Vec3 = [
    middle[0] - right[0] * middleWidth,
    middle[1],
    middle[2] - right[2] * middleWidth,
  ];
  const middleRight: Vec3 = [
    middle[0] + right[0] * middleWidth,
    middle[1],
    middle[2] + right[2] * middleWidth,
  ];
  const tipLeft: Vec3 = [
    top[0] - right[0] * topWidth,
    top[1],
    top[2] - right[2] * topWidth,
  ];
  const tipRight: Vec3 = [
    top[0] + right[0] * topWidth,
    top[1],
    top[2] + right[2] * topWidth,
  ];

  pushGradientQuad(
    target,
    baseLeft,
    shade(baseColor, 0.72),
    baseRight,
    shade(baseColor, 0.86),
    middleRight,
    middleColor,
    middleLeft,
    shade(middleColor, 1.08),
    materialFlora
  );
  pushGradientQuad(
    target,
    middleLeft,
    shade(middleColor, 0.86),
    middleRight,
    middleColor,
    tipRight,
    tipColor,
    tipLeft,
    shade(tipColor, 1.08),
    materialFlora
  );
}

function pushGrassBlade(
  triangles: number[],
  lines: number[],
  x: number,
  z: number,
  height: number,
  width: number,
  time: number,
  phase: number,
  baseY: number,
  tone: number,
  crossed: boolean
): void {
  const windDirection: Vec3 = normalize([0.86, 0, 0.52]);
  const windRight: Vec3 = [-windDirection[2], 0, windDirection[0]];
  const primaryWave = Math.sin(time * 1.5 + x * 0.82 + z * 1.08 + phase * 0.04);
  const crossWave = Math.sin(time * 2.1 + x * 1.33 - z * 0.58 + phase * 0.07) * 0.38;
  const gust = 0.54 + Math.sin(time * 0.42 + z * 0.28) * 0.18;
  const bendStrength = height * (0.15 + gust * 0.17 + (primaryWave + crossWave) * 0.055);
  const sideways = (pseudoRandom(phase + 3907) - 0.5) * height * 0.14;
  const bendX = windDirection[0] * bendStrength + windRight[0] * sideways;
  const bendZ = windDirection[2] * bendStrength + windRight[2] * sideways;
  const bottom: Vec3 = [x, baseY, z];
  const middle: Vec3 = [x + bendX * 0.36, baseY + height * 0.56, z + bendZ * 0.36];
  const top: Vec3 = [x + bendX, baseY + height, z + bendZ];
  const angle = pseudoRandom(phase + 1301) * Math.PI * 2;
  const right: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
  const baseColor: Rgba = [0.08 + tone * 0.04, 0.27 + tone * 0.12, 0.095, 0.72];
  const middleColor: Rgba = [0.14 + tone * 0.05, 0.42 + tone * 0.13, 0.15, 0.7];
  const tipColor: Rgba = [0.25 + tone * 0.06, 0.58 + tone * 0.14, 0.22, 0.62];
  pushGrassBladeRibbon(
    triangles,
    bottom,
    middle,
    top,
    right,
    width,
    width * 0.28,
    baseColor,
    middleColor,
    tipColor
  );

  if (crossed) {
    const crossRight: Vec3 = [-right[2], 0, right[0]];
    pushGrassBladeRibbon(
      triangles,
      bottom,
      middle,
      top,
      crossRight,
      width * 0.58,
      width * 0.16,
      colorWithAlpha(baseColor, 0.42),
      colorWithAlpha(middleColor, 0.42),
      colorWithAlpha(tipColor, 0.38)
    );
  }

  pushLine(lines, bottom, top, [0.42, 0.76, 0.28, 0.12 + tone * 0.18]);
}

function pushFineGrassBlade(
  triangles: number[],
  lines: number[],
  x: number,
  z: number,
  height: number,
  width: number,
  time: number,
  phase: number,
  baseY: number,
  tone: number
): void {
  const windDirection: Vec3 = normalize([0.9, 0, 0.43]);
  const windRight: Vec3 = [-windDirection[2], 0, windDirection[0]];
  const primaryWave = Math.sin(time * 1.42 + x * 0.64 + z * 0.92 + phase * 0.03);
  const localLean = (pseudoRandom(phase + 811) - 0.5) * height * 0.1;
  const bendStrength = height * (0.12 + primaryWave * 0.045);
  const bendX = windDirection[0] * bendStrength + windRight[0] * localLean;
  const bendZ = windDirection[2] * bendStrength + windRight[2] * localLean;
  const bottom: Vec3 = [x, baseY, z];
  const middle: Vec3 = [x + bendX * 0.34, baseY + height * 0.58, z + bendZ * 0.34];
  const top: Vec3 = [x + bendX, baseY + height, z + bendZ];
  const angle = pseudoRandom(phase + 1301) * Math.PI * 2;
  const right: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
  const alpha = 0.3 + tone * 0.12;
  const baseColor: Rgba = [0.07 + tone * 0.035, 0.23 + tone * 0.075, 0.08, alpha];
  const middleColor: Rgba = [0.12 + tone * 0.04, 0.34 + tone * 0.1, 0.12, alpha * 0.92];
  const tipColor: Rgba = [0.2 + tone * 0.05, 0.46 + tone * 0.11, 0.18, alpha * 0.72];
  pushGrassBladeRibbon(
    triangles,
    bottom,
    middle,
    top,
    right,
    width,
    width * 0.14,
    baseColor,
    middleColor,
    tipColor
  );
  pushLine(lines, bottom, top, [0.34, 0.66, 0.24, 0.055 + tone * 0.07]);
}

function middleDistanceGrassPatch(x: number, z: number): number {
  const cellX = Math.floor((x + 48) * 0.24);
  const cellZ = Math.floor((z + 18) * 0.42);
  const coarse = pseudoRandom(cellX * 71 + cellZ * 151 + 2807);
  const weave =
    Math.sin(x * 0.23 + z * 0.64) * 0.18 +
    Math.sin(x * 0.71 - z * 0.29 + 1.4) * 0.11;
  return clamp(coarse * 0.78 + 0.18 + weave, 0, 1);
}

function pushGrassTuft(
  triangles: number[],
  lines: number[],
  x: number,
  z: number,
  radius: number,
  height: number,
  time: number,
  seed: number,
  baseY: number,
  roughness: number
): void {
  const bladeCount = 3 + Math.floor(pseudoRandom(seed + 47) * 5);
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI * 2 + pseudoRandom(seed + blade * 29) * 0.82;
    const spread = radius * (0.18 + pseudoRandom(seed + blade * 37) * 0.82);
    const bladeX = x + Math.cos(angle) * spread;
    const bladeZ = z + Math.sin(angle) * spread;
    const bladeHeight = height * (0.58 + pseudoRandom(seed + blade * 43) * (0.52 + roughness * 0.42));
    const width = (0.006 + roughness * 0.01) * (0.8 + pseudoRandom(seed + blade * 53) * 0.9);
    pushGrassBlade(
      triangles,
      lines,
      bladeX,
      bladeZ,
      bladeHeight,
      width,
      time,
      seed + blade * 61,
      resolveGroundHeight(bladeX, bladeZ) + 0.024,
      0.24 + pseudoRandom(seed + blade * 67) * 0.6,
      roughness > 0.72 && blade % 3 === 0
    );
  }
}

function pushTinyWildflower(
  triangles: number[],
  lines: number[],
  x: number,
  z: number,
  height: number,
  color: Rgba,
  time: number,
  phase: number,
  baseY: number
): void {
  const sway = Math.sin(time * 0.78 + phase) * 0.018;
  const stemBottom: Vec3 = [x, baseY, z];
  const stemTop: Vec3 = [x + sway, baseY + height, z];
  const stemColor: Rgba = [0.28, 0.5, 0.19, 0.42];
  pushLine(lines, stemBottom, stemTop, colorWithAlpha(stemColor, 0.4));
  pushStemRibbon(triangles, stemBottom, stemTop, 0.008, colorWithAlpha(stemColor, 0.34));
  pushSphere(triangles, stemTop, 0.015, color, 3, 6, materialFlora);
}

function pushFlower(
  triangles: number[],
  lines: number[],
  x: number,
  z: number,
  height: number,
  color: Rgba,
  time: number,
  phase: number,
  baseY: number
): void {
  const sway = Math.sin(time * 0.82 + phase) * 0.025;
  const stemBottom: Vec3 = [x, baseY, z];
  const stemTop: Vec3 = [x + sway, baseY + height, z];
  const stemColor: Rgba = [0.34, 0.62, 0.24, 0.72];
  pushLine(lines, stemBottom, stemTop, stemColor);
  pushStemRibbon(triangles, stemBottom, stemTop, 0.018, colorWithAlpha(stemColor, 0.58));
  pushSphere(triangles, stemTop, 0.028, color, 5, 10, materialFlora);

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + phase * 0.1;
    const petalCenter: Vec3 = [
      stemTop[0] + Math.cos(angle) * 0.043,
      stemTop[1] + Math.sin(angle) * 0.008,
      stemTop[2] + Math.sin(angle) * 0.018,
    ];
    pushSphere(triangles, petalCenter, 0.022, shade(color, 1.08, color[3] * 0.86), 4, 8, materialFlora);
  }
}

function pushMeadowForeground(
  triangles: number[],
  lines: number[],
  time: number,
  accent: Rgba,
  settings: SceneRenderSettings
): void {
  const bladeCount = settings.qualityMode === "ultra" ? 420 : 200;
  for (let index = 0; index < bladeCount; index += 1) {
    const depth = pseudoRandom(index + 1801);
    const x = (pseudoRandom(index + 1601) - 0.5) * (8 + depth * 18);
    const z = 0.45 + depth * 8.8;
    const height = 0.12 + pseudoRandom(index + 1703) * 0.33;
    const width = 0.014 + (1 - depth) * 0.012 + pseudoRandom(index + 1901) * 0.012;
    const groundY = resolveGroundHeight(x, z) + 0.026;
    pushGrassBlade(
      triangles,
      lines,
      x,
      z,
      height,
      width,
      time,
      index + depth * 100,
      groundY,
      pseudoRandom(index + 2011),
      settings.qualityMode === "ultra" && depth < 0.18
    );
  }

  const flowerColors: readonly Rgba[] = [
    [0.95, 0.86, 0.42, 0.9],
    [0.86, 0.92, 0.74, 0.82],
    [0.92, 0.58, 0.54, 0.82],
    colorWithAlpha(accent, 0.78),
  ];
  const flowerCount = settings.qualityMode === "ultra" ? 168 : 88;
  for (let index = 0; index < flowerCount; index += 1) {
    const depth = pseudoRandom(index + 2101);
    const x = (pseudoRandom(index + 2201) - 0.5) * (8 + depth * 20);
    const z = 0.55 + depth * 11.5;
    const height = 0.13 + pseudoRandom(index + 2301) * 0.26;
    const color = flowerColors[index % flowerColors.length]!;
    pushFlower(
      triangles,
      lines,
      x,
      z,
      height,
      color,
      time,
      index + depth * 10,
      resolveGroundHeight(x, z) + 0.04
    );
  }
}

function pushMiddleDistanceMeadow(
  triangles: number[],
  lines: number[],
  time: number,
  accent: Rgba,
  settings: SceneRenderSettings
): void {
  const bladeCount = settings.qualityMode === "ultra" ? 520 : 260;
  for (let index = 0; index < bladeCount; index += 1) {
    const depth = pseudoRandom(index + 3301);
    const z = -11.8 + depth * 16.8;
    const band = (z + 11.8) / 16.8;
    const span = 17 + band * 28;
    const x = (pseudoRandom(index + 3401) - 0.5) * span;
    const patch = middleDistanceGrassPatch(x, z);
    if (patch < 0.24 && pseudoRandom(index + 3501) > 0.18) {
      continue;
    }

    const nearWeight = smoothstep(-8, 4.8, z);
    const height =
      (0.045 + nearWeight * 0.09 + patch * 0.045) *
      (0.7 + pseudoRandom(index + 3601) * 0.72);
    const width =
      (0.0038 + nearWeight * 0.0035 + patch * 0.0028) *
      (0.72 + pseudoRandom(index + 3701) * 0.72);
    pushFineGrassBlade(
      triangles,
      lines,
      x,
      z,
      height,
      width,
      time,
      index + 6100,
      resolveGroundHeight(x, z) + 0.022,
      pseudoRandom(index + 3801)
    );
  }

  const tuftCount = settings.qualityMode === "ultra" ? 62 : 34;
  for (let index = 0; index < tuftCount; index += 1) {
    const depth = pseudoRandom(index + 3901);
    const z = -10.8 + depth * 15.2;
    const band = (z + 10.8) / 15.2;
    const x = (pseudoRandom(index + 4001) - 0.5) * (15 + band * 30);
    const patch = middleDistanceGrassPatch(x, z);
    if (patch < 0.42 && pseudoRandom(index + 4101) > 0.35) {
      continue;
    }

    const roughness = 0.48 + pseudoRandom(index + 4201) * 0.52;
    pushGrassTuft(
      triangles,
      lines,
      x,
      z,
      0.035 + roughness * 0.07,
      0.09 + patch * 0.12 + band * 0.07,
      time,
      index + 7000,
      resolveGroundHeight(x, z) + 0.024,
      roughness
    );
  }

  const flowerColors: readonly Rgba[] = [
    [0.91, 0.82, 0.38, 0.72],
    [0.78, 0.86, 0.67, 0.62],
    [0.78, 0.42, 0.48, 0.62],
    colorWithAlpha(accent, 0.58),
  ];
  const flowerCount = settings.qualityMode === "ultra" ? 46 : 24;
  for (let index = 0; index < flowerCount; index += 1) {
    const depth = pseudoRandom(index + 4301);
    const z = -7.8 + depth * 12;
    const band = (z + 7.8) / 12;
    const x = (pseudoRandom(index + 4401) - 0.5) * (13 + band * 24);
    if (middleDistanceGrassPatch(x, z) < 0.34) {
      continue;
    }

    pushTinyWildflower(
      triangles,
      lines,
      x,
      z,
      0.08 + pseudoRandom(index + 4501) * 0.1,
      flowerColors[index % flowerColors.length]!,
      time,
      index + 8200,
      resolveGroundHeight(x, z) + 0.03
    );
  }
}

function skyboxPoint(center: Vec3, radius: number, direction: Vec3): Vec3 {
  return [
    center[0] + direction[0] * radius,
    center[1] + direction[1] * radius,
    center[2] + direction[2] * radius,
  ];
}

function resolveSkyboxColor(direction: Vec3, sunDirection: Vec3): Rgba {
  const lower: Rgba = [0.035, 0.08, 0.105, 1];
  const horizon: Rgba = [0.57, 0.71, 0.62, 1];
  const middle: Rgba = [0.34, 0.6, 0.75, 1];
  const zenith: Rgba = [0.105, 0.27, 0.49, 1];
  const vertical = (direction[1] + 1) / 2;
  const base =
    vertical < 0.46
      ? mixRgba(lower, horizon, smoothstep(0.08, 0.46, vertical))
      : vertical < 0.76
        ? mixRgba(horizon, middle, smoothstep(0.46, 0.76, vertical))
        : mixRgba(middle, zenith, smoothstep(0.76, 1, vertical));
  const horizonGlow =
    smoothstep(-0.1, 0.16, direction[1]) * (1 - smoothstep(0.32, 0.68, direction[1]));
  const sunAlignment = dot(direction, sunDirection);
  const sunCorona = smoothstep(0.86, 0.999, sunAlignment);
  const sunDisc = smoothstep(0.9984, 0.9999, sunAlignment);
  const corona = mixRgba(base, [1, 0.72, 0.38, 1], horizonGlow * 0.1 + sunCorona * 0.42);
  return mixRgba(corona, [1, 0.86, 0.52, 1], sunDisc * 0.78);
}

function skyboxDirection(row: number, column: number, rows: number, columns: number): Vec3 {
  const phi = (row / rows) * Math.PI;
  const theta = (column / columns) * Math.PI * 2;
  const sinPhi = Math.sin(phi);
  return [Math.cos(theta) * sinPhi, Math.cos(phi), Math.sin(theta) * sinPhi];
}

function pushSkyboxSphere(
  target: number[],
  center: Vec3,
  radius: number,
  sunDirection: Vec3,
  settings: SceneRenderSettings
): void {
  const rows = settings.qualityMode === "ultra" ? 44 : 28;
  const columns = settings.qualityMode === "ultra" ? 104 : 56;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const d00 = skyboxDirection(row, column, rows, columns);
      const d10 = skyboxDirection(row + 1, column, rows, columns);
      const d11 = skyboxDirection(row + 1, column + 1, rows, columns);
      const d01 = skyboxDirection(row, column + 1, rows, columns);
      const p00 = skyboxPoint(center, radius, d00);
      const p10 = skyboxPoint(center, radius, d10);
      const p11 = skyboxPoint(center, radius, d11);
      const p01 = skyboxPoint(center, radius, d01);
      const c00 = resolveSkyboxColor(d00, sunDirection);
      const c10 = resolveSkyboxColor(d10, sunDirection);
      const c11 = resolveSkyboxColor(d11, sunDirection);
      const c01 = resolveSkyboxColor(d01, sunDirection);
      pushGradientTriangle(target, p00, c00, p10, c10, p11, c11, materialEmitter);
      pushGradientTriangle(target, p00, c00, p11, c11, p01, c01, materialEmitter);
    }
  }
}

function resolveDirectionalSunDirection(): Vec3 {
  return normalize([0.34, 0.58, -0.74]);
}

function resolveGroundHeight(x: number, z: number): number {
  const radius = Math.hypot(x * 0.78, z * 0.92);
  const broadUndulation =
    Math.sin(x * 0.08 + z * 0.045) * 0.055 +
    Math.sin(x * 0.035 - z * 0.105 + 1.2) * 0.075;
  const nearRise = Math.exp(-((x + 10) ** 2 + (z - 3) ** 2) / 360) * 0.15;
  const distantRise = Math.exp(-((x - 18) ** 2 + (z + 18) ** 2) / 520) * 0.22;
  const curvature = -radius * radius * 0.000075;
  return -0.54 + broadUndulation + nearRise + distantRise + curvature;
}

function resolveGrassColor(x: number, z: number): Rgba {
  const radius = Math.hypot(x * 0.78, z * 0.92);
  const base: Rgba = [0.075, 0.235, 0.11, 1];
  const lit: Rgba = [0.18, 0.38, 0.15, 1];
  const far: Rgba = [0.105, 0.235, 0.15, 0.9];
  const noise =
    Math.sin(x * 0.16 + z * 0.11) * 0.5 +
    Math.sin(x * 0.07 - z * 0.18 + 0.6) * 0.5;
  const patch = mixRgba(base, lit, clamp(0.42 + noise * 0.18, 0, 1));
  const distanceFade = smoothstep(38, 104, radius);
  const edgeFade = 1 - smoothstep(102, 118, radius);
  const color = mixRgba(patch, far, distanceFade);
  return colorWithAlpha(color, color[3] * edgeFade);
}

function terrainPoint(radius: number, theta: number): Vec3 {
  const x = Math.cos(theta) * radius;
  const z = Math.sin(theta) * radius;
  return [x, resolveGroundHeight(x, z), z];
}

function pushGrasslandTerrain(target: number[], settings: SceneRenderSettings): void {
  const maxRadius = 120;
  const rows = settings.qualityMode === "ultra" ? 34 : 24;
  const columns = settings.qualityMode === "ultra" ? 120 : 84;

  for (let row = 0; row < rows; row += 1) {
    const radius0 = (row / rows) ** 1.24 * maxRadius;
    const radius1 = ((row + 1) / rows) ** 1.24 * maxRadius;
    for (let column = 0; column < columns; column += 1) {
      const theta0 = (column / columns) * Math.PI * 2;
      const theta1 = ((column + 1) / columns) * Math.PI * 2;
      const p00 = terrainPoint(radius0, theta0);
      const p10 = terrainPoint(radius1, theta0);
      const p11 = terrainPoint(radius1, theta1);
      const p01 = terrainPoint(radius0, theta1);
      const c00 = resolveGrassColor(p00[0], p00[2]);
      const c10 = resolveGrassColor(p10[0], p10[2]);
      const c11 = resolveGrassColor(p11[0], p11[2]);
      const c01 = resolveGrassColor(p01[0], p01[2]);
      pushGradientTriangle(target, p00, c00, p10, c10, p11, c11, materialGround);
      pushGradientTriangle(target, p00, c00, p11, c11, p01, c01, materialGround);
    }
  }
}

function pushForestBand(triangles: number[], settings: SceneRenderSettings): void {
  const forestRows = [
    {
      count: settings.qualityMode === "ultra" ? 72 : 44,
      span: 92,
      zBase: -15.8,
      zSpread: 5.6,
      minScale: 0.62,
      scaleRange: 0.86,
    },
    {
      count: settings.qualityMode === "ultra" ? 88 : 54,
      span: 136,
      zBase: -25.5,
      zSpread: 7.4,
      minScale: 0.45,
      scaleRange: 0.68,
    },
    {
      count: settings.qualityMode === "ultra" ? 104 : 64,
      span: 184,
      zBase: -40,
      zSpread: 10.5,
      minScale: 0.3,
      scaleRange: 0.48,
    },
    {
      count: settings.qualityMode === "ultra" ? 118 : 74,
      span: 242,
      zBase: -59,
      zSpread: 15,
      minScale: 0.2,
      scaleRange: 0.34,
    },
    {
      count: settings.qualityMode === "ultra" ? 126 : 80,
      span: 292,
      zBase: -80,
      zSpread: 20,
      minScale: 0.14,
      scaleRange: 0.24,
    },
  ] as const;

  for (const [rowIndex, row] of forestRows.entries()) {
    for (let index = 0; index < row.count; index += 1) {
      const spanRatio = row.count <= 1 ? 0 : index / (row.count - 1);
      const jitterX = (pseudoRandom(index + rowIndex * 401) - 0.5) * (1.2 + rowIndex * 1.4);
      const x = -row.span / 2 + spanRatio * row.span + jitterX;
      const z = row.zBase - pseudoRandom(index + rowIndex * 503) * row.zSpread;
      const scale = row.minScale + pseudoRandom(index + rowIndex * 607) * row.scaleRange;
      const tone = rowIndex === 0
        ? pseudoRandom(index + 133)
        : 0.62 + pseudoRandom(index + rowIndex * 709) * 0.34;
      pushTree(triangles, x, z, scale, tone, resolveGroundHeight(x, z) + 0.04);
    }
  }
}

function pushOutdoorWorld(
  triangles: number[],
  lines: number[],
  time: number,
  accent: Rgba,
  settings: SceneRenderSettings
): void {
  const skyCenter: Vec3 = [0, 2.2, 0];
  const skyRadius = 132;
  const sunDirection = resolveDirectionalSunDirection();
  const distantBack = -24;
  const hillNear: Rgba = [0.08, 0.25, 0.15, 0.96];
  const hillFar: Rgba = [0.12, 0.27, 0.19, 0.82];

  pushSkyboxSphere(triangles, skyCenter, skyRadius, sunDirection, settings);
  pushGrasslandTerrain(triangles, settings);

  pushTriangle(triangles, [-34, 0.1, distantBack + 2], [-18, 2.0, distantBack + 2], [-3.5, 0.1, distantBack + 2], hillFar, materialGround);
  pushTriangle(triangles, [-8, 0.04, distantBack + 1.9], [8, 1.72, distantBack + 1.9], [25, 0.04, distantBack + 1.9], shade(hillFar, 0.92), materialGround);
  pushTriangle(triangles, [5, 0.02, distantBack + 1.8], [25, 2.35, distantBack + 1.8], [42, 0.02, distantBack + 1.8], shade(hillFar, 1.08), materialGround);
  pushLine(lines, [-40, 0.16, distantBack + 1.6], [40, 0.16, distantBack + 1.6], [0.65, 0.83, 0.68, 0.24]);

  pushTriangle(triangles, [-38, -0.48, -18], [-19, 0.48, -18.5], [0, -0.48, -18], hillNear, materialGround);
  pushTriangle(triangles, [-2, -0.48, -18], [16, 0.68, -18.7], [34, -0.48, -18], shade(hillNear, 1.08), materialGround);
  pushForestBand(triangles, settings);
  pushMiddleDistanceMeadow(triangles, lines, time, accent, settings);
}

function pushFieldWorld(
  triangles: number[],
  lines: number[],
  time: number,
  accent: Rgba,
  settings: SceneRenderSettings
): void {
  pushOutdoorWorld(triangles, lines, time, accent, settings);
  pushMeadowForeground(triangles, lines, time, accent, settings);
}

function createParticles(count: number): readonly Vec3[] {
  const particles: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = pseudoRandom(index + 1) * Math.PI * 2;
    const radius = 2.4 + pseudoRandom(index + 17) * 7.8;
    particles.push([
      Math.cos(angle) * radius,
      pseudoRandom(index + 31) * 6.4 - 0.1,
      Math.sin(angle) * radius - 2.2,
    ]);
  }
  return particles;
}

function createBackgroundParticles(count: number): readonly AmbientParticle[] {
  const particles: AmbientParticle[] = [];
  for (let index = 0; index < count; index += 1) {
    particles.push({
      position: [
        (pseudoRandom(index + 211) - 0.5) * 24,
        0.8 + pseudoRandom(index + 307) * 6.2,
        -12.4 + pseudoRandom(index + 401) * 16.2,
      ],
      phase: pseudoRandom(index + 503) * Math.PI * 2,
      speed: 0.28 + pseudoRandom(index + 607) * 0.54,
      scale: 0.05 + pseudoRandom(index + 709) * 0.17,
      tone: pseudoRandom(index + 811),
    });
  }
  return particles;
}

function pushBackgroundParticles(
  target: number[],
  particles: readonly AmbientParticle[],
  time: number,
  look: PlayerLookState,
  accent: Rgba,
  settings: SceneRenderSettings
): void {
  for (const [index, particle] of particles.entries()) {
    const shimmer = 0.48 + Math.sin(time * (1.1 + particle.speed) + particle.phase) * 0.32;
    const x = particle.position[0] + Math.sin(time * particle.speed + particle.phase) * 0.18;
    const y = particle.position[1] + Math.cos(time * 0.43 + particle.phase) * 0.07;
    const z = particle.position[2] + Math.sin(time * 0.22 + particle.phase) * 0.24;
    const length = particle.scale * (0.55 + shimmer);
    const alpha = boostAlpha(0.032 + shimmer * 0.04, settings, 0.9);
    const color: Rgba =
      particle.tone > 0.78
        ? colorWithAlpha(accent, alpha * settings.accentBoost)
        : [0.86, 0.9, 0.48, alpha * 0.75];

    pushLine(target, [x, y, z], [x + look.yaw * 0.04, y + length, z], color);

    if (settings.qualityMode === "ultra" && index % 9 === 0) {
      const glint = length * 0.52;
      pushLine(
        target,
        [x - glint, y + length * 0.36, z],
        [x + glint, y + length * 0.36, z],
        colorWithAlpha(color, alpha * 0.7)
      );
    }
  }
}

function resolvePlayerCameraMotion(timeMs: number): {
  readonly position: Vec3;
  readonly targetOffset: Vec3;
} {
  const time = timeMs * 0.001;
  const forward = 1.05 + Math.sin(time * 0.18 - 0.8) * 0.72 + Math.sin(time * 0.055) * 0.28;
  const strafe = Math.sin(time * 0.13 + 1.1) * 0.42 + Math.sin(time * 0.047) * 0.18;
  const stepBob = Math.sin(time * 2.05) * 0.034 + Math.sin(time * 4.1 + 0.7) * 0.012;

  return {
    position: [strafe, stepBob, -forward],
    targetOffset: [strafe * 0.55, stepBob * 0.28, -forward * 0.42],
  };
}

interface CameraFrame {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly fovRadians: number;
}

function resolveCameraFrame(frame: EncodedSceneFrame): CameraFrame {
  const look = frame.look;
  const movement = resolvePlayerCameraMotion(frame.timeMs);
  const eye: Vec3 = [
    look.yaw * 0.36 + movement.position[0],
    3.7 + look.pitch * 0.22 + movement.position[1],
    12.9 - Math.abs(look.yaw) * 0.12 + movement.position[2],
  ];
  const target: Vec3 = [
    look.yaw * 6.4 + movement.targetOffset[0],
    0.72 + look.pitch * 3.35 + movement.targetOffset[1],
    -3.2 + movement.targetOffset[2],
  ];
  const forward = normalize(subtract(target, eye));
  const right = normalize(cross(forward, [0, 1, 0] as Vec3));
  const up = normalize(cross(right, forward));
  return {
    eye,
    target,
    forward,
    right,
    up,
    fovRadians: (46 * Math.PI) / 180,
  };
}

function buildCameraMatrix(frame: EncodedSceneFrame, aspect: number): Float32Array {
  const camera = resolveCameraFrame(frame);
  const view = lookAt(camera.eye, camera.target, [0, 1, 0]);
  const projection = perspective(camera.fovRadians, aspect, 0.1, 240);
  return multiplyMatrices(projection, view);
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function lookAt(eye: Vec3, target: Vec3, up: Vec3): Float32Array {
  const zAxis = normalize(subtract(eye, target));
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);
  return new Float32Array([
    xAxis[0],
    yAxis[0],
    zAxis[0],
    0,
    xAxis[1],
    yAxis[1],
    zAxis[1],
    0,
    xAxis[2],
    yAxis[2],
    zAxis[2],
    0,
    -dot(xAxis, eye),
    -dot(yAxis, eye),
    -dot(zAxis, eye),
    1,
  ]);
}

function perspective(fovRadians: number, aspect: number, near: number, far: number): Float32Array {
  const focal = 1 / Math.tan(fovRadians / 2);
  const range = near - far;
  return new Float32Array([
    focal / aspect,
    0,
    0,
    0,
    0,
    focal,
    0,
    0,
    0,
    0,
    far / range,
    -1,
    0,
    0,
    (far * near) / range,
    0,
  ]);
}

function multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row]! * b[column * 4]! +
        a[4 + row]! * b[column * 4 + 1]! +
        a[8 + row]! * b[column * 4 + 2]! +
        a[12 + row]! * b[column * 4 + 3]!;
    }
  }
  return output;
}

function rotatePanelPoint(local: Vec3, yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const pitched: Vec3 = [
    local[0],
    local[1] * cosPitch - local[2] * sinPitch,
    local[1] * sinPitch + local[2] * cosPitch,
  ];
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  return [
    pitched[0] * cosYaw + pitched[2] * sinYaw,
    pitched[1],
    -pitched[0] * sinYaw + pitched[2] * cosYaw,
  ];
}

function translatePoint(point: Vec3, offset: Vec3): Vec3 {
  return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];
}

interface PanelLayout {
  readonly center: Vec3;
  readonly width: number;
  readonly height: number;
  readonly yaw: number;
  readonly pitch: number;
}

const panelLayouts: Record<SystemPanelKind, PanelLayout> = {
  nav: {
    center: [-2.95, 2.08, 1.06],
    width: 1.48,
    height: 2.64,
    yaw: 0.32,
    pitch: -0.16,
  },
  screen: {
    center: [0, 2.08, 0.72],
    width: 3.6,
    height: 2.64,
    yaw: 0,
    pitch: -0.16,
  },
  context: {
    center: [3.02, 2.08, 1.06],
    width: 1.64,
    height: 2.64,
    yaw: -0.32,
    pitch: -0.16,
  },
};

function getPanelLayout(kind: SystemPanelKind): PanelLayout {
  return panelLayouts[kind];
}

function pushTexturedVertex(
  target: number[],
  point: Vec3,
  u: number,
  v: number,
  tint: Rgba = [1, 1, 1, 1]
): void {
  target.push(point[0], point[1], point[2], u, v, tint[0], tint[1], tint[2], tint[3]);
}

function createPanelVertices(kind: SystemPanelKind, tint: Rgba = [1, 1, 1, 1]): Float32Array {
  const layout = getPanelLayout(kind);
  const halfWidth = layout.width / 2;
  const halfHeight = layout.height / 2;
  const topLeft = translatePoint(
    rotatePanelPoint([-halfWidth, halfHeight, 0], layout.yaw, layout.pitch),
    layout.center
  );
  const bottomLeft = translatePoint(
    rotatePanelPoint([-halfWidth, -halfHeight, 0], layout.yaw, layout.pitch),
    layout.center
  );
  const bottomRight = translatePoint(
    rotatePanelPoint([halfWidth, -halfHeight, 0], layout.yaw, layout.pitch),
    layout.center
  );
  const topRight = translatePoint(
    rotatePanelPoint([halfWidth, halfHeight, 0], layout.yaw, layout.pitch),
    layout.center
  );
  const vertices: number[] = [];
  pushTexturedVertex(vertices, topLeft, 0, 0, tint);
  pushTexturedVertex(vertices, bottomLeft, 0, 1, tint);
  pushTexturedVertex(vertices, bottomRight, 1, 1, tint);
  pushTexturedVertex(vertices, topLeft, 0, 0, tint);
  pushTexturedVertex(vertices, bottomRight, 1, 1, tint);
  pushTexturedVertex(vertices, topRight, 1, 0, tint);
  return new Float32Array(vertices);
}

function projectTextureVertex(
  vertices: Float32Array,
  vertexIndex: number,
  viewProjection: Float32Array,
  width: number,
  height: number
): ProjectedTextureVertex | undefined {
  const offset = vertexIndex * textureVertexFloats;
  const x = vertices[offset] ?? 0;
  const y = vertices[offset + 1] ?? 0;
  const z = vertices[offset + 2] ?? 0;
  const clipX =
    viewProjection[0]! * x +
    viewProjection[4]! * y +
    viewProjection[8]! * z +
    viewProjection[12]!;
  const clipY =
    viewProjection[1]! * x +
    viewProjection[5]! * y +
    viewProjection[9]! * z +
    viewProjection[13]!;
  const clipZ =
    viewProjection[2]! * x +
    viewProjection[6]! * y +
    viewProjection[10]! * z +
    viewProjection[14]!;
  const clipW =
    viewProjection[3]! * x +
    viewProjection[7]! * y +
    viewProjection[11]! * z +
    viewProjection[15]!;

  if (clipW <= 0.0001) {
    return undefined;
  }

  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth: ndcZ,
    u: vertices[offset + 3] ?? 0,
    v: vertices[offset + 4] ?? 0,
  };
}

function resolveTriangleUv(
  pointerX: number,
  pointerY: number,
  a: ProjectedTextureVertex,
  b: ProjectedTextureVertex,
  c: ProjectedTextureVertex
): { readonly u: number; readonly v: number; readonly depth: number } | undefined {
  const denominator =
    (b.y - c.y) * (a.x - c.x) +
    (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 0.0001) {
    return undefined;
  }

  const weightA =
    ((b.y - c.y) * (pointerX - c.x) +
      (c.x - b.x) * (pointerY - c.y)) /
    denominator;
  const weightB =
    ((c.y - a.y) * (pointerX - c.x) +
      (a.x - c.x) * (pointerY - c.y)) /
    denominator;
  const weightC = 1 - weightA - weightB;
  const tolerance = -0.002;
  if (weightA < tolerance || weightB < tolerance || weightC < tolerance) {
    return undefined;
  }

  return {
    u: weightA * a.u + weightB * b.u + weightC * c.u,
    v: weightA * a.v + weightB * b.v + weightC * c.v,
    depth: weightA * a.depth + weightB * b.depth + weightC * c.depth,
  };
}

function findActionAtPanelUv(
  panel: SystemPanelRaster,
  u: number,
  v: number
): SystemPanelAction | undefined {
  return resolveGpuInteractionActionAtUv(panel.actions, {
    u,
    v,
    width: panel.canvas.width,
    height: panel.canvas.height,
  });
}

function createLabeledShaderModule(
  device: GPUDevice,
  label: string,
  code: string,
  diagnostics: string[]
): GPUShaderModule {
  const module = device.createShaderModule({ label, code });
  void module.getCompilationInfo?.().then((info: GPUCompilationInfo) => {
    for (const message of info.messages) {
      diagnostics.push(
        `${label}:${message.lineNum}:${message.linePos} ${message.type}: ${message.message}`
      );
    }
  });
  return module;
}

function createPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  topology: GPUPrimitiveTopology,
  layout: GPUPipelineLayout,
  diagnostics: string[]
): GPURenderPipeline {
  const label = `player-system.${topology}`;
  const module = createLabeledShaderModule(device, `${label}.shader`, shaderSource, diagnostics);
  return device.createRenderPipeline({
    label: `${label}.pipeline`,
    layout,
    vertex: {
      module,
      entryPoint: "vertexMain",
      buffers: [
        {
          arrayStride: vertexFloats * Float32Array.BYTES_PER_ELEMENT,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            {
              shaderLocation: 1,
              offset: 3 * Float32Array.BYTES_PER_ELEMENT,
              format: "float32x4",
            },
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: "fragmentMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology,
      cullMode: "none",
    },
  });
}

function createTexturedPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  layout: GPUPipelineLayout,
  diagnostics: string[]
): GPURenderPipeline {
  const module = createLabeledShaderModule(
    device,
    "player-system.textured.shader",
    texturedShaderSource,
    diagnostics
  );
  return device.createRenderPipeline({
    label: "player-system.textured.pipeline",
    layout,
    vertex: {
      module,
      entryPoint: "vertexMain",
      buffers: [
        {
          arrayStride: textureVertexFloats * Float32Array.BYTES_PER_ELEMENT,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            {
              shaderLocation: 1,
              offset: 3 * Float32Array.BYTES_PER_ELEMENT,
              format: "float32x2",
            },
            {
              shaderLocation: 2,
              offset: 5 * Float32Array.BYTES_PER_ELEMENT,
              format: "float32x4",
            },
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: "fragmentMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "none",
    },
  });
}

function createFullscreenPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  layout: GPUPipelineLayout,
  shaderCode: string,
  label: string,
  diagnostics: string[]
): GPURenderPipeline {
  const module = createLabeledShaderModule(device, `${label}.shader`, shaderCode, diagnostics);
  return device.createRenderPipeline({
    label: `${label}.pipeline`,
    layout,
    vertex: {
      module,
      entryPoint: "vertexMain",
    },
    fragment: {
      module,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "none",
    },
  });
}

function createRenderPassDescriptor(
  view: GPUTextureView,
  clearColor: readonly [number, number, number, number]
): GPURenderPassDescriptor {
  return {
    colorAttachments: [
      {
        view,
        loadOp: "clear",
        clearValue: {
          r: clearColor[0],
          g: clearColor[1],
          b: clearColor[2],
          a: clearColor[3],
        },
        storeOp: "store",
      },
    ],
  };
}

function createLoadRenderPassDescriptor(view: GPUTextureView): GPURenderPassDescriptor {
  return {
    colorAttachments: [
      {
        view,
        loadOp: "load",
        storeOp: "store",
      },
    ],
  };
}

function resolveRaySampleCount(
  canvas: HTMLCanvasElement,
  settings: SceneRenderSettings
): number {
  if (settings.raySamples) {
    return settings.raySamples;
  }

  const pixelCount = Math.max(1, canvas.width * canvas.height);
  const maxSamples = settings.qualityMode === "ultra" ? 8 : 4;
  const targetSamplePixels = settings.qualityMode === "ultra" ? 7_400_000 : 3_700_000;
  return Math.max(1, Math.min(maxSamples, Math.floor(targetSamplePixels / pixelCount)));
}

function createRayTraceUniforms(
  frame: EncodedSceneFrame,
  canvas: HTMLCanvasElement,
  settings: SceneRenderSettings,
  panels: readonly SystemPanelRaster[],
  traceTriangleCount: number,
  traceNodeCount: number,
  raySampleCount: number
): Float32Array {
  const shadowPlan = settings.rayTracing.shadowPostProcess;
  const reflectionPlan = settings.rayTracing.groundReflection;
  const time = frame.timeMs * 0.001;
  const aspect = canvas.width / Math.max(1, canvas.height);
  const camera = resolveCameraFrame(frame);
  const sunDirection = resolveDirectionalSunDirection();
  const shadowEnabled = shadowPlan.shadowMask === "per-pixel-screen-space-ray-mask";
  const reflectionEnabled =
    reflectionPlan.reflectionResolve === "per-pixel-water-raytrace-resolve";
  const shadowStrength = shadowEnabled
    ? clamp(1.36 * shadowPlan.shadowStrengthMultiplier, 0, 2.2)
    : 0;
  const reflectionStrength = reflectionEnabled
    ? clamp(
        0.52 *
          reflectionPlan.sceneReflectionIntensity *
          reflectionPlan.reflectionStrengthMultiplier,
        0,
        1.25
      )
    : 0;
  const accent = focusColors[frame.focus];
  const visiblePanels = new Set(panels.map((panel) => panel.kind));

  return new Float32Array([
    canvas.width,
    canvas.height,
    time,
    settings.qualityMode === "ultra" ? 1 : 0,
    camera.eye[0],
    camera.eye[1],
    camera.eye[2],
    camera.fovRadians,
    camera.forward[0],
    camera.forward[1],
    camera.forward[2],
    aspect,
    camera.right[0],
    camera.right[1],
    camera.right[2],
    0,
    camera.up[0],
    camera.up[1],
    camera.up[2],
    0,
    sunDirection[0],
    sunDirection[1],
    sunDirection[2],
    settings.lightingBoost,
    shadowStrength,
    reflectionStrength,
    180,
    settings.qualityMode === "ultra" ? 0.62 : 0.5,
    accent[0],
    accent[1],
    accent[2],
    1,
    visiblePanels.has("nav") ? 1 : 0,
    visiblePanels.has("screen") ? 1 : 0,
    visiblePanels.has("context") ? 1 : 0,
    0,
    traceTriangleCount,
    traceNodeCount,
    raySampleCount,
    settings.rayDebugMode === "hits" ? 1 : 0,
  ]);
}

function createResources(
  device: GPUDevice,
  format: GPUTextureFormat
): SceneGpuResources {
  const shaderDiagnostics: string[] = [];
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: gpuShaderStage.vertex,
        buffer: { type: "uniform" },
      },
    ],
  });
  const textureBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 1,
        visibility: gpuShaderStage.fragment,
        sampler: { type: "filtering" },
      },
    ],
  });
  const rayTraceBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 1,
        visibility: gpuShaderStage.fragment,
        sampler: { type: "filtering" },
      },
      {
        binding: 2,
        visibility: gpuShaderStage.fragment,
        buffer: { type: "uniform" },
      },
      {
        binding: 3,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 4,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 5,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 6,
        visibility: gpuShaderStage.fragment,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 7,
        visibility: gpuShaderStage.fragment,
        buffer: { type: "read-only-storage" },
      },
    ],
  });
  const denoiseBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 1,
        visibility: gpuShaderStage.fragment,
        texture: { sampleType: "float" },
      },
      {
        binding: 2,
        visibility: gpuShaderStage.fragment,
        sampler: { type: "filtering" },
      },
      {
        binding: 3,
        visibility: gpuShaderStage.fragment,
        buffer: { type: "uniform" },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout],
  });
  const texturedPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout, textureBindGroupLayout],
  });
  const rayTracePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [rayTraceBindGroupLayout],
  });
  const solidDebugPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [],
  });
  const denoisePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [denoiseBindGroupLayout],
  });
  const trianglePipeline = createPipeline(
    device,
    format,
    "triangle-list",
    pipelineLayout,
    shaderDiagnostics
  );
  const linePipeline = createPipeline(
    device,
    format,
    "line-list",
    pipelineLayout,
    shaderDiagnostics
  );
  const texturedPipeline = createTexturedPipeline(
    device,
    format,
    texturedPipelineLayout,
    shaderDiagnostics
  );
  const rayTracePipeline = createFullscreenPipeline(
    device,
    format,
    rayTracePipelineLayout,
    rayTraceShaderSource,
    "player-system.ray-trace",
    shaderDiagnostics
  );
  const rayTraceHitDebugPipeline = createFullscreenPipeline(
    device,
    format,
    rayTracePipelineLayout,
    rayTraceHitDebugShaderSource,
    "player-system.ray-hit-debug",
    shaderDiagnostics
  );
  const solidDebugPipeline = createFullscreenPipeline(
    device,
    format,
    solidDebugPipelineLayout,
    solidDebugShaderSource,
    "player-system.solid-debug",
    shaderDiagnostics
  );
  const denoisePipeline = createFullscreenPipeline(
    device,
    format,
    denoisePipelineLayout,
    denoiseShaderSource,
    "player-system.denoise",
    shaderDiagnostics
  );
  const uniformBuffer = device.createBuffer({
    size: matrixBytes,
    usage: gpuBufferUsage.uniform | gpuBufferUsage.copyDst,
  });
  const rayTraceUniformBuffer = device.createBuffer({
    size: rayTraceUniformBytes,
    usage: gpuBufferUsage.uniform | gpuBufferUsage.copyDst,
  });
  const textureSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });
  const rayTraceSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });
  const fallbackPanelTexture = device.createTexture({
    size: [1, 1, 1],
    format: "rgba8unorm",
    usage: gpuTextureUsage.textureBinding | gpuTextureUsage.copyDst,
  });
  device.queue.writeTexture(
    { texture: fallbackPanelTexture },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1]
  );
  const fallbackPanelTextureView = fallbackPanelTexture.createView();
  const bindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  return {
    device,
    format,
    uniformBuffer,
    bindGroup,
    trianglePipeline,
    linePipeline,
    texturedPipeline,
    rayTracePipeline,
    rayTraceHitDebugPipeline,
    solidDebugPipeline,
    denoisePipeline,
    textureBindGroupLayout,
    rayTraceBindGroupLayout,
    denoiseBindGroupLayout,
    textureSampler,
    rayTraceSampler,
    rayTraceUniformBuffer,
    fallbackPanelTexture,
    fallbackPanelTextureView,
    shaderDiagnostics,
    triangleCapacity: 0,
    traceTriangleCapacity: 0,
    traceTriangleCount: 0,
    traceNodeCapacity: 0,
    traceNodeCount: 0,
    lineCapacity: 0,
    sceneTextureWidth: 0,
    sceneTextureHeight: 0,
    rayTraceTextureWidth: 0,
    rayTraceTextureHeight: 0,
  };
}

function ensureVertexBuffer(
  resources: SceneGpuResources,
  existing: GPUBuffer | undefined,
  existingCapacity: number,
  data: Float32Array
): { readonly buffer: GPUBuffer; readonly capacity: number } {
  if (existing && existingCapacity >= data.byteLength) {
    resources.device.queue.writeBuffer(existing, 0, data);
    return { buffer: existing, capacity: existingCapacity };
  }

  existing?.destroy();
  const capacity = Math.max(256, 2 ** Math.ceil(Math.log2(Math.max(1, data.byteLength))));
  const buffer = resources.device.createBuffer({
    size: capacity,
    usage: gpuBufferUsage.vertex | gpuBufferUsage.copyDst,
  });
  resources.device.queue.writeBuffer(buffer, 0, data);
  return { buffer, capacity };
}

function ensureStorageBuffer(
  resources: SceneGpuResources,
  existing: GPUBuffer | undefined,
  existingCapacity: number,
  data: Float32Array
): { readonly buffer: GPUBuffer; readonly capacity: number } {
  if (existing && existingCapacity >= data.byteLength) {
    resources.device.queue.writeBuffer(existing, 0, data);
    return { buffer: existing, capacity: existingCapacity };
  }

  existing?.destroy();
  const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, data.byteLength))));
  const buffer = resources.device.createBuffer({
    size: capacity,
    usage: gpuBufferUsage.storage | gpuBufferUsage.copyDst,
  });
  resources.device.queue.writeBuffer(buffer, 0, data);
  return { buffer, capacity };
}

type MutableVec3 = [number, number, number];

interface TraceTriangleRecord {
  readonly p0: MutableVec3;
  readonly p1: MutableVec3;
  readonly p2: MutableVec3;
  readonly c0: Rgba;
  readonly c1: Rgba;
  readonly c2: Rgba;
  readonly material: number;
  readonly boundsMin: MutableVec3;
  readonly boundsMax: MutableVec3;
  readonly centroid: MutableVec3;
}

interface TraceNodeRecord {
  readonly boundsMin: MutableVec3;
  readonly boundsMax: MutableVec3;
  readonly left: number;
  readonly right: number;
  readonly first: number;
  readonly count: number;
}

interface TraceMeshData {
  readonly triangleData: Float32Array;
  readonly nodeData: Float32Array;
  readonly triangleCount: number;
  readonly nodeCount: number;
}

function minVec3(a: MutableVec3, b: MutableVec3): MutableVec3 {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}

function maxVec3(a: MutableVec3, b: MutableVec3): MutableVec3 {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

function triangleRecordFromVertices(
  data: readonly number[],
  offset: number,
  material: number
): TraceTriangleRecord | undefined {
  const p0: MutableVec3 = [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
  const p1Offset = offset + vertexFloats;
  const p2Offset = offset + vertexFloats * 2;
  const p1: MutableVec3 = [
    data[p1Offset] ?? 0,
    data[p1Offset + 1] ?? 0,
    data[p1Offset + 2] ?? 0,
  ];
  const p2: MutableVec3 = [
    data[p2Offset] ?? 0,
    data[p2Offset + 1] ?? 0,
    data[p2Offset + 2] ?? 0,
  ];
  const c0: Rgba = [
    data[offset + 3] ?? 0,
    data[offset + 4] ?? 0,
    data[offset + 5] ?? 0,
    data[offset + 6] ?? 0,
  ];
  const c1: Rgba = [
    data[p1Offset + 3] ?? 0,
    data[p1Offset + 4] ?? 0,
    data[p1Offset + 5] ?? 0,
    data[p1Offset + 6] ?? 0,
  ];
  const c2: Rgba = [
    data[p2Offset + 3] ?? 0,
    data[p2Offset + 4] ?? 0,
    data[p2Offset + 5] ?? 0,
    data[p2Offset + 6] ?? 0,
  ];
  if (Math.max(c0[3], c1[3], c2[3]) < 0.015) {
    return undefined;
  }
  const edgeA: MutableVec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const edgeB: MutableVec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const crossLength = Math.hypot(
    edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
    edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
    edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]
  );
  if (crossLength < 0.000001) {
    return undefined;
  }

  const boundsMin = minVec3(minVec3(p0, p1), p2);
  const boundsMax = maxVec3(maxVec3(p0, p1), p2);
  const centroid: MutableVec3 = [
    (p0[0] + p1[0] + p2[0]) / 3,
    (p0[1] + p1[1] + p2[1]) / 3,
    (p0[2] + p1[2] + p2[2]) / 3,
  ];
  return { p0, p1, p2, c0, c1, c2, material, boundsMin, boundsMax, centroid };
}

function createTraceTriangleRecords(triangles: readonly number[]): readonly TraceTriangleRecord[] {
  const records: TraceTriangleRecord[] = [];
  const triangleStride = vertexFloats * 3;
  const materials = traceMaterialsByGeometry.get(triangles as number[]) ?? [];
  let triangleIndex = 0;
  for (let offset = 0; offset + triangleStride <= triangles.length; offset += triangleStride) {
    const record = triangleRecordFromVertices(
      triangles,
      offset,
      materials[triangleIndex] ?? materialUnknown
    );
    if (record) {
      records.push(record);
    }
    triangleIndex += 1;
  }
  return records;
}

function longestBoundsAxis(minimum: MutableVec3, maximum: MutableVec3): 0 | 1 | 2 {
  const x = maximum[0] - minimum[0];
  const y = maximum[1] - minimum[1];
  const z = maximum[2] - minimum[2];
  if (y > x && y >= z) {
    return 1;
  }
  if (z > x && z > y) {
    return 2;
  }
  return 0;
}

function buildTraceMeshData(triangles: readonly number[]): TraceMeshData {
  const records = createTraceTriangleRecords(triangles);
  if (records.length === 0) {
    return {
      triangleData: new Float32Array(traceTriangleFloats),
      nodeData: new Float32Array(traceNodeFloats),
      triangleCount: 0,
      nodeCount: 0,
    };
  }

  const indices = new Uint32Array(records.length);
  for (let index = 0; index < indices.length; index += 1) {
    indices[index] = index;
  }

  const ordered: TraceTriangleRecord[] = [];
  const nodes: TraceNodeRecord[] = [];

  function buildNode(start: number, end: number): number {
    let boundsMin: MutableVec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    let boundsMax: MutableVec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    let centroidMin: MutableVec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    let centroidMax: MutableVec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let index = start; index < end; index += 1) {
      const record = records[indices[index]!]!;
      boundsMin = minVec3(boundsMin, record.boundsMin);
      boundsMax = maxVec3(boundsMax, record.boundsMax);
      centroidMin = minVec3(centroidMin, record.centroid);
      centroidMax = maxVec3(centroidMax, record.centroid);
    }

    const nodeIndex = nodes.length;
    nodes.push({ boundsMin, boundsMax, left: 0, right: 0, first: 0, count: 0 });
    const count = end - start;
    if (count <= traceMeshLeafSize) {
      const first = ordered.length;
      for (let index = start; index < end; index += 1) {
        ordered.push(records[indices[index]!]!);
      }
      nodes[nodeIndex] = { boundsMin, boundsMax, left: 0, right: 0, first, count };
      return nodeIndex;
    }

    const axis = longestBoundsAxis(centroidMin, centroidMax);
    indices.subarray(start, end).sort((a, b) => records[a]!.centroid[axis] - records[b]!.centroid[axis]);
    const middle = start + Math.floor(count / 2);
    const left = buildNode(start, middle);
    const right = buildNode(middle, end);
    nodes[nodeIndex] = { boundsMin, boundsMax, left, right, first: 0, count: 0 };
    return nodeIndex;
  }

  buildNode(0, records.length);

  const triangleData = new Float32Array(Math.max(traceTriangleFloats, ordered.length * traceTriangleFloats));
  for (const [index, triangle] of ordered.entries()) {
    const offset = index * traceTriangleFloats;
    triangleData.set(
      [
        ...triangle.p0,
        triangle.material,
        ...triangle.p1,
        triangle.material,
        ...triangle.p2,
        triangle.material,
      ],
      offset
    );
    triangleData.set(triangle.c0, offset + 12);
    triangleData.set(triangle.c1, offset + 16);
    triangleData.set(triangle.c2, offset + 20);
  }

  const nodeData = new Float32Array(Math.max(traceNodeFloats, nodes.length * traceNodeFloats));
  for (const [index, node] of nodes.entries()) {
    const offset = index * traceNodeFloats;
    nodeData.set([...node.boundsMin, 0], offset);
    nodeData.set([...node.boundsMax, 0], offset + 4);
    nodeData.set([node.left, node.right, node.first, node.count], offset + 8);
  }

  return {
    triangleData,
    nodeData,
    triangleCount: ordered.length,
    nodeCount: nodes.length,
  };
}

class WebGpuSystemScene {
  private readonly backgroundParticles: readonly AmbientParticle[];
  private readonly particles: readonly Vec3[];
  private panelRasters: readonly SystemPanelRaster[] = [];
  private panelSurfaces = new Map<SystemPanelKind, PanelGpuSurface>();
  private surfaceVersionKey = "";
  private traceMeshKey = "";
  private lastRaySampleCount = 0;
  private resources?: SceneGpuResources;
  private frame: EncodedSceneFrame = {
    timeMs: 0,
    focus: "missions-quests",
    look: resolvePlayerLook(0),
  };

  constructor(private readonly settings: SceneRenderSettings) {
    this.particles = createParticles(settings.particleCount);
    this.backgroundParticles = createBackgroundParticles(settings.backgroundParticleCount);
  }

  setSurfaceState(surfaceState: SystemSceneSurfaceState): void {
    const versionKey = `${surfaceState.revealStage}:${surfaceState.activeModuleId}:${surfaceState.activeSelectionId}:${surfaceState.visualKind}`;
    if (versionKey === this.surfaceVersionKey) {
      return;
    }
    this.surfaceVersionKey = versionKey;
    this.panelRasters = rasterizeSystemPanels(surfaceState);
    this.destroyPanelSurfaces();
  }

  setFrame(timeMs: number, focus: SystemDemoModuleId): PlayerLookState {
    const look = resolvePlayerLook(timeMs);
    this.frame = { timeMs, focus, look };
    return look;
  }

  getActions(): readonly SystemPanelAction[] {
    return this.panelRasters.flatMap((panel) => panel.actions);
  }

  getDiagnostics(): SystemSceneDiagnostics {
    return {
      panelRasterCount: this.panelRasters.length,
      traceTriangleCount: this.resources?.traceTriangleCount ?? 0,
      traceNodeCount: this.resources?.traceNodeCount ?? 0,
      raySampleCount: this.lastRaySampleCount,
      rayDebugMode: this.settings.rayDebugMode,
      shaderDiagnostics: this.resources?.shaderDiagnostics ?? [],
    };
  }

  encode(
    event: RenderEncodeEvent,
    format: GPUTextureFormat,
    geometry: { readonly triangles: readonly number[]; readonly lines: readonly number[] } = this.buildGeometry(),
    options: { readonly includePanels?: boolean } = {}
  ): void {
    const resources = this.getResources(event.device, format);
    const aspect = event.canvas.width / Math.max(1, event.canvas.height);
    const viewProjection = buildCameraMatrix(this.frame, aspect);
    const { triangles, lines } = geometry;

    event.device.queue.writeBuffer(resources.uniformBuffer, 0, viewProjection);
    const triangleData = new Float32Array(triangles);
    const lineData = new Float32Array(lines);
    const triangleResult = ensureVertexBuffer(
      resources,
      resources.triangleBuffer,
      resources.triangleCapacity,
      triangleData
    );
    resources.triangleBuffer = triangleResult.buffer;
    resources.triangleCapacity = triangleResult.capacity;

    const lineResult = ensureVertexBuffer(
      resources,
      resources.lineBuffer,
      resources.lineCapacity,
      lineData
    );
    resources.lineBuffer = lineResult.buffer;
    resources.lineCapacity = lineResult.capacity;

    event.pass.setBindGroup(0, resources.bindGroup);
    if (triangleData.length > 0) {
      event.pass.setPipeline(resources.trianglePipeline);
      event.pass.setVertexBuffer(0, resources.triangleBuffer);
      event.pass.draw(triangleData.length / vertexFloats);
    }
    if (lineData.length > 0) {
      event.pass.setPipeline(resources.linePipeline);
      event.pass.setVertexBuffer(0, resources.lineBuffer);
      event.pass.draw(lineData.length / vertexFloats);
    }
    if (options.includePanels !== false) {
      this.drawPanelSurfaces(event, resources);
    }
  }

  encodeFrame(event: RendererEncodeFrameEvent, format: GPUTextureFormat): void {
    const resources = this.getResources(event.device, format);
    const geometry = this.buildGeometry();
    if (this.settings.rayDebugMode === "solid") {
      const solidDebugPass = event.encoder.beginRenderPass(
        createRenderPassDescriptor(event.view, event.clearColor)
      );
      solidDebugPass.setPipeline(resources.solidDebugPipeline);
      solidDebugPass.draw(3);
      solidDebugPass.end();
      return;
    }

    if (this.settings.presentationMode === "geometry") {
      const pass = event.encoder.beginRenderPass(
        createRenderPassDescriptor(event.view, event.clearColor)
      );
      this.encode({ device: event.device, pass, canvas: event.canvas }, format, geometry);
      pass.end();
      return;
    }

    const sceneView = this.ensureSceneTexture(resources, event.canvas.width, event.canvas.height);
    const scenePass = event.encoder.beginRenderPass(createRenderPassDescriptor(sceneView, gpuClearColor));
    this.encode(
      { device: event.device, pass: scenePass, canvas: event.canvas },
      format,
      geometry,
      { includePanels: false }
    );
    scenePass.end();
    this.updateTraceMesh(resources, geometry.triangles);
    const raySampleCount = resolveRaySampleCount(event.canvas, this.settings);
    this.lastRaySampleCount = raySampleCount;

    const uniforms = createRayTraceUniforms(
      this.frame,
      event.canvas,
      this.settings,
      this.panelRasters,
      resources.traceTriangleCount,
      resources.traceNodeCount,
      raySampleCount
    );
    event.device.queue.writeBuffer(resources.rayTraceUniformBuffer, 0, uniforms);

    if (this.settings.rayDebugMode === "hits") {
      const rayDebugPass = event.encoder.beginRenderPass(
        createRenderPassDescriptor(event.view, event.clearColor)
      );
      rayDebugPass.setPipeline(resources.rayTraceHitDebugPipeline);
      rayDebugPass.setBindGroup(0, this.createRayTraceBindGroup(resources));
      rayDebugPass.draw(3);
      rayDebugPass.end();
      return;
    }

    const rayTraceView = this.ensureRayTraceTexture(
      resources,
      event.canvas.width,
      event.canvas.height
    );
    const rayTracePass = event.encoder.beginRenderPass(
      createRenderPassDescriptor(rayTraceView, gpuClearColor)
    );
    rayTracePass.setPipeline(resources.rayTracePipeline);
    rayTracePass.setBindGroup(0, this.createRayTraceBindGroup(resources));
    rayTracePass.draw(3);
    rayTracePass.end();

    const denoisePass = event.encoder.beginRenderPass(
      createRenderPassDescriptor(event.view, event.clearColor)
    );
    denoisePass.setPipeline(resources.denoisePipeline);
    denoisePass.setBindGroup(0, this.createDenoiseBindGroup(resources));
    denoisePass.draw(3);
    denoisePass.end();

    const panelPass = event.encoder.beginRenderPass(createLoadRenderPassDescriptor(event.view));
    this.drawPanelSurfaces({ device: event.device, pass: panelPass, canvas: event.canvas }, resources);
    panelPass.end();
  }

  dispose(): void {
    this.destroyPanelSurfaces();
    this.resources?.triangleBuffer?.destroy();
    this.resources?.traceTriangleBuffer?.destroy();
    this.resources?.traceNodeBuffer?.destroy();
    this.resources?.lineBuffer?.destroy();
    this.resources?.uniformBuffer.destroy();
    this.resources?.rayTraceUniformBuffer.destroy();
    this.resources?.sceneTexture?.destroy();
    this.resources?.rayTraceTexture?.destroy();
    this.resources?.fallbackPanelTexture.destroy();
    this.resources = undefined;
  }

  private updateTraceMesh(resources: SceneGpuResources, triangles: readonly number[]): void {
    const meshUpdateMs = this.settings.qualityMode === "ultra" ? 260 : 420;
    const meshKey = `${this.frame.focus}:${Math.floor(this.frame.timeMs / meshUpdateMs)}`;
    if (
      meshKey === this.traceMeshKey &&
      resources.traceTriangleBuffer &&
      resources.traceNodeBuffer
    ) {
      return;
    }

    this.traceMeshKey = meshKey;
    const mesh = buildTraceMeshData(triangles);
    const triangleResult = ensureStorageBuffer(
      resources,
      resources.traceTriangleBuffer,
      resources.traceTriangleCapacity,
      mesh.triangleData
    );
    resources.traceTriangleBuffer = triangleResult.buffer;
    resources.traceTriangleCapacity = triangleResult.capacity;
    resources.traceTriangleCount = mesh.triangleCount;

    const nodeResult = ensureStorageBuffer(
      resources,
      resources.traceNodeBuffer,
      resources.traceNodeCapacity,
      mesh.nodeData
    );
    resources.traceNodeBuffer = nodeResult.buffer;
    resources.traceNodeCapacity = nodeResult.capacity;
    resources.traceNodeCount = mesh.nodeCount;
  }

  private destroyPanelSurfaces(): void {
    for (const surface of this.panelSurfaces.values()) {
      surface.texture.destroy();
      surface.vertexBuffer.destroy();
    }
    this.panelSurfaces.clear();
  }

  private getResources(device: GPUDevice, format: GPUTextureFormat): SceneGpuResources {
    if (!this.resources || this.resources.device !== device || this.resources.format !== format) {
      this.dispose();
      this.resources = createResources(device, format);
    }
    return this.resources;
  }

  private ensureSceneTexture(
    resources: SceneGpuResources,
    width: number,
    height: number
  ): GPUTextureView {
    const resolvedWidth = Math.max(1, width);
    const resolvedHeight = Math.max(1, height);
    if (
      resources.sceneTexture &&
      resources.sceneTextureView &&
      resources.sceneTextureWidth === resolvedWidth &&
      resources.sceneTextureHeight === resolvedHeight
    ) {
      return resources.sceneTextureView;
    }

    resources.sceneTexture?.destroy();
    resources.sceneTexture = resources.device.createTexture({
      size: [resolvedWidth, resolvedHeight, 1],
      format: resources.format,
      usage: gpuTextureUsage.renderAttachment | gpuTextureUsage.textureBinding,
    });
    resources.sceneTextureView = resources.sceneTexture.createView();
    resources.sceneTextureWidth = resolvedWidth;
    resources.sceneTextureHeight = resolvedHeight;
    return resources.sceneTextureView;
  }

  private ensureRayTraceTexture(
    resources: SceneGpuResources,
    width: number,
    height: number
  ): GPUTextureView {
    const resolvedWidth = Math.max(1, width);
    const resolvedHeight = Math.max(1, height);
    if (
      resources.rayTraceTexture &&
      resources.rayTraceTextureView &&
      resources.rayTraceTextureWidth === resolvedWidth &&
      resources.rayTraceTextureHeight === resolvedHeight
    ) {
      return resources.rayTraceTextureView;
    }

    resources.rayTraceTexture?.destroy();
    resources.rayTraceTexture = resources.device.createTexture({
      size: [resolvedWidth, resolvedHeight, 1],
      format: resources.format,
      usage: gpuTextureUsage.renderAttachment | gpuTextureUsage.textureBinding,
    });
    resources.rayTraceTextureView = resources.rayTraceTexture.createView();
    resources.rayTraceTextureWidth = resolvedWidth;
    resources.rayTraceTextureHeight = resolvedHeight;
    return resources.rayTraceTextureView;
  }

  private getPanelTextureView(
    resources: SceneGpuResources,
    kind: SystemPanelKind
  ): GPUTextureView {
    const panel = this.panelRasters.find((candidate) => candidate.kind === kind);
    return panel
      ? this.getPanelSurface(resources, panel).textureView
      : resources.fallbackPanelTextureView;
  }

  private createRayTraceBindGroup(resources: SceneGpuResources): GPUBindGroup {
    if (!resources.sceneTextureView || !resources.traceTriangleBuffer || !resources.traceNodeBuffer) {
      throw new Error("Ray trace pass requires source scene and trace mesh buffers.");
    }

    return resources.device.createBindGroup({
      layout: resources.rayTraceBindGroupLayout,
      entries: [
        { binding: 0, resource: resources.sceneTextureView },
        { binding: 1, resource: resources.rayTraceSampler },
        { binding: 2, resource: { buffer: resources.rayTraceUniformBuffer } },
        { binding: 3, resource: this.getPanelTextureView(resources, "nav") },
        { binding: 4, resource: this.getPanelTextureView(resources, "screen") },
        { binding: 5, resource: this.getPanelTextureView(resources, "context") },
        { binding: 6, resource: { buffer: resources.traceTriangleBuffer } },
        { binding: 7, resource: { buffer: resources.traceNodeBuffer } },
      ],
    });
  }

  private createDenoiseBindGroup(resources: SceneGpuResources): GPUBindGroup {
    if (!resources.sceneTextureView || !resources.rayTraceTextureView) {
      throw new Error("Denoise pass requires source scene and ray trace textures.");
    }

    return resources.device.createBindGroup({
      layout: resources.denoiseBindGroupLayout,
      entries: [
        { binding: 0, resource: resources.rayTraceTextureView },
        { binding: 1, resource: resources.sceneTextureView },
        { binding: 2, resource: resources.rayTraceSampler },
        { binding: 3, resource: { buffer: resources.rayTraceUniformBuffer } },
      ],
    });
  }

  private getPanelSurface(
    resources: SceneGpuResources,
    panel: SystemPanelRaster
  ): PanelGpuSurface {
    const existing = this.panelSurfaces.get(panel.kind);
    if (existing && existing.versionKey === panel.versionKey) {
      return existing;
    }

    existing?.texture.destroy();
    existing?.vertexBuffer.destroy();
    const texture = resources.device.createTexture({
      size: [panel.canvas.width, panel.canvas.height, 1],
      format: "rgba8unorm",
      usage:
        gpuTextureUsage.textureBinding |
        gpuTextureUsage.copyDst |
        gpuTextureUsage.renderAttachment,
    });
    resources.device.queue.copyExternalImageToTexture(
      { source: panel.canvas },
      { texture },
      [panel.canvas.width, panel.canvas.height]
    );
    const textureView = texture.createView();
    const vertexData = createPanelVertices(panel.kind);
    const vertexBuffer = resources.device.createBuffer({
      size: vertexData.byteLength,
      usage: gpuBufferUsage.vertex | gpuBufferUsage.copyDst,
    });
    resources.device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    const bindGroup = resources.device.createBindGroup({
      layout: resources.textureBindGroupLayout,
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: resources.textureSampler },
      ],
    });
    const surface: PanelGpuSurface = {
      kind: panel.kind,
      versionKey: panel.versionKey,
      texture,
      textureView,
      bindGroup,
      vertexBuffer,
      vertexCount: vertexData.length / textureVertexFloats,
    };
    this.panelSurfaces.set(panel.kind, surface);
    return surface;
  }

  private drawPanelSurfaces(
    event: RenderEncodeEvent,
    resources: SceneGpuResources
  ): void {
    if (this.panelRasters.length === 0) {
      return;
    }

    event.pass.setPipeline(resources.texturedPipeline);
    event.pass.setBindGroup(0, resources.bindGroup);
    for (const panel of this.panelRasters) {
      const surface = this.getPanelSurface(resources, panel);
      event.pass.setBindGroup(1, surface.bindGroup);
      event.pass.setVertexBuffer(0, surface.vertexBuffer);
      event.pass.draw(surface.vertexCount);
    }
  }

  pickAction(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ): SystemPanelAction | undefined {
    const rect = canvas.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    if (
      pointerX < 0 ||
      pointerY < 0 ||
      pointerX > rect.width ||
      pointerY > rect.height ||
      this.panelRasters.length === 0
    ) {
      return undefined;
    }

    const viewProjection = buildCameraMatrix(this.frame, rect.width / Math.max(1, rect.height));
    let closest: { readonly action: SystemPanelAction; readonly depth: number } | undefined;

    for (const panel of this.panelRasters) {
      if (panel.actions.length === 0) {
        continue;
      }

      const vertices = createPanelVertices(panel.kind);
      const projected = Array.from({ length: 6 }, (_, index) =>
        projectTextureVertex(vertices, index, viewProjection, rect.width, rect.height)
      );
      const triangles = [
        [0, 1, 2],
        [3, 4, 5],
      ] as const;

      for (const [aIndex, bIndex, cIndex] of triangles) {
        const a = projected[aIndex];
        const b = projected[bIndex];
        const c = projected[cIndex];
        if (!a || !b || !c) {
          continue;
        }

        const uv = resolveTriangleUv(pointerX, pointerY, a, b, c);
        if (!uv) {
          continue;
        }

        const action = findActionAtPanelUv(panel, uv.u, uv.v);
        if (action && (!closest || uv.depth < closest.depth)) {
          closest = { action, depth: uv.depth };
        }
      }
    }

    return closest?.action;
  }

  private buildGeometry(): { readonly triangles: number[]; readonly lines: number[] } {
    const triangles: number[] = [];
    const lines: number[] = [];
    const time = this.frame.timeMs * 0.001;
    const look = this.frame.look;
    const accent = focusColors[this.frame.focus];
    pushFieldWorld(triangles, lines, time, accent, this.settings);
    pushBackgroundParticles(lines, this.backgroundParticles, time, look, accent, this.settings);

    for (const [index, particle] of this.particles.entries()) {
      const phase = time * (0.08 + pseudoRandom(index + 71) * 0.08);
      const angle = Math.atan2(particle[2] + 2.2, particle[0]) + phase - look.yaw * 0.08;
      const radius = Math.hypot(particle[0], particle[2] + 2.2);
      const y = particle[1] + Math.sin(time * 0.9 + index) * 0.045;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 2.2;
      const alpha = boostAlpha(0.22 + pseudoRandom(index + 113) * 0.26, this.settings, 0.92);
      pushLine(lines, [x, y, z], [x, y + 0.055, z], [0.86, 0.9, 0.48, alpha * 0.72]);
    }

    return { triangles, lines };
  }
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  renderer: GpuRenderer,
  settings: SceneRenderSettings
): SceneResizeDiagnostics {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const requestedPixelRatio = Math.max(
    1,
    Math.min(
      window.devicePixelRatio * settings.renderScale,
      settings.qualityMode === "ultra" ? 3 : 2
    )
  );
  const maxTextureDimension2D = renderer.device.limits.maxTextureDimension2D;
  const maxDimensionRatio = Math.min(
    maxTextureDimension2D / width,
    maxTextureDimension2D / height
  );
  const pixelRatio = clamp(
    Math.min(requestedPixelRatio, maxDimensionRatio),
    1,
    requestedPixelRatio
  );
  const resized = renderer.resize(width, height, pixelRatio);

  return {
    cssWidth: width,
    cssHeight: height,
    canvasWidth: resized.width,
    canvasHeight: resized.height,
    pixelRatio,
    requestedPixelRatio,
    maxTextureDimension2D,
  };
}

function formatGpuError(error: GPUError | null): string | undefined {
  if (!error) {
    return undefined;
  }
  return `${error.constructor.name}: ${error.message}`;
}

async function popFrameErrorScopes(device: GPUDevice): Promise<string | undefined> {
  const errors = await Promise.all([
    device.popErrorScope(),
    device.popErrorScope(),
    device.popErrorScope(),
  ]);
  return errors.map(formatGpuError).find((message): message is string => Boolean(message));
}

async function mountWebGpuSystemScene(
  canvas: HTMLCanvasElement,
  options: SystemSceneOptions
): Promise<SystemSceneController> {
  const settings = resolveSceneSettings(options);
  const scene = new WebGpuSystemScene(settings);
  let currentFocus: SystemDemoModuleId = "missions-quests";
  let frameId: number | undefined;
  let disposed = false;
  let lastTimeMs = 0;
  let lastSubmittedFrame: Promise<void> = Promise.resolve();
  let lastGpuError: string | undefined;
  let lastResizeDiagnostics: SceneResizeDiagnostics | undefined;
  let renderer: GpuRenderer | undefined;

  renderer = await createGpuRenderer({
    canvas,
    alpha: false,
    clearColor: [...gpuClearColor],
    frameIdFactory: ({ frame }) => `player-system-gpu-frame-${frame}`,
    onEncodeFrame(event) {
      scene.encodeFrame(event, renderer?.format as GPUTextureFormat);
    },
  });

  renderer.device.addEventListener("uncapturederror", (event) => {
    lastGpuError = event.error?.message ?? String(event.error);
  });
  renderer.device.lost.then((info) => {
    lastGpuError = `WebGPU device lost: ${info.reason}${info.message ? `: ${info.message}` : ""}`;
  }).catch((error: unknown) => {
    lastGpuError = error instanceof Error ? error.message : String(error);
  });

  function renderFrame(timeMs: number): void {
    if (disposed || !renderer) {
      return;
    }
    lastTimeMs = timeMs;
    scene.setFrame(timeMs, currentFocus);
    try {
      lastResizeDiagnostics = resizeCanvas(canvas, renderer, settings);
      const device = renderer.device;
      device.pushErrorScope("validation");
      device.pushErrorScope("out-of-memory");
      device.pushErrorScope("internal");
      renderer.renderOnce(timeMs);
      const scopedErrors = popFrameErrorScopes(device);
      lastSubmittedFrame = Promise.all([device.queue.onSubmittedWorkDone(), scopedErrors])
        .then(([, scopedError]) => {
          if (scopedError) {
            lastGpuError = scopedError;
          }
        })
        .catch(async (error: unknown) => {
          lastGpuError = error instanceof Error ? error.message : String(error);
          await scopedErrors.catch(() => undefined);
        });
    } catch (error: unknown) {
      void popFrameErrorScopes(renderer.device).catch(() => undefined);
      lastGpuError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  function animate(timeMs: number): void {
    renderFrame(timeMs);
    if (!disposed) {
      frameId = window.requestAnimationFrame(animate);
    }
  }

  const controller: SystemSceneController = {
    rendererMode: "webgpu",
    setFocus(moduleId) {
      currentFocus = moduleId;
      renderFrame(lastTimeMs);
    },
    setSurfaceState(surfaceState) {
      scene.setSurfaceState(surfaceState);
      renderFrame(lastTimeMs);
    },
    getDiagnostics() {
      return {
        ...scene.getDiagnostics(),
        ...lastResizeDiagnostics,
        gpuError: lastGpuError,
      };
    },
    getActions() {
      return scene.getActions();
    },
    pickAction(clientX, clientY) {
      return scene.pickAction(canvas, clientX, clientY);
    },
    renderFrame,
    async waitForFrame() {
      await lastSubmittedFrame;
    },
    getLookState: (timeMs = lastTimeMs) => resolvePlayerLook(timeMs),
    dispose() {
      disposed = true;
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", handleResize);
      scene.dispose();
      renderer?.destroy();
      renderer = undefined;
    },
  };

  function handleResize(): void {
    renderFrame(lastTimeMs);
  }

  window.addEventListener("resize", handleResize);
  if (options.manualFrame) {
    renderFrame(0);
  } else {
    frameId = window.requestAnimationFrame(animate);
  }
  return controller;
}

function replaceWithFallbackCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (canvas.getContext("2d")) {
    return canvas;
  }

  const fallback = document.createElement("canvas");
  fallback.id = canvas.id;
  fallback.className = canvas.className;
  fallback.setAttribute("aria-hidden", canvas.getAttribute("aria-hidden") ?? "true");
  canvas.replaceWith(fallback);
  return fallback;
}

function getRequiredCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("System scene requires WebGPU or a 2D canvas fallback.");
  }
  return context;
}

function mountCanvasFallback(
  initialCanvas: HTMLCanvasElement,
  options: SystemSceneOptions
): SystemSceneController {
  const settings = resolveSceneSettings(options);
  const canvas = replaceWithFallbackCanvas(initialCanvas);
  const context = getRequiredCanvasContext(canvas);

  const particles = createParticles(settings.qualityMode === "ultra" ? 260 : 160);
  const backgroundParticles = createBackgroundParticles(settings.qualityMode === "ultra" ? 180 : 80);
  let panelRasters: readonly SystemPanelRaster[] = [];
  let panelPlacements: Array<{
    readonly panel: SystemPanelRaster;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
    readonly shear: number;
  }> = [];
  let currentFocus: SystemDemoModuleId = "missions-quests";
  let frameId: number | undefined;
  let disposed = false;
  let lastTimeMs = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(
      window.devicePixelRatio * settings.renderScale,
      settings.qualityMode === "ultra" ? 3 : 2
    );
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  }

  function renderFrame(timeMs: number): void {
    if (disposed) {
      return;
    }
    lastTimeMs = timeMs;
    resize();
    const time = timeMs * 0.001;
    const look = resolvePlayerLook(timeMs);
    const movement = resolvePlayerCameraMotion(timeMs);
    const accent = focusColors[currentFocus];
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width * (0.5 - look.yaw * 0.045 - movement.position[0] * 0.018);
    const horizonY = height * (0.49 + look.pitch * 0.06 + movement.position[1] * 0.018);
    context.clearRect(0, 0, width, height);

    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#143a5c");
    sky.addColorStop(0.35, "#4f83a0");
    sky.addColorStop(0.68, "#95b6a2");
    sky.addColorStop(1, "#ddc27f");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    const parallaxX = look.yaw * -width * 0.13 + movement.position[0] * -width * 0.08;
    context.save();
    context.translate(parallaxX, 0);

    const sunX = width * 0.68 - parallaxX * 0.18;
    const sunY = height * 0.18 + look.pitch * height * 0.04;
    const sunGlow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, height * 0.22);
    sunGlow.addColorStop(0, "rgba(255, 211, 120, 0.96)");
    sunGlow.addColorStop(0.32, "rgba(255, 188, 82, 0.34)");
    sunGlow.addColorStop(1, "rgba(255, 188, 82, 0)");
    context.fillStyle = sunGlow;
    context.fillRect(0, 0, width, height * 0.52);

    for (let tile = -1; tile <= 1; tile += 1) {
      const tileX = tile * width * 1.08;
      context.fillStyle = "rgba(42, 92, 60, 0.82)";
      context.beginPath();
      context.moveTo(tileX - width * 0.2, horizonY + height * 0.02);
      context.lineTo(tileX + width * 0.16, horizonY - height * 0.16);
      context.lineTo(tileX + width * 0.46, horizonY + height * 0.02);
      context.lineTo(tileX + width * 0.72, horizonY - height * 0.13);
      context.lineTo(tileX + width * 1.2, horizonY + height * 0.02);
      context.lineTo(tileX + width * 1.2, horizonY + height * 0.18);
      context.lineTo(tileX - width * 0.2, horizonY + height * 0.18);
      context.closePath();
      context.fill();

      const groundGradient = context.createLinearGradient(0, horizonY + height * 0.02, 0, height);
      groundGradient.addColorStop(0, "rgba(43, 91, 48, 0.92)");
      groundGradient.addColorStop(0.58, "rgba(25, 78, 36, 0.98)");
      groundGradient.addColorStop(1, "rgba(14, 42, 21, 1)");
      context.fillStyle = groundGradient;
      context.beginPath();
      context.moveTo(tileX - width * 0.22, horizonY + height * 0.05);
      context.bezierCurveTo(
        tileX + width * 0.12,
        horizonY + height * 0.018,
        tileX + width * 0.72,
        horizonY + height * 0.12,
        tileX + width * 1.24,
        horizonY + height * 0.04
      );
      context.lineTo(tileX + width * 1.24, height * 1.05);
      context.lineTo(tileX - width * 0.22, height * 1.05);
      context.closePath();
      context.fill();

      context.strokeStyle = "rgba(142, 183, 94, 0.12)";
      context.lineWidth = 1;
      for (let band = 0; band < 4; band += 1) {
        const bandY = horizonY + height * (0.16 + band * 0.13);
        context.beginPath();
        context.moveTo(tileX - width * 0.16, bandY);
        context.bezierCurveTo(
          tileX + width * 0.18,
          bandY - height * 0.035,
          tileX + width * 0.62,
          bandY + height * 0.04,
          tileX + width * 1.12,
          bandY - height * 0.02
        );
        context.stroke();
      }

      for (let treeRow = 0; treeRow < 4; treeRow += 1) {
        const treeCount = 42 + treeRow * 18;
        for (let index = 0; index < treeCount; index += 1) {
          const seed = index + treeRow * 211;
          const treeX =
            tileX -
            width * (0.28 + treeRow * 0.07) +
            index * (width * (1.7 + treeRow * 0.3) / treeCount) +
            pseudoRandom(seed + 81) * width * 0.018;
          const treeBase =
            horizonY +
            height * (-0.018 + treeRow * 0.029 + pseudoRandom(seed + 23) * 0.055);
          const treeHeight =
            height * (0.036 + Math.max(0, 3 - treeRow) * 0.023 + pseudoRandom(seed + 41) * 0.074);
          context.fillStyle = `rgba(45, 30, 18, ${0.42 + Math.max(0, 3 - treeRow) * 0.1})`;
          context.fillRect(treeX - 1.5, treeBase - treeHeight * 0.36, 3, treeHeight * 0.36);
          context.fillStyle = `rgba(${12 + pseudoRandom(seed + 8) * 18}, ${50 + pseudoRandom(seed + 17) * 45}, ${27 + pseudoRandom(seed + 27) * 25}, ${0.6 + Math.max(0, 3 - treeRow) * 0.09})`;
          context.beginPath();
          context.ellipse(
            treeX,
            treeBase - treeHeight * 0.54,
            treeHeight * 0.19,
            treeHeight * 0.29,
            0,
            0,
            Math.PI * 2
          );
          context.fill();
        }
      }
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.55;
    const beam = context.createRadialGradient(centerX, horizonY, 20, centerX, horizonY, height * 0.5);
    beam.addColorStop(
      0,
      `rgba(${Math.round(accent[0] * 255)}, ${Math.round(accent[1] * 255)}, ${Math.round(accent[2] * 255)}, 0.26)`
    );
    beam.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = beam;
    context.fillRect(0, 0, width, height);
    context.restore();

    context.save();
    context.globalCompositeOperation = "screen";
    for (const particle of backgroundParticles) {
      const shimmer = 0.44 + Math.sin(time * (1.1 + particle.speed) + particle.phase) * 0.3;
      const x =
        centerX +
        parallaxX * 0.3 +
        particle.position[0] * width * 0.032 +
        Math.sin(time * particle.speed + particle.phase) * 6;
      const y =
        horizonY -
        height * 0.28 +
        particle.position[1] * height * 0.07 +
        Math.cos(time * 0.43 + particle.phase) * 4;
      const length = Math.max(2, particle.scale * width * 0.016 * (0.6 + shimmer));
      const alpha = Math.min(0.2, (0.05 + shimmer * 0.06) * settings.lightingBoost);
      context.strokeStyle =
        particle.tone > 0.78
          ? `rgba(${Math.round(accent[0] * 255)}, ${Math.round(accent[1] * 255)}, ${Math.round(accent[2] * 255)}, ${alpha})`
          : `rgba(219, 229, 122, ${alpha * 0.75})`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + look.yaw * 4, y + length);
      context.stroke();
    }
    context.restore();

    context.save();
    context.translate(parallaxX * 0.15, 0);
    context.lineWidth = Math.max(1, width * 0.0012);
    const meadowCount = settings.qualityMode === "ultra" ? 260 : 148;
    const flowerPalette = [
      [242, 219, 112],
      [237, 244, 199],
      [224, 122, 116],
      [183, 210, 120],
    ] as const;
    for (let index = 0; index < meadowCount; index += 1) {
      const depth = pseudoRandom(index + 1201);
      const flowerX =
        centerX + (pseudoRandom(index + 1301) - 0.5) * width * (0.86 - depth * 0.14);
      const baseY = horizonY + height * (0.18 + depth * 0.46);
      const stemHeight =
        height * (0.025 + pseudoRandom(index + 1401) * 0.034) * (0.75 + depth * 0.8);
      const sway = Math.sin(time * 0.85 + index * 0.7) * width * (0.002 + depth * 0.002);
      const stemAlpha = Math.min(0.72, 0.24 + depth * 0.46);
      const green = Math.round(118 + pseudoRandom(index + 1501) * 58);
      context.strokeStyle = `rgba(70, ${green}, 43, ${stemAlpha})`;
      context.beginPath();
      context.moveTo(flowerX, baseY);
      context.lineTo(flowerX + sway, baseY - stemHeight);
      context.stroke();

      if (index % 3 !== 1) {
        const tipX = flowerX + sway;
        const tipY = baseY - stemHeight;
        const petalRadius = Math.max(1.4, width * (0.0014 + depth * 0.0011));
        const color = flowerPalette[index % flowerPalette.length]!;
        context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.48 + depth * 0.28})`;
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = (petal / 5) * Math.PI * 2 + time * 0.08;
          context.beginPath();
          context.arc(
            tipX + Math.cos(angle) * petalRadius * 1.2,
            tipY + Math.sin(angle) * petalRadius * 0.85,
            petalRadius,
            0,
            Math.PI * 2
          );
          context.fill();
        }
        context.fillStyle = `rgba(92, 78, 38, ${0.42 + depth * 0.18})`;
        context.beginPath();
        context.arc(tipX, tipY, petalRadius * 0.55, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();

    if (panelRasters.length > 0) {
      context.save();
      panelPlacements = [];
      const screenFocus = look.screenFocus;
      const clusterY = horizonY + height * (0.15 - screenFocus * 0.08);
      const panelHeight = height * (0.36 + screenFocus * 0.03);
      const screenWidth = panelHeight * (980 / 760);
      const sideHeight = panelHeight;
      const navWidth = sideHeight * (420 / 760);
      const contextWidth = sideHeight * (470 / 760);
      const gap = width * 0.012;
      for (const panel of panelRasters) {
        const isNav = panel.kind === "nav";
        const isContext = panel.kind === "context";
        const drawWidth = isNav ? navWidth : isContext ? contextWidth : screenWidth;
        const drawHeight = isNav || isContext ? sideHeight : panelHeight;
        const offsetX = isNav
          ? -(screenWidth / 2 + gap + navWidth / 2)
          : isContext
            ? screenWidth / 2 + gap + contextWidth / 2
            : 0;
        const shear = isNav ? -0.08 : isContext ? 0.08 : 0;
        panelPlacements.push({
          panel,
          centerX: centerX + offsetX,
          centerY: clusterY,
          width: drawWidth,
          height: drawHeight,
          shear,
        });
        context.save();
        context.translate(centerX + offsetX, clusterY);
        context.transform(1, 0, shear, 1, 0, 0);
        context.globalAlpha = 0.96;
        context.drawImage(panel.canvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        context.restore();
      }
      context.restore();
    }

    context.save();
    context.globalCompositeOperation = "screen";
    for (const [index, particle] of particles.entries()) {
      const x = centerX + particle[0] * width * 0.026 + Math.sin(time + index) * 4;
      const y = horizonY + height * 0.1 - particle[1] * height * 0.044;
      context.fillStyle = `rgba(222, 229, 124, ${settings.qualityMode === "ultra" ? 0.42 : 0.34})`;
      context.fillRect(x, y, 1.8, 7);
    }
    context.restore();

  }

  function animate(timeMs: number): void {
    renderFrame(timeMs);
    if (!disposed) {
      frameId = window.requestAnimationFrame(animate);
    }
  }

  function handleResize(): void {
    renderFrame(lastTimeMs);
  }

  window.addEventListener("resize", handleResize);
  if (options.manualFrame) {
    renderFrame(0);
  } else {
    frameId = window.requestAnimationFrame(animate);
  }

  return {
    rendererMode: "canvas",
    setFocus(moduleId) {
      currentFocus = moduleId;
      renderFrame(lastTimeMs);
    },
    setSurfaceState(surfaceState) {
      panelRasters = rasterizeSystemPanels(surfaceState);
      renderFrame(lastTimeMs);
    },
    getDiagnostics() {
      return {
        panelRasterCount: panelRasters.length,
      traceTriangleCount: 0,
      traceNodeCount: 0,
      raySampleCount: settings.raySamples ?? 0,
      rayDebugMode: settings.rayDebugMode,
      gpuError: undefined,
      shaderDiagnostics: [],
    };
    },
    getActions() {
      return panelRasters.flatMap((panel) => panel.actions);
    },
    pickAction(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
      const y = (clientY - rect.top) * (canvas.height / Math.max(1, rect.height));

      for (const placement of panelPlacements) {
        const localY = y - placement.centerY;
        const localX = x - placement.centerX - placement.shear * localY;
        if (
          localX < -placement.width / 2 ||
          localX > placement.width / 2 ||
          localY < -placement.height / 2 ||
          localY > placement.height / 2
        ) {
          continue;
        }

        const u = (localX + placement.width / 2) / placement.width;
        const v = (localY + placement.height / 2) / placement.height;
        const action = findActionAtPanelUv(placement.panel, u, v);
        if (action) {
          return action;
        }
      }

      return undefined;
    },
    renderFrame,
    waitForFrame: () => Promise.resolve(),
    getLookState: (timeMs = lastTimeMs) => resolvePlayerLook(timeMs),
    dispose() {
      disposed = true;
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", handleResize);
    },
  };
}

export async function mountSystemScene(
  canvas: HTMLCanvasElement,
  options: SystemSceneOptions = {}
): Promise<SystemSceneController> {
  const allowCanvasFallback = options.allowCanvasFallback !== false;
  if (!supportsWebGpu()) {
    if (!allowCanvasFallback) {
      throw new Error("WebGPU runtime unavailable; capture requires the real WebGPU renderer.");
    }
    return mountCanvasFallback(canvas, options);
  }

  try {
    return await mountWebGpuSystemScene(canvas, options);
  } catch (error) {
    if (!allowCanvasFallback) {
      throw error;
    }
    return mountCanvasFallback(canvas, options);
  }
}
