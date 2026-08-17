import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as CANNON from 'cannon-es';

// =========================================================
// 1. GAME STATE & AUDIO ENGINE
// =========================================================
const gameState = {
    state: 'LOBBY',
    coins: 0,
    uc: 0,
    level: 1,
    matchesPlayed: 0,
    kills: 0,
    damageDealt: 0,
    isHost: false,
    roomCode: 'SOLO',
    inGame: false,
    isShopOpen: false,
    selectedMode: 'SOLO',
    currentOutfit: 'default'
};

let health = 100;
let maxHealth = 100;
let armor = 0;
let maxArmor = 100;

// Networking
let peer, conn;
const networkPlayers = {};
let lastNetTick = 0;
const netTickRate = 0.05;

// Audio System
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    switch (type) {
        case 'shoot_rifle':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
            break;
        case 'shoot_pistol':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
            osc.start(now);
            osc.stop(now + 0.09);
            break;
        case 'empty_click':
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
            osc.start(now);
            osc.stop(now + 0.04);
            break;
        case 'reload_mag_out':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        case 'reload_mag_in':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.setValueAtTime(500, now + 0.08);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;
        case 'reload_slide':
            osc.type = 'square';
            osc.frequency.setValueAtTime(480, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
            break;
        case 'slide_sfx':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;
        case 'jump_sfx':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        case 'buy':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(587, now);
            osc.frequency.setValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
            break;
        case 'hit_metal':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
    }
}

// =========================================================
// 2. THREE.JS SCENE & CANNON PHYSICS
// =========================================================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);
scene.fog = new THREE.FogExp2(0x050811, 0.015);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.35, 3.2);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
const timeStep = 1 / 60;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(20, 50, 30);
dirLight.castShadow = true;
scene.add(dirLight);

const cyanRimLight = new THREE.PointLight(0x06b6d4, 3, 20);
cyanRimLight.position.set(-3, 3, -2);
scene.add(cyanRimLight);

const amberRimLight = new THREE.PointLight(0xf59e0b, 2.5, 20);
amberRimLight.position.set(3, 2, 2);
scene.add(amberRimLight);

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================
// 3. WEAPONS CATALOG
// =========================================================
const SHOP_ITEMS = [
    { id: 'kevlar', category: 'equipment', name: 'Kevlar Vest', cost: 650, icon: '🛡️', type: 'armor', value: 50, dmgVal: 0, rateVal: 0, rangeVal: 0, desc: 'Lightweight body armor.', tip: 'Essential budget protection.' },
    { id: 'helmet', category: 'equipment', name: 'Kevlar + Helmet', cost: 1000, icon: '🪖', type: 'armor', value: 100, dmgVal: 0, rateVal: 0, rangeVal: 0, desc: 'Full ballistic set.', tip: 'Prevents headshot kill.' },
    { id: 'medkit', category: 'equipment', name: 'Tactical Medkit', cost: 300, icon: '💊', type: 'health', value: 100, dmgVal: 0, rateVal: 0, rangeVal: 0, desc: 'Restores health instantly to 100 HP.', tip: 'Use behind cover.' },
    { id: 'fpspist', category: 'pistols', name: 'FPS Pistol', cost: 100, file: './gun_fps_hand.glb', icon: '🔰', type: 'gun', sound: 'shoot_pistol', vfx: 'TypeB', damage: 38, rate: 0.35, magSize: 12, reserve: 60, dmgVal: 38, rateVal: 45, rangeVal: 50, desc: 'Crisp semi-automatic sidearm.', tip: 'High headshot multiplier.' },
    { id: 'uzi', category: 'mid-tier', name: 'UZI Submachine', cost: 200, file: './uzi.glb', icon: '⚡', type: 'gun', sound: 'shoot_rifle', vfx: 'TypeA', damage: 16, rate: 0.07, magSize: 32, reserve: 120, dmgVal: 16, rateVal: 95, rangeVal: 45, desc: 'Blistering fire rate.', tip: 'Run and gun.' },
    { id: 'ak47', category: 'rifles', name: 'AK-47', cost: 0, file: './ak-47_mid-poly.glb', icon: '🔫', type: 'gun', sound: 'shoot_rifle', vfx: 'TypeA', damage: 32, rate: 0.15, magSize: 30, reserve: 90, dmgVal: 32, rateVal: 75, rangeVal: 80, desc: 'Lethal assault rifle.', tip: 'Tap fire precision.' },
    { id: 'm4', category: 'rifles', name: 'M4 Carbine', cost: 150, file: './m4_carbine_rifle.glb', icon: '🪖', type: 'gun', sound: 'shoot_rifle', vfx: 'TypeA', damage: 28, rate: 0.12, magSize: 30, reserve: 90, dmgVal: 28, rateVal: 85, rangeVal: 85, desc: 'Laser-accurate NATO rifle.', tip: 'Smooth recoil.' },
    { id: 'flashbang', category: 'grenades', name: 'Flashbang', cost: 200, icon: '✨', type: 'grenade', dmgVal: 0, rateVal: 50, rangeVal: 70, desc: 'Blinds enemies.', tip: 'Clear corners.' }
];

let selectedShopItem = SHOP_ITEMS.find(i => i.id === 'ak47');

// =========================================================
// 4. VFX MANAGER
// =========================================================
class VFXManager {
    constructor() {
        this.decals = [];
        this.maxDecals = 50;
        this.particles = [];
        this.shotCount = 0;
    }

