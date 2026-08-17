import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as CANNON from 'cannon-es';

// ==========================================
// GAME STATE & STATS
// ==========================================
const gameState = {
    coins: 800,
    isHost: false,
    roomCode: 'SOLO',
    inGame: false,
    isShopOpen: false,
    selectedMode: 'SOLO' // 'SOLO', 'HOST', 'JOIN'
};

let health = 100;
let maxHealth = 100;
let armor = 0;
let maxArmor = 100;
let weaponDamage = 30;

// Networking
let peer, conn;
const networkPlayers = {};
let lastNetTick = 0;
const netTickRate = 0.05;

// Input State
const keys = {
    w: false, a: false, s: false, d: false,
    shift: false, ctrl: false, space: false
};

// Player & Camera Variables
let playerBody, playerMesh;
let lobbyPedestal;
let cameraYaw = 0;
let cameraPitch = 0;
const walkSpeed = 5;
const sprintSpeed = 9;
const jumpVelocity = 6;
let isCrouching = false;
let colorIndex = Math.floor(Math.random() * 0xffffff);

let playerBones = {};
let playerRightHand = null;

// ==========================================
// COMPREHENSIVE SHOP & WEAPONS CATALOG
// ==========================================
const SHOP_ITEMS = [
    // 1. Equipment
    { id: 'kevlar', category: 'equipment', name: 'Kevlar Vest', cost: 650, icon: '🛡️', type: 'armor', value: 50, dmg: '-', rate: '-', range: 'Body', desc: 'Lightweight body armor that absorbs 50% incoming damage.', tip: 'Essential budget protection for early rounds.' },
    { id: 'helmet', category: 'equipment', name: 'Kevlar + Helmet', cost: 1000, icon: '🪖', type: 'armor', value: 100, dmg: '-', rate: '-', range: 'Head+Body', desc: 'Full ballistic protection that prevents instant headshot deaths.', tip: 'Always purchase on full buy rounds.' },
    { id: 'medkit', category: 'equipment', name: 'Tactical Medkit', cost: 300, icon: '💊', type: 'health', value: 100, dmg: '-', rate: '-', range: 'Self', desc: 'Restores health immediately back to full 100 HP.', tip: 'Use behind cover after taking heavy hits.' },

    // 2. Pistols
    { id: 'fpspist', category: 'pistols', name: 'FPS Pistol', cost: 100, file: './gun_fps_hand.glb', icon: '🔰', type: 'gun', damage: 40, rate: 0.40, dmgVal: 40, rateVal: 40, rangeVal: 50, desc: 'High-damage sidearm with crisp single-fire accuracy.', tip: 'Great eco-round weapon with solid headshot multiplier.' },
    { id: 'dual_beretta', category: 'pistols', name: 'Dual Berettas', cost: 300, file: './gun_fps_hand.glb', icon: '🔫', type: 'gun', damage: 26, rate: 0.15, dmgVal: 26, rateVal: 75, rangeVal: 40, desc: 'Dual-wielded rapid pistols offering high rate of close-quarters fire.', tip: 'Spam at close range to overwhelm enemies.' },
    { id: 'magnum', category: 'pistols', name: 'Heavy Magnum', cost: 500, file: './gun_fps_hand.glb', icon: '💥', type: 'gun', damage: 65, rate: 0.65, dmgVal: 65, rateVal: 25, rangeVal: 70, desc: 'Hand cannon delivering devastating punch per round.', tip: 'Precision is rewarded — two body shots eliminate a target.' },

    // 3. Mid-Tier
    { id: 'uzi', category: 'mid-tier', name: 'UZI Submachine', cost: 200, file: './uzi.glb', icon: '⚡', type: 'gun', damage: 16, rate: 0.06, dmgVal: 16, rateVal: 95, rangeVal: 45, desc: 'Extreme rate of fire designed for run-and-gun skirmishes.', tip: 'Sprint into close corridors and spray.' },
    { id: 'pp19', category: 'mid-tier', name: 'PP-19 Vityaz', cost: 250, file: './pp-19-01_vityaz.glb', icon: '🎯', type: 'gun', damage: 22, rate: 0.09, dmgVal: 22, rateVal: 85, rangeVal: 60, desc: 'Russian tactical 9mm SMG with large magazine capacity.', tip: 'Predictable recoil pattern makes it easy to control.' },
    { id: 'ump', category: 'mid-tier', name: 'HK UMP', cost: 300, file: './heckler__koch_ump.glb', icon: '🎖️', type: 'gun', damage: 26, rate: 0.12, dmgVal: 26, rateVal: 70, rangeVal: 65, desc: '.45 ACP tactical submachine gun with high armor penetration.', tip: 'Effective at medium range bursts.' },
    { id: 'm590', category: 'mid-tier', name: 'M590 Shotgun', cost: 400, file: './free_fire_gun_m590.glb', icon: '💣', type: 'gun', damage: 95, rate: 1.00, dmgVal: 95, rateVal: 15, rangeVal: 30, desc: 'Pump-action combat shotgun capable of one-shot eliminations at close range.', tip: 'Hold tight corners and ambush incoming opponents.' },

    // 4. Rifles
    { id: 'ak47', category: 'rifles', name: 'AK-47', cost: 0, file: './ak-47_mid-poly.glb', icon: '🔫', type: 'gun', damage: 32, rate: 0.16, dmgVal: 32, rateVal: 75, rangeVal: 80, desc: 'The gold standard of assault rifles with lethal damage and range.', tip: 'Fire in 3-round bursts for maximum headshot accuracy.' },
    { id: 'm4', category: 'rifles', name: 'M4 Carbine', cost: 150, file: './m4_carbine_rifle.glb', icon: '🪖', type: 'gun', damage: 28, rate: 0.12, dmgVal: 28, rateVal: 85, rangeVal: 85, desc: 'Laser-accurate NATO rifle with smooth handling and low recoil.', tip: 'Ideal for precision sustained fire.' },
    { id: 'sniper', category: 'rifles', name: 'Heavy Sniper', cost: 500, file: './ak-47_mid-poly.glb', icon: '🔭', type: 'gun', damage: 100, rate: 1.30, dmgVal: 100, rateVal: 10, rangeVal: 100, desc: 'High-caliber sniper rifle with guaranteed one-shot kill.', tip: 'Take high ground and cover long sightlines.' },

    // 5. Grenades
    { id: 'flashbang', category: 'grenades', name: 'Flashbang', cost: 200, icon: '✨', type: 'grenade', dmgVal: 0, rateVal: 50, rangeVal: 70, desc: 'Blinds and disorients opponents caught looking at the detonation.', tip: 'Throw around corners before breaching.' },
    { id: 'smoke', category: 'grenades', name: 'Smoke Grenade', cost: 300, icon: '💨', type: 'grenade', dmgVal: 0, rateVal: 50, rangeVal: 60, desc: 'Deploys a thick tactical smoke cloud blocking sightlines for 15s.', tip: 'Use to cross open areas safely or revive teammates.' },
    { id: 'he_frag', category: 'grenades', name: 'HE Frag Grenade', cost: 400, icon: '💥', type: 'grenade', dmgVal: 80, rateVal: 30, rangeVal: 50, desc: 'High explosive fragmentation grenade dealing heavy area damage.', tip: 'Bounce off walls into enemy cover.' }
];

