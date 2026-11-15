import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

const $ = (id) => document.getElementById(id);

const ids = [
  "length", "width", "height", "wall", "base", "radius",
  "columns", "rows", "divider", "engravingSize",
  "engravingDepth", "engravingRotation", "diameter"
];

const defaults = {
  length: 120,
  width: 80,
  height: 15,
  wall: 2.5,
  base: 3,
  radius: 6,
  columns: 3,
  rows: 2,
  divider: 2,
  engravingSize: 5,
  engravingDepth: 0.6,
  engravingRotation: 0,
  diameter: 120
};

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
fill.position.set(-100, 60, -80);
scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.rotateSpeed = 0.8;
controls.panSpeed = 0.8;
controls.zoomSpeed = 1.0;

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
modelGroup.rotation.x = -Math.PI / 2;
scene.add(modelGroup);

let generatedMesh = null;
let brandPreviewMesh = null;
let isDraggingBrand = false;
let logoSvgText = "";
let logoPreviewGroup = null;

let engravingPosition = {
  x: 0,
  y: 0
};

// --------------------------------------------------
// CLEANUP
// --------------------------------------------------

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

function clearModelGroup() {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  modelGroup.traverse((object) => {
    if (object.geometry) {
      geometries.add(object.geometry);
    }

    if (object.material) {
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      objectMaterials.forEach((material) => {
        materials.add(material);

        if (material.map) {
          textures.add(material.map);
        }
      });
    }
  });

  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());

  modelGroup.clear();
  brandPreviewMesh = null;
  logoPreviewGroup = null;
}

// --------------------------------------------------
// PARAMETERS
// --------------------------------------------------

function params() {
  const p = {};

  ids.forEach(id => {
    p[id] = Number($(id).value);
  });

  p.trayShape = $("trayShape").value;
  p.diameter = Number($("diameter").value);
  p.brand_text = $("brandText").value.trim();
  p.engraving_x = engravingPosition.x;
  p.engraving_y = engravingPosition.y;
  p.logo_svg = logoSvgText;
  p.logo_width = Number($("logoWidth").value);
  p.logo_x = Number($("logoX").value);
  p.logo_y = Number($("logoY").value);
  p.logo_rotation = Number($("logoRotation").value);
  p.logo_depth = Number($("logoDepth").value);

  return p;
}

// --------------------------------------------------
// GEOMETRY HELPERS
// --------------------------------------------------

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();

  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));

  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);

  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);

  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);

  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);

  return s;
}

function addBox(parent, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  parent.add(mesh);

  return mesh;
}

// Shared dimensions for bubble preview and engraving positioning.
function getBubbleDimensions(p) {
  const outerRadius = p.diameter / 2;

  const beadRadius = Math.min(
    6,
    Math.max(1.5, (p.height - p.base) / 1.85)
  );

  // Sphere centres sit just inside the outer edge.
  const beadRingRadius = outerRadius - beadRadius;

  // The flat base meets and slightly overlaps the bubbles.
  const baseRadius = outerRadius - beadRadius * 1.4;

  return {
    outerRadius,
    beadRadius,
    beadRingRadius,
    baseRadius
  };
}

// --------------------------------------------------
// BRAND ENGRAVING PREVIEW
// --------------------------------------------------

