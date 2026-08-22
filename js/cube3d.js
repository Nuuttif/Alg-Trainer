import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 3D controllable virtual cube.
// Reads the same cube.cubestate (54-length URFDLB facelet array) used by the 2D
// canvas, so keyboard moves drive it unchanged via the shared drawCube dispatch.
// Exposes window.cube3D with init/render/resize/destroy hooks.

const CUBE_N = 3;                       // 3x3 grid of stickers per face
const HALF = CUBE_N / 2;                 // cube spans -1.5 .. 1.5
const STICKER_SIZE = 0.88;               // sticker side, leaving a black gap
const STICKER_OFFSET = 1.52;            // just outside the body surface
const BODY_SIZE = 3.0;

// Map each of the 54 facelet indices -> {pos:[x,y,z], normal:[x,y,z]}.
// URFDLB order; each face row-major (r,c), index = faceBase + r*3 + c.
const STICKER_LAYOUT = (function () {
    const layout = [];
    const add = (face, base, pos, normal) => {
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                layout[base + r * 3 + c] = { pos: pos(r, c), normal: normal };
            }
        }
    };
    // U (indices 0-8): top face (+Y). row 0 = back (-Z), col 0 = left (-X).
    add('U', 0, (r, c) => [c - 1, STICKER_OFFSET, r - 1], [0, 1, 0]);
    // R (9-17): right face (+X). row 0 = top (+Y), col 0 = front (+Z).
    add('R', 9, (r, c) => [STICKER_OFFSET, 1 - r, 1 - c], [1, 0, 0]);
    // F (18-26): front face (+Z). row 0 = top (+Y), col 0 = left (-X).
    add('F', 18, (r, c) => [c - 1, 1 - r, STICKER_OFFSET], [0, 0, 1]);
    // D (27-35): bottom face (-Y). row 0 = front (+Z), col 0 = left (-X).
    add('D', 27, (r, c) => [c - 1, -STICKER_OFFSET, 1 - r], [0, -1, 0]);
    // L (36-44): left face (-X). row 0 = top (+Y), col 0 = back (-Z).
    add('L', 36, (r, c) => [-STICKER_OFFSET, 1 - r, c - 1], [-1, 0, 0]);
    // B (45-53): back face (-Z). row 0 = top (+Y), col 0 = right (+X).
    add('B', 45, (r, c) => [1 - c, 1 - r, -STICKER_OFFSET], [0, 0, -1]);
    return layout;
})();

// For 2x2 mode, only corner stickers (r,c in {0,2}) are visible.
function isCornerSticker(index) {
    const faceBase = Math.floor(index / 9) * 9;
    const off = index - faceBase;
    const r = Math.floor(off / 3);
    const c = off % 3;
    return (r === 0 || r === 2) && (c === 0 || c === 2);
}

function parseColour(value) {
    const fn = window.stickerColour;
    if (typeof fn === 'function') return fn(value);
    // Fallback palette (matches RubiksCube.js defaults).
    return ['#ffffff', '#ff0000', '#00cc00', '#ffd500', '#ff8800', '#0044ff'][(value - 1) % 6];
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(5, 6, 7);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.rotateSpeed = 0.8;
controls.minDistance = 4;
controls.maxDistance = 16;
controls.enablePan = false;
controls.enableKeys = false;

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.55);
keyLight.position.set(6, 10, 8);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
fillLight.position.set(-6, -4, -6);
scene.add(fillLight);

// Black cube body.
const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85, metalness: 0.0 })
);
scene.add(body);

// Sticker meshes (one per facelet), oriented facing outward.
const stickerGeo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
const stickerMats = {};
const stickers = STICKER_LAYOUT.map(spec => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.0 });
    const mesh = new THREE.Mesh(stickerGeo, mat);
    mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    mesh.lookAt(spec.pos[0] + spec.normal[0], spec.pos[1] + spec.normal[1], spec.pos[2] + spec.normal[2]);
    scene.add(mesh);
    return mesh;
});

let container = null;
let rafId = null;
let currentCubeType = '3x3';

function setStickerVisibility(cubeType) {
    currentCubeType = cubeType;
    const is2x2 = cubeType === '2x2';
    for (let i = 0; i < stickers.length; i++) {
        stickers[i].visible = is2x2 ? isCornerSticker(i) : true;
    }
}

function resize() {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

function animate() {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function render(cubeArray, cubeType) {
    if (!cubeArray) return;
    if (cubeType && cubeType !== currentCubeType) setStickerVisibility(cubeType);
    for (let i = 0; i < stickers.length; i++) {
        const value = cubeArray[i];
        if (value === undefined) continue;
        const colour = parseColour(value);
        if (!stickerMats[colour]) {
            stickerMats[colour] = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: 0.5, metalness: 0.0 });
        }
        stickers[i].material = stickerMats[colour];
    }
}

function mount(el) {
    container = el;
    el.innerHTML = '';
    renderer.setSize(el.clientWidth || 300, el.clientHeight || 300);
    el.appendChild(renderer.domElement);
    resize();
    if (rafId === null) animate();
}

function show(visible) {
    if (!renderer) return;
    renderer.domElement.style.display = visible ? '' : 'none';
    if (visible && rafId === null) animate();
}

window.cube3D = {
    mount,
    render,
    show,
    resize,
    setStickerVisibility,
    isReady: () => !!renderer
};

// Attach a draw hook so RubiksCube.js can dispatch 3D renders without needing
// to know the module is loaded. drawCube() checks window.drawCube3D. Lazily
// mounts the renderer the first time it's called (handles the case where the
// 3D style is selected after the page loads, so init() didn't mount).
window.drawCube3D = function (cubeArray) {
    const cubeType = (document.getElementById('cubeType') || {}).value || '3x3';
    if (!container) {
        const el = document.getElementById('cube3d');
        if (el) {
            mount(el);
            show(true);
        }
    }
    render(cubeArray, cubeType);
};

// Auto-initialise: this module loads after the classic scripts (it's an ES
// module, hence deferred), so cube.cubestate and localStorage are ready. If the
// page loaded with the 3D style active and the simulator panel visible, mount
// the renderer and draw the current state.
(function init() {
    const style = localStorage.getItem('virtualCubeStyle');
    if (style !== '3d') return;
    const sim = document.getElementById('simcube');
    if (!sim || sim.style.display === 'none') return;
    const el = document.getElementById('cube3d');
    if (!el) return;
    mount(el);
    show(true);
    if (window.cube && window.cube.cubestate) {
        const cubeType = (document.getElementById('cubeType') || {}).value || '3x3';
        render(window.cube.cubestate, cubeType);
    }
})();

// Keep the renderer sized to its container when the window resizes.
window.addEventListener('resize', () => {
    if (container) resize();
});