let selectedItem = SHOP_ITEMS.find(i => i.id === 'ak47');
let currentWeapon = SHOP_ITEMS.find(i => i.id === 'ak47');
let weaponMesh;
let raycaster = new THREE.Raycaster();
let shootCooldown = 0;
let shootRate = 0.16;
let recoilOffset = 0;

const WEAPON_HAND_POS = new THREE.Vector3(0.38, 0.50, 0.10);

// ==========================================
// WEB AUDIO API SOUND SYSTEM
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'buy') {
        // Cash register chime
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
    } else if (type === 'error') {
        // Low error buzz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
    } else if (type === 'equip') {
        // Mechanical click
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(640, now + 0.04);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'shoot') {
        // Punchy gunshot pop
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
    }
}

// ==========================================
// UI ELEMENTS
// ==========================================
const uiMainMenu = document.getElementById('main-menu');
const uiHud = document.getElementById('hud');
const shopMenu = document.getElementById('shop-menu');
const coinDisplay = document.getElementById('coin-display');
const lobbyCoins = document.getElementById('lobby-coins');
const shopCoins = document.getElementById('shop-coins');
const hudRoomCode = document.getElementById('hud-room-code');
const hudWeaponName = document.getElementById('hud-weapon-name');
const healthBarFill = document.getElementById('health-bar-fill');
const healthValue = document.getElementById('health-value');
const armorBarFill = document.getElementById('armor-bar-fill');
const armorValue = document.getElementById('armor-value');
const btnCloseShop = document.getElementById('btn-close-shop');

// Modal Elements
const modalModeSelect = document.getElementById('modal-mode-select');
const btnOpenModeModal = document.getElementById('btn-open-mode-modal');
const btnChangeMode = document.getElementById('btn-change-mode');
const btnCloseModeModal = document.getElementById('btn-close-mode-modal');
const modeOptSolo = document.getElementById('mode-opt-solo');
const modeOptHost = document.getElementById('mode-opt-host');
const btnModalJoin = document.getElementById('btn-modal-join');
const modalInputCode = document.getElementById('modal-input-code');
const currentModeTitle = document.getElementById('current-mode-title');
const lobbyRoomCodeTag = document.getElementById('lobby-room-code-tag');
const btnFortnitePlayAction = document.getElementById('btn-fortnite-play-action');
const lobbyStatusText = document.getElementById('lobby-status-text');

