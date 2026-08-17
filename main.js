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
let weaponDamage = 25;

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

// Weapon Variables
let weaponMesh;
let raycaster = new THREE.Raycaster();
let shootCooldown = 0;
let shootRate = 0.15; // seconds between shots
let recoilOffset = 0; // for weapon kickback
const bullets = []; // simple tracer lines

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
    loadingStatus.classList.remove('hidden');
    
    if (gameState.isHost) {
        loadingStatus.innerText = "Creating Lobby...";
        peer = new window.Peer('arena-' + gameState.roomCode);
        
        peer.on('open', (id) => {
            console.log('Host Lobby created:', id);
            loadingStatus.innerText = "Waiting for players...";
        });
        
        peer.on('connection', (connection) => {
            conn = connection;
            console.log('Player joined!');
            loadingStatus.classList.add('hidden');
            setupConnectionEvents();
        });
        
    } else {
        loadingStatus.innerText = "Joining Lobby...";
        peer = new window.Peer(); // random id
        
        peer.on('open', (id) => {
            conn = peer.connect('arena-' + gameState.roomCode);
            setupConnectionEvents();
        });
    }
}

function setupConnectionEvents() {
    conn.on('open', () => {
        console.log('Connected to peer!');
        loadingStatus.classList.add('hidden');
    });
    
    conn.on('data', (data) => {
        if (data.type === 'state') {
            handleNetworkState(data);
        } else if (data.type === 'shoot') {
            handleNetworkShoot(data);
        } else if (data.type === 'death') {
            // Target died! Reward me.
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
    // 1. Physics Body (Cylinder representing the player)
    const radius = 0.5;
    const height = 1.6;
    const playerShape = new CANNON.Cylinder(radius, radius, height, 16);
    playerBody = new CANNON.Body({
        mass: 75, // kg
        fixedRotation: true, // Don't tumble
        position: new CANNON.Vec3(0, 5, 0)
    });
    playerBody.addShape(playerShape);
    // Low friction so we don't stick to walls
    playerBody.linearDamping = 0.9;
    world.addBody(playerBody);

    // 2. Load Visual Model
    try {
        const gltf = await gltfLoader.loadAsync('./Low_Poly_Character-8f36aa0e/glb/converted/source.glb');
        playerMesh = gltf.scene;
        
        // Dynamic Character Color
        playerMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Tint the material slightly based on a random color
                if (child.material) {
                    child.material = child.material.clone();
                    child.material.color.setHex(colorIndex);
                }
            }
        });

        // Scale and add
        playerMesh.scale.set(1, 1, 1);
        scene.add(playerMesh);
        
        // Load Weapons after player is ready
        loadWeapons();
    } catch(err) {
        console.error("Failed to load player mesh", err);
    }
}