    createMuzzleFlash(position, type = 'TypeA') {
        const flashGroup = new THREE.Group();
        flashGroup.position.copy(position);

        let color = 0xffaa00;
        let scale = 0.35;
        if (type === 'TypeB') { color = 0x38bdf8; scale = 0.2; }

        const coreGeo = new THREE.SphereGeometry(scale * 0.4, 8, 8);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        flashGroup.add(new THREE.Mesh(coreGeo, coreMat));

        const outerGeo = new THREE.SphereGeometry(scale, 8, 8);
        const outerMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 });
        flashGroup.add(new THREE.Mesh(outerGeo, outerMat));

        scene.add(flashGroup);
        setTimeout(() => {
            scene.remove(flashGroup);
            coreGeo.dispose(); coreMat.dispose();
            outerGeo.dispose(); outerMat.dispose();
        }, 60);
    }

    createShellEjection(position) {
        const shellGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.05, 6);
        const shellMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.position.copy(position);
        scene.add(shell);

        const vel = new THREE.Vector3(Math.random() * 0.4 + 0.3, Math.random() * 0.5 + 0.5, Math.random() * 0.4 - 0.2);
        this.particles.push({ mesh: shell, vel: vel, life: 0.8, gravity: true, rotSpeed: new THREE.Vector3(10, 15, 5) });
    }

    createImpact(point, normal, surfaceType = 'concrete') {
        const count = surfaceType === 'metal' ? 14 : 8;
        let color = surfaceType === 'metal' ? 0xfbbf24 : (surfaceType === 'flesh' ? 0xef4444 : 0x94a3b8);

        for (let i = 0; i < count; i++) {
            const pGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
            const pMat = new THREE.MeshBasicMaterial({ color: color });
            const pMesh = new THREE.Mesh(pGeo, pMat);
            pMesh.position.copy(point);
            scene.add(pMesh);

            const spread = 1.2;
            const vel = new THREE.Vector3(
                normal.x * 2 + (Math.random() - 0.5) * spread,
                normal.y * 2 + (Math.random() - 0.5) * spread + (surfaceType === 'metal' ? 1 : 0),
                normal.z * 2 + (Math.random() - 0.5) * spread
            );
            this.particles.push({ mesh: pMesh, vel: vel, life: 0.45, gravity: true });
        }

        if (surfaceType === 'metal') playSound('hit_metal');
        this.createBulletHole(point, normal);
    }

    createBulletHole(point, normal) {
        const decalGeo = new THREE.CircleGeometry(0.05, 8);
        const decalMat = new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.9 });
        const decal = new THREE.Mesh(decalGeo, decalMat);
        decal.position.copy(point).addScaledVector(normal, 0.005);
        decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        decal.rotation.z = Math.random() * Math.PI * 2;
        scene.add(decal);
        this.decals.push({ mesh: decal, time: Date.now() });

        if (this.decals.length > this.maxDecals) {
            const oldest = this.decals.shift();
            scene.remove(oldest.mesh);
            oldest.mesh.geometry.dispose(); oldest.mesh.material.dispose();
        }
    }

    createBulletTrail(start, end) {
        this.shotCount++;
        const isTracer = this.shotCount % 3 === 0;
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: isTracer ? 0x38bdf8 : 0xf59e0b,
            transparent: true,
            opacity: isTracer ? 0.95 : 0.65
        });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        setTimeout(() => { scene.remove(line); geometry.dispose(); material.dispose(); }, 120);
    }

    update(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            if (p.gravity) p.vel.y -= 9.81 * delta;
            p.mesh.position.addScaledVector(p.vel, delta);
            if (p.rotSpeed) {
                p.mesh.rotation.x += p.rotSpeed.x * delta;
                p.mesh.rotation.y += p.rotSpeed.y * delta;
            }
            if (p.life <= 0) {
                scene.remove(p.mesh);
                p.mesh.geometry.dispose(); p.mesh.material.dispose();
                this.particles.splice(i, 1);
            }
        }
    }
}
const vfxManager = new VFXManager();

// =========================================================
// 5. RELOAD SYSTEM
// =========================================================
class ReloadSystem {
    constructor() {
        this.isReloading = false;
        this.reloadProgress = 0;
        this.reloadDuration = 2.4;
        this.stage = 0;
    }

    startReload(weapon) {
        if (this.isReloading || weapon.ammo >= weapon.magSize || weapon.reserve <= 0) return;
        this.isReloading = true;
        this.reloadProgress = 0;
        this.stage = 1;
        gameState.state = 'RELOADING';

        document.getElementById('reload-bar-container').classList.remove('hidden');
        document.getElementById('ammo-state-label').innerText = 'RELOADING...';
        document.getElementById('ammo-state-label').className = 'text-xs font-bold text-amber-400 uppercase tracking-widest animate-pulse';

        playSound('reload_mag_out');
    }

    update(delta, weapon) {
        if (!this.isReloading) return;

        this.reloadProgress += delta / this.reloadDuration;
        const progressPct = Math.min(100, Math.round(this.reloadProgress * 100));
        document.getElementById('reload-bar-fill').style.width = progressPct + '%';

        if (this.stage === 1 && this.reloadProgress >= 0.45) {
            this.stage = 2;
            playSound('reload_mag_in');
        }

        if (this.stage === 2 && this.reloadProgress >= 0.80) {
            this.stage = 3;
            playSound('reload_slide');
        }

        if (this.reloadProgress >= 1.0) {
            this.completeReload(weapon);
        }
    }

    completeReload(weapon) {
        this.isReloading = false;
        this.reloadProgress = 0;
        this.stage = 0;
        gameState.state = 'PLAYING';

        const needed = weapon.magSize - weapon.ammo;
        const toLoad = Math.min(needed, weapon.reserve);
        weapon.ammo += toLoad;
        weapon.reserve -= toLoad;

        document.getElementById('reload-bar-container').classList.add('hidden');
        document.getElementById('ammo-state-label').innerText = 'READY';
        document.getElementById('ammo-state-label').className = 'text-xs font-bold text-gray-400 uppercase tracking-widest';

        updateHUD();
    }
}
const reloadSystem = new ReloadSystem();

// =========================================================
// 6. WEAPON SYSTEM
// =========================================================
class WeaponSystem {
    constructor() {
        this.current = {
            ...SHOP_ITEMS.find(i => i.id === 'ak47'),
            ammo: 30,
            magSize: 30,
            reserve: 90
        };
        this.mesh = null;
        this.cooldown = 0;
        this.recoilOffset = 0;
        this.isADS = false;
        this.targetFOV = 70;
        this.currentFOV = 70;
        this.handOffset = new THREE.Vector3(0.28, 0.95, 0.25);
    }

