import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

// Game State
const gameState = {
    coins: 500,
    isHost: false,
    roomCode: null,
    inGame: false,
    isShopOpen: false
};

// Player Stats
let health = 100;

// Networking
let peer, conn;
const networkPlayers = {}; // store remote player meshes
let lastNetTick = 0;
const netTickRate = 0.05; // 20 updates per sec

// Input State
const keys = {
    w: false, a: false, s: false, d: false,
    shift: false, ctrl: false, space: false
};

// Player Variables
let playerBody, playerMesh;
let cameraYaw = 0;
let cameraPitch = 0;
const walkSpeed = 5;
const sprintSpeed = 9;
const jumpVelocity = 6;
let isCrouching = false;
let colorIndex = Math.floor(Math.random() * 0xffffff);

// Weapon Catalog — all 7 guns
const WEAPONS = [
    { id: 'ak47',    name: 'AK-47',          file: './ak-47_mid-poly.glb',           cost: 0,   damage: 30, rate: 0.18, color: 0xd97706, label: 'FREE' },
    { id: 'm4',      name: 'M4 Carbine',      file: './m4_carbine_rifle.glb',          cost: 150, damage: 25, rate: 0.12, color: 0x6b7280, label: '150 Coins' },
    { id: 'uzi',     name: 'UZI',             file: './uzi.glb',                       cost: 200, damage: 12, rate: 0.05, color: 0xf59e0b, label: '200 Coins' },
    { id: 'pp19',    name: 'PP-19 Vityaz',    file: './pp-19-01_vityaz.glb',           cost: 250, damage: 18, rate: 0.08, color: 0x3b82f6, label: '250 Coins' },
    { id: 'ump',     name: 'HK UMP',          file: './heckler__koch_ump.glb',         cost: 300, damage: 22, rate: 0.10, color: 0x10b981, label: '300 Coins' },
    { id: 'fpspist', name: 'FPS Pistol',       file: './gun_fps_hand.glb',              cost: 100, damage: 40, rate: 0.50, color: 0x8b5cf6, label: '100 Coins' },
    { id: 'm590',    name: 'M590 Shotgun',     file: './free_fire_gun_m590.glb',        cost: 400, damage: 90, rate: 1.20, color: 0xef4444, label: '400 Coins' },
];
let currentWeaponIdx = 0; // AK-47 default

// Weapon Variables
let weaponMesh;
let raycaster = new THREE.Raycaster();
let shootCooldown = 0;
let shootRate = WEAPONS[0].rate;
let weaponDamage = WEAPONS[0].damage;
let recoilOffset = 0;

// Procedural Rig Bones — detected child meshes of the character
let rigLeftArm = null, rigRightArm = null;
let rigLeftLeg = null, rigRightLeg = null;
let rigUpperBody = null;

// UI Elements
const uiMainMenu = document.getElementById('main-menu');
const uiHud = document.getElementById('hud');
const btnCreateLobby = document.getElementById('btn-create-lobby');
const btnJoinLobby = document.getElementById('btn-join-lobby');
const inputLobbyCode = document.getElementById('input-lobby-code');
const loadingStatus = document.getElementById('loading-status');
const coinDisplay = document.getElementById('coin-display');
const hudRoomCode = document.getElementById('hud-room-code');
const healthBarFill = document.getElementById('health-bar-fill');
const shopMenu = document.getElementById('shop-menu');
const shopCoins = document.getElementById('shop-coins');
const btnBuySmg = document.getElementById('btn-buy-smg');
const btnBuySniper = document.getElementById('btn-buy-sniper');
const btnCloseShop = document.getElementById('btn-close-shop');

// UI Update Functions
function updateHUD() {
    coinDisplay.innerText = gameState.coins;
    shopCoins.innerText = gameState.coins;
    healthBarFill.style.width = Math.max(0, health) + '%';
    if (health < 30) {
        healthBarFill.className = 'bg-gradient-to-r from-red-600 to-red-500 h-full w-full transition-all duration-300';
    } else {
        healthBarFill.className = 'bg-gradient-to-r from-green-500 to-green-400 h-full w-full transition-all duration-300';
    }
    // Refresh shop coin balance text
    shopCoins.innerText = gameState.coins;
}
function addCoins(amount) {
    gameState.coins += amount;
    updateHUD();
}

// Three.js Setup
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Physics Setup
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.81, 0)
});
const timeStep = 1 / 60;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
scene.add(dirLight);

