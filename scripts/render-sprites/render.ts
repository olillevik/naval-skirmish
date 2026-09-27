import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  type Object3D,
  OrthographicCamera,
  Scene,
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

declare global {
  interface Window {
    renderSheet: typeof renderSheet;
  }
}
window.renderSheet = renderSheet;