    async equip(item) {
        if (!item || !item.file) return;
        this.current = {
            ...item,
            ammo: item.magSize || 30,
            magSize: item.magSize || 30,
            reserve: item.reserve || 90
        };

        if (this.mesh && playerMesh) {
            playerMesh.remove(this.mesh);
            this.mesh = null;
        }

        try {
            const gltf = await gltfLoader.loadAsync(item.file);
            const rawMesh = gltf.scene;

            const container = new THREE.Group();
            rawMesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(rawMesh);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            rawMesh.position.sub(center);
            container.add(rawMesh);

            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const s = 0.75 / maxDim;
                container.scale.set(s, s, s);
            }

            if (size.x > size.y && size.x > size.z) rawMesh.rotation.y = -Math.PI / 2;
            else if (size.y > size.x && size.y > size.z) rawMesh.rotation.x = Math.PI / 2;
            else rawMesh.rotation.y = Math.PI;

            container.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                }
            });

            container.position.copy(this.handOffset);
            this.mesh = container;
            if (playerMesh) playerMesh.add(this.mesh);

            updateHUD();
        } catch (e) {
            console.error('Failed to equip weapon:', e);
        }
    }

    toggleADS(active) {
        this.isADS = active;
        this.targetFOV = active ? 45 : 70;
        const crosshair = document.getElementById('crosshair');
        if (active) crosshair.classList.add('crosshair-ads');
        else crosshair.classList.remove('crosshair-ads');
    }

    fire(camera, sceneChildren) {
        if (this.cooldown > 0 || reloadSystem.isReloading) return;

        if (this.current.ammo <= 0) {
            playSound('empty_click');
            reloadSystem.startReload(this.current);
            return;
        }

        this.current.ammo--;
        this.cooldown = this.current.rate || 0.15;
        this.recoilOffset = this.isADS ? 0.05 : 0.12;

        playSound(this.current.sound || 'shoot_rifle');
        updateHUD();

        const crosshair = document.getElementById('crosshair');
        crosshair.classList.add('crosshair-spread');
        setTimeout(() => crosshair.classList.remove('crosshair-spread'), 100);

        const muzzlePos = new THREE.Vector3();
        if (this.mesh) {
            this.mesh.getWorldPosition(muzzlePos);
            muzzlePos.add(new THREE.Vector3(0, 0.05, -0.4).applyQuaternion(playerMesh.quaternion));
        } else {
            muzzlePos.copy(camera.position);
        }
        vfxManager.createMuzzleFlash(muzzlePos, this.current.vfx || 'TypeA');
        vfxManager.createShellEjection(muzzlePos);

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        const hits = raycaster.intersectObjects(sceneChildren, true).filter(
            h => h.object !== playerMesh && !playerMesh.children.includes(h.object)
        );

        let endPoint = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(60));

        if (hits.length > 0) {
            const hit = hits[0];
            endPoint = hit.point;

            const name = (hit.object.name || '').toLowerCase();
            let surface = 'concrete';
            if (name.includes('metal') || name.includes('pillar') || name.includes('frame')) surface = 'metal';
            else if (name.includes('wood') || name.includes('crate')) surface = 'wood';

            let targetPlayerId = null;
            for (const [id, mesh] of Object.entries(networkPlayers)) {
                if (hit.object === mesh || hit.object.parent === mesh) {
                    targetPlayerId = id;
                    surface = 'flesh';
                    break;
                }
            }

            const normal = hit.face ? hit.face.normal.clone().applyQuaternion(hit.object.quaternion) : new THREE.Vector3(0, 1, 0);
            vfxManager.createImpact(hit.point, normal, surface);

            if (targetPlayerId) {
                gameState.damageDealt += this.current.damage;
                updateStatsModal();
                if (conn && conn.open) {
                    conn.send({
                        type: 'shoot',
                        hitPoint: hit.point,
                        targetId: targetPlayerId,
                        damage: this.current.damage
                    });
                }
            }
        }

        vfxManager.createBulletTrail(muzzlePos, endPoint);

        if (this.current.ammo <= 0) {
            setTimeout(() => reloadSystem.startReload(this.current), 200);
        }
    }

    update(delta, time, isMoving) {
        if (this.cooldown > 0) this.cooldown -= delta;

        if (Math.abs(this.currentFOV - this.targetFOV) > 0.1) {
            this.currentFOV += (this.targetFOV - this.currentFOV) * (delta * 12);
            camera.fov = this.currentFOV;
            camera.updateProjectionMatrix();
        }

        if (this.recoilOffset > 0) {
            this.recoilOffset -= delta * 2;
            if (this.recoilOffset < 0) this.recoilOffset = 0;
        }

        if (this.mesh) {
            const swayX = isMoving ? Math.sin(time * 10) * 0.02 : Math.sin(time * 1.5) * 0.005;
            const swayY = isMoving ? Math.cos(time * 20) * 0.015 : Math.cos(time * 2) * 0.005;

            if (this.isADS) {
                this.mesh.position.set(0.08, 1.15, 0.35 + this.recoilOffset);
            } else {
                this.mesh.position.set(
                    this.handOffset.x + swayX,
                    this.handOffset.y + swayY,
                    this.handOffset.z + this.recoilOffset
                );
            }
        }
    }
}
const weaponSystem = new WeaponSystem();

// =========================================================
// 7. COMPLETE CHARACTER RIGGING & PROCEDURAL ANIMATIONS
// (IDLE, WALK, RUN, RELOAD, SLIDE, JUMP, PEEK)
// =========================================================
let playerBody, playerMesh;
let playerFeetOffsetY = 0;

// Hierarchical Rig Groups
let paladinLimbs = {
    rightArm: [],
    leftArm: [],
    rightLeg: [],
    leftLeg: [],
    torso: [],
    head: []
};

let cameraYaw = 0;
let cameraPitch = 0;
let peekOffset = 0; // Current peek lerp value (-1 to +1)
let slideTimer = 0; // Active slide duration
let slideDirection = new THREE.Vector3();
let isCrouching = false;
let colorIndex = Math.floor(Math.random() * 0xffffff);

let isDraggingLobby = false;
let previousMouseX = 0;

const walkSpeed = 5.5;
const sprintSpeed = 9.5;
const jumpVelocity = 6.5;

let textures = {};

async function loadCharacter() {
    const radius = 0.45;
    const sphereShape = new CANNON.Sphere(radius);
    playerBody = new CANNON.Body({
        mass: 75,
        fixedRotation: true,
        linearDamping: 0.8
    });
    playerBody.addShape(sphereShape, new CANNON.Vec3(0, -0.35, 0));
    playerBody.addShape(sphereShape, new CANNON.Vec3(0, 0.35, 0));
    playerBody.position.set(0, 0.8, 0);
    world.addBody(playerBody);

    try {
        const fbx = await fbxLoader.loadAsync('./New_Character/fbx/stylized_paladin_fbx_extracted/Stylized_Paladin.fbx');
        playerMesh = fbx;

        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
            const s = 1.75 / size.y;
            fbx.scale.set(s, s, s);
        }

        fbx.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(fbx);
        playerFeetOffsetY = scaledBox.min.y;

        const basePath = './New_Character/fbx/stylized_paladin_fbx_extracted/Textures/';
        textures.armor = texLoader.load(basePath + 'Armor_Base_color.png');
        textures.body = texLoader.load(basePath + 'Body_Base_color.png');
        textures.hair = texLoader.load(basePath + 'Hair_Color.png');
        textures.eye = texLoader.load(basePath + 'Eye_Iris_Color.png');

        Object.values(textures).forEach(t => { t.colorSpace = THREE.SRGBColorSpace; });

        paladinLimbs = { rightArm: [], leftArm: [], rightLeg: [], leftLeg: [], torso: [], head: [] };

        fbx.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;

            const name = (child.name || '').toLowerCase();
            const matName = (child.material?.name || '').toLowerCase();

            let tex = textures.body;
            let isArmor = false;
            if (name.includes('armor') || name.includes('boot') || name.includes('neck') || matName.includes('armor')) {
                tex = textures.armor;
                isArmor = true;
            } else if (name.includes('hair') || name.includes('eyebrow') || name.includes('eyelash') || matName.includes('hair')) {
                tex = textures.hair;
            } else if (name.includes('eye') || matName.includes('eye')) {
                tex = textures.eye;
            }

            child.material = new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.45,
                metalness: isArmor ? 0.35 : 0.05,
                side: THREE.DoubleSide
            });

            const mBox = new THREE.Box3().setFromObject(child);
            const mCenter = mBox.getCenter(new THREE.Vector3());

            if (name.includes('arm_armor')) {
                if (mCenter.x > 0) paladinLimbs.rightArm.push(child);
                else paladinLimbs.leftArm.push(child);
            } else if (name.includes('boot_armor')) {
                if (mCenter.x > 0) paladinLimbs.rightLeg.push(child);
                else paladinLimbs.leftLeg.push(child);
            } else if (name.includes('hair') || name.includes('eye')) {
                paladinLimbs.head.push(child);
            } else {
                paladinLimbs.torso.push(child);
            }
        });

        // Initialize default combat pose
        paladinLimbs.rightArm.forEach(m => {
            m.rotation.x = -Math.PI / 4;
            m.rotation.z = Math.PI / 10;
        });
        paladinLimbs.leftArm.forEach(m => {
            m.rotation.x = -Math.PI / 3;
            m.rotation.y = Math.PI / 5;
        });

        scene.add(playerMesh);

        // Equip default weapon in lobby
        await weaponSystem.equip(SHOP_ITEMS.find(i => i.id === 'ak47'));

    } catch (err) {
        console.error('Failed to load Paladin character:', err);
    }
}

