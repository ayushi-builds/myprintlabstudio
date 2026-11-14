import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const $ = (id) => document.getElementById(id);
const ids = ["length", "width", "height", "wall", "base", "radius", "columns", "rows", "divider", "engravingSize", "engravingDepth"];
const defaults = { length: 120, width: 80, height: 15, wall: 2.5, base: 3, radius: 6, columns: 3, rows: 2, divider: 2, engravingSize: 5, engravingDepth: 0.6 };

const viewport = $("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101a2b);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
camera.up.set(0, 1, 0);
camera.position.set(150, 125, 165);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdceaff, 0x39445a, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 3);
key.position.set(100, 150, 100);
key.castShadow = false;
scene.add(key);
const fill = new THREE.DirectionalLight(0x8db4ff, 1.1);
fill.position.set(-100, 60, -80); scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.rotateSpeed = 0.8;
controls.panSpeed = 0.8;
controls.zoomSpeed = 1.0;
// Left-drag = orbit, right-drag = pan, wheel = zoom.
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN
};
controls.target.set(0, 7.5, 0);

const grid = new THREE.GridHelper(320, 32, 0x40516b, 0x26364d);
grid.position.y = 0;
scene.add(grid);

const modelGroup = new THREE.Group();
// CadQuery's Z-up geometry is rotated into Three.js Y-up world coordinates.
modelGroup.rotation.x = -Math.PI / 2;
scene.add(modelGroup);
let generatedMesh = null;
let debounceTimer;

let engravingPosition = {
  x: 0,
  y: 0
};

let brandPreviewMesh = null;
let isDraggingBrand = false;
function removeGeneratedMesh() {
  if (!generatedMesh) return;

  scene.remove(generatedMesh);
  generatedMesh.geometry.dispose();

  if (Array.isArray(generatedMesh.material)) {
    generatedMesh.material.forEach(material => material.dispose());
  } else {
    generatedMesh.material.dispose();
  }

  generatedMesh = null;
}

function params() {
  const p = {};
  ids.forEach(id => p[id] = Number($(id).value));
  p.brand_text = $("brandText").value.trim();
  p.engraving_x = engravingPosition.x;
  p.engraving_y = engravingPosition.y;
  return p;
}
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2, rr = Math.max(0, Math.min(r, w / 2, h / 2));
  s.moveTo(x + rr, y); s.lineTo(x + w - rr, y); s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr); s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}
function addBox(parent, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}

function addBrandPreview(p) {
  const brandText = $("brandText").value.trim();

  brandPreviewMesh = null;

  if (!brandText) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const fontSize = 160;
  ctx.font = `${fontSize}px Arial`;

  const metrics = ctx.measureText(brandText);

  canvas.width = Math.max(512, Math.ceil(metrics.width + 100));
  canvas.height = 256;

  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#805b48";
  ctx.fillText(brandText, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const physicalWidth = (canvas.width / fontSize) * p.engravingSize;
  const physicalHeight = (canvas.height / fontSize) * p.engravingSize;

  const geometry = new THREE.PlaneGeometry(
    physicalWidth,
    physicalHeight
  );

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1
  });

  brandPreviewMesh = new THREE.Mesh(geometry, material);

  brandPreviewMesh.position.set(
    engravingPosition.x,
    engravingPosition.y,
    p.base + 0.025
  );

  modelGroup.add(brandPreviewMesh);
}

function renderPreview() {
  modelGroup.visible = true;
  const p = params();
  ids.filter(id => $(id).type === "range").forEach(id => $(id + "Out").textContent = p[id]);
  $("engravingSizeOut").textContent = p.engravingSize;
  $("engravingDepthOut").textContent = p.engravingDepth;
  $("summary").textContent = `${p.length} × ${p.width} × ${p.height} mm`;
  $("compartmentCount").textContent = p.rows * p.columns;

  modelGroup.clear();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd69a70, roughness: .58, metalness: .04 });
  const innerL = p.length - 2 * p.wall, innerW = p.width - 2 * p.wall;
  const outerShape = roundedRectShape(p.length, p.width, p.radius);
  const hole = roundedRectShape(innerL, innerW, Math.max(.1, p.radius - p.wall));
  outerShape.holes.push(hole);
  const wallGeo = new THREE.ExtrudeGeometry(outerShape, { depth: p.height - p.base, bevelEnabled: false, curveSegments: 8 });
  const wallMesh = new THREE.Mesh(wallGeo, mat);
  wallMesh.position.z = p.base; wallMesh.castShadow = true; wallMesh.receiveShadow = true;
  modelGroup.add(wallMesh);

  const baseShape = roundedRectShape(p.length, p.width, p.radius);
  const baseMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(baseShape, { depth: p.base, bevelEnabled: false, curveSegments: 8 }), mat);
  baseMesh.castShadow = true; baseMesh.receiveShadow = true; modelGroup.add(baseMesh);

  const divMat = mat;
  if (p.columns > 1) for (let i = 1; i < p.columns; i++) {
    const x = -innerL / 2 + i * innerL / p.columns;
    addBox(modelGroup, p.divider, innerW, p.height - p.base, x, 0, p.base + (p.height - p.base) / 2, divMat);
  }
  if (p.rows > 1) for (let i = 1; i < p.rows; i++) {
    const y = -innerW / 2 + i * innerW / p.rows;
    addBox(modelGroup, innerL, p.divider, p.height - p.base, 0, y, p.base + (p.height - p.base) / 2, divMat);
  }
  // Display brand engraving in the live preview.
  addBrandPreview(p);
  // Keep the preview centred on the object.
  controls.target.set(0, p.height / 2, 0);
  controls.update();
  $("loading").style.display = "none";
  removeGeneratedMesh();
}
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
}
window.addEventListener("resize", resize); resize();
// Frame the initial model immediately; no page scrolling is needed.
camera.position.set(150, 125, 165);
controls.target.set(0, 7.5, 0);
controls.update();

