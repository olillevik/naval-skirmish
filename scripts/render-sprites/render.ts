import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  type Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** What run.ts asks for: one sprite sheet of one model. */
export interface SheetSpec {
  model: string;
  /** Screen pixels per model unit, so each vessel comes out the size the game wants. */
  pixelsPerUnit: number;
  /** Multiplies the colour of every node whose name starts with "sail". */
  sailColour?: number;
}

export interface Sheet {
  png: string;
  frameWidth: number;
  frameHeight: number;
}

/** Must match FRAMES in src/view/directionalSprite.ts. */
const FRAMES = 64;
const COLUMNS = 8;
/** How far above the horizon the camera looks down. 90° would be straight down, like the old pack. */
const CAMERA_TILT = (60 * Math.PI) / 180;
/** The kit's models point their bow along +Z. This turns frame 0's bow to the top of the screen. */
const MODEL_YAW = Math.PI;

const loader = new GLTFLoader();

async function renderSheet({ model, pixelsPerUnit, sailColour }: SheetSpec): Promise<Sheet> {
  const vessel = (await loader.loadAsync(`/art/pirate-kit/${model}.glb`)).scene;
  if (sailColour !== undefined) tintSails(vessel, new Color(sailColour));

  const scene = new Scene();
  scene.add(vessel);
  scene.add(new AmbientLight(0xffffff, 0.9));
  // The sun stays put while the vessel turns, from the top left of the screen.
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.position.set(-1, 2, -0.5);
  scene.add(sun);

  const camera = new OrthographicCamera();
  camera.position.set(0, Math.sin(CAMERA_TILT), Math.cos(CAMERA_TILT)).multiplyScalar(100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // Every frame shares one size, and the vessel's waterline centre sits in the middle of it, so the sprite's
  // default origin is the vessel's position in the game.
  const { halfWidth, halfHeight } = projectedExtent(vessel, camera);
  const frameWidth = Math.ceil(halfWidth * pixelsPerUnit) * 2;
  const frameHeight = Math.ceil(halfHeight * pixelsPerUnit) * 2;
  camera.left = -frameWidth / 2 / pixelsPerUnit;
  camera.right = frameWidth / 2 / pixelsPerUnit;
  camera.top = frameHeight / 2 / pixelsPerUnit;
  camera.bottom = -frameHeight / 2 / pixelsPerUnit;
  camera.updateProjectionMatrix();

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(frameWidth, frameHeight);
  renderer.setClearColor(0x000000, 0);
  const sheet = document.createElement('canvas');
  sheet.width = frameWidth * COLUMNS;
  sheet.height = frameHeight * Math.ceil(FRAMES / COLUMNS);
  const context = sheet.getContext('2d')!;
  for (let i = 0; i < FRAMES; i++) {
    vessel.rotation.y = headingYaw(i);
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, (i % COLUMNS) * frameWidth, Math.floor(i / COLUMNS) * frameHeight);
  }
  renderer.dispose();
  return { png: sheet.toDataURL('image/png'), frameWidth, frameHeight };
}

/** Frame i points the bow i/FRAMES of a turn clockwise from the top of the screen, as the game's headings do. */
function headingYaw(frame: number): number {
  return MODEL_YAW - (frame / FRAMES) * Math.PI * 2;
}

/** The largest distance from the frame's centre that any vertex reaches, over all the frames. */
function projectedExtent(vessel: Object3D, camera: OrthographicCamera): { halfWidth: number; halfHeight: number } {
  let halfWidth = 0;
  let halfHeight = 0;
  const point = new Vector3();
  for (let i = 0; i < FRAMES; i++) {
    vessel.rotation.y = headingYaw(i);
    vessel.updateMatrixWorld(true);
    vessel.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      for (let v = 0; v < positions.count; v++) {
        point.fromBufferAttribute(positions, v).applyMatrix4(node.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        halfWidth = Math.max(halfWidth, Math.abs(point.x));
        halfHeight = Math.max(halfHeight, Math.abs(point.y));
      }
    });
  }
  return { halfWidth, halfHeight };
}