// 3D Lobby Platform Setup
let lobbyPedestal, lobbyBackgroundMesh;
function buildLobbyPlatform() {
    lobbyPedestal = new THREE.Group();

    const deckGeo = new THREE.CylinderGeometry(2.4, 2.6, 0.25, 48);
    const deckMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.2,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.y = -0.13;
    lobbyPedestal.add(deckMesh);

    const neonRingGeo = new THREE.TorusGeometry(2.35, 0.05, 16, 64);
    const neonRingMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const neonRing = new THREE.Mesh(neonRingGeo, neonRingMat);
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.y = 0.01;
    lobbyPedestal.add(neonRing);

    const innerRingGeo = new THREE.TorusGeometry(1.5, 0.03, 16, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.02;
    lobbyPedestal.add(innerRing);

    texLoader.load('./cyberpunk-asus-rog-1920x1080-19780.jpg', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const bgGeo = new THREE.SphereGeometry(25, 32, 16);
        const bgMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
        lobbyBackgroundMesh = new THREE.Mesh(bgGeo, bgMat);
        lobbyBackgroundMesh.rotation.y = -Math.PI / 4;
        scene.add(lobbyBackgroundMesh);
    });

    scene.add(lobbyPedestal);
}
buildLobbyPlatform();

// =========================================================
// 8. ARENA MAP ENVIRONMENT & COLLISION
// =========================================================
async function loadArenaEnvironment() {
    const mapFile = './FPS_Shooter_Game_Arena_Map_v3-c7e9c3f1/glb/converted/fps_shooter_game_arena_map_v3.glb';

    try {
        const gltf = await gltfLoader.loadAsync(mapFile);
        const mapGroup = gltf.scene;

        mapGroup.traverse(child => {
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

        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        groundBody.position.set(0, 0, 0);
        world.addBody(groundBody);

        mapGroup.traverse(child => {
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
                if (geo.index) indices = Array.from(geo.index.array);
                else {
                    for (let i = 0; i < posAttr.count; i++) indices.push(i);
                }

                const trimesh = new CANNON.Trimesh(vertices, indices);
                const body = new CANNON.Body({ mass: 0 });
                body.addShape(trimesh);
                world.addBody(body);
            } catch (e) {}
        });

        if (playerBody) {
            playerBody.position.set(6, 0.9, 6);
            playerBody.velocity.set(0, 0, 0);
        }
    } catch (e) {
        console.error('Failed to load arena:', e);
    }
}

// =========================================================
// 9. INPUT HANDLING (Movement, Jump, Slide, Peek Q/E)
// =========================================================
const keys = {
    w: false, a: false, s: false, d: false,
    shift: false, ctrl: false, space: false,
    q: false, e: false, c: false
};

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
    if (e.shiftKey) keys.shift = true;
    if (e.ctrlKey) keys.ctrl = true;
    if (e.code === 'Space') keys.space = true;

    // Trigger Combat Slide with 'C' or 'Ctrl' while moving
    if ((k === 'c' || e.ctrlKey) && keys.shift && gameState.inGame && slideTimer <= 0) {
        slideTimer = 0.8;
        playSound('slide_sfx');
        if (playerBody) {
            slideDirection.set(playerBody.velocity.x, 0, playerBody.velocity.z).normalize();
            playerBody.velocity.x = slideDirection.x * 14;
            playerBody.velocity.z = slideDirection.z * 14;
        }
    }

    if (k === 'r' && gameState.inGame && !gameState.isShopOpen) {
        reloadSystem.startReload(weaponSystem.current);
    }

    if (k === 'b' && gameState.inGame) {
        toggleShop();
    }
});

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
    if (!e.shiftKey) keys.shift = false;
    if (!e.ctrlKey) keys.ctrl = false;
    if (e.code === 'Space') keys.space = false;
});

// Mouse Controls
window.addEventListener('mousedown', (e) => {
    if (!gameState.inGame && e.button === 0) {
        isDraggingLobby = true;
        previousMouseX = e.clientX;
    } else if (document.pointerLockElement === canvas && gameState.inGame && !gameState.isShopOpen) {
        if (e.button === 0) {
            weaponSystem.fire(camera, scene.children);
        } else if (e.button === 2) {
            weaponSystem.toggleADS(true);
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (!gameState.inGame && isDraggingLobby && playerMesh) {
        const deltaX = e.clientX - previousMouseX;
        previousMouseX = e.clientX;
        playerMesh.rotation.y += deltaX * 0.008;
    } else if (document.pointerLockElement === canvas && gameState.inGame && !gameState.isShopOpen) {
        const sens = weaponSystem.isADS ? 0.0012 : 0.0022;
        cameraYaw -= e.movementX * sens;
        cameraPitch -= e.movementY * sens;
        cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraPitch));
    }
});

window.addEventListener('mouseup', (e) => {
    if (!gameState.inGame) {
        isDraggingLobby = false;
    }
    if (e.button === 2 && gameState.inGame) {
        weaponSystem.toggleADS(false);
    }
});

window.addEventListener('contextmenu', e => e.preventDefault());

