import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b7c7bc');
scene.fog = new THREE.Fog('#b7c7bc', 30, 80);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
const pointerControls = new PointerLockControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 5;
controls.maxDistance = 52;
controls.target.set(0, 0, 0);
camera.position.set(14, 14, 17);

scene.add(new THREE.HemisphereLight('#f4f6e9', '#66736b', 2.2));
const sun = new THREE.DirectionalLight('#fff3d7', 3.1);
sun.position.set(-9, 18, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
scene.add(sun);
const fill = new THREE.DirectionalLight('#c0d5ed', 0.8);
fill.position.set(10, 8, -10);
scene.add(fill);

const terrainStyles = {
  grove: { name: 'Clairière', color: '#788e69', background: '#b7c7bc', fog: '#b7c7bc' },
  desert: { name: 'Désert', color: '#b49a69', background: '#d4bc94', fog: '#d4bc94' },
  frost: { name: 'Montagne', color: '#8299a3', background: '#bacbd0', fog: '#bacbd0' },
  dusk: { name: 'Crépuscule', color: '#5d686c', background: '#8c8584', fog: '#8c8584' }
};
const definitions = {
  block: { name: 'Bloc', color: '#587c62', solid: true },
  platform: { name: 'Plateforme', color: '#b88051', solid: true },
  rock: { name: 'Rocher', color: '#92938a', solid: true },
  coin: { name: 'Cristal', color: '#f3c960', solid: false },
  hazard: { name: 'Danger', color: '#da5e58', solid: false },
  spawn: { name: 'Départ', color: '#4bb9a2', solid: false },
  goal: { name: 'Portail', color: '#9b80d5', solid: false },
  tree: { name: 'Arbre', color: '#638859', solid: true },
  lamp: { name: 'Balise', color: '#e5a94f', solid: false },
  water: { name: 'Eau', color: '#478da0', solid: false }
};
const blocks = new Map();
const undoStack = [];
const redoStack = [];
const keyState = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clock = new THREE.Clock();
let width = 18;
let depth = 14;
let maxHeight = 12;
let selectedType = 'block';
let selectedColor = definitions.block.color;
let projectName = 'Jardin suspendu';
let gameMode = 'platformer';
let terrain = 'grove';
let playing = false;
let fpsMode = false;
let player = null;
let fpsSavedCamera = null;
let gameSavedCamera = null;
let gestureState = null;
let gestureChanged = false;
let autosaveTimer = 0;
let coinCount = 0;
let hoveredKey = null;
let dayLevel = 0.8;
const cameraDirection = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
let outlinerRefreshQueued = false;

const groundMaterial = new THREE.MeshStandardMaterial({ color: terrainStyles[terrain].color, roughness: 0.92 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.055;
ground.receiveShadow = true;
scene.add(ground);
const gridGroup = new THREE.Group();
scene.add(gridGroup);

const keyOf = (x, y, z) => `${x},${y},${z}`;
const inBounds = (x, y, z) => x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < maxHeight;
const worldX = (x) => x - width / 2 + 0.5;
const worldZ = (z) => z - depth / 2 + 0.5;
const cellX = (x) => Math.floor(x + width / 2);
const cellZ = (z) => Math.floor(z + depth / 2);

function buildGrid() {
  gridGroup.clear();
  const points = [];
  for (let x = 0; x <= width; x++) {
    const px = x - width / 2;
    points.push(px, 0.005, -depth / 2, px, 0.005, depth / 2);
  }
  for (let z = 0; z <= depth; z++) {
    const pz = z - depth / 2;
    points.push(-width / 2, 0.005, pz, width / 2, 0.005, pz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#364944', transparent: true, opacity: 0.34 }));
  gridGroup.add(lines);
  gridGroup.visible = $('gridToggle').checked;
}

function createBlockMesh(block) {
  const group = new THREE.Group();
  const color = block.color || definitions[block.type].color;
  const standard = (tone, options = {}) => new THREE.MeshStandardMaterial({ color: tone, roughness: 0.77, ...options });
  let geometry;
  let material;
  if (block.type === 'coin') {
    geometry = new THREE.OctahedronGeometry(0.34, 1);
    material = standard(color, { metalness: 0.36, emissive: color, emissiveIntensity: 0.12 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.5;
    group.add(mesh);
  } else if (block.type === 'hazard') {
    geometry = new THREE.ConeGeometry(0.42, 0.82, 5);
    material = standard(color, { emissive: color, emissiveIntensity: 0.08 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.4;
    group.add(mesh);
  } else if (block.type === 'spawn' || block.type === 'goal') {
    geometry = block.type === 'spawn' ? new THREE.CylinderGeometry(0.3, 0.38, 0.78, 10) : new THREE.TorusGeometry(0.36, 0.105, 10, 24);
    material = standard(color, { emissive: color, emissiveIntensity: 0.27, metalness: 0.18 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = block.type === 'goal' ? 0.75 : 0.39;
    if (block.type === 'goal') mesh.rotation.y = Math.PI / 4;
    group.add(mesh);
  } else if (block.type === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.75, 7), standard('#715543'));
    trunk.position.y = 0.38;
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.53, 1), standard(color));
    canopy.position.y = 0.98;
    group.add(trunk, canopy);
  } else if (block.type === 'lamp') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.78, 8), standard('#495955', { metalness: 0.3 }));
    post.position.y = 0.4;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), standard(color, { emissive: color, emissiveIntensity: 1.7 }));
    glow.position.y = 0.88;
    group.add(post, glow);
  } else if (block.type === 'water') {
    geometry = new THREE.BoxGeometry(0.97, 0.18, 0.97);
    material = standard(color, { transparent: true, opacity: 0.83, roughness: 0.24, metalness: 0.12 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.12;
    group.add(mesh);
  } else {
    geometry = new THREE.BoxGeometry(0.97, 0.97, 0.97);
    material = standard(color, { roughness: block.type === 'rock' ? 0.96 : 0.76 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.485;
    group.add(mesh);
    if (block.type === 'platform') {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.1, 0.99), standard('#d3a66e'));
      trim.position.y = 0.91;
      group.add(trim);
    }
  }
  group.position.set(worldX(block.x), block.y, worldZ(block.z));
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.blockKey = keyOf(block.x, block.y, block.z);
  });
  group.userData.blockKey = keyOf(block.x, block.y, block.z);
  return group;
}

function disposeTree(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((item) => item.dispose());
    else child.material?.dispose();
  });
}