function addBrandPreview(p) {
  const brandText = $("brandText").value.trim();

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

  ctx.fillText(
    brandText,
    canvas.width / 2,
    canvas.height / 2
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const physicalWidth =
    (canvas.width / fontSize) * p.engravingSize;

  const physicalHeight =
    (canvas.height / fontSize) * p.engravingSize;

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

  brandPreviewMesh.rotation.z = THREE.MathUtils.degToRad(
    p.engravingRotation
  );

  modelGroup.add(brandPreviewMesh);
}
// --------------------------------------------------
// LOGO ENGRAVING PREVIEW
// --------------------------------------------------

function addLogoPreview(p) {
  if (!logoSvgText) return;

  try {
    const loader = new SVGLoader();
    const svgData = loader.parse(logoSvgText);

    logoPreviewGroup = new THREE.Group();

    const logoMaterial = new THREE.MeshBasicMaterial({
      color: 0x805b48,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });

    svgData.paths.forEach(path => {
      const shapes = SVGLoader.createShapes(path);

      shapes.forEach(shape => {
        const geometry = new THREE.ShapeGeometry(shape);

        const mesh = new THREE.Mesh(
          geometry,
          logoMaterial
        );

        logoPreviewGroup.add(mesh);
      });
    });

    if (logoPreviewGroup.children.length === 0) {
      throw new Error("No filled vector paths found in this SVG.");
    }

    // Calculate original logo dimensions.
    logoPreviewGroup.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(
      logoPreviewGroup
    );

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    if (size.x <= 0 || size.y <= 0) {
      throw new Error("The SVG has invalid dimensions.");
    }

    // Center all logo geometry around its origin.
    logoPreviewGroup.children.forEach(mesh => {
      mesh.geometry.translate(
        -center.x,
        -center.y,
        0
      );
    });

    // Preserve the SVG's original proportions.
    const targetWidth = Number($("logoWidth").value);
    const scale = targetWidth / size.x;

    logoPreviewGroup.scale.set(
      scale,
      -scale,
      scale
    );

    logoPreviewGroup.position.set(
      Number($("logoX").value),
      Number($("logoY").value),
      p.base + 0.04
    );

    logoPreviewGroup.rotation.z =
      THREE.MathUtils.degToRad(
        Number($("logoRotation").value)
      );

    modelGroup.add(logoPreviewGroup);

  } catch (error) {
    console.error("Logo preview error:", error);

    $("logoStatus").textContent =
      "Could not display SVG: " + error.message;
  }
}
// --------------------------------------------------
// MAIN PREVIEW
// --------------------------------------------------

function renderPreview() {
  removeGeneratedMesh();
  modelGroup.visible = true;

  const p = params();

  ids
    .filter(id => $(id).type === "range")
    .forEach(id => {
      const output = $(id + "Out");
      if (output) output.textContent = p[id];
    });

  $("engravingSizeOut").textContent = p.engravingSize;
  $("engravingDepthOut").textContent = p.engravingDepth;

  [
    "logoWidth",
    "logoX",
    "logoY",
    "logoRotation",
    "logoDepth"
  ].forEach(id => {
    $(id + "Out").textContent = $(id).value;
  });

  if (p.trayShape === "rectangle") {
    $("summary").textContent =
      `${p.length} × ${p.width} × ${p.height} mm`;

    $("compartmentCount").textContent =
      p.rows * p.columns;
  } else {
    $("summary").textContent =
      `${p.diameter} Ø × ${p.height} mm`;

    $("compartmentCount").textContent = "Open dish";
  }

  clearModelGroup();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xd69a70,
    roughness: 0.58,
    metalness: 0.04
  });

  // ================================================
  // RECTANGLE
  // Existing geometry preserved
  // ================================================

  if (p.trayShape === "rectangle") {
    const innerL = p.length - 2 * p.wall;
    const innerW = p.width - 2 * p.wall;

    const outerShape = roundedRectShape(
      p.length,
      p.width,
      p.radius
    );

    const hole = roundedRectShape(
      innerL,
      innerW,
      Math.max(0.1, p.radius - p.wall)
    );

    outerShape.holes.push(hole);

    const wallGeo = new THREE.ExtrudeGeometry(outerShape, {
      depth: p.height - p.base,
      bevelEnabled: false,
      curveSegments: 8
    });

    const wallMesh = new THREE.Mesh(wallGeo, mat);
    wallMesh.position.z = p.base;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    modelGroup.add(wallMesh);

    const baseShape = roundedRectShape(
      p.length,
      p.width,
      p.radius
    );

    const baseMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(baseShape, {
        depth: p.base,
        bevelEnabled: false,
        curveSegments: 8
      }),
      mat
    );

    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;

    modelGroup.add(baseMesh);

    // Column dividers
    if (p.columns > 1) {
      for (let i = 1; i < p.columns; i++) {
        const x = -innerL / 2 + i * innerL / p.columns;

        addBox(
          modelGroup,
          p.divider,
          innerW,
          p.height - p.base,
          x,
          0,
          p.base + (p.height - p.base) / 2,
          mat
        );
      }
    }

    // Row dividers
    if (p.rows > 1) {
      for (let i = 1; i < p.rows; i++) {
        const y = -innerW / 2 + i * innerW / p.rows;

        addBox(
          modelGroup,
          innerL,
          p.divider,
          p.height - p.base,
          0,
          y,
          p.base + (p.height - p.base) / 2,
          mat
        );
      }
    }
  }

  // ================================================
  // CIRCLE
  // Flat circular base + continuous circular wall
  // ================================================

  else if (p.trayShape === "circle") {
    const outerRadius = p.diameter / 2;
    const innerRadius = outerRadius - p.wall;

    const outerShape = new THREE.Shape();
    outerShape.absarc(
      0, 0, outerRadius,
      0, Math.PI * 2, false
    );

    const hole = new THREE.Path();
    hole.absarc(
      0, 0, innerRadius,
      0, Math.PI * 2, true
    );

    outerShape.holes.push(hole);

    const wallGeo = new THREE.ExtrudeGeometry(outerShape, {
      depth: p.height - p.base,
      bevelEnabled: false,
      curveSegments: 64
    });

    const wallMesh = new THREE.Mesh(wallGeo, mat);
    wallMesh.position.z = p.base;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    modelGroup.add(wallMesh);

    const baseShape = new THREE.Shape();
    baseShape.absarc(
      0, 0, outerRadius,
      0, Math.PI * 2, false
    );

    const baseMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(baseShape, {
        depth: p.base,
        bevelEnabled: false,
        curveSegments: 64
      }),
      mat
    );

    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;

    modelGroup.add(baseMesh);
  }

  // ================================================
  // BUBBLE
  // Flat circular base + individual rounded bubbles
  // NO continuous wall
  // ================================================

  else if (p.trayShape === "bubble") {
    const {
      beadRadius,
      beadRingRadius,
      baseRadius
    } = getBubbleDimensions(p);

    // 1. Flat circular base.
    // Its edge slightly overlaps the bubble ring.
    const baseShape = new THREE.Shape();

    baseShape.absarc(
      0,
      0,
      baseRadius,
      0,
      Math.PI * 2,
      false
    );

    const baseMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(baseShape, {
        depth: p.base,
        bevelEnabled: false,
        curveSegments: 96
      }),
      mat
    );

    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;

    modelGroup.add(baseMesh);

    // 2. Rounded bubbles arranged around the perimeter.
    // Their overlap creates a connected scalloped border.
    const spacing = beadRadius * 1.75;

    const beadCount = Math.max(
      20,
      Math.round(
        (2 * Math.PI * beadRingRadius) / spacing
      )
    );

    const beadGeometry = new THREE.SphereGeometry(
      beadRadius,
      32,
      24
    );

    // The spheres slightly enter the base and rise above it.
    const beadCenterZ = p.base + beadRadius * 0.85;

    for (let i = 0; i < beadCount; i++) {
      const angle = (i / beadCount) * Math.PI * 2;

      const bead = new THREE.Mesh(beadGeometry, mat);

      bead.position.set(
        beadRingRadius * Math.cos(angle),
        beadRingRadius * Math.sin(angle),
        beadCenterZ
      );

      bead.castShadow = true;
      bead.receiveShadow = true;

      modelGroup.add(bead);
    }
  }

  // ================================================
  // BRAND ENGRAVING
  // ================================================

  addBrandPreview(p);
  addLogoPreview(p);

  controls.target.set(0, p.height / 2, 0);
  controls.update();

  const loading = $("loading");
  if (loading) loading.style.display = "none";
}