// =========================================================
// 10. UI, MODALS, CHAT & INVENTORY LOCKER
// =========================================================
function updateHUD() {
    document.getElementById('coin-display').innerText = gameState.coins.toLocaleString();
    document.getElementById('lobby-coins').innerText = gameState.coins.toLocaleString();
    document.getElementById('lobby-uc').innerText = gameState.uc.toLocaleString();
    document.getElementById('shop-coins').innerText = gameState.coins.toLocaleString();

    document.getElementById('health-value').innerText = Math.max(0, Math.round(health));
    document.getElementById('health-bar-fill').style.width = Math.max(0, (health / maxHealth) * 100) + '%';

    document.getElementById('armor-value').innerText = Math.max(0, Math.round(armor));
    document.getElementById('armor-bar-fill').style.width = Math.max(0, (armor / maxArmor) * 100) + '%';

    if (weaponSystem.current) {
        document.getElementById('hud-weapon-name').innerText = weaponSystem.current.name;
        document.getElementById('ammo-current').innerText = weaponSystem.current.ammo;
        document.getElementById('ammo-reserve').innerText = weaponSystem.current.reserve;

        const container = document.getElementById('ammo-counter-container');
        if (weaponSystem.current.ammo <= 5 && weaponSystem.current.ammo > 0) {
            container.classList.add('ammo-low');
        } else {
            container.classList.remove('ammo-low');
        }
    }
}

function updateStatsModal() {
    document.getElementById('stat-matches').innerText = gameState.matchesPlayed;
    document.getElementById('stat-kills').innerText = gameState.kills;
    document.getElementById('stat-damage').innerText = gameState.damageDealt;
    const kd = gameState.matchesPlayed > 0 ? (gameState.kills / gameState.matchesPlayed).toFixed(2) : (gameState.kills).toFixed(2);
    document.getElementById('stat-kd').innerText = kd;
}

function flashDamageIndicator() {
    const flash = document.getElementById('damage-flash');
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 220);
}

function addKillFeed(text) {
    const feed = document.getElementById('kill-feed');
    const item = document.createElement('div');
    item.className = 'kill-feed-item text-white flex items-center gap-2 shadow-lg';
    item.innerHTML = `<span>⚔️</span> <span>${text}</span>`;
    feed.appendChild(item);
    setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 300);
    }, 4000);
}

// World Chat
const modalChat = document.getElementById('modal-chat');
const btnOpenChat = document.getElementById('btn-open-chat');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessagesContainer = document.getElementById('chat-messages-container');
const chatPreviewText = document.getElementById('chat-preview-text');

btnOpenChat.addEventListener('click', () => {
    modalChat.classList.remove('hidden');
    chatInput.focus();
});
btnCloseChat.addEventListener('click', () => modalChat.classList.add('hidden'));

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;

    if (chatMessagesContainer.innerText.includes('No messages in global channel yet.')) {
        chatMessagesContainer.innerHTML = '';
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgEl = document.createElement('div');
    msgEl.className = 'bg-white/5 p-2 rounded-lg border border-white/5';
    msgEl.innerHTML = `<span class="text-cyan-400 font-bold font-mono">[Recruit]</span> <span class="text-gray-400 text-[10px]">${timeStr}</span>: <span class="text-white">${msg}</span>`;
    chatMessagesContainer.appendChild(msgEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    chatPreviewText.innerText = msg;
    chatInput.value = '';

    if (conn && conn.open) {
        conn.send({ type: 'chat', text: msg });
    }
});

// Season 1 Modal
const modalSeason = document.getElementById('modal-season');
document.getElementById('btn-nav-season').addEventListener('click', () => {
    updateStatsModal();
    modalSeason.classList.remove('hidden');
});
document.getElementById('btn-close-season').addEventListener('click', () => modalSeason.classList.add('hidden'));

// Royale Pass Modal
const modalRp = document.getElementById('modal-rp');
document.getElementById('btn-rp').addEventListener('click', () => modalRp.classList.remove('hidden'));
document.getElementById('btn-close-rp').addEventListener('click', () => modalRp.classList.add('hidden'));

// Inventory Locker Modal
const modalInventory = document.getElementById('modal-inventory');
document.getElementById('btn-open-inventory-locker').addEventListener('click', () => modalInventory.classList.remove('hidden'));
document.getElementById('btn-nav-inventory').addEventListener('click', () => modalInventory.classList.remove('hidden'));
document.getElementById('btn-close-inventory').addEventListener('click', () => modalInventory.classList.add('hidden'));

const tabInvOutfits = document.getElementById('tab-inv-outfits');
const tabInvGuns = document.getElementById('tab-inv-guns');
const gridInvOutfits = document.getElementById('grid-inv-outfits');
const gridInvGuns = document.getElementById('grid-inv-guns');

tabInvOutfits.addEventListener('click', () => {
    tabInvOutfits.className = 'text-cyan-400 border-b-2 border-cyan-400 pb-1 font-bold';
    tabInvGuns.className = 'text-gray-400 hover:text-white pb-1 font-bold';
    gridInvOutfits.classList.remove('hidden');
    gridInvGuns.classList.add('hidden');
});

tabInvGuns.addEventListener('click', () => {
    tabInvGuns.className = 'text-cyan-400 border-b-2 border-cyan-400 pb-1 font-bold';
    tabInvOutfits.className = 'text-gray-400 hover:text-white pb-1 font-bold';
    gridInvGuns.classList.remove('hidden');
    gridInvOutfits.classList.add('hidden');
});

// Outfit Swapping
document.querySelectorAll('#grid-inv-outfits .inv-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('#grid-inv-outfits .inv-card').forEach(c => {
            c.classList.remove('equipped');
            c.querySelector('span').className = 'text-xs font-bold text-cyan-400 font-mono';
            c.querySelector('span').innerText = 'CLICK TO EQUIP';
        });
        card.classList.add('equipped');
        card.querySelector('span').className = 'text-xs font-bold text-amber-400 font-mono';
        card.querySelector('span').innerText = 'EQUIPPED ✓';

        const outfit = card.getAttribute('data-outfit');
        gameState.currentOutfit = outfit;
        applyOutfitToModel(outfit);
        playSound('buy');
    });
});

function applyOutfitToModel(outfit) {
    if (!playerMesh) return;
    playerMesh.traverse(child => {
        if (child.isMesh && child.material) {
            if (outfit === 'assassin') {
                child.material.color.setHex(0x334155);
            } else if (outfit === 'vanguard') {
                child.material.color.setHex(0x06b6d4);
            } else {
                child.material.color.setHex(0xffffff);
            }
        }
    });
}