function removeBlockRaw(key) {
  const block = blocks.get(key);
  if (!block) return false;
  scene.remove(block.mesh);
  disposeTree(block.mesh);
  blocks.delete(key);
  return true;
}

function setBlockRaw(block) {
  const key = keyOf(block.x, block.y, block.z);
  removeBlockRaw(key);
  const entry = { ...block, key, mesh: null };
  entry.mesh = createBlockMesh(entry);
  blocks.set(key, entry);
  scene.add(entry.mesh);
}

function captureState() {
  return {
    app: 'MiniGameStudio3D', version: 2, name: projectName, mode: gameMode, terrain, width, depth, maxHeight,
    blocks: Array.from(blocks.values(), ({ x, y, z, type, color }) => ({ x, y, z, type, color }))
  };
}

function applyState(state) {
  width = state.width;
  depth = state.depth;
  maxHeight = state.maxHeight;
  projectName = state.name || 'Mon jeu';
  gameMode = state.mode || 'platformer';
  terrain = terrainStyles[state.terrain] ? state.terrain : 'grove';
  $('projectName').value = projectName;
  $('mapWidth').value = width;
  $('mapDepth').value = depth;
  $('gameMode').value = gameMode;
  $('terrainSelect').value = terrain;
  ground.geometry.dispose();
  ground.geometry = new THREE.PlaneGeometry(width, depth);
  ground.position.set(0, -0.055, 0);
  groundMaterial.color.set(terrainStyles[terrain].color);
  scene.background.set(terrainStyles[terrain].background);
  scene.fog.color.set(terrainStyles[terrain].fog);
  ground.position.y = -0.055;
  buildGrid();
  for (const key of Array.from(blocks.keys())) removeBlockRaw(key);
  for (const block of state.blocks) setBlockRaw(block);
  controls.target.set(0, 0, 0);
  updateCameraLimits();
  updateStats();
}

function recordUndo(before = captureState()) {
  undoStack.push(before);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('undoBtn').disabled = undoStack.length === 0 || playing;
  $('redoBtn').disabled = redoStack.length === 0 || playing;
}

function commitChange(message = 'Modifications enregistrées automatiquement') {
  $('saveStatus').textContent = message;
  $('objectCount').textContent = `${blocks.size} objets`;
  updateStats();
  if (!outlinerRefreshQueued) {
    outlinerRefreshQueued = true;
    requestAnimationFrame(() => {
      outlinerRefreshQueued = false;
      renderOutliner();
    });
  }
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem('mini-game-studio-3d', JSON.stringify(captureState()));
      $('saveStatus').textContent = 'Sauvegarde locale à jour';
    } catch {
      $('saveStatus').textContent = 'Export JSON conseillé : stockage indisponible';
    }
  }, 450);
}

function updateStats() {
  let coins = 0;
  let solids = 0;
  for (const block of blocks.values()) {
    if (block.type === 'coin') coins++;
    if (definitions[block.type].solid) solids++;
  }
  $('coinCount').textContent = String(coins);
  $('solidCount').textContent = String(solids);
  $('worldSize').textContent = `${width} × ${depth}`;
  $('objectCountStat').textContent = String(blocks.size);
  $('worldSizeStat').textContent = `${width} × ${depth}`;
}

function renderOutliner() {
  const list = $('outlinerList');
  const filter = $('sceneFilter').value.trim().toLocaleLowerCase();
  const entries = Array.from(blocks.values())
    .filter((block) => `${definitions[block.type].name} ${block.x + 1} ${block.y + 1} ${block.z + 1}`.toLocaleLowerCase().includes(filter))
    .sort((a, b) => definitions[a.type].name.localeCompare(definitions[b.type].name) || a.z - b.z || a.y - b.y || a.x - b.x);
  $('outlinerCount').textContent = String(blocks.size);
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'outliner-empty';
    empty.textContent = blocks.size ? 'Aucun objet correspondant.' : 'La scène est vide.';
    list.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const block of entries) {
    const row = document.createElement('div');
    row.className = `scene-row${block.key === hoveredKey ? ' selected' : ''}`;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-selected', String(block.key === hoveredKey));
    const kind = document.createElement('span');
    kind.className = 'scene-kind';
    kind.style.setProperty('--swatch', block.color || definitions[block.type].color);
    kind.textContent = definitions[block.type].name.slice(0, 1);
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'scene-select';
    select.dataset.sceneSelect = block.key;
    select.textContent = `${definitions[block.type].name}  ·  ${block.x + 1}, ${block.y + 1}, ${block.z + 1}`;
    select.title = `Sélectionner ${definitions[block.type].name}`;
    const focus = document.createElement('button');
    focus.type = 'button';
    focus.className = 'scene-focus';
    focus.dataset.sceneFocus = block.key;
    focus.textContent = '◎';
    focus.title = 'Centrer la caméra sur cet objet';
    focus.setAttribute('aria-label', focus.title);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'scene-delete';
    remove.dataset.sceneDelete = block.key;
    remove.textContent = '×';
    remove.title = 'Supprimer cet objet';
    remove.setAttribute('aria-label', remove.title);
    row.append(kind, select, focus, remove);
    fragment.append(row);
  }
  list.append(fragment);
}