function updateHUD() {
    coinDisplay.innerText = gameState.coins;
    lobbyCoins.innerText = gameState.coins;
    shopCoins.innerText = gameState.coins;

    healthValue.innerText = Math.max(0, Math.round(health));
    healthBarFill.style.width = Math.max(0, (health / maxHealth) * 100) + '%';

    armorValue.innerText = Math.max(0, Math.round(armor));
    armorBarFill.style.width = Math.max(0, (armor / maxArmor) * 100) + '%';

    if (currentWeapon) {
        hudWeaponName.innerText = currentWeapon.name;
    }
}

function addCoins(amount) {
    gameState.coins += amount;
    updateHUD();
}

// ==========================================
// THREE.JS & CANNON PHYSICS SETUP
// ==========================================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a111c); // Dark lobby sky
scene.fog = new THREE.FogExp2(0x0a111c, 0.012);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 4);

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.81, 0)
});
const timeStep = 1 / 60;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(30, 80, 40);
dirLight.castShadow = true;
scene.add(dirLight);

// Sci-Fi Lobby Spotlights & Pedestal Glow
const lobbySpot = new THREE.SpotLight(0x38bdf8, 4, 25, Math.PI / 4, 0.5);
lobbySpot.position.set(0, 8, 3);
scene.add(lobbySpot);

// Loaders
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==========================================
// 3D LOBBY PEDESTAL SETUP
// ==========================================
function buildLobbyPedestal() {
    lobbyPedestal = new THREE.Group();

    // Base cylinder
    const baseGeo = new THREE.CylinderGeometry(2, 2.2, 0.3, 32);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.4,
        metalness: 0.8
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.15;
    lobbyPedestal.add(baseMesh);

    // Glowing Cyan Outer Ring
    const ringGeo = new THREE.TorusGeometry(1.9, 0.06, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.02;
    lobbyPedestal.add(ringMesh);

    // Inner Glowing Disc
    const discGeo = new THREE.CircleGeometry(1.7, 32);
    const discMat = new THREE.MeshBasicMaterial({
        color: 0x0369a1,
        transparent: true,
        opacity: 0.7
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.rotation.x = -Math.PI / 2;
    discMesh.position.y = 0.01;
    lobbyPedestal.add(discMesh);

    scene.add(lobbyPedestal);
}
buildLobbyPedestal();

// ==========================================
// INPUT HANDLING & POINTER LOCK
// ==========================================
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
    if (e.shiftKey) keys.shift = true;
    if (e.ctrlKey) keys.ctrl = true;
    if (e.code === 'Space') keys.space = true;

    // Toggle Buy Menu with 'B'
    if (k === 'b') {
        if (gameState.inGame) {
            toggleShop();
        }
    }

    // Number shortcuts in buy menu (1 - 5)
    if (gameState.isShopOpen) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 5) {
            const categories = ['equipment', 'pistols', 'mid-tier', 'rifles', 'grenades'];
            const cat = categories[num - 1];
            const firstInCat = SHOP_ITEMS.find(i => i.category === cat);
            if (firstInCat) selectShopItem(firstInCat);
        }
    }
});

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
    if (!e.shiftKey) keys.shift = false;
    if (!e.ctrlKey) keys.ctrl = false;
    if (e.code === 'Space') keys.space = false;
});

// Pointer Lock & Camera Rotation
window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && gameState.inGame && !gameState.isShopOpen) {
        const sensitivity = 0.0022;
        cameraYaw -= e.movementX * sensitivity;
        cameraPitch -= e.movementY * sensitivity;
        cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraPitch));
    }
});

// Shooting
window.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement === canvas && e.button === 0 && gameState.inGame && !gameState.isShopOpen) {
        shoot();
    }
});

function shoot() {
    if (shootCooldown > 0) return;
    shootCooldown = shootRate;
    recoilOffset = 0.12;

    playSound('shoot');

    // Raycast from camera center
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true).filter(
        i => i.object !== playerMesh && !playerMesh.children.includes(i.object)
    );

    if (intersects.length > 0) {
        const hit = intersects[0];
        
        // Spawn impact spark VFX
        const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.copy(hit.point);
        scene.add(spark);
        setTimeout(() => { scene.remove(spark); spark.geometry.dispose(); spark.material.dispose(); }, 180);

        let hitPlayerId = null;
        for (const [id, mesh] of Object.entries(networkPlayers)) {
            if (hit.object === mesh || hit.object.parent === mesh) {
                hitPlayerId = id;
                break;
            }
        }

        if (conn && conn.open) {
            conn.send({
                type: 'shoot',
                hitPoint: hit.point,
                targetId: hitPlayerId,
                damage: hitPlayerId ? weaponDamage : 0
            });
        }
    }
}