function updateShapeControls() {
  const shape = $("trayShape").value;
  $("diameterField").hidden = shape === "rectangle";
}
// --------------------------------------------------
// RESIZE
// Registered only once
// --------------------------------------------------

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
}

window.addEventListener("resize", resize);
resize();

// --------------------------------------------------
// CAMERA AND ANIMATION
// Registered only once
// --------------------------------------------------

camera.position.set(150, 125, 165);
controls.target.set(0, 7.5, 0);
controls.update();

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  renderer.render(scene, camera);
}

animate();

// --------------------------------------------------
// BRAND ENGRAVING DRAGGING
// Registered only once
// --------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const dragPlane = new THREE.Plane(
  new THREE.Vector3(0, 1, 0),
  0
);

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x =
    ((event.clientX - rect.left) / rect.width) * 2 - 1;

  pointer.y =
    -((event.clientY - rect.top) / rect.height) * 2 + 1;

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

  dragPlane.constant = -(p.base + 0.025);

  const intersection = new THREE.Vector3();

  if (!raycaster.ray.intersectPlane(dragPlane, intersection)) {
    return;
  }

  modelGroup.updateWorldMatrix(true, false);
  modelGroup.worldToLocal(intersection);

  const angle = THREE.MathUtils.degToRad(
    p.engravingRotation
  );

  const width = brandPreviewMesh.geometry.parameters.width;
  const height = brandPreviewMesh.geometry.parameters.height;

  const halfTextWidth =
    (
      Math.abs(Math.cos(angle)) * width +
      Math.abs(Math.sin(angle)) * height
    ) / 2;

  const halfTextHeight =
    (
      Math.abs(Math.sin(angle)) * width +
      Math.abs(Math.cos(angle)) * height
    ) / 2;

  let maxX;
  let maxY;

  if (p.trayShape === "rectangle") {
    maxX = Math.max(
      0,
      p.length / 2 - p.wall - halfTextWidth
    );

    maxY = Math.max(
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
  } else {
    let usableRadius;

    if (p.trayShape === "bubble") {
      usableRadius = getBubbleDimensions(p).baseRadius - 2;
    } else {
      usableRadius = p.diameter / 2 - p.wall;
    }

    const safeRadius = Math.max(
      0,
      usableRadius - Math.hypot(halfTextWidth, halfTextHeight)
    );

    const distance = Math.hypot(
      intersection.x,
      intersection.y
    );

    if (distance > safeRadius && distance > 0) {
      engravingPosition.x =
        (intersection.x / distance) * safeRadius;

      engravingPosition.y =
        (intersection.y / distance) * safeRadius;
    } else {
      engravingPosition.x = intersection.x;
      engravingPosition.y = intersection.y;
    }
  }

  brandPreviewMesh.position.x = engravingPosition.x;
  brandPreviewMesh.position.y = engravingPosition.y;
});