function focusBlock(block) {
  if (fpsMode || playing) return;
  const target = new THREE.Vector3(worldX(block.x), block.y + 0.5, worldZ(block.z));
  const offset = camera.position.clone().sub(controls.target);
  const distance = Math.max(6, offset.length());
  if (offset.lengthSq() < 0.01) offset.set(8, 7, 9);
  camera.position.copy(target).add(offset.normalize().multiplyScalar(distance));
  controls.target.copy(target);
  controls.enabled = true;
  controls.update();
}

function nudgeSelected(axis, amount) {
  const block = blocks.get(hoveredKey);
  if (!block || playing || fpsMode) return;
  const nextPosition = { x: block.x, y: block.y, z: block.z };
  nextPosition[axis] += amount;
  if (!inBounds(nextPosition.x, nextPosition.y, nextPosition.z)) return;
  const nextKey = keyOf(nextPosition.x, nextPosition.y, nextPosition.z);
  if (blocks.has(nextKey)) return;
  const before = captureState();
  removeBlockRaw(block.key);
  setBlockRaw({ ...block, ...nextPosition });
  hoveredKey = nextKey;
  recordUndo(before);
  selectBlock(nextKey);
  commitChange('Objet déplacé');
}

function toggleMode(nextMode) {
  if (playing) stopGame();
  const before = captureState();
  gameMode = nextMode;
  $('gameMode').value = gameMode;
  recordUndo(before);
  commitChange('Mode de jeu modifié');
}

function drawSample() {
  for (let x = 0; x < width; x++) {
    setBlockRaw({ x, y: 0, z: depth - 3, type: 'block', color: x % 4 === 0 ? '#6f8c65' : '#587c62' });
  }
  for (const item of [
    { x: 2, y: 0, z: depth - 3, type: 'spawn' }, { x: 4, y: 0, z: depth - 3, type: 'coin' },
    { x: 6, y: 0, z: depth - 3, type: 'hazard' }, { x: 8, y: 0, z: depth - 3, type: 'platform', color: '#b88051' },
    { x: 9, y: 1, z: depth - 4, type: 'platform', color: '#d19a63' }, { x: 10, y: 2, z: depth - 5, type: 'platform', color: '#d19a63' },
    { x: 9, y: 3, z: depth - 5, type: 'coin' }, { x: 13, y: 0, z: depth - 3, type: 'tree' },
    { x: 15, y: 0, z: depth - 3, type: 'goal' }, { x: 3, y: 0, z: depth - 6, type: 'lamp' },
    { x: 5, y: 0, z: depth - 6, type: 'water' }, { x: 6, y: 0, z: depth - 6, type: 'water' },
    { x: 7, y: 0, z: depth - 6, type: 'water' }, { x: 16, y: 0, z: depth - 6, type: 'rock', color: '#92938a' }
  ]) setBlockRaw(item);
}

function makeBlank() {
  if (!confirm('Créer un nouveau monde ? Le projet courant reste disponible dans les sauvegardes locales.')) return;
  recordUndo();
  projectName = 'Nouveau monde';
  $('projectName').value = projectName;
  for (const key of Array.from(blocks.keys())) removeBlockRaw(key);
  drawSample();
  commitChange('Nouveau monde créé');
}

function setTool(type) {
  if (!definitions[type] && type !== 'select' && type !== 'erase') return;
  selectedType = type;
  if (definitions[type]) {
    selectedColor = definitions[type].color;
    $('paintColor').value = selectedColor;
  }
  document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === type));
  const name = type === 'select' ? 'Sélection' : type === 'erase' ? 'Gomme' : definitions[type].name;
  $('activeToolName').textContent = name;
  $('toolStatus').textContent = `${name} · clic pour utiliser dans la scène`;
}

function setTerrain(value) {
  const before = captureState();
  terrain = value;
  const style = terrainStyles[terrain];
  groundMaterial.color.set(style.color);
  scene.background.set(style.background);
  scene.fog.color.set(style.fog);
  recordUndo(before);
  commitChange(`${style.name} sélectionné`);
}

function placeAt(x, z, y = Number($('elevation').value)) {
  if (!inBounds(x, y, z)) return false;
  const type = selectedType;
  const color = selectedColor || definitions[type].color;
  if (type === 'spawn' || type === 'goal') {
    for (const [key, block] of blocks) if (block.type === type) removeBlockRaw(key);
  }
  const key = keyOf(x, y, z);
  const old = blocks.get(key);
  if (old?.type === type && old.color === color) return false;
  setBlockRaw({ x, y, z, type, color });
  return true;
}

function getPointerCell(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(Array.from(blocks.values(), (block) => block.mesh), true)[0];
  if (selectedType === 'select' && hit) return { hit, blockKey: hit.object.userData.blockKey };
  if (selectedType === 'erase' && hit) return { hit, blockKey: hit.object.userData.blockKey };
  let point = new THREE.Vector3();
  let y = Number($('elevation').value);
  if (hit && event.altKey) {
    point.copy(hit.point);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    point.addScaledVector(normal, 0.52);
    y = Math.max(0, Math.floor(point.y));
  } else if (raycaster.ray.intersectPlane(floorPlane, point) === null) {
    if (!hit) return null;
    point.copy(hit.point);
  }
  return { x: cellX(point.x), z: cellZ(point.z), y };
}

function applyPointer(event) {
  if (playing || fpsMode) return;
  const cell = getPointerCell(event);
  if (!cell) return;
  if (selectedType === 'select') {
    if (cell.blockKey) selectBlock(cell.blockKey);
    return;
  }
  if (selectedType === 'erase') {
    if (cell.blockKey && removeBlockRaw(cell.blockKey)) changedDuringGesture();
    return;
  }
  if (cell.x === undefined || !inBounds(cell.x, cell.y, cell.z)) return;
  if (placeAt(cell.x, cell.z, cell.y)) changedDuringGesture();
}