// Gun skin swapping
document.querySelectorAll('#grid-inv-guns .inv-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('#grid-inv-guns .inv-card').forEach(c => {
            c.classList.remove('equipped');
            c.querySelector('span').className = 'text-xs font-bold text-cyan-400 font-mono';
            c.querySelector('span').innerText = 'CLICK TO EQUIP';
        });
        card.classList.add('equipped');
        card.querySelector('span').className = 'text-xs font-bold text-amber-400 font-mono';
        card.querySelector('span').innerText = 'EQUIPPED ✓';

        const gunId = card.getAttribute('data-gun');
        const item = SHOP_ITEMS.find(i => i.id === gunId);
        if (item) {
            weaponSystem.equip(item);
            playSound('reload_slide');
        }
    });
});

// Mode Selector
const modalModeSelect = document.getElementById('modal-mode-select');
document.getElementById('btn-open-mode-modal').addEventListener('click', () => modalModeSelect.classList.remove('hidden'));
document.getElementById('mode-badge-card').addEventListener('click', () => modalModeSelect.classList.remove('hidden'));
document.getElementById('btn-close-mode-modal').addEventListener('click', () => modalModeSelect.classList.add('hidden'));

document.getElementById('mode-opt-solo').addEventListener('click', () => {
    gameState.selectedMode = 'SOLO';
    gameState.roomCode = 'SOLO';
    document.getElementById('current-mode-tag').innerText = 'EvoGround (TPP)';
    document.getElementById('current-mode-desc').innerText = 'Selected: Arena Metropolis';
    document.getElementById('lobby-room-code-tag').innerText = 'SOLO PRACTICE';
    modalModeSelect.classList.add('hidden');
});

document.getElementById('mode-opt-host').addEventListener('click', () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    gameState.selectedMode = 'HOST';
    gameState.isHost = true;
    gameState.roomCode = code;
    document.getElementById('current-mode-tag').innerText = 'P2P MULTIPLAYER';
    document.getElementById('current-mode-desc').innerText = `Room Host: ${code}`;
    document.getElementById('lobby-room-code-tag').innerText = `ROOM: ${code}`;
    modalModeSelect.classList.add('hidden');
});

document.getElementById('btn-modal-join').addEventListener('click', () => {
    const code = document.getElementById('modal-input-code').value.trim().toUpperCase();
    if (code.length >= 4) {
        gameState.selectedMode = 'JOIN';
        gameState.isHost = false;
        gameState.roomCode = code;
        document.getElementById('current-mode-tag').innerText = 'P2P MULTIPLAYER';
        document.getElementById('current-mode-desc').innerText = `Joining Room: ${code}`;
        document.getElementById('lobby-room-code-tag').innerText = `ROOM: ${code}`;
        modalModeSelect.classList.add('hidden');
    }
});

document.getElementById('btn-pubg-start').addEventListener('click', () => {
    playSound('reload_slide');
    document.getElementById('btn-pubg-start').innerHTML = '<span>DEPLOYING...</span>';
    setupNetworking();
});

// In-Game Buy Menu
function renderBuyMenu() {
    const cols = {
        'equipment': document.getElementById('col-equipment'),
        'pistols': document.getElementById('col-pistols'),
        'mid-tier': document.getElementById('col-mid-tier'),
        'rifles': document.getElementById('col-rifles'),
        'grenades': document.getElementById('col-grenades')
    };

    Object.values(cols).forEach(c => { if (c) c.innerHTML = ''; });

    SHOP_ITEMS.forEach((item) => {
        const parent = cols[item.category];
        if (!parent) return;

        const card = document.createElement('div');
        const isEquipped = weaponSystem.current?.id === item.id;
        const isSelected = selectedShopItem?.id === item.id;

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

        card.addEventListener('mouseenter', () => selectShopItem(item));
        card.addEventListener('click', () => {
            selectShopItem(item);
            buyItem();
        });

        parent.appendChild(card);
    });
}

function selectShopItem(item) {
    selectedShopItem = item;

    document.querySelectorAll('.cs-card').forEach(c => c.classList.remove('selected'));
    const active = document.getElementById(`buy-card-${item.id}`);
    if (active) active.classList.add('selected');

    document.getElementById('inspect-icon').innerText = item.icon;
    document.getElementById('inspect-title').innerText = item.name;
    document.getElementById('inspect-cost').innerText = item.cost === 0 ? 'FREE' : `$ ${item.cost}`;

    document.getElementById('inspect-stat-dmg').innerText = item.dmgVal ?? '-';
    document.getElementById('inspect-stat-rate').innerText = item.rateVal ? `${item.rateVal}%` : '-';
    document.getElementById('inspect-stat-range').innerText = item.rangeVal ? `${item.rangeVal}%` : '-';

    document.getElementById('inspect-bar-dmg').style.width = (item.dmgVal || 20) + '%';
    document.getElementById('inspect-bar-rate').style.width = (item.rateVal || 40) + '%';
    document.getElementById('inspect-bar-range').style.width = (item.rangeVal || 50) + '%';

    document.getElementById('inspect-desc').innerText = `• ${item.desc}`;
    document.getElementById('inspect-tip').innerText = `• ${item.tip}`;

    const btnBuy = document.getElementById('btn-inspect-buy');
    if (weaponSystem.current?.id === item.id) {
        btnBuy.innerText = 'EQUIPPED ✓';
        btnBuy.className = 'w-full py-3 mt-4 bg-emerald-800 text-emerald-200 font-heading text-xl font-bold rounded-xl cursor-default';
    } else {
        btnBuy.innerText = item.cost === 0 ? 'EQUIP FREE' : `BUY FOR $${item.cost}`;
        btnBuy.className = 'w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-heading text-xl font-bold rounded-xl tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all cursor-pointer';
    }
}

function buyItem() {
    if (!selectedShopItem) return;

    if (selectedShopItem.type === 'armor') {
        if (gameState.coins >= selectedShopItem.cost) {
            gameState.coins -= selectedShopItem.cost;
            armor = Math.min(maxArmor, armor + selectedShopItem.value);
            playSound('buy');
            updateHUD();
            renderBuyMenu();
        } else playSound('error');
    } else if (selectedShopItem.type === 'health') {
        if (gameState.coins >= selectedShopItem.cost) {
            gameState.coins -= selectedShopItem.cost;
            health = maxHealth;
            playSound('buy');
            updateHUD();
            renderBuyMenu();
        } else playSound('error');
    } else if (selectedShopItem.type === 'gun') {
        if (weaponSystem.current?.id === selectedShopItem.id) {
            playSound('reload_slide');
            return;
        }
        if (gameState.coins >= selectedShopItem.cost) {
            gameState.coins -= selectedShopItem.cost;
            weaponSystem.equip(selectedShopItem);
            playSound('buy');
            renderBuyMenu();
            selectShopItem(selectedShopItem);
        } else playSound('error');
    }
}