// ==========================================
// NETWORKING SETUP (PeerJS)
// ==========================================
function setupNetworking() {
    if (gameState.isHost) {
        lobbyStatusText.innerText = 'Creating Room... (Connecting)';
        const peerId = 'arena-' + gameState.roomCode;
        try {
            peer = new window.Peer(peerId);
        } catch (e) {
            lobbyStatusText.innerText = 'PeerJS offline. Starting Solo.';
            setTimeout(enterGame, 800);
            return;
        }

        peer.on('open', (id) => {
            console.log('Host Lobby Ready:', id);
            enterGame();
        });

        peer.on('connection', (connection) => {
            conn = connection;
            setupConnectionEvents();
        });

        peer.on('error', (err) => {
            console.warn('PeerJS error:', err.type);
            enterGame(); // Fallback to play smoothly
        });

    } else if (gameState.selectedMode === 'JOIN') {
        lobbyStatusText.innerText = 'Connecting to Host...';
        try {
            peer = new window.Peer();
        } catch (e) {
            enterGame();
            return;
        }

        peer.on('open', () => {
            conn = peer.connect('arena-' + gameState.roomCode);
            setupConnectionEvents();
        });

        peer.on('error', () => {
            lobbyStatusText.innerText = 'Host unreachable. Starting Solo.';
            setTimeout(enterGame, 1000);
        });
    } else {
        // Solo mode
        enterGame();
    }
}

function setupConnectionEvents() {
    conn.on('open', () => {
        enterGame();
    });

    conn.on('data', (data) => {
        if (data.type === 'state') {
            handleNetworkState(data);
        } else if (data.type === 'shoot') {
            handleNetworkShoot(data);
        } else if (data.type === 'death') {
            addCoins(300);
            console.log('Kill reward! +300 Coins');
        }
    });

    conn.on('close', () => {
        for (const id in networkPlayers) {
            scene.remove(networkPlayers[id]);
            delete networkPlayers[id];
        }
    });
}

function handleNetworkState(data) {
    if (!networkPlayers[data.id]) {
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.6, 16);
        const mat = new THREE.MeshStandardMaterial({ color: data.color || 0xef4444 });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        networkPlayers[data.id] = mesh;
    }
    const remote = networkPlayers[data.id];
    remote.position.set(data.pos.x, data.pos.y, data.pos.z);
    remote.rotation.y = data.rotY;
}

function handleNetworkShoot(data) {
    if (data.targetId === peer?.id) {
        let dmg = data.damage;
        // Armor absorption
        if (armor > 0) {
            const absorbed = Math.min(armor, dmg * 0.5);
            armor -= absorbed;
            dmg -= absorbed;
        }
        health -= dmg;
        updateHUD();

        if (health <= 0) {
            health = 100;
            armor = 0;
            updateHUD();
            playerBody.position.set(6, 0.9, 6);
            if (conn && conn.open) conn.send({ type: 'death' });
        }
    }
}