function changedDuringGesture() {
  if (!gestureChanged && gestureState) {
    recordUndo(gestureState);
    gestureChanged = true;
  }
  commitChange('Modifications non sauvegardées');
}

function selectBlock(key) {
  const block = blocks.get(key);
  if (!block) return;
  selectedType = 'select';
  $('selectedType').textContent = definitions[block.type].name;
  $('selectedPosition').textContent = `X ${block.x + 1} · Y ${block.y + 1} · Z ${block.z + 1}`;
  $('selectedPositionInfo').textContent = `X ${block.x + 1} · Y ${block.y + 1} · Z ${block.z + 1}`;
  $('paintColor').value = block.color || definitions[block.type].color;
  hoveredKey = key;
  document.querySelectorAll('[data-tool]').forEach((button) => button.classList.remove('active'));
  $('toolStatus').textContent = `${definitions[block.type].name} sélectionné · Alt + clic pour empiler`;
  renderOutliner();
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || playing || fpsMode) return;
  gestureState = captureState();
  gestureChanged = false;
  if (selectedType !== 'select') controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  applyPointer(event);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(Array.from(blocks.values(), (block) => block.mesh), true)[0];
  const key = hit?.object.userData.blockKey || null;
  if (key !== hoveredKey) {
    if (hoveredKey && blocks.get(hoveredKey)) blocks.get(hoveredKey).mesh.scale.setScalar(1);
    if (key && blocks.get(key)) blocks.get(key).mesh.scale.setScalar(1.035);
    hoveredKey = key;
  }
  if (renderer.domElement.hasPointerCapture(event.pointerId) && gestureState) applyPointer(event);
});
function finishGesture() {
  controls.enabled = !playing;
  gestureState = null;
}
renderer.domElement.addEventListener('pointerup', finishGesture);
renderer.domElement.addEventListener('pointercancel', finishGesture);
renderer.domElement.addEventListener('lostpointercapture', finishGesture);

function updateCameraLimits() {
  controls.target.set(0, 0.5, 0);
  camera.far = Math.max(100, width * 5, depth * 5);
  camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(36, width * 2.5, depth * 2.5);
}

function fitCamera(top = false) {
  if (fpsMode || playing) return;
  controls.target.set(0, 0.2, 0);
  if (top) {
    camera.position.set(0, Math.max(width, depth) * 1.16, 0.01);
    controls.maxPolarAngle = Math.PI / 2;
  } else {
    camera.position.set(width * 0.82, Math.max(width, depth) * 0.83, depth * 1.02);
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
  }
  controls.update();
}

function captureCamera() {
  return { position: camera.position.clone(), target: controls.target.clone() };
}

function restoreCamera(snapshot) {
  if (!snapshot) return;
  camera.position.copy(snapshot.position);
  controls.target.copy(snapshot.target);
  controls.update();
}

function enterFpsView() {
  if (playing || fpsMode) return;
  if (!renderer.domElement.requestPointerLock) {
    $('saveStatus').textContent = 'Le mode FPS nécessite un navigateur avec Pointer Lock';
    return;
  }
  fpsSavedCamera = captureCamera();
  const anchor = Array.from(blocks.values()).find((block) => block.type === 'spawn') || { x: Math.floor(width / 2), z: Math.floor(depth / 2), y: 0 };
  const eyeX = worldX(anchor.x);
  const eyeZ = worldZ(anchor.z);
  const eyeY = groundHeight(anchor.x, anchor.z) + 1.65;
  camera.position.set(eyeX, eyeY, eyeZ);
  camera.lookAt(eyeX, eyeY, eyeZ - 1);
  controls.enabled = false;
  fpsMode = true;
  document.querySelector('.stage').classList.add('fps-active');
  $('fpsBtn').classList.add('active');
  $('playState').textContent = 'VUE FPS';
  $('saveStatus').textContent = 'ZQSD / WASD · Maj pour accélérer · Échap pour quitter';
  pointerControls.lock();
}

function exitFpsView() {
  if (!fpsMode) return;
  fpsMode = false;
  const snapshot = fpsSavedCamera;
  fpsSavedCamera = null;
  if (pointerControls.isLocked) pointerControls.unlock();
  controls.enabled = true;
  document.querySelector('.stage').classList.remove('fps-active');
  $('fpsBtn').classList.remove('active');
  $('playState').textContent = 'ÉDITEUR';
  restoreCamera(snapshot);
}

function updateFpsCamera(delta) {
  if (!pointerControls.isLocked) return;
  const forward = Number(keyState.has('w') || keyState.has('z') || keyState.has('arrowup')) - Number(keyState.has('s') || keyState.has('arrowdown'));
  const sideways = Number(keyState.has('d') || keyState.has('arrowright')) - Number(keyState.has('a') || keyState.has('q') || keyState.has('arrowleft'));
  const vertical = Number(keyState.has(' ')) - Number(keyState.has('control'));
  const speed = (keyState.has('shift') ? 13 : 6) * delta;
  pointerControls.moveForward(forward * speed);
  pointerControls.moveRight(sideways * speed);
  camera.position.y += vertical * speed;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -width / 2 - 2, width / 2 + 2);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.45, maxHeight + 8);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -depth / 2 - 2, depth / 2 + 2);
}

pointerControls.addEventListener('unlock', () => {
  if (fpsMode) exitFpsView();
  else if (playing) stopGame();
});