// Loaders
const gltfLoader = new GLTFLoader();

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Input Handlers
document.addEventListener('keydown', (e) => {
    if (!gameState.inGame) return;
    const key = e.key.toLowerCase();
    
    // Toggle Shop
    if (key === 'b') {
        gameState.isShopOpen = !gameState.isShopOpen;
        if (gameState.isShopOpen) {
            document.exitPointerLock();
            shopMenu.classList.remove('hidden');
        } else {
            shopMenu.classList.add('hidden');
            canvas.requestPointerLock();
        }
        return;
    }
    
    if (keys.hasOwnProperty(key)) keys[key] = true;
    if (e.code === 'Space') keys.space = true;
    if (e.key === 'Shift') keys.shift = true;
    if (e.key === 'Control') keys.ctrl = true;
});

document.addEventListener('keyup', (e) => {
    if (!gameState.inGame) return;
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
    if (e.code === 'Space') keys.space = false;
    if (e.key === 'Shift') keys.shift = false;
    if (e.key === 'Control') keys.ctrl = false;
});

document.addEventListener('mousemove', (e) => {
    if (!gameState.inGame || document.pointerLockElement !== canvas) return;
    const sensitivity = 0.002;
    cameraYaw -= e.movementX * sensitivity;
    cameraPitch -= e.movementY * sensitivity;
    
    // Clamp pitch to avoid flipping
    const pitchLimit = Math.PI / 2 - 0.1;
    cameraPitch = Math.max(-pitchLimit, Math.min(pitchLimit, cameraPitch));
});

document.addEventListener('mousedown', (e) => {
    if (!gameState.inGame || document.pointerLockElement !== canvas) return;
    if (e.button === 0) { // Left click
        shootWeapon();
    }
});

function shootWeapon() {
    if (shootCooldown > 0 || !weaponMesh) return;
    
    shootCooldown = shootRate;
    
    // Recoil (camera kick and weapon kick)
    cameraPitch += 0.05; // kick camera up
    recoilOffset = 0.2;  // kick weapon back
    
    // Raycast from camera center
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    // Ignore player mesh for intersections
    const intersects = raycaster.intersectObjects(scene.children, true).filter(
        i => i.object !== playerMesh && !playerMesh.children.includes(i.object)
    );
    
    if (intersects.length > 0) {
        const hit = intersects[0];
        
        // Spawn a temporary impact spark
        const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.copy(hit.point);
        scene.add(spark);
        setTimeout(() => { scene.remove(spark); spark.geometry.dispose(); spark.material.dispose(); }, 200);
        
        // Check if we hit another player (look for their ID)
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

// Networking Setup
function setupNetworking() {
    if (gameState.isHost) {
        loadingStatus.classList.remove('hidden');
        loadingStatus.innerText = '⏳ Creating lobby... (connecting to PeerJS)';

        // Use a plain peer ID so it's shareable
        const peerId = 'arena-' + gameState.roomCode;
        try {
            peer = new window.Peer(peerId);
        } catch(e) {
            loadingStatus.innerText = '❌ PeerJS not loaded. Check your connection.';
            return;
        }

        peer.on('open', (id) => {
            console.log('Host ready, ID:', id);
            loadingStatus.classList.add('hidden');
            // Show the room code prominently so user can share it
            hudRoomCode.innerText = gameState.roomCode;
            enterGame();
        });

        peer.on('connection', (connection) => {
            conn = connection;
            console.log('Player joined!');
            setupConnectionEvents();
        });

        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'unavailable-id') {
                // Room code collision — generate a new one
                gameState.roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
                loadingStatus.innerText = `Code taken! Trying new code: ${gameState.roomCode}...`;
                setTimeout(setupNetworking, 500);
            } else {
                loadingStatus.innerText = `Network error: ${err.type}. Playing solo.`;
                setTimeout(enterGame, 1500);
            }
        });

    } else {
        loadingStatus.classList.remove('hidden');
        loadingStatus.innerText = '⏳ Joining lobby...';

        try {
            peer = new window.Peer();
        } catch(e) {
            loadingStatus.innerText = '❌ PeerJS not loaded.';
            return;
        }

        peer.on('open', (id) => {
            conn = peer.connect('arena-' + gameState.roomCode);
            setupConnectionEvents();
        });

        peer.on('error', (err) => {
            loadingStatus.innerText = `Could not join: ${err.type}. Is the code correct?`;
        });
    }
}

function setupConnectionEvents() {
    conn.on('open', () => {
        console.log('Connected to peer!');
        loadingStatus.classList.add('hidden');
        hudRoomCode.innerText = gameState.roomCode;
        enterGame();
    });
    
    conn.on('data', (data) => {
        if (data.type === 'state') {
            handleNetworkState(data);
        } else if (data.type === 'shoot') {
            handleNetworkShoot(data);
        } else if (data.type === 'death') {
            addCoins(200);
            console.log("Kill! +200 coins");
        }
    });
    
    conn.on('close', () => {
        console.log('Peer disconnected');
        for (const id in networkPlayers) {
            scene.remove(networkPlayers[id]);
            delete networkPlayers[id];
        }
    });
}

