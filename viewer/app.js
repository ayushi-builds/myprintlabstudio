
import * as THREE from
    'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

import { OrbitControls } from
    'three/addons/controls/OrbitControls.js';

import { STLLoader } from
    'three/addons/loaders/STLLoader.js';

const container = document.getElementById('viewer');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);

const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    10000
);

camera.position.set(150, 150, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(100, 150, 100);
scene.add(light);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let currentModel;

function loadSTL(url) {
    new STLLoader().load(url, geometry => {
        if (currentModel) scene.remove(currentModel);

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0xe5a16d,
            metalness: 0.1,
            roughness: 0.65
        });

        currentModel = new THREE.Mesh(geometry, material);

        geometry.computeBoundingBox();
        const center = geometry.boundingBox.getCenter(new THREE.Vector3());

        currentModel.position.sub(center);
        scene.add(currentModel);

        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);

        camera.position.set(
            maxDimension * 1.8,
            maxDimension * 1.8,
            maxDimension * 1.8
        );

        controls.target.set(0, 0, 0);
        controls.update();
    });
}

// Load the generated jewellery tray
loadSTL('/output/jewelry_tray.stl');

// Upload a different STL
document.getElementById('file').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    loadSTL(url);
});

// Responsive viewer
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