// ==========================================
// CHARACTER & WEAPON LOADERS
// ==========================================
async function loadPlayer() {
    const radius = 0.45;
    const sphereShape = new CANNON.Sphere(radius);
    playerBody = new CANNON.Body({
        mass: 75,
        fixedRotation: true,
        linearDamping: 0.8
    });
    playerBody.addShape(sphereShape, new CANNON.Vec3(0, -0.35, 0));
    playerBody.addShape(sphereShape, new CANNON.Vec3(0, 0.35, 0));
    playerBody.position.set(0, 0.8, 0); // On lobby pedestal initially
    world.addBody(playerBody);

    try {
        const fbx = await fbxLoader.loadAsync('./New_Character/fbx/stylized_paladin_fbx_extracted/Stylized_Paladin.fbx');
        playerMesh = fbx;

        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
            const s = 1.7 / size.y;
            fbx.scale.set(s, s, s);
        }

        const armorTex = texLoader.load('./New_Character/fbx/stylized_paladin_fbx_extracted/Textures/Armor_Base_color.png');
        const bodyTex = texLoader.load('./New_Character/fbx/stylized_paladin_fbx_extracted/Textures/Body_Base_color.png');
        const hairTex = texLoader.load('./New_Character/fbx/stylized_paladin_fbx_extracted/Textures/Hair_Color.png');

        playerBones = {};
        playerRightHand = null;

        fbx.traverse((child) => {
            if (child.isBone) {
                const name = child.name.toLowerCase();
                playerBones[name] = child;
                if (name.includes('righthand') || name.includes('hand_r') || name.includes('hand.r') || (name.includes('hand') && name.includes('r'))) {
                    playerRightHand = child;
                }
            }
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const mName = (child.name || '').toLowerCase();
                if (child.material) {
                    if (mName.includes('armor')) child.material.map = armorTex;
                    else if (mName.includes('hair')) child.material.map = hairTex;
                    else if (mName.includes('body') || mName.includes('head') || mName.includes('paladin')) child.material.map = bodyTex;
                    child.material.needsUpdate = true;
                }
            }
        });

        // Pose character arms in combat stance
        for (const [name, bone] of Object.entries(playerBones)) {
            if (name.includes('rightarm') || name.includes('upperarm_r') || name.includes('arm_r') || name.includes('shoulder_r')) {
                bone.rotation.x = -Math.PI / 4;
                bone.rotation.z = Math.PI / 8;
            }
            if (name.includes('rightforearm') || name.includes('lowerarm_r') || name.includes('forearm_r')) {
                bone.rotation.y = -Math.PI / 6;
            }
            if (name.includes('leftarm') || name.includes('upperarm_l') || name.includes('arm_l') || name.includes('shoulder_l')) {
                bone.rotation.x = -Math.PI / 3;
                bone.rotation.y = Math.PI / 4;
            }
            if (name.includes('leftforearm') || name.includes('lowerarm_l') || name.includes('forearm_l')) {
                bone.rotation.y = Math.PI / 3;
            }
        }

        scene.add(playerMesh);

        // Load default weapon (AK-47)
        loadWeaponItem(SHOP_ITEMS.find(i => i.id === 'ak47'));

    } catch (err) {
        console.error('Failed to load Paladin character:', err);
    }
}

// Load 3D weapon onto character
async function loadWeaponItem(item) {
    if (!item || !item.file) return;
    currentWeapon = item;
    shootRate = item.rate || 0.16;
    weaponDamage = item.damage || 30;

    if (weaponMesh && playerMesh) {
        playerMesh.remove(weaponMesh);
        weaponMesh = null;
    }

    try {
        const gltf = await gltfLoader.loadAsync(item.file);
        const rawMesh = gltf.scene;

        const gunContainer = new THREE.Group();
        rawMesh.updateMatrixWorld(true);
        const gunBox = new THREE.Box3().setFromObject(rawMesh);
        const gunCenter = gunBox.getCenter(new THREE.Vector3());
        const gunSize = gunBox.getSize(new THREE.Vector3());

        rawMesh.position.sub(gunCenter);
        gunContainer.add(rawMesh);

        const maxDim = Math.max(gunSize.x, gunSize.y, gunSize.z);
        if (maxDim > 0) {
            const s = 0.75 / maxDim;
            gunContainer.scale.set(s, s, s);
        }

        if (gunSize.x > gunSize.y && gunSize.x > gunSize.z) {
            rawMesh.rotation.y = -Math.PI / 2;
        } else if (gunSize.y > gunSize.x && gunSize.y > gunSize.z) {
            rawMesh.rotation.x = Math.PI / 2;
        } else {
            rawMesh.rotation.y = Math.PI;
        }

        gunContainer.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        gunContainer.position.copy(WEAPON_HAND_POS);
        weaponMesh = gunContainer;
        playerMesh.add(weaponMesh);

        updateHUD();
        console.log('Equipped weapon:', item.name);
    } catch (err) {
        console.error('Failed to load weapon file:', item.file, err);
    }
}

// ==========================================
// ARENA ENVIRONMENT & TRIMESH COLLISION
// ==========================================
async function loadEnvironment() {
    const mapFile = './FPS_Shooter_Game_Arena_Map_v3-c7e9c3f1/glb/converted/fps_shooter_game_arena_map_v3.glb';

    try {
        const gltf = await gltfLoader.loadAsync(mapFile);
        const mapGroup = gltf.scene;

        mapGroup.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const sceneBox = new THREE.Box3().setFromObject(mapGroup);
        const sceneCenter = sceneBox.getCenter(new THREE.Vector3());
        mapGroup.position.x = -sceneCenter.x;
        mapGroup.position.z = -sceneCenter.z;
        mapGroup.position.y = -sceneBox.min.y;

        scene.add(mapGroup);
        mapGroup.updateMatrixWorld(true);

        // Ground Plane at Y = 0
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        groundBody.position.set(0, 0, 0);
        world.addBody(groundBody);

        // Exact Trimesh colliders
        mapGroup.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            try {
                const geo = child.geometry.clone();
                child.updateWorldMatrix(true, false);
                geo.applyMatrix4(child.matrixWorld);

                const posAttr = geo.attributes.position;
                if (!posAttr || posAttr.count < 3) return;

                const vertices = [];
                for (let i = 0; i < posAttr.count; i++) {
                    vertices.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                }

                let indices = [];
                if (geo.index) {
                    indices = Array.from(geo.index.array);
                } else {
                    for (let i = 0; i < posAttr.count; i++) indices.push(i);
                }

                const trimesh = new CANNON.Trimesh(vertices, indices);
                const body = new CANNON.Body({ mass: 0 });
                body.addShape(trimesh);
                world.addBody(body);
            } catch (e) {}
        });

        // Spawn player on open arena floor
        if (playerBody) {
            playerBody.position.set(6, 0.9, 6);
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
        }

    } catch (err) {
        console.error('Failed to load arena:', err);
    }
}