/** The sails share the kit's one material with the hull, so each sail gets a tinted copy of its own. */
function tintSails(vessel: Object3D, colour: Color): void {
  vessel.traverse((node) => {
    if (!node.name.startsWith('sail')) return;
    node.traverse((part) => {
      if (!(part instanceof Mesh)) return;
      part.material = part.material.clone();
      part.material.color.multiply(colour);
    });
  });
}

/** The water tile's side in pixels. Big enough that the repeat is hard to spot on a screen. */
const WATER_SIZE = 1024;
/** The toon water's two tones, close together so the vessels stand out, and the pale crests between them. */
const WATER_DEEP = new Color(0x3d9dd1);
const WATER_SHALLOW = new Color(0x4aa9db);
const WATER_CREST = new Color(0x9edbf2);
/** How much of the crest colour shows. */
const WATER_CREST_STRENGTH = 0.6;
/**
 * Waves as whole numbers of cycles across the tile, so the tile repeats with no seam. Each is
 * [cycles across, cycles down, amplitude, phase].
 */
const WATER_WAVES = [
  [3, 5, 1, 0.3],
  [6, -2, 0.8, 1.9],
  [-4, 7, 0.7, 4.1],
  [8, 5, 0.45, 2.6],
  [-9, 4, 0.4, 5.2],
  [5, -11, 0.3, 0.9],
  [13, 8, 0.2, 3.3],
  [-14, -7, 0.18, 1.4],
  [2, 15, 0.15, 2.2],
];
/** Where the patches change tone, in wave height, and how wide the crest along that edge is, in pixels. */
const WATER_EDGE = 0.1;
const WATER_CREST_PIXELS = 2.5;

/**
 * A seamless water tile in the kit's flat, soft style: two tones of blue in rounded patches, with a pale
 * crest along the edge of each lighter patch.
 */
function renderWater(): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = WATER_SIZE;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(WATER_SIZE, WATER_SIZE);
  const total = WATER_WAVES.reduce((sum, [, , amplitude]) => sum + amplitude, 0);
  const colour = new Color();
  const rgb = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < WATER_SIZE; y++) {
    for (let x = 0; x < WATER_SIZE; x++) {
      let height = 0;
      let slopeX = 0;
      let slopeY = 0;
      for (const [across, down, amplitude, phase] of WATER_WAVES) {
        const angle = ((across * x + down * y) / WATER_SIZE) * Math.PI * 2 + phase;
        height += amplitude * Math.sin(angle);
        const slope = (amplitude * Math.cos(angle) * Math.PI * 2) / WATER_SIZE;
        slopeX += slope * across;
        slopeY += slope * down;
      }
      // Height over slope is roughly the distance in pixels to the edge, so every edge is equally sharp.
      const pixels = (height / total - WATER_EDGE) / (Math.hypot(slopeX, slopeY) / total);
      colour.lerpColors(WATER_DEEP, WATER_SHALLOW, smoothstep(-0.75, 0.75, pixels));
      const crest = 1 - smoothstep(WATER_CREST_PIXELS - 1, WATER_CREST_PIXELS, Math.abs(pixels - WATER_CREST_PIXELS));
      colour.lerp(WATER_CREST, crest * WATER_CREST_STRENGTH);
      // Color works in linear light, and the canvas wants sRGB.
      const { r, g, b } = colour.getRGB(rgb, SRGBColorSpace);
      image.data.set([r * 255, g * 255, b * 255, 255], (y * WATER_SIZE + x) * 4);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

declare global {
  interface Window {
    renderSheet: typeof renderSheet;
    renderWater: typeof renderWater;
  }
}
window.renderSheet = renderSheet;
window.renderWater = renderWater;