function resizeWorld() {
  const nextWidth = Math.max(6, Math.min(50, Number($('mapWidth').value) || width));
  const nextDepth = Math.max(6, Math.min(50, Number($('mapDepth').value) || depth));
  if (nextWidth === width && nextDepth === depth) return;
  recordUndo();
  width = nextWidth;
  depth = nextDepth;
  for (const [key, block] of blocks) if (block.x >= width || block.z >= depth) removeBlockRaw(key);
  ground.geometry.dispose();
  ground.geometry = new THREE.PlaneGeometry(width, depth);
  buildGrid();
  updateCameraLimits();
  fitCamera();
  commitChange('Monde redimensionné');
}

function loadProject(data) {
  let state;
  if (Array.isArray(data?.blocks)) {
    const nextWidth = Number(data.width);
    const nextDepth = Number(data.depth);
    const nextHeight = Number(data.maxHeight) || 12;
    if (!Number.isInteger(nextWidth) || !Number.isInteger(nextDepth) || nextWidth < 4 || nextWidth > 50 || nextDepth < 4 || nextDepth > 50 || nextHeight < 4 || nextHeight > 30 || data.blocks.length > 5000) throw new Error('Dimensions ou nombre de blocs invalides.');
    const clean = data.blocks.map((block) => {
      if (!block || !Number.isInteger(block.x) || !Number.isInteger(block.y) || !Number.isInteger(block.z) || !definitions[block.type] || block.x < 0 || block.x >= nextWidth || block.z < 0 || block.z >= nextDepth || block.y < 0 || block.y >= nextHeight) throw new Error('Un bloc du projet est invalide.');
      return { x: block.x, y: block.y, z: block.z, type: block.type, color: /^#[\da-f]{6}$/i.test(block.color || '') ? block.color : definitions[block.type].color };
    });
    state = { width: nextWidth, depth: nextDepth, maxHeight: nextHeight, name: String(data.name || 'Projet importé').slice(0, 50), mode: ['platformer', 'explorer', 'racer'].includes(data.mode) ? data.mode : 'platformer', terrain: data.terrain, blocks: clean };
  } else if (Array.isArray(data?.grid) && Number.isInteger(data.W) && Number.isInteger(data.H) && data.W >= 4 && data.H >= 4 && data.W <= 50 && data.H <= 50) {
    const legacy = [];
    const oldTypes = { 1: 'block', 2: 'coin', 3: 'hazard', 4: 'spawn', 5: 'goal', 6: 'platform', 7: 'rock' };
    data.grid.forEach((row, z) => row.forEach((value, x) => { if (oldTypes[value]) legacy.push({ x, y: 0, z: data.H - z - 1, type: oldTypes[value], color: definitions[oldTypes[value]].color }); }));
    state = { width: data.W, depth: data.H, maxHeight: 12, name: data.name || 'Projet importé', mode: 'platformer', terrain: 'grove', blocks: legacy };
  } else throw new Error('Fichier JSON MiniGame Studio invalide.');
  const before = captureState();
  applyState(state);
  recordUndo(before);
  commitChange('Projet chargé');
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function safeFilename(value) {
  return (value || 'mon-projet').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'mon-projet';
}

function exportStandalone() {
  const payload = JSON.stringify(JSON.stringify(captureState())).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${projectName.replace(/[&<>"']/g, '')}</title><style>*{box-sizing:border-box}body{margin:0;background:#1b2826;color:#edf0e8;font:16px system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:18px}.wrap{width:min(1100px,100%)}header{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0}h1{font-size:22px;margin:0}#status{color:#b9c7b7}button{background:#d9e67a;color:#17211c;border:0;border-radius:6px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}#game{width:100%;height:min(70vh,680px);min-height:340px;display:block;border:1px solid #50635b;border-radius:4px;touch-action:none}.help{color:#b9c7b7;font-size:13px}@media(max-width:600px){header{align-items:flex-start;flex-direction:column}#game{height:62vh;min-height:300px}}</style><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"}}</script></head><body><main class="wrap"><header><h1 id="title"></h1><span id="status" aria-live="polite">Chargement…</span><button id="restart">Recommencer</button></header><canvas id="game"></canvas><p class="help">WASD / flèches : bouger · Espace : sauter · Souris : tourner la caméra</p></main><script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js';
const data=JSON.parse(${payload}),canvas=document.querySelector('#game'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;const scene=new THREE.Scene();scene.background=new THREE.Color('#b7c7bc');scene.add(new THREE.HemisphereLight('#f4f6e9','#66736b',2));const light=new THREE.DirectionalLight('#fff3d7',3);light.position.set(-9,18,11);light.castShadow=true;scene.add(light);const camera=new THREE.PerspectiveCamera(42,1,.1,200),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.02;const floor=new THREE.Mesh(new THREE.PlaneGeometry(data.width,data.depth),new THREE.MeshStandardMaterial({color:'#788e69'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.06;floor.receiveShadow=true;scene.add(floor);const cells=new Map(),coins=new Set(),keys=new Set(),types={block:'#587c62',platform:'#b88051',rock:'#92938a',coin:'#f3c960',hazard:'#da5e58',spawn:'#4bb9a2',goal:'#9b80d5',tree:'#638859',lamp:'#e5a94f',water:'#478da0'};const wx=x=>x-data.width/2+.5,wz=z=>z-data.depth/2+.5,key=(x,y,z)=>x+','+y+','+z;document.querySelector('#title').textContent=data.name;for(const b of data.blocks){const color=b.color||types[b.type],geometry=b.type==='coin'?new THREE.OctahedronGeometry(.34,1):b.type==='hazard'?new THREE.ConeGeometry(.42,.82,5):b.type==='goal'?new THREE.TorusGeometry(.36,.1,10,20):new THREE.BoxGeometry(.94,.94,.94),material=new THREE.MeshStandardMaterial({color,roughness:.76,emissive:b.type==='coin'||b.type==='goal'?color:'#000000',emissiveIntensity:.16}),mesh=new THREE.Mesh(geometry,material);mesh.position.set(wx(b.x),b.y+(b.type==='coin'||b.type==='hazard'?.5:.48),wz(b.z));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData=b;scene.add(mesh);cells.set(key(b.x,b.y,b.z),{...b,mesh});if(b.type==='coin')coins.add(mesh)}const spawn=data.blocks.find(b=>b.type==='spawn')||{x:1,y:0,z:data.depth-2};const player=new THREE.Mesh(new THREE.CapsuleGeometry(.24,.55,4,8),new THREE.MeshStandardMaterial({color:'#f5e8c7'}));scene.add(player);let velocity=0,won=false,coinTotal=0,yaw=0;function reset(){player.position.set(wx(spawn.x),.9,wz(spawn.z));velocity=0;won=false;document.querySelector('#status').textContent='À toi de jouer';for(const coin of coins){coin.visible=true}coinTotal=0}reset();camera.position.set(data.width*.8,Math.max(data.width,data.depth)*.8,data.depth);controls.target.set(0,0,0);const solid=(x,z,y)=>{const gx=Math.floor(x+data.width/2),gz=Math.floor(z+data.depth/2);for(const b of data.blocks)if(['block','platform','rock','tree'].includes(b.type)&&b.x===gx&&b.z===gz&&y<b.y+1&&y+.7>b.y)return true;return false};let previous=0;function frame(now){requestAnimationFrame(frame);const dt=Math.min(.04,(now-previous)/1000);previous=now;if(!won){const left=keys.has('ArrowLeft')||keys.has('a'),right=keys.has('ArrowRight')||keys.has('d'),up=keys.has('ArrowUp')||keys.has('w'),down=keys.has('ArrowDown')||keys.has('s');if(data.mode==='racer'){yaw+=((right?1:0)-(left?1:0))*2.5*dt;const speed=(up?1:0)-(down?1:0),nx=player.position.x+Math.sin(yaw)*speed*6*dt,nz=player.position.z+Math.cos(yaw)*speed*6*dt;if(!solid(nx,nz,player.position.y))player.position.set(nx,player.position.y,nz)}else{const speed=(data.mode==='explorer'?5:4)*dt,nx=player.position.x+((right?1:0)-(left?1:0))*speed,nz=player.position.z+((down?1:0)-(up?1:0))*speed;if(!solid(nx,player.position.z,player.position.y))player.position.x=nx;if(!solid(player.position.x,nz,player.position.y))player.position.z=nz;if(keys.has(' ')&&player.position.y<1.02)velocity=8}velocity-=20*dt;player.position.y=Math.max(.85,player.position.y+velocity*dt);if(player.position.y<=.85)velocity=0;for(const item of data.blocks){const dx=wx(item.x)-player.position.x,dz=wz(item.z)-player.position.z;if(dx*dx+dz*dz<.45&&Math.abs(player.position.y-item.y-.7)<1){if(item.type==='coin'){const mesh=cells.get(key(item.x,item.y,item.z))?.mesh;if(mesh?.visible){mesh.visible=false;coinTotal++;document.querySelector('#status').textContent='Cristaux : '+coinTotal}}if(item.type==='hazard'){reset();document.querySelector('#status').textContent='Touché ! Retour au départ'}}if(item.type==='goal'&&dx*dx+dz*dz<.6){won=true;document.querySelector('#status').textContent='Niveau terminé · Cristaux : '+coinTotal}}}controls.target.lerp(player.position,.035);controls.update();const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();renderer.render(scene,camera)}window.addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());keys.add(e.key);if(e.key.startsWith('Arrow')||e.key===' ')e.preventDefault()});window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());keys.delete(e.key)});window.addEventListener('blur',()=>keys.clear());document.querySelector('#restart').onclick=reset;requestAnimationFrame(frame);
</script></body></html>`;
  download(`${safeFilename(projectName)}-jeu.html`, html, 'text/html');
  $('saveStatus').textContent = 'Jeu 3D autonome exporté';
}

function startGame() {
  if (playing || fpsMode) return;
  playing = true;
  gameSavedCamera = captureCamera();
  coinCount = 0;
  const spawn = Array.from(blocks.values()).find((block) => block.type === 'spawn') || { x: 1, z: depth - 3, y: 0 };
  const material = new THREE.MeshStandardMaterial({ color: '#f4e9ce', roughness: 0.55 });
  player = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.54, 4, 8), material);
  player.position.set(worldX(spawn.x), groundHeight(spawn.x, spawn.z) + 0.88, worldZ(spawn.z));
  player.castShadow = true;
  player.visible = false;
  scene.add(player);
  player.userData.velocity = 0;
  player.userData.yaw = 0;
  controls.enabled = false;
  camera.position.set(player.position.x, player.position.y + 0.3, player.position.z);
  camera.lookAt(player.position.x, player.position.y + 0.3, player.position.z - 1);
  document.querySelector('.stage').classList.add('fps-active');
  pointerControls.lock();
  $('fpsBtn').classList.remove('active');
  $('playBtn').classList.add('hidden');
  $('stopBtn').classList.remove('hidden');
  $('playState').textContent = 'PARTIE EN COURS';
  $('saveStatus').textContent = 'ZQSD / WASD pour bouger · Espace pour sauter';
  for (const block of blocks.values()) if (block.type === 'coin') block.mesh.visible = true;
  updateHistoryButtons();
}

function groundHeight(x, z) {
  const gx = Math.floor(x + width / 2);
  const gz = Math.floor(z + depth / 2);
  let height = 0;
  for (const block of blocks.values()) if (definitions[block.type].solid && block.x === gx && block.z === gz) height = Math.max(height, block.y + 1);
  return height;
}

function isBlocked(x, z, feet) {
  for (const sample of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const gx = Math.floor(x + sample[0] + width / 2);
    const gz = Math.floor(z + sample[1] + depth / 2);
    for (const block of blocks.values()) {
      if (definitions[block.type].solid && block.x === gx && block.z === gz && feet < block.y + 0.96 && feet + 0.78 > block.y + 0.08) return true;
    }
  }
  return false;
}

function updateGame(delta) {
  if (!playing || !player) return;
  const left = keyState.has('arrowleft') || keyState.has('a') || keyState.has('q');
  const right = keyState.has('arrowright') || keyState.has('d');
  const forward = keyState.has('arrowup') || keyState.has('w') || keyState.has('z');
  const backward = keyState.has('arrowdown') || keyState.has('s');
  let dx = 0;
  let dz = 0;
  if (gameMode === 'racer') {
    player.userData.yaw += ((right ? 1 : 0) - (left ? 1 : 0)) * 2.5 * delta;
    const speed = ((forward ? 1 : 0) - (backward ? 1 : 0)) * 5.5 * delta;
    dx = Math.sin(player.userData.yaw) * speed;
    dz = Math.cos(player.userData.yaw) * speed;
    player.rotation.y = player.userData.yaw;
  } else {
    const speed = (gameMode === 'explorer' ? 5.1 : 3.8) * delta;
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    cameraRight.set(-cameraDirection.z, 0, cameraDirection.x);
    const forwardInput = Number(forward) - Number(backward);
    const rightInput = Number(right) - Number(left);
    dx = (cameraDirection.x * forwardInput + cameraRight.x * rightInput) * speed;
    dz = (cameraDirection.z * forwardInput + cameraRight.z * rightInput) * speed;
  }
  const boundsX = width / 2 - 0.4;
  const boundsZ = depth / 2 - 0.4;
  const nx = THREE.MathUtils.clamp(player.position.x + dx, -boundsX, boundsX);
  const nz = THREE.MathUtils.clamp(player.position.z + dz, -boundsZ, boundsZ);
  if (!isBlocked(nx, player.position.z, player.position.y - 0.88)) player.position.x = nx;
  if (!isBlocked(player.position.x, nz, player.position.y - 0.88)) player.position.z = nz;
  const foot = player.position.y - 0.88;
  const support = groundHeight(player.position.x, player.position.z);
  if (gameMode === 'platformer' && (keyState.has(' ') || keyState.has('space')) && player.userData.velocity === 0 && foot <= support + 0.09) player.userData.velocity = 7.1;
  player.userData.velocity -= 20 * delta;
  let nextFoot = foot + player.userData.velocity * delta;
  if (nextFoot <= support) {
    nextFoot = support;
    player.userData.velocity = 0;
  }
  player.position.y = nextFoot + 0.88;
  camera.position.set(player.position.x, player.position.y + 0.3, player.position.z);
  const gx = Math.floor(player.position.x + width / 2);
  const gz = Math.floor(player.position.z + depth / 2);
  for (const block of blocks.values()) {
    if (block.x !== gx || block.z !== gz || Math.abs(player.position.y - block.y - 0.88) > 0.9) continue;
    if (block.type === 'coin' && block.mesh.visible) {
      block.mesh.visible = false;
      coinCount++;
      $('saveStatus').textContent = `${coinCount} cristal${coinCount > 1 ? 'aux' : ''} récupéré${coinCount > 1 ? 's' : ''}`;
    } else if (block.type === 'hazard') {
      const spawn = Array.from(blocks.values()).find((item) => item.type === 'spawn') || { x: 1, z: depth - 3 };
      player.position.set(worldX(spawn.x), groundHeight(spawn.x, spawn.z) + 0.88, worldZ(spawn.z));
      player.userData.velocity = 0;
      $('saveStatus').textContent = 'Touché ! Retour au départ';
    } else if (block.type === 'goal') {
      $('saveStatus').textContent = `Niveau terminé · ${coinCount} cristal${coinCount > 1 ? 'aux' : ''}`;
      stopGame(true);
      return;
    }
  }
}

function stopGame(completed = false) {
  if (!playing) return;
  playing = false;
  if (pointerControls.isLocked) pointerControls.unlock();
  if (player) {
    scene.remove(player);
    disposeTree(player);
    player = null;
  }
  for (const block of blocks.values()) if (block.type === 'coin') block.mesh.visible = true;
  controls.enabled = true;
  document.querySelector('.stage').classList.remove('fps-active');
  restoreCamera(gameSavedCamera);
  gameSavedCamera = null;
  $('stopBtn').classList.add('hidden');
  $('playBtn').classList.remove('hidden');
  $('playState').textContent = completed ? 'NIVEAU TERMINÉ' : 'ÉDITEUR';
  updateHistoryButtons();
}

function undo() {
  if (!undoStack.length || playing) return;
  redoStack.push(captureState());
  applyState(undoStack.pop());
  updateHistoryButtons();
  commitChange('Action annulée');
}

function redo() {
  if (!redoStack.length || playing) return;
  undoStack.push(captureState());
  applyState(redoStack.pop());
  updateHistoryButtons();
  commitChange('Action rétablie');
}

function shareProject() {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(captureState()))));
  const url = `${location.origin}${location.pathname}#projet=${encoded}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      $('saveStatus').textContent = 'Lien du projet copié';
    }).catch(() => {
      prompt('Copie ce lien pour partager le projet :', url);
    });
  } else {
    prompt('Copie ce lien pour partager le projet :', url);
  }
}