// ==========================================
// CS:GO 5-COLUMN BUY MENU SYSTEM
// ==========================================
function renderBuyMenu() {
    const colEquipment = document.getElementById('col-equipment');
    const colPistols = document.getElementById('col-pistols');
    const colMidTier = document.getElementById('col-mid-tier');
    const colRifles = document.getElementById('col-rifles');
    const colGrenades = document.getElementById('col-grenades');

    const containers = {
        'equipment': colEquipment,
        'pistols': colPistols,
        'mid-tier': colMidTier,
        'rifles': colRifles,
        'grenades': colGrenades
    };

    // Clear all
    Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });

    // Populate each column
    SHOP_ITEMS.forEach((item, index) => {
        const parent = containers[item.category];
        if (!parent) return;

        const card = document.createElement('div');
        const isEquipped = currentWeapon?.id === item.id;
        const isSelected = selectedItem?.id === item.id;
        
        card.className = `cs-card p-3 rounded-xl flex items-center justify-between cursor-pointer ${isSelected ? 'selected' : ''}`;
        card.id = `buy-card-${item.id}`;

        const priceText = item.cost === 0 ? 'FREE' : `$ ${item.cost}`;

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-2xl">${item.icon}</span>
                <div>
                    <h4 class="font-heading text-lg font-bold text-white leading-tight">${item.name}</h4>
                    <span class="font-mono text-xs font-bold text-emerald-400">${priceText}</span>
                </div>
            </div>
            ${isEquipped ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40">EQUIPPED</span>' : ''}
        `;

        card.addEventListener('mouseenter', () => {
            selectShopItem(item);
        });

        card.addEventListener('click', () => {
            selectShopItem(item);
            buyCurrentSelectedItem();
        });

        parent.appendChild(card);
    });
}

function selectShopItem(item) {
    selectedItem = item;

    // Update selection highlight
    document.querySelectorAll('.cs-card').forEach(c => c.classList.remove('selected'));
    const activeCard = document.getElementById(`buy-card-${item.id}`);
    if (activeCard) activeCard.classList.add('selected');

    // Update Right-Hand Inspector
    document.getElementById('inspect-icon').innerText = item.icon;
    document.getElementById('inspect-title').innerText = item.name;
    document.getElementById('inspect-cost').innerText = item.cost === 0 ? 'FREE' : `$ ${item.cost}`;

    document.getElementById('inspect-stat-dmg').innerText = item.dmgVal ?? (item.value ? `+${item.value}` : '-');
    document.getElementById('inspect-stat-rate').innerText = item.rateVal ? `${item.rateVal}%` : '-';
    document.getElementById('inspect-stat-range').innerText = item.rangeVal ? `${item.rangeVal}%` : (item.range || '-');

    document.getElementById('inspect-bar-dmg').style.width = (item.dmgVal || 20) + '%';
    document.getElementById('inspect-bar-rate').style.width = (item.rateVal || 40) + '%';
    document.getElementById('inspect-bar-range').style.width = (item.rangeVal || 50) + '%';

    document.getElementById('inspect-desc').innerText = `• ${item.desc}`;
    document.getElementById('inspect-tip').innerText = `• ${item.tip}`;

    const btnBuy = document.getElementById('btn-inspect-buy');
    if (currentWeapon?.id === item.id) {
        btnBuy.innerText = 'EQUIPPED ✓';
        btnBuy.className = 'w-full py-3 mt-4 bg-emerald-800 text-emerald-200 font-heading text-xl font-bold rounded-xl cursor-default';
    } else {
        btnBuy.innerText = item.cost === 0 ? 'EQUIP FREE' : `BUY FOR $${item.cost}`;
        btnBuy.className = 'w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-heading text-xl font-bold rounded-xl tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all cursor-pointer';
    }
}

function buyCurrentSelectedItem() {
    if (!selectedItem) return;

    if (selectedItem.type === 'armor') {
        if (gameState.coins >= selectedItem.cost) {
            addCoins(-selectedItem.cost);
            armor = Math.min(maxArmor, armor + selectedItem.value);
            playSound('buy');
            updateHUD();
            renderBuyMenu();
        } else {
            playSound('error');
        }
    } else if (selectedItem.type === 'health') {
        if (gameState.coins >= selectedItem.cost) {
            addCoins(-selectedItem.cost);
            health = maxHealth;
            playSound('buy');
            updateHUD();
            renderBuyMenu();
        } else {
            playSound('error');
        }
    } else if (selectedItem.type === 'gun') {
        if (currentWeapon?.id === selectedItem.id) {
            playSound('equip');
            return;
        }
        if (gameState.coins >= selectedItem.cost) {
            addCoins(-selectedItem.cost);
            loadWeaponItem(selectedItem);
            playSound('buy');
            renderBuyMenu();
            selectShopItem(selectedItem);
        } else {
            playSound('error');
        }
    } else if (selectedItem.type === 'grenade') {
        if (gameState.coins >= selectedItem.cost) {
            addCoins(-selectedItem.cost);
            playSound('buy');
            updateHUD();
        } else {
            playSound('error');
        }
    }
}

document.getElementById('btn-inspect-buy').addEventListener('click', buyCurrentSelectedItem);

function toggleShop() {
    gameState.isShopOpen = !gameState.isShopOpen;
    if (gameState.isShopOpen) {
        document.exitPointerLock();
        shopMenu.classList.remove('hidden');
        renderBuyMenu();
        if (selectedItem) selectShopItem(selectedItem);
    } else {
        shopMenu.classList.add('hidden');
        canvas.requestPointerLock();
    }
}

btnCloseShop.addEventListener('click', toggleShop);

// ==========================================
// LOBBY INTERACTIONS & MODE SELECTION
// ==========================================
btnOpenModeModal.addEventListener('click', () => {
    modalModeSelect.classList.remove('hidden');
});
btnChangeMode.addEventListener('click', () => {
    modalModeSelect.classList.remove('hidden');
});
btnCloseModeModal.addEventListener('click', () => {
    modalModeSelect.classList.add('hidden');
});

modeOptSolo.addEventListener('click', () => {
    gameState.selectedMode = 'SOLO';
    gameState.isHost = false;
    gameState.roomCode = 'SOLO';
    currentModeTitle.innerText = 'SOLO ARENA';
    lobbyRoomCodeTag.innerText = 'SOLO PRACTICE';
    modalModeSelect.classList.add('hidden');
});

modeOptHost.addEventListener('click', () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    gameState.selectedMode = 'HOST';
    gameState.isHost = true;
    gameState.roomCode = code;
    currentModeTitle.innerText = 'P2P MULTIPLAYER';
    lobbyRoomCodeTag.innerText = `ROOM: ${code}`;
    modalModeSelect.classList.add('hidden');
});

btnModalJoin.addEventListener('click', () => {
    const code = modalInputCode.value.trim().toUpperCase();
    if (code.length >= 4) {
        gameState.selectedMode = 'JOIN';
        gameState.isHost = false;
        gameState.roomCode = code;
        currentModeTitle.innerText = `JOINING ${code}`;
        lobbyRoomCodeTag.innerText = `ROOM: ${code}`;
        modalModeSelect.classList.add('hidden');
    }
});

btnFortnitePlayAction.addEventListener('click', () => {
    playSound('equip');
    btnFortnitePlayAction.innerText = 'CONNECTING...';
    setupNetworking();
});

document.getElementById('btn-tab-shop').addEventListener('click', () => {
    toggleShop();
});

// ==========================================
// ENTERING IN-GAME MATCH
// ==========================================
let gameLoaded = false;
async function enterGame() {
    if (gameLoaded) return;
    gameLoaded = true;

    uiMainMenu.classList.add('hidden');
    modalModeSelect.classList.add('hidden');
    uiHud.classList.remove('hidden');
    hudRoomCode.innerText = gameState.roomCode;
    gameState.inGame = true;

    if (lobbyPedestal) {
        scene.remove(lobbyPedestal);
    }
    scene.background = new THREE.Color(0x87CEEB); // Switch to arena sky
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

    try {
        canvas.requestPointerLock();
    } catch (e) {}

    await loadEnvironment();
    updateHUD();
}

// ==========================================
// ANIMATION & MAIN GAME LOOP
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (!gameState.inGame) {
        // ==========================================
        // LOBBY MODE CAMERA & CHARACTER ROTATION
        // ==========================================
        if (playerMesh) {
            playerMesh.position.set(0, 0, 0);
            playerMesh.rotation.y = time * 0.4; // Smooth idle turnaround
        }
        if (lobbyPedestal) {
            lobbyPedestal.rotation.y = -time * 0.2;
        }

        // Orbit camera in lobby
        const orbitDist = 3.8;
        camera.position.x = Math.sin(time * 0.15) * 1.5;
        camera.position.y = 1.3 + Math.sin(time * 0.5) * 0.05;
        camera.position.z = orbitDist;
        camera.lookAt(0, 0.9, 0);

    } else {
        // ==========================================
        // IN-GAME COMBAT & MOVEMENT
        // ==========================================
        world.step(timeStep, delta, 3);
        updatePlayer(delta, time);

        // Network tick
        if (conn && conn.open && playerBody && playerMesh) {
            lastNetTick += delta;
            if (lastNetTick >= netTickRate) {
                lastNetTick = 0;
                conn.send({
                    type: 'state',
                    id: peer.id,
                    color: colorIndex,
                    pos: { x: playerMesh.position.x, y: playerMesh.position.y + 0.8, z: playerMesh.position.z },
                    rotY: playerMesh.rotation.y
                });
            }
        }
    }

    renderer.render(scene, camera);
}

function updatePlayer(delta, time) {
    if (!playerBody || !gameState.inGame) return;

    const speed = keys.shift ? sprintSpeed : walkSpeed;
    isCrouching = keys.ctrl;
    const currentSpeed = isCrouching ? speed * 0.5 : speed;

    const direction = new THREE.Vector3();
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;

    direction.normalize();

    if (direction.lengthSq() > 0) {
        const euler = new THREE.Euler(0, cameraYaw, 0, 'YXZ');
        direction.applyEuler(euler);
        playerBody.velocity.x = direction.x * currentSpeed;
        playerBody.velocity.z = direction.z * currentSpeed;

        if (playerMesh) {
            playerMesh.rotation.y = Math.atan2(playerBody.velocity.x, playerBody.velocity.z);
        }
    } else {
        playerBody.velocity.x *= 0.5;
        playerBody.velocity.z *= 0.5;
    }

    if (keys.space && Math.abs(playerBody.velocity.y) < 0.1) {
        playerBody.velocity.y = jumpVelocity;
        keys.space = false;
    }

    // Sync mesh to physics body
    if (playerMesh) {
        playerMesh.position.copy(playerBody.position);
        playerMesh.position.y -= 0.8;

        const speedVal = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.z ** 2);
        const isMoving = speedVal > 0.5;
        const bobRate = isCrouching ? 8 : (keys.shift ? 18 : 12);

        if (isMoving) {
            const legSwing = Math.sin(time * bobRate) * 0.6;
            for (const [name, bone] of Object.entries(playerBones)) {
                if (name.includes('thigh_l') || name.includes('leftupleg') || name.includes('leg_l')) {
                    bone.rotation.x = legSwing;
                }
                if (name.includes('thigh_r') || name.includes('rightupleg') || name.includes('leg_r')) {
                    bone.rotation.x = -legSwing;
                }
                if (name.includes('calf_l') || name.includes('leftleg') || name.includes('lowerleg_l')) {
                    bone.rotation.x = Math.max(0, -legSwing * 0.7);
                }
                if (name.includes('calf_r') || name.includes('rightleg') || name.includes('lowerleg_r')) {
                    bone.rotation.x = Math.max(0, legSwing * 0.7);
                }
            }
            playerMesh.position.y += Math.sin(time * bobRate * 2) * 0.03;
            playerMesh.rotation.z = Math.sin(time * bobRate * 0.5) * 0.02;
        } else {
            for (const [name, bone] of Object.entries(playerBones)) {
                if (name.includes('leg') || name.includes('thigh') || name.includes('calf')) {
                    bone.rotation.x = 0;
                }
            }
            playerMesh.position.y += Math.sin(time * 1.5) * 0.01;
            playerMesh.rotation.z = 0;
        }

        if (isCrouching) playerMesh.position.y -= 0.3;
    }

    // Third-person orbit camera
    const orbitDistance = isCrouching ? 2.5 : 4;
    const yOffset = isCrouching ? 0.5 : 1.5;

    const camX = playerBody.position.x + orbitDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const camY = playerBody.position.y + yOffset + orbitDistance * Math.sin(cameraPitch);
    const camZ = playerBody.position.z + orbitDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch);

    camera.position.set(camX, camY, camZ);
    camera.lookAt(playerBody.position.x, playerBody.position.y + yOffset, playerBody.position.z);

    // Recoil recovery
    if (shootCooldown > 0) shootCooldown -= delta;
    if (weaponMesh) {
        if (recoilOffset > 0) {
            recoilOffset -= delta * 2;
            if (recoilOffset < 0) recoilOffset = 0;
        }
        weaponMesh.position.x = WEAPON_HAND_POS.x;
        weaponMesh.position.y = WEAPON_HAND_POS.y;
        weaponMesh.position.z = WEAPON_HAND_POS.z + recoilOffset;
    }
}

// Initial Load
loadPlayer();
animate();
updateHUD();