function handleNetworkState(data) {
    if (!networkPlayers[data.id]) {
        // Create dummy mesh for remote player
        const geo = new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16);
        const mat = new THREE.MeshStandardMaterial({ color: data.color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        networkPlayers[data.id] = mesh;
    }
    
    const remotePlayer = networkPlayers[data.id];
    // Interpolate later, for now snap
    remotePlayer.position.set(data.pos.x, data.pos.y, data.pos.z);
    remotePlayer.rotation.y = data.rotY;
}

function handleNetworkShoot(data) {
    // Check if I was hit
    if (data.targetId === peer.id) {
        health -= data.damage;
        updateHUD();
        
        // Did I die?
        if (health <= 0) {
            // Simple respawn logic
            health = 100;
            updateHUD();
            playerBody.position.set(0, 5, 0); // Respawn at origin
            if (conn && conn.open) {
                conn.send({ type: 'death' });
            }
        }
    }

    // Spawn VFX at hit point
    const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.copy(data.hitPoint);
    scene.add(spark);
    setTimeout(() => { scene.remove(spark); spark.geometry.dispose(); spark.material.dispose(); }, 200);
}

// Phase 2: Setup Player Physics and Model
async function loadPlayer() {
    // Smooth capsule body (2 spheres) so the player glides smoothly and never snags
    const radius = 0.45;
    const sphereShape = new CANNON.Sphere(radius);
    playerBody = new CANNON.Body({
        mass: 75,
        fixedRotation: true,
        linearDamping: 0.8
    });
    playerBody.addShape(sphereShape, new CANNON.Vec3(0, -0.35, 0)); // feet
    playerBody.addShape(sphereShape, new CANNON.Vec3(0, 0.35, 0));  // torso
    
    // Spawn on open floor at (6, 0.9, 6)
    playerBody.position.set(6, 0.9, 6);
    world.addBody(playerBody);

    try {
        const gltf = await gltfLoader.loadAsync('./Low_Poly_Character-8f36aa0e/glb/converted/source.glb');
        playerMesh = gltf.scene;

        // Play built-in GLB animations if any
        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(playerMesh);
            gltf.animations.forEach(clip => mixer.clipAction(clip).play());
            playerMesh.userData.mixer = mixer;
            console.log('Playing', gltf.animations.length, 'built-in animations');
        }

        // Tint all meshes
        playerMesh.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material = child.material.clone();
                child.material.color.setHex(colorIndex);
            }
        });

        playerMesh.scale.set(1, 1, 1);
        scene.add(playerMesh);

        // Load default weapon (AK-47)
        loadWeaponByIndex(0);
    } catch(err) {
        console.error("Failed to load player mesh:", err);
    }
}

const WEAPON_HAND_POS = new THREE.Vector3(0.38, 0.50, 0.10);

// Load weapon by catalog index
async function loadWeaponByIndex(idx) {
    const def = WEAPONS[idx];
    if (!def) return;
    currentWeaponIdx = idx;
    shootRate = def.rate;
    weaponDamage = def.damage;

    // Remove old weapon from player
    if (weaponMesh && playerMesh) {
        playerMesh.remove(weaponMesh);
        weaponMesh = null;
    }

    try {
        const gltf = await gltfLoader.loadAsync(def.file);
        const rawMesh = gltf.scene;

        // Create container group for proper pivot and centering
        const gunContainer = new THREE.Group();

        rawMesh.updateMatrixWorld(true);
        const gunBox = new THREE.Box3().setFromObject(rawMesh);
        const gunCenter = gunBox.getCenter(new THREE.Vector3());
        const gunSize = gunBox.getSize(new THREE.Vector3());

        // Center raw mesh at (0,0,0) inside container
        rawMesh.position.sub(gunCenter);
        gunContainer.add(rawMesh);

        // Auto-scale to handheld weapon size (~0.75 units long)
        const maxDim = Math.max(gunSize.x, gunSize.y, gunSize.z);
        if (maxDim > 0) {
            const s = 0.75 / maxDim;
            gunContainer.scale.set(s, s, s);
        }

        // Auto-orient based on weapon dimensions to face forward
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

        // Place gun directly in the character's right hand
        gunContainer.position.copy(WEAPON_HAND_POS);
        weaponMesh = gunContainer;
        playerMesh.add(weaponMesh);
        console.log(`Weapon attached in hand: ${def.name}`);
    } catch (err) {
        console.error(`Failed to load weapon ${def.name}:`, err);
    }
}