$('undoBtn').onclick = undo;
$('redoBtn').onclick = redo;
$('newBtn').onclick = makeBlank;
$('saveBtn').onclick = () => {
  localStorage.setItem('mini-game-studio-3d', JSON.stringify(captureState()));
  $('saveStatus').textContent = 'Sauvegarde locale effectuée';
};
$('exportBtn').onclick = () => download(`${safeFilename(projectName)}.json`, JSON.stringify(captureState(), null, 2), 'application/json');
$('exportGameBtn').onclick = exportStandalone;
$('shareBtn').onclick = shareProject;
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    loadProject(JSON.parse(await file.text()));
  } catch (error) {
    $('saveStatus').textContent = error.message || 'Fichier de projet invalide';
  }
  event.target.value = '';
};
$('playBtn').onclick = startGame;
$('stopBtn').onclick = () => stopGame();
$('paintColor').addEventListener('input', (event) => {
  selectedColor = event.target.value;
  if (selectedType === 'select' && hoveredKey) {
    const block = blocks.get(hoveredKey);
    if (block) {
      const before = captureState();
      setBlockRaw({ ...block, color: selectedColor });
      recordUndo(before);
      commitChange('Couleur modifiée');
    }
  }
});
$('gameMode').addEventListener('change', (event) => toggleMode(event.target.value));
$('terrainSelect').addEventListener('change', (event) => setTerrain(event.target.value));
$('gridToggle').addEventListener('change', (event) => { gridGroup.visible = event.target.checked; });
$('elevation').addEventListener('input', (event) => { $('elevationValue').textContent = `${event.target.value} m`; });
$('resizeBtn').onclick = resizeWorld;
$('homeView').onclick = () => fitCamera();
$('topView').onclick = () => fitCamera(true);
$('fpsBtn').onclick = () => fpsMode ? exitFpsView() : enterFpsView();
$('sceneFilter').addEventListener('input', renderOutliner);
$('outlinerList').addEventListener('click', (event) => {
  const select = event.target.closest('[data-scene-select]');
  const focus = event.target.closest('[data-scene-focus]');
  const remove = event.target.closest('[data-scene-delete]');
  if (select) {
    const block = blocks.get(select.dataset.sceneSelect);
    if (block) {
      selectBlock(block.key);
      focusBlock(block);
    }
  } else if (focus) {
    const block = blocks.get(focus.dataset.sceneFocus);
    if (block) focusBlock(block);
  } else if (remove) {
    const key = remove.dataset.sceneDelete;
    if (!blocks.has(key)) return;
    const before = captureState();
    removeBlockRaw(key);
    if (hoveredKey === key) {
      hoveredKey = null;
      $('selectedType').textContent = 'Aucun';
      $('selectedPosition').textContent = 'Aucun objet sélectionné';
      $('selectedPositionInfo').textContent = 'X — · Y — · Z —';
    }
    recordUndo(before);
    commitChange('Objet supprimé');
  }
});
document.querySelectorAll('[data-nudge]').forEach((button) => button.addEventListener('click', () => {
  const [axis, amount] = button.dataset.nudge.split(',');
  nudgeSelected(axis, Number(amount));
}));
$('daylight').addEventListener('input', (event) => {
  dayLevel = Number(event.target.value) / 100;
  sun.intensity = 0.55 + dayLevel * 3.5;
  fill.intensity = 0.18 + dayLevel * 0.85;
  $('daylightValue').textContent = dayLevel > 0.66 ? 'Jour' : dayLevel > 0.33 ? 'Soir' : 'Nuit';
});
document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
document.querySelectorAll('[data-panel-toggle]').forEach((button) => button.addEventListener('click', () => {
  const panel = $(button.dataset.panelToggle);
  panel.classList.toggle('collapsed');
  button.textContent = panel.classList.contains('collapsed') ? '+' : '−';
}));