function stopBrandDragging() {
  if (!isDraggingBrand) return;

  isDraggingBrand = false;
  controls.enabled = true;
  renderer.domElement.style.cursor = "grab";

  $("message").textContent =
    "Brand position updated. Generate STL to export.";
}

renderer.domElement.addEventListener("pointerup", stopBrandDragging);
renderer.domElement.addEventListener("pointercancel", stopBrandDragging);

// --------------------------------------------------
// INPUT EVENT LISTENERS
// Registered only once
// --------------------------------------------------

ids.forEach(id => {
  $(id).addEventListener("input", () => {
    renderPreview();

    $("message").textContent =
      "Preview updated. Generate STL to create the printable file.";
  });
});

// $("trayShape").addEventListener("change", () => {
//   renderPreview();

//   $("message").textContent =
//     "Tray shape changed. Preview updated.";
// });
$("trayShape").addEventListener("change", () => {
  updateShapeControls();
  renderPreview();
});
$("brandText").addEventListener("input", () => {
  renderPreview();

  $("message").textContent =
    "Brand engraving preview updated. Generate STL to export.";
});

$("reset").addEventListener("click", () => {
  ids.forEach(id => {
    $(id).value = defaults[id];
  });

  $("trayShape").value = "rectangle";
  $("brandText").value = "";
  logoSvgText = "";

  $("logoFile").value = "";
  $("logoControls").hidden = true;

  $("logoStatus").textContent =
    "Upload a single-colour SVG logo.";

  $("logoWidth").value = 25;
  $("logoX").value = 0;
  $("logoY").value = 0;
  $("logoRotation").value = 0;
  $("logoDepth").value = 0.6;

  engravingPosition = { x: 0, y: 0 };

  renderPreview();

  $("download").classList.add("disabled");

  $("message").textContent = "Defaults restored.";
});