// Phase 1: Load Environment
async function loadEnvironment() {
    loadingStatus.classList.remove('hidden');
    loadingStatus.innerText = "Loading Arena...";

    const mapFile = Math.random() > 0.5 ?
        './FPS_Shooter_Game_Arena_Map_v3-c7e9c3f1/glb/converted/fps_shooter_game_arena_map_v3.glb' :
        './FPS_Shooter_Game_Arena_Map_v4-df281796/glb/converted/fps_shooter_game_arena_map_v4.glb';

    try {
        const gltf = await gltfLoader.loadAsync(mapFile);
        const mapGroup = gltf.scene;

        mapGroup.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // 1. Center the map horizontally and sit it on Y=0
        const sceneBox = new THREE.Box3().setFromObject(mapGroup);
        const sceneCenter = sceneBox.getCenter(new THREE.Vector3());

        mapGroup.position.x = -sceneCenter.x;
        mapGroup.position.z = -sceneCenter.z;
        mapGroup.position.y = -sceneBox.min.y; // lift so floor sits at y=0

        scene.add(mapGroup);

        // 2. Force update world matrices so bounding boxes and vertices are in world space
        mapGroup.updateMatrixWorld(true);

        // 3. Add base static ground plane at y = 0
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        groundBody.position.set(0, 0, 0);
        world.addBody(groundBody);

        // 4. Build exact Trimesh collision bodies for all walls and arena obstacles
        let meshCount = 0;
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
                    for (let i = 0; i < posAttr.count; i++) {
                        indices.push(i);
                    }
                }

                const trimesh = new CANNON.Trimesh(vertices, indices);
                const body = new CANNON.Body({ mass: 0 });
                body.addShape(trimesh);
                world.addBody(body);
                meshCount++;
            } catch (e) {
                console.warn("Could not create trimesh for", child.name, e);
            }
        });

        console.log(`Built ${meshCount} exact Trimesh physics bodies for arena.`);

        // 5. Place player directly on the open floor at (6, 0.9, 6)
        if (playerBody) {
            playerBody.position.set(6, 0.9, 6);
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
        }

        loadingStatus.innerText = "Arena Loaded!";
        setTimeout(() => loadingStatus.classList.add('hidden'), 1000);

    } catch (err) {
        console.error("Failed to load map:", err);
        loadingStatus.innerText = "Failed to load map.";
    }
}


function updatePlayer(delta) {
    if (!playerBody || !gameState.inGame) return;

    // Movement Logic relative to Camera Yaw
    const speed = keys.shift ? sprintSpeed : walkSpeed;
    
    // Handle crouch
    isCrouching = keys.ctrl;
    // Visually lower character or adjust hitbox later, for now just slow down
    const currentSpeed = isCrouching ? speed * 0.5 : speed;

    const direction = new THREE.Vector3();
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;

    direction.normalize();

    // Rotate movement direction by camera's yaw
    if (direction.lengthSq() > 0) {
        const euler = new THREE.Euler(0, cameraYaw, 0, 'YXZ');
        direction.applyEuler(euler);
        
        // Apply velocity but keep current Y velocity (for gravity/falling)
        playerBody.velocity.x = direction.x * currentSpeed;
        playerBody.velocity.z = direction.z * currentSpeed;
        
        // Rotate visual mesh to face movement
        if (playerMesh) {
            const targetAngle = Math.atan2(playerBody.velocity.x, playerBody.velocity.z);
            playerMesh.rotation.y = targetAngle;
        }
    } else {
        // Stop horizontally
        playerBody.velocity.x *= 0.5;
        playerBody.velocity.z *= 0.5;
    }

    // Jump (Raycast downwards to check if grounded)
    if (keys.space) {
        // A simple check if velocity Y is near zero (not robust but okay for now)
        if (Math.abs(playerBody.velocity.y) < 0.1) {
            playerBody.velocity.y = jumpVelocity;
            keys.space = false; // Prevent hold to fly
        }
    }

    // Sync visual mesh to physics body
    if (playerMesh) {
        playerMesh.position.copy(playerBody.position);
        playerMesh.position.y -= 0.8;

        const time = clock.getElapsedTime();
        const speedVal = Math.sqrt(playerBody.velocity.x**2 + playerBody.velocity.z**2);
        const isMoving = speedVal > 0.5;
        const bobRate  = isCrouching ? 8 : (keys.shift ? 18 : 12);

        // Update GLB animation mixer if present
        if (playerMesh.userData.mixer) {
            playerMesh.userData.mixer.update(delta);
        }

        // Whole-body procedural animation (safe — does not touch individual limb meshes)
        if (isMoving) {
            // Walk/run body bob up-down
            playerMesh.position.y += Math.sin(time * bobRate * 2) * 0.04;
            // Subtle side lean while running
            playerMesh.rotation.z = Math.sin(time * bobRate * 0.5) * 0.03;
        } else {
            // Idle breathing sway
            playerMesh.position.y += Math.sin(time * 1.5) * 0.01;
            playerMesh.rotation.z = 0;
        }

        // Crouch: lower the body slightly
        if (isCrouching) playerMesh.position.y -= 0.3;
    }

    // Update Third-Person Camera
    // Orbit around the player
    const orbitDistance = isCrouching ? 2.5 : 4;
    const yOffset = isCrouching ? 0.5 : 1.5;
    
    // Calculate camera position based on spherical coordinates
    const camX = playerBody.position.x + orbitDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const camY = playerBody.position.y + yOffset + orbitDistance * Math.sin(cameraPitch);
    const camZ = playerBody.position.z + orbitDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch);
    
    camera.position.set(camX, camY, camZ);
    
    // Look at player's head/torso
    camera.lookAt(
        playerBody.position.x,
        playerBody.position.y + yOffset,
        playerBody.position.z
    );

    // Update weapon logic
    if (shootCooldown > 0) shootCooldown -= delta;
    if (weaponMesh) {
        // Recover recoil
        if (recoilOffset > 0) {
            recoilOffset -= delta * 2;
            if (recoilOffset < 0) recoilOffset = 0;
        }
        // Maintain hand anchor position and apply kickback along Z
        weaponMesh.position.x = WEAPON_HAND_POS.x;
        weaponMesh.position.y = WEAPON_HAND_POS.y;
        weaponMesh.position.z = WEAPON_HAND_POS.z + recoilOffset;
    }
}