document.getElementById('btn-inspect-buy').addEventListener('click', buyItem);

function toggleShop() {
    gameState.isShopOpen = !gameState.isShopOpen;
    const shop = document.getElementById('shop-menu');
    if (gameState.isShopOpen) {
        document.exitPointerLock();
        shop.classList.remove('hidden');
        renderBuyMenu();
        if (selectedShopItem) selectShopItem(selectedShopItem);
    } else {
        shop.classList.add('hidden');
        if (gameState.inGame) canvas.requestPointerLock();
    }
}

document.getElementById('btn-close-shop').addEventListener('click', toggleShop);

// Networking
function setupNetworking() {
    if (gameState.isHost) {
        try {
            peer = new window.Peer('arena-' + gameState.roomCode);
        } catch (e) {
            enterGame();
            return;
        }
        peer.on('open', () => enterGame());
        peer.on('connection', c => { conn = c; setupNetEvents(); });
        peer.on('error', () => enterGame());
    } else if (gameState.selectedMode === 'JOIN') {
        try {
            peer = new window.Peer();
        } catch (e) {
            enterGame();
            return;
        }
        peer.on('open', () => {
            conn = peer.connect('arena-' + gameState.roomCode);
            setupNetEvents();
        });
        peer.on('error', () => enterGame());
    } else {
        enterGame();
    }
}