async function loadWeapons() {
    try {
        // Use the Free Pack weapon GLB - it has proper gun meshes (AK47, M16, pistol)
        const gltf = await gltfLoader.loadAsync('./Free_Pack_-_Weapon-3ee0ae1f/glb/converted/free_pack_weapon.glb');
        
        // Log what's in the scene so we know what to pick
        const meshNames = [];
        gltf.scene.traverse((child) => {
            if (child.isMesh) meshNames.push(child.name);
        });
        console.log('Weapon meshes found:', meshNames);
        
        // The scene may contain multiple weapons + a test map floor.
        // We want to find the largest single weapon object (not the flat floor plane).
        let bestGun = null;
        let bestVolume = 0;
        
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                const box = new THREE.Box3().setFromObject(child);
                const size = box.getSize(new THREE.Vector3());
                
                // Skip flat planes (the test map floor - has very small Y dimension)
                if (size.y < 0.05) return;
                
                const volume = size.x * size.y * size.z;
                if (volume > bestVolume) {
                    bestVolume = volume;
                    bestGun = child;
                }
            }
        });
        
        if (!bestGun) {
            console.warn('Could not find a suitable gun mesh, using entire scene');
            bestGun = gltf.scene;
        }
        
        console.log('Selected gun mesh:', bestGun.name);
        
        // Clone it so we detach it cleanly from original parent
        weaponMesh = bestGun.clone();
        
        // Auto-scale: we want the gun to be about 1.2 units long
        const gunBox = new THREE.Box3().setFromObject(weaponMesh);
        const gunSize = gunBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(gunSize.x, gunSize.y, gunSize.z);
        const desiredSize = 1.2;
        if (maxDim > 0) {
            const s = desiredSize / maxDim;
            weaponMesh.scale.set(s, s, s);
        }

        // Position: right side of character, at hand height
        // These offsets are relative to the playerMesh (character body center)
        weaponMesh.position.set(0.5, 0.9, 0.3);
        weaponMesh.rotation.set(0, Math.PI, 0); // point forward
        
        weaponMesh.castShadow = true;
        weaponMesh.receiveShadow = true;
        
        playerMesh.add(weaponMesh);
        console.log('Gun attached to player!');
        
    } catch (err) {
        console.error('Failed to load weapons:', err);
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

        // 2. Force update world matrices so bounding boxes are correct in world space
        mapGroup.updateMatrixWorld(true);

        // 3. Build a CANNON.Box physics body for EVERY mesh in the arena
        //    This gives us solid walls, platforms, floors — everything!
        let floorY = 0; // track the highest floor surface to spawn player above it
        let meshCount = 0;

        mapGroup.traverse((child) => {
            if (!child.isMesh) return;

            // Compute world-space bounding box for this mesh
            const meshBox = new THREE.Box3().setFromObject(child);
            const meshSize = meshBox.getSize(new THREE.Vector3());
            const meshCenter = meshBox.getCenter(new THREE.Vector3());

            // Skip degenerate meshes (tiny slivers, invisible faces, etc.)
            if (meshSize.x < 0.01 || meshSize.y < 0.01 || meshSize.z < 0.01) return;
            // Skip any single mesh that is larger than 500 units (probably the sky/background)
            if (meshSize.x > 500 || meshSize.z > 500) return;

            // Create a static Box body that matches the mesh bounding box
            const halfExtents = new CANNON.Vec3(
                meshSize.x / 2,
                meshSize.y / 2,
                meshSize.z / 2
            );
            const boxShape = new CANNON.Box(halfExtents);
            const boxBody = new CANNON.Body({ mass: 0 }); // mass=0 → static/immovable
            boxBody.addShape(boxShape);
            boxBody.position.set(meshCenter.x, meshCenter.y, meshCenter.z);
            world.addBody(boxBody);
            meshCount++;

            // Track topmost surface of any relatively flat/floor-like mesh
            // (top of box = meshCenter.y + meshSize.y/2)
            const topSurface = meshCenter.y + meshSize.y / 2;
            if (topSurface > floorY && topSurface < 5) {
                floorY = topSurface;
            }
        });

        console.log(`Built ${meshCount} collision bodies for arena. Floor at Y=${floorY.toFixed(2)}`);

        // 4. Spawn player above the detected floor level
        //    Physics cylinder height = 1.6, so center needs to be at floorY + 0.8 + small gap
        const spawnY = floorY + 0.8 + 2; // 2 unit gap above floor so they don't clip in
        playerBody.position.set(0, spawnY, 0);
        playerBody.velocity.set(0, 0, 0);
        playerBody.angularVelocity.set(0, 0, 0);

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
        playerMesh.position.y -= 0.8; // Offset because cylinder origin is at center
        
        // Procedural Animation (Bobbing) when moving
        const currentSpeedVal = Math.sqrt(playerBody.velocity.x**2 + playerBody.velocity.z**2);
        if (currentSpeedVal > 0.5) {
            const time = clock.getElapsedTime();
            const bobRate = isCrouching ? 10 : (keys.shift ? 20 : 15);
            const bobAmount = 0.05;
            playerMesh.position.y += Math.sin(time * bobRate) * bobAmount;
            
            // Waddle side to side
            playerMesh.rotation.z = Math.sin(time * bobRate * 0.5) * 0.05;
        } else {
            playerMesh.rotation.z = 0;
        }
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
        // Offset weapon Z position based on recoil
        weaponMesh.position.z = 0.5 + recoilOffset;
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
btnCreateLobby.addEventListener('click', async () => {
    // Generate a random 4 letter room code
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    gameState.isHost = true;
    gameState.roomCode = code;
    
    startGame();
});

btnJoinLobby.addEventListener('click', () => {
    const code = inputLobbyCode.value.trim().toUpperCase();
    if (code.length > 0) {
        gameState.isHost = false;
        gameState.roomCode = code;
        startGame();
    }
});

// Shop Interactions
btnCloseShop.addEventListener('click', () => {
    gameState.isShopOpen = false;
    shopMenu.classList.add('hidden');
    canvas.requestPointerLock();
});

btnBuySmg.addEventListener('click', () => {
    if (gameState.coins >= 200) {
        addCoins(-200);
        shootRate = 0.05; // faster
        weaponDamage = 15; // less damage per bullet
        btnBuySmg.innerText = "Equipped";
        btnBuySmg.classList.replace('bg-blue-600', 'bg-gray-600');
        // Tint weapon blue
        if (weaponMesh) {
            weaponMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    child.material.color.setHex(0x3b82f6);
                }
            });
        }
    }
});

btnBuySniper.addEventListener('click', () => {
    if (gameState.coins >= 400) {
        addCoins(-400);
        shootRate = 1.0; // very slow
        weaponDamage = 80; // massive damage
        btnBuySniper.innerText = "Equipped";
        btnBuySniper.classList.replace('bg-purple-600', 'bg-gray-600');
        // Tint weapon purple
        if (weaponMesh) {
            weaponMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    child.material.color.setHex(0xa855f7);
                }
            });
        }
    }
});

function startGame() {
    uiMainMenu.classList.add('hidden');
    uiHud.classList.remove('hidden');
    hudRoomCode.innerText = gameState.roomCode;
    gameState.inGame = true;
    
    // Lock pointer for FPS controls
    canvas.requestPointerLock();
    
    setupNetworking();
    loadEnvironment();
    loadPlayer();
}

// Handle pointer lock exit
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && gameState.inGame) {
        // Show pause menu or main menu (simplified for now)
    }
});