window.addEventListener('keydown', (event) => {
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); $('saveBtn').click(); return; }
  if (event.key === 'Escape' && fpsMode) { exitFpsView(); return; }
  if (event.key === 'Escape' && playing) { stopGame(); return; }
  if (!editing && /^[1-9]$/.test(event.key)) {
    const tool = document.querySelector(`[data-shortcut="${event.key}"]`);
    if (tool) setTool(tool.dataset.tool);
  }
  if (playing || fpsMode) {
    keyState.add(event.key.toLowerCase());
    if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => keyState.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keyState.clear());
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#projet=')) return;
  try {
    const bytes = Uint8Array.from(atob(location.hash.slice(8)), (char) => char.charCodeAt(0));
    loadProject(JSON.parse(new TextDecoder().decode(bytes)));
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    $('saveStatus').textContent = 'Lien de projet invalide';
  }
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  if (fpsMode && !playing) updateFpsCamera(delta);
  updateGame(delta);
  controls.update();
  renderer.render(scene, camera);
}

function resizeRenderer() {
  const { width: viewWidth, height: viewHeight } = view.getBoundingClientRect();
  if (!viewWidth || !viewHeight) return;
  renderer.setSize(viewWidth, viewHeight, false);
  camera.aspect = viewWidth / viewHeight;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeRenderer).observe(view);
buildGrid();
const sharedProject = location.hash.startsWith('#projet=');
let loaded = false;
if (sharedProject) {
  try {
    const bytes = Uint8Array.from(atob(location.hash.slice(8)), (char) => char.charCodeAt(0));
    loadProject(JSON.parse(new TextDecoder().decode(bytes)));
    history.replaceState(null, '', location.pathname + location.search);
    loaded = true;
  } catch {
    $('saveStatus').textContent = 'Lien de projet invalide';
  }
}
if (!loaded) {
  try {
    const saved = localStorage.getItem('mini-game-studio-3d');
    if (saved) {
      applyState(JSON.parse(saved));
      loaded = true;
    }
  } catch {
    $('saveStatus').textContent = 'Impossible de lire la sauvegarde locale';
  }
}
if (!loaded) drawSample();
$('projectName').addEventListener('input', () => {
  projectName = $('projectName').value.slice(0, 50);
  commitChange('Nom du projet modifié');
});
fitCamera();
resizeRenderer();
updateHistoryButtons();
updateStats();
setTool('block');
renderOutliner();
animate();