function setupNetEvents() {
    conn.on('open', () => enterGame());
    conn.on('data', data => {
        if (data.type === 'state') handleNetworkState(data);
        else if (data.type === 'shoot') handleNetworkDamage(data);
        else if (data.type === 'chat') {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const msgEl = document.createElement('div');
            msgEl.className = 'bg-white/5 p-2 rounded-lg border border-white/5';
            msgEl.innerHTML = `<span class="text-amber-400 font-bold font-mono">[Agent]</span> <span class="text-gray-400 text-[10px]">${timeStr}</span>: <span class="text-white">${data.text}</span>`;
            chatMessagesContainer.appendChild(msgEl);
            chatPreviewText.innerText = data.text;
        } else if (data.type === 'death') {
            gameState.kills++;
            gameState.coins += 500;
            addKillFeed('Eliminated Enemy Agent (+500 Coins)');
            updateStatsModal();
            updateHUD();
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

function handleNetworkDamage(data) {
    if (data.targetId === peer?.id) {
        let dmg = data.damage;
        flashDamageIndicator();
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

// Enter Game
let gameStarted = false;
async function enterGame() {
    if (gameStarted) return;
    gameStarted = true;

    gameState.matchesPlayed++;
    updateStatsModal();

    document.getElementById('main-menu').classList.add('hidden');
    modalModeSelect.classList.add('hidden');
    modalInventory.classList.add('hidden');
    modalSeason.classList.add('hidden');
    modalChat.classList.add('hidden');
    modalRp.classList.add('hidden');

    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hud-room-code').innerText = gameState.roomCode;
    gameState.inGame = true;
    gameState.state = 'PLAYING';

    if (lobbyPedestal) scene.remove(lobbyPedestal);
    if (lobbyBackgroundMesh) scene.remove(lobbyBackgroundMesh);

    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

    try { canvas.requestPointerLock(); } catch (e) {}

    await loadArenaEnvironment();
    updateHUD();
}

// =========================================================
// 11. MAIN GAME LOOP & ANIMATION CONTROLLER
// =========================================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    vfxManager.update(delta);
    reloadSystem.update(delta, weaponSystem.current);

    if (!gameState.inGame) {
        // LOBBY IDLE ANIMATION
        if (playerMesh) {
            playerMesh.position.set(0, 0.02, 0);

            // Subtle idle breathing
            const breathe = Math.sin(time * 2) * 0.008;
            paladinLimbs.torso.forEach(m => m.position.y = breathe);
            paladinLimbs.head.forEach(m => m.position.y = breathe);
            paladinLimbs.rightArm.forEach(m => {
                m.rotation.x = -Math.PI / 4 + Math.sin(time * 2) * 0.02;
                m.rotation.z = Math.PI / 10;
            });
            paladinLimbs.leftArm.forEach(m => {
                m.rotation.x = -Math.PI / 3 + Math.sin(time * 2) * 0.015;
                m.rotation.y = Math.PI / 5;
            });
        }
        camera.position.set(0, 1.35, 3.2);
        camera.lookAt(0, 0.85, 0);
    } else {
        world.step(timeStep, delta, 3);
        updatePlayerAnimationController(delta, time);

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

function updatePlayerAnimationController(delta, time) {
    if (!playerBody || !gameState.inGame) return;

    // Out-of-bounds Reset
    if (playerBody.position.y < -2.0) {
        playerBody.position.set(6, 0.9, 6);
        playerBody.velocity.set(0, 0, 0);
        playerBody.angularVelocity.set(0, 0, 0);
    }

    // Slide state timer
    const isSliding = slideTimer > 0;
    if (isSliding) {
        slideTimer -= delta;
        playerBody.velocity.x *= 0.96;
        playerBody.velocity.z *= 0.96;
    }

    const isSprinting = keys.shift && !keys.ctrl && !isSliding;
    isCrouching = keys.ctrl && !isSliding;
    const speed = isSliding ? 0 : (isSprinting ? sprintSpeed : (isCrouching ? walkSpeed * 0.5 : walkSpeed));

    const direction = new THREE.Vector3();
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;

    direction.normalize();
    const isMoving = direction.lengthSq() > 0 && !isSliding;

    if (isMoving) {
        const euler = new THREE.Euler(0, cameraYaw, 0, 'YXZ');
        direction.applyEuler(euler);
        playerBody.velocity.x = direction.x * speed;
        playerBody.velocity.z = direction.z * speed;

        if (playerMesh) {
            playerMesh.rotation.y = Math.atan2(playerBody.velocity.x, playerBody.velocity.z);
        }
    } else if (!isSliding) {
        playerBody.velocity.x *= 0.5;
        playerBody.velocity.z *= 0.5;
    }

    // JUMP Handling
    const isGrounded = Math.abs(playerBody.velocity.y) < 0.15;
    if (keys.space && isGrounded && !isSliding) {
        playerBody.velocity.y = jumpVelocity;
        playSound('jump_sfx');
        keys.space = false;
    }

    // PEEK Q/E Target Lerp
    let targetPeek = 0;
    if (keys.q) targetPeek = 1;      // Lean left
    else if (keys.e) targetPeek = -1; // Lean right
    peekOffset += (targetPeek - peekOffset) * (delta * 10);

    // Sync mesh to physics body with grounded feet offset
    if (playerMesh) {
        const groundContactY = playerBody.position.y - 0.7;
        playerMesh.position.x = playerBody.position.x;
        playerMesh.position.z = playerBody.position.z;
        playerMesh.position.y = groundContactY - playerFeetOffsetY;

        // Apply Peek Tilt to Torso & Head
        const peekTilt = peekOffset * 0.35;

        // ==========================================
        // 1. SLIDE ANIMATION
        // ==========================================
        if (isSliding) {
            playerMesh.position.y -= 0.35;
            paladinLimbs.torso.forEach(m => {
                m.rotation.x = -0.35;
                m.rotation.z = peekTilt;
            });
            paladinLimbs.rightLeg.forEach(m => m.rotation.x = -1.1); // Front leg slide
            paladinLimbs.leftLeg.forEach(m => m.rotation.x = 0.6);   // Back leg tucked
            paladinLimbs.rightArm.forEach(m => {
                m.rotation.x = -Math.PI / 4;
                m.rotation.z = Math.PI / 10;
            });
            paladinLimbs.leftArm.forEach(m => {
                m.rotation.x = -Math.PI / 3;
                m.rotation.y = Math.PI / 5;
            });

        // ==========================================
        // 2. JUMP / AIR ANIMATION
        // ==========================================
        } else if (!isGrounded) {
            paladinLimbs.torso.forEach(m => {
                m.rotation.x = 0.1;
                m.rotation.z = peekTilt;
            });
            paladinLimbs.rightLeg.forEach(m => m.rotation.x = -0.45); // Legs tucked
            paladinLimbs.leftLeg.forEach(m => m.rotation.x = -0.45);
            paladinLimbs.rightArm.forEach(m => m.rotation.x = -Math.PI / 3.5);
            paladinLimbs.leftArm.forEach(m => m.rotation.x = -Math.PI / 2.8);

        // ==========================================
        // 3. WALK / RUN ANIMATION
        // ==========================================
        } else if (isMoving) {
            const bobRate = isSprinting ? 16 : (isCrouching ? 8 : 11);
            const strideAmp = isSprinting ? 0.75 : 0.45;
            const legSwing = Math.sin(time * bobRate) * strideAmp;

            paladinLimbs.rightLeg.forEach(m => m.rotation.x = -legSwing);
            paladinLimbs.leftLeg.forEach(m => m.rotation.x = legSwing);

            paladinLimbs.torso.forEach(m => {
                m.rotation.x = isSprinting ? 0.22 : 0.05; // Lean forward on sprint
                m.rotation.z = peekTilt + Math.sin(time * bobRate * 0.5) * 0.02;
            });

            // Reload left arm override during reload
            if (reloadSystem.isReloading) {
                animateReloadArm(reloadSystem.reloadProgress);
            } else {
                paladinLimbs.rightArm.forEach(m => {
                    m.rotation.x = -Math.PI / 4 + Math.sin(time * bobRate) * (isSprinting ? 0.18 : 0.08);
                    m.rotation.z = Math.PI / 10;
                });
                paladinLimbs.leftArm.forEach(m => {
                    m.rotation.x = -Math.PI / 3 - Math.sin(time * bobRate) * (isSprinting ? 0.18 : 0.08);
                    m.rotation.y = Math.PI / 5;
                });
            }

            playerMesh.position.y += Math.sin(time * bobRate * 2) * (isSprinting ? 0.04 : 0.02);

        // ==========================================
        // 4. IDLE ANIMATION
        // ==========================================
        } else {
            const breathe = Math.sin(time * 2) * 0.008;
            paladinLimbs.rightLeg.forEach(m => m.rotation.x = 0);
            paladinLimbs.leftLeg.forEach(m => m.rotation.x = 0);

            paladinLimbs.torso.forEach(m => {
                m.rotation.x = 0;
                m.rotation.z = peekTilt;
                m.position.y = breathe;
            });

            if (reloadSystem.isReloading) {
                animateReloadArm(reloadSystem.reloadProgress);
            } else {
                paladinLimbs.rightArm.forEach(m => {
                    m.rotation.x = -Math.PI / 4 + Math.sin(time * 2) * 0.02;
                    m.rotation.z = Math.PI / 10;
                });
                paladinLimbs.leftArm.forEach(m => {
                    m.rotation.x = -Math.PI / 3 + Math.sin(time * 2) * 0.015;
                    m.rotation.y = Math.PI / 5;
                });
            }
        }

        if (isCrouching && !isSliding) playerMesh.position.y -= 0.3;
    }

    // Third-person Orbit Camera Rig with Peek & ADS Offset
    const orbitDist = weaponSystem.isADS ? 2.2 : (isCrouching || isSliding ? 2.5 : 3.8);
    const yOffset = weaponSystem.isADS ? 1.35 : (isCrouching || isSliding ? 0.6 : 1.45);

    // Peek lateral camera offset (Q/E)
    const peekCamOffset = new THREE.Vector3(-peekOffset * 0.55, 0, 0).applyEuler(new THREE.Euler(0, cameraYaw, 0));

    const camX = playerBody.position.x + orbitDist * Math.sin(cameraYaw) * Math.cos(cameraPitch) + peekCamOffset.x;
    const camY = playerBody.position.y + yOffset + orbitDist * Math.sin(cameraPitch);
    const camZ = playerBody.position.z + orbitDist * Math.cos(cameraYaw) * Math.cos(cameraPitch) + peekCamOffset.z;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(playerBody.position.x + peekCamOffset.x, playerBody.position.y + yOffset, playerBody.position.z + peekCamOffset.z);

    weaponSystem.update(delta, time, isMoving);
}

// 4-Stage Reload Arm Animation Keyframe Solver
function animateReloadArm(progress) {
    if (progress < 0.35) {
        // Phase 1: Hand drops to hip magazine pouch
        paladinLimbs.leftArm.forEach(m => {
            m.rotation.x = 0.2;
            m.rotation.y = 0;
            m.rotation.z = -0.2;
        });
    } else if (progress < 0.70) {
        // Phase 2: Hand raises up to insert magazine into weapon
        paladinLimbs.leftArm.forEach(m => {
            m.rotation.x = -Math.PI / 2.2;
            m.rotation.y = Math.PI / 4;
            m.rotation.z = 0;
        });
    } else if (progress < 0.90) {
        // Phase 3: Hand slides back chamber bolt
        paladinLimbs.leftArm.forEach(m => {
            m.rotation.x = -Math.PI / 2.0;
            m.rotation.y = Math.PI / 6;
            m.rotation.z = -0.3;
        });
    } else {
        // Phase 4: Returns to weapon grip
        paladinLimbs.leftArm.forEach(m => {
            m.rotation.x = -Math.PI / 3;
            m.rotation.y = Math.PI / 5;
            m.rotation.z = 0;
        });
    }
}

// Initial Run
loadCharacter();
animate();
updateHUD();
updateStatsModal();