$("diameter").addEventListener("input", renderPreview);

// --------------------------------------------------
// LOGO UPLOAD AND CONTROLS
// --------------------------------------------------

const logoControlIds = [
  "logoWidth",
  "logoX",
  "logoY",
  "logoRotation",
  "logoDepth"
];

// Update preview when logo settings change.
logoControlIds.forEach(id => {
  $(id).addEventListener("input", () => {
    renderPreview();

    $("message").textContent =
      "Logo preview updated. Generate STL to export.";
  });
});

// Upload SVG.
$("logoFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    if (!file.name.toLowerCase().endsWith(".svg")) {
      throw new Error("Please upload an SVG file.");
    }

    if (file.size > 1024 * 1024) {
      throw new Error("SVG file must be smaller than 1 MB.");
    }

    const svgText = await file.text();

    // Reject active content and external resources.
    if (
      /<script\b|<foreignObject\b|<image\b|<iframe\b|javascript:|url\s*\(/i.test(svgText) ||
      /\bhref\s*=/i.test(svgText)
    ) {
      throw new Error(
        "This SVG contains unsupported or external content."
      );
    }

    // Validate that the file can be parsed.
    const loader = new SVGLoader();
    const parsed = loader.parse(svgText);

    if (!parsed.paths || parsed.paths.length === 0) {
      throw new Error("No vector paths found in this SVG.");
    }

    logoSvgText = svgText;

    $("logoControls").hidden = false;
    $("logoStatus").textContent =
      "Logo loaded: " + file.name;

    renderPreview();

    $("message").textContent =
      "Logo uploaded successfully. Adjust its position and size.";

  } catch (error) {
    console.error("SVG upload error:", error);

    logoSvgText = "";
    $("logoControls").hidden = true;

    $("logoStatus").textContent = error.message;

    renderPreview();
  }
});

// Remove uploaded logo.
$("removeLogo").addEventListener("click", () => {
  logoSvgText = "";

  $("logoFile").value = "";
  $("logoControls").hidden = true;

  $("logoStatus").textContent =
    "Upload a single-colour SVG logo.";

  renderPreview();

  $("message").textContent = "Logo removed.";
});
// --------------------------------------------------
// STL GENERATION
// Registered only once
// --------------------------------------------------

async function generate() {
  const button = $("generate");
  const topButton = $("generateTop");

  button.disabled = true;
  topButton.disabled = true;

  $("message").textContent =
    "Generating STL with CadQuery…";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params())
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Generation failed");
    }

    const url = result.download + "?t=" + Date.now();

    const geometry = await new STLLoader().loadAsync(url);

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const bounds = geometry.boundingBox;
    const center = bounds.getCenter(new THREE.Vector3());

    // Centre X/Y and place CAD bottom on the ground plane.
    geometry.translate(
      -center.x,
      -center.y,
      -bounds.min.z
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x8ed9c2,
      roughness: 0.55,
      metalness: 0.02
    });

    const newGeneratedMesh = new THREE.Mesh(
      geometry,
      material
    );

    newGeneratedMesh.rotation.x = -Math.PI / 2;

    removeGeneratedMesh();

    generatedMesh = newGeneratedMesh;
    scene.add(generatedMesh);

    modelGroup.visible = false;

    controls.target.set(0, params().height / 2, 0);
    controls.update();

    $("download").href = result.download;
    $("download").classList.remove("disabled");

    $("message").textContent =
      "STL generated successfully. The preview now shows the exported mesh.";

  } catch (error) {
    console.error("STL generation error:", error);

    $("message").textContent =
      "Could not generate STL: " + error.message;

  } finally {
    button.disabled = false;
    topButton.disabled = false;
  }
}

$("generate").addEventListener("click", generate);
$("generateTop").addEventListener("click", generate);

// --------------------------------------------------
// INITIAL PREVIEW
// --------------------------------------------------

renderPreview();