// Main Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    world.step(timeStep, delta, 3);
    
    updatePlayer(delta);
    
    // Broadcast state to peer
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
    
    renderer.render(scene, camera);
}
animate();

// UI Interactions
btnCreateLobby.addEventListener('click', () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    gameState.isHost = true;
    gameState.roomCode = code;
    // Show code BEFORE networking starts so user sees it immediately
    loadingStatus.classList.remove('hidden');
    loadingStatus.innerText = `📋 Your Room Code: ${code}  —  Connecting...`;
    startGame();
});

btnJoinLobby.addEventListener('click', () => {
    const code = inputLobbyCode.value.trim().toUpperCase();
    if (code.length >= 4) {
        gameState.isHost = false;
        gameState.roomCode = code;
        startGame();
    } else {
        inputLobbyCode.style.borderColor = 'red';
        setTimeout(() => inputLobbyCode.style.borderColor = '', 1000);
    }
});

document.getElementById('btn-solo-play').addEventListener('click', () => {
    gameState.isHost = false;
    gameState.roomCode = 'SOLO';
    enterGame();
});

// Shop Interactions
btnCloseShop.addEventListener('click', () => {
    gameState.isShopOpen = false;
    shopMenu.classList.add('hidden');
    canvas.requestPointerLock();
});

// Dynamically build shop buy buttons
WEAPONS.forEach((def, idx) => {
    const btn = document.getElementById(`btn-buy-${def.id}`);
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (idx === 0) {
            loadWeaponByIndex(0);
            return;
        }
        if (gameState.coins >= def.cost) {
            addCoins(-def.cost);
            loadWeaponByIndex(idx);
            WEAPONS.forEach(w => {
                const b = document.getElementById(`btn-buy-${w.id}`);
                if (b) b.innerText = (w.id === def.id) ? 'Equipped ✓' : w.label;
            });
        } else {
            btn.innerText = 'Not enough coins!';
            setTimeout(() => { btn.innerText = def.label; }, 1500);
        }
    });
});

function startGame() {
    loadingStatus.classList.remove('hidden');
    loadingStatus.innerText = '⏳ Initializing...';
    setupNetworking();
}

let gameLoaded = false;
async function enterGame() {
    if (gameLoaded) return;
    gameLoaded = true;

    uiMainMenu.classList.add('hidden');
    uiHud.classList.remove('hidden');
    hudRoomCode.innerText = gameState.roomCode || 'SOLO';
    gameState.inGame = true;

    try {
        canvas.requestPointerLock();
    } catch (e) {}

    await loadPlayer();
    await loadEnvironment();
}

// Handle pointer lock exit
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && gameState.inGame) {
        // Pointer unlocked
    }
});