function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();

// ===== DRAG BRAND ENGRAVING =====

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const dragPlane = new THREE.Plane(
  new THREE.Vector3(0, 1, 0),
  0
);

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!brandPreviewMesh || !$("brandText").value.trim()) return;

  updatePointer(event);

  scene.updateMatrixWorld(true);

  const hits = raycaster.intersectObject(brandPreviewMesh);

  if (hits.length > 0) {
    isDraggingBrand = true;
    controls.enabled = false;

    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = "grabbing";
  }
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!isDraggingBrand) {
    if (brandPreviewMesh) {
      updatePointer(event);

      const hits = raycaster.intersectObject(brandPreviewMesh);
      renderer.domElement.style.cursor =
        hits.length > 0 ? "grab" : "default";
    }
    return;
  }

  updatePointer(event);

  const p = params();

  // Horizontal world plane at the tray's inside floor.
  dragPlane.constant = -(p.base + 0.025);

  const intersection = new THREE.Vector3();

  if (!raycaster.ray.intersectPlane(dragPlane, intersection)) return;

  // Convert world coordinates back into tray coordinates.
  modelGroup.updateWorldMatrix(true, false);
  modelGroup.worldToLocal(intersection);

  // Keep text inside the tray walls.
  const halfTextWidth = brandPreviewMesh.geometry.parameters.width / 2;
  const halfTextHeight = brandPreviewMesh.geometry.parameters.height / 2;

  const maxX = Math.max(
    0,
    p.length / 2 - p.wall - halfTextWidth
  );

  const maxY = Math.max(
    0,
    p.width / 2 - p.wall - halfTextHeight
  );

  engravingPosition.x = THREE.MathUtils.clamp(
    intersection.x,
    -maxX,
    maxX
  );

  engravingPosition.y = THREE.MathUtils.clamp(
    intersection.y,
    -maxY,
    maxY
  );

  brandPreviewMesh.position.x = engravingPosition.x;
  brandPreviewMesh.position.y = engravingPosition.y;
});

function stopBrandDragging(event) {
  if (!isDraggingBrand) return;

  isDraggingBrand = false;
  controls.enabled = true;
  renderer.domElement.style.cursor = "grab";

  $("message").textContent =
    "Brand position updated. Generate STL to export.";
}

renderer.domElement.addEventListener("pointerup", stopBrandDragging);
renderer.domElement.addEventListener("pointercancel", stopBrandDragging);

ids.forEach(id => $(id).addEventListener("input", () => {
  renderPreview();
  $("message").textContent = "Preview updated. Generate STL to create the printable file.";
}));
$("brandText").addEventListener("input", () => {
  renderPreview();

  $("message").textContent =
    "Brand engraving preview updated. Generate STL to export.";
});
$("reset").addEventListener("click", () => {
  ids.forEach(id => $(id).value = defaults[id]);
  $("brandText").value = "";
  engravingPosition = { x: 0, y: 0 };
  renderPreview();
  $("download").classList.add("disabled");
  $("message").textContent = "Defaults restored.";
});

async function generate() {
  const button = $("generate");
  button.disabled = true; $("generateTop").disabled = true;
  $("message").textContent = "Generating STL with CadQuery…";
  try {
    const response = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params())
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Generation failed");
    const url = result.download + "?t=" + Date.now();
    const geometry = await new STLLoader().loadAsync(url);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0x8ed9c2, roughness: .55, metalness: .02 });
    removeGeneratedMesh();
    generatedMesh = new THREE.Mesh(geometry, material);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const center = bounds.getCenter(new THREE.Vector3());
    // Centre X/Y and place the CAD bottom (Z-min) on the world ground plane.
    geometry.translate(-center.x, -center.y, -bounds.min.z);
    generatedMesh.rotation.x = -Math.PI / 2;
    scene.add(generatedMesh);
    modelGroup.visible = false;
    controls.target.set(0, params().height / 2, 0);
    controls.update();
    $("download").href = result.download;
    $("download").classList.remove("disabled");
    $("message").textContent = "STL generated successfully. The preview now shows the exported mesh.";
  } catch (error) {
    $("message").textContent = "Could not generate STL: " + error.message;
  } finally {
    button.disabled = false; $("generateTop").disabled = false;
  }
}
$("generate").addEventListener("click", generate);
$("generateTop").addEventListener("click", generate);
renderPreview();
