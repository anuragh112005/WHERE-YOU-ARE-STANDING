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
    grenadesCount: 3
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
        case 'grenade_pin':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(900, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;
        case 'explosion':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(20, now + 0.8);
            gain.gain.setValueAtTime(0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            osc.start(now);
            osc.stop(now + 0.8);
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

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
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
    { id: 'grenade', category: 'grenades', name: 'Tactical Grenade', cost: 200, icon: '💣', type: 'grenade', dmgVal: 100, rateVal: 30, rangeVal: 70, desc: 'High explosive frag grenade.', tip: 'Press G to toss.' }
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

    createExplosion(position) {
        playSound('explosion');

        // Big fiery sphere
        const expGeo = new THREE.SphereGeometry(2.5, 16, 16);
        const expMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.9 });
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expMesh.position.copy(position);
        scene.add(expMesh);

        let scale = 1;
        const interval = setInterval(() => {
            scale += 0.25;
            expMesh.scale.set(scale, scale, scale);
            expMat.opacity -= 0.15;
            if (expMat.opacity <= 0) {
                clearInterval(interval);
                scene.remove(expMesh);
                expGeo.dispose(); expMat.dispose();
            }
        }, 30);

        // Explosion debris & sparks
        for (let i = 0; i < 30; i++) {
            const pGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
            const pMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffaa00 : 0xef4444 });
            const pMesh = new THREE.Mesh(pGeo, pMat);
            pMesh.position.copy(position);
            scene.add(pMesh);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                Math.random() * 6 + 2,
                (Math.random() - 0.5) * 8
            );
            this.particles.push({ mesh: pMesh, vel: vel, life: 1.0, gravity: true });
        }
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
// 5. GRENADE THROW SYSTEM
// =========================================================
const activeGrenades = [];
let grenadeTemplate = null;

// Preload 3D grenade model
gltfLoader.load('./retro_lowpoly_psx_grenade.glb', (gltf) => {
    grenadeTemplate = gltf.scene;
    grenadeTemplate.scale.set(0.4, 0.4, 0.4);
});

function throwGrenade() {
    if (gameState.grenadesCount <= 0 || !gameState.inGame) return;
    gameState.grenadesCount--;
    playSound('grenade_pin');

    if (animActions.toss) {
        playAnimation('toss', 0.1, false);
    }

    // Spawn grenade model
    let grenadeMesh = grenadeTemplate ? grenadeTemplate.clone() : new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x166534 })
    );

    const spawnPos = new THREE.Vector3();
    camera.getWorldPosition(spawnPos);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    spawnPos.addScaledVector(forward, 0.5);

    grenadeMesh.position.copy(spawnPos);
    scene.add(grenadeMesh);

    // Cannon physics body
    const grenadeShape = new CANNON.Sphere(0.15);
    const grenadeBody = new CANNON.Body({
        mass: 1.5,
        linearDamping: 0.2,
        angularDamping: 0.4
    });
    grenadeBody.addShape(grenadeShape);
    grenadeBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    grenadeBody.velocity.set(
        forward.x * 16,
        forward.y * 16 + 4.5,
        forward.z * 16
    );
    world.addBody(grenadeBody);

    activeGrenades.push({
        mesh: grenadeMesh,
        body: grenadeBody,
        fuse: 2.8
    });
}

function updateGrenades(delta) {
    for (let i = activeGrenades.length - 1; i >= 0; i--) {
        const g = activeGrenades[i];
        g.fuse -= delta;

        g.mesh.position.copy(g.body.position);
        g.mesh.quaternion.copy(g.body.quaternion);

        if (g.fuse <= 0) {
            const expPos = g.mesh.position.clone();
            vfxManager.createExplosion(expPos);

            // Area damage
            if (playerBody) {
                const dist = playerBody.position.distanceTo(new CANNON.Vec3(expPos.x, expPos.y, expPos.z));
                if (dist < 6.0) {
                    const dmg = Math.round((1 - dist / 6.0) * 85);
                    health -= dmg;
                    flashDamageIndicator();
                    updateHUD();
                }
            }

            scene.remove(g.mesh);
            world.removeBody(g.body);
            activeGrenades.splice(i, 1);
        }
    }
}

// =========================================================
// 6. RELOAD & WEAPON SYSTEM
// =========================================================
class ReloadSystem {
    constructor() {
        this.isReloading = false;
        this.reloadProgress = 0;
        this.reloadDuration = 2.4;
    }

    startReload(weapon) {
        if (this.isReloading || weapon.ammo >= weapon.magSize || weapon.reserve <= 0) return;
        this.isReloading = true;
        this.reloadProgress = 0;
        gameState.state = 'RELOADING';

        document.getElementById('reload-bar-container').classList.remove('hidden');
        document.getElementById('ammo-state-label').innerText = 'RELOADING...';
        document.getElementById('ammo-state-label').className = 'text-xs font-bold text-amber-400 uppercase tracking-widest animate-pulse';

        if (animActions.reload) playAnimation('reload', 0.15, false);
        playSound('reload_mag_out');
    }

    update(delta, weapon) {
        if (!this.isReloading) return;

        this.reloadProgress += delta / this.reloadDuration;
        const progressPct = Math.min(100, Math.round(this.reloadProgress * 100));
        document.getElementById('reload-bar-fill').style.width = progressPct + '%';

        if (this.reloadProgress >= 1.0) {
            this.completeReload(weapon);
        }
    }

    completeReload(weapon) {
        this.isReloading = false;
        this.reloadProgress = 0;
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
    }

    async equip(item) {
        if (!item || !item.file) return;
        this.current = {
            ...item,
            ammo: item.magSize || 30,
            magSize: item.magSize || 30,
            reserve: item.reserve || 90
        };

        if (this.mesh && playerRightHandBone) {
            playerRightHandBone.remove(this.mesh);
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

            // Gun alignment in SWAT right hand
            container.position.set(0.08, -0.05, 0.12);
            container.rotation.set(Math.PI / 2, -Math.PI / 2, 0);

            container.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                }
            });

            this.mesh = container;
            if (playerRightHandBone) {
                playerRightHandBone.add(this.mesh);
            }

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
        this.recoilOffset = 0.1;

        playSound(this.current.sound || 'shoot_rifle');
        updateHUD();

        if (animActions.fire) {
            animActions.fire.reset().play();
        }

        const crosshair = document.getElementById('crosshair');
        crosshair.classList.add('crosshair-spread');
        setTimeout(() => crosshair.classList.remove('crosshair-spread'), 100);

        const muzzlePos = new THREE.Vector3();
        if (this.mesh) {
            this.mesh.getWorldPosition(muzzlePos);
        } else {
            muzzlePos.copy(camera.position);
        }
        vfxManager.createMuzzleFlash(muzzlePos, this.current.vfx || 'TypeA');

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

    update(delta) {
        if (this.cooldown > 0) this.cooldown -= delta;

        if (Math.abs(this.currentFOV - this.targetFOV) > 0.1) {
            this.currentFOV += (this.targetFOV - this.currentFOV) * (delta * 12);
            camera.fov = this.currentFOV;
            camera.updateProjectionMatrix();
        }
    }
}
const weaponSystem = new WeaponSystem();

// =========================================================
// 7. BASIC SHOOTER PACK SWAT CHARACTER & ANIMATION MIXER
// =========================================================
let playerBody, playerMesh;
let playerFeetOffsetY = 0;
let playerRightHandBone = null;

let mixer = null;
const animActions = {};
let currentActionName = 'idle';

let cameraYaw = 0;
let cameraPitch = 0;
let isCrouching = false;
let colorIndex = Math.floor(Math.random() * 0xffffff);

let isDraggingLobby = false;
let previousMouseX = 0;

const walkSpeed = 5.5;
const sprintSpeed = 9.5;
const jumpVelocity = 6.5;

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
        // Load SWAT Character FBX
        const swatFbx = await fbxLoader.loadAsync('./Basic Shooter Pack/Swat.fbx');
        playerMesh = swatFbx;

        // Auto scale
        const box = new THREE.Box3().setFromObject(swatFbx);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
            const s = 1.75 / size.y;
            swatFbx.scale.set(s, s, s);
        }

        swatFbx.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(swatFbx);
        playerFeetOffsetY = scaledBox.min.y;

        // Find RightHand bone for gun parenting
        playerRightHandBone = null;
        swatFbx.traverse(child => {
            if (child.isBone) {
                const name = child.name.toLowerCase();
                if (name.includes('righthand') || name.includes('hand_r') || name.includes('hand.r') || (name.includes('hand') && name.includes('r'))) {
                    playerRightHandBone = child;
                }
            }
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Initialize AnimationMixer
        mixer = new THREE.AnimationMixer(swatFbx);

        // Load idle first and start playing immediately
        try {
            const idleFbx = await fbxLoader.loadAsync('./Basic Shooter Pack/rifle aiming idle.fbx');
            if (idleFbx.animations && idleFbx.animations.length > 0) {
                const action = mixer.clipAction(idleFbx.animations[0]);
                animActions.idle = action;
                action.play();
                currentActionName = 'idle';
            }
        } catch (e) {
            console.warn('Idle anim load error:', e);
        }

        scene.add(playerMesh);

        // Equip default weapon in SWAT's hand
        await weaponSystem.equip(SHOP_ITEMS.find(i => i.id === 'ak47'));

        // Load remaining animations in parallel without blocking rendering
        const otherAnims = {
            walk: './Basic Shooter Pack/walking.fbx',
            run: './Basic Shooter Pack/rifle run.fbx',
            reload: './Basic Shooter Pack/reloading.fbx',
            fire: './Basic Shooter Pack/firing rifle.fbx',
            jump: './Basic Shooter Pack/rifle jump.fbx',
            toss: './Basic Shooter Pack/toss grenade.fbx',
            hit: './Basic Shooter Pack/hit reaction.fbx'
        };

        Promise.all(Object.entries(otherAnims).map(async ([name, path]) => {
            try {
                const animFbx = await fbxLoader.loadAsync(path);
                if (animFbx.animations && animFbx.animations.length > 0) {
                    const clip = animFbx.animations[0];
                    const action = mixer.clipAction(clip);
                    if (name === 'reload' || name === 'fire' || name === 'toss' || name === 'hit' || name === 'jump') {
                        action.setLoop(THREE.LoopOnce);
                        action.clampWhenFinished = true;
                    }
                    animActions[name] = action;
                }
            } catch (err) {}
        }));

    } catch (err) {
        console.error('Failed to load SWAT character:', err);
    }
}

function playAnimation(name, fadeDuration = 0.2, loop = true) {
    if (!mixer || !animActions[name] || currentActionName === name) return;

    const nextAction = animActions[name];
    const prevAction = animActions[currentActionName];

    if (prevAction) prevAction.fadeOut(fadeDuration);

    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.fadeIn(fadeDuration);
    nextAction.play();

    currentActionName = name;
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
// 9. INPUT HANDLING (Movement, G for Grenade)
// =========================================================
const keys = { w: false, a: false, s: false, d: false, shift: false, ctrl: false, space: false };

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
    if (e.shiftKey) keys.shift = true;
    if (e.ctrlKey) keys.ctrl = true;
    if (e.code === 'Space') keys.space = true;

    // G key tosses grenade
    if (k === 'g' && gameState.inGame) {
        throwGrenade();
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
    if (!gameState.inGame) isDraggingLobby = false;
    if (e.button === 2 && gameState.inGame) weaponSystem.toggleADS(false);
});

window.addEventListener('contextmenu', e => e.preventDefault());

// =========================================================
// 10. UI & LOBBY SYSTEM
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
    setTimeout(() => { item.style.opacity = '0'; setTimeout(() => item.remove(), 300); }, 4000);
}

// Chat
const modalChat = document.getElementById('modal-chat');
document.getElementById('btn-open-chat').addEventListener('click', () => { modalChat.classList.remove('hidden'); document.getElementById('chat-input').focus(); });
document.getElementById('btn-close-chat').addEventListener('click', () => modalChat.classList.add('hidden'));

document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const container = document.getElementById('chat-messages-container');
    if (container.innerText.includes('No messages in global channel yet.')) container.innerHTML = '';

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgEl = document.createElement('div');
    msgEl.className = 'bg-white/5 p-2 rounded-lg border border-white/5';
    msgEl.innerHTML = `<span class="text-cyan-400 font-bold font-mono">[SWAT]</span> <span class="text-gray-400 text-[10px]">${timeStr}</span>: <span class="text-white">${msg}</span>`;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;

    document.getElementById('chat-preview-text').innerText = msg;
    input.value = '';
});

// Modals
document.getElementById('btn-nav-season').addEventListener('click', () => { updateStatsModal(); document.getElementById('modal-season').classList.remove('hidden'); });
document.getElementById('btn-close-season').addEventListener('click', () => document.getElementById('modal-season').classList.add('hidden'));

document.getElementById('btn-rp').addEventListener('click', () => document.getElementById('modal-rp').classList.remove('hidden'));
document.getElementById('btn-close-rp').addEventListener('click', () => document.getElementById('modal-rp').classList.add('hidden'));

document.getElementById('btn-open-inventory-locker').addEventListener('click', () => document.getElementById('modal-inventory').classList.remove('hidden'));
document.getElementById('btn-nav-inventory').addEventListener('click', () => document.getElementById('modal-inventory').classList.remove('hidden'));
document.getElementById('btn-close-inventory').addEventListener('click', () => document.getElementById('modal-inventory').classList.add('hidden'));

// Mode Selector
const modalModeSelect = document.getElementById('modal-mode-select');
document.getElementById('btn-open-mode-modal').addEventListener('click', () => modalModeSelect.classList.remove('hidden'));
document.getElementById('mode-badge-card').addEventListener('click', () => modalModeSelect.classList.remove('hidden'));
document.getElementById('btn-close-mode-modal').addEventListener('click', () => modalModeSelect.classList.add('hidden'));

document.getElementById('mode-opt-solo').addEventListener('click', () => {
    gameState.selectedMode = 'SOLO';
    gameState.roomCode = 'SOLO';
    modalModeSelect.classList.add('hidden');
});

document.getElementById('mode-opt-host').addEventListener('click', () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    gameState.selectedMode = 'HOST';
    gameState.isHost = true;
    gameState.roomCode = code;
    modalModeSelect.classList.add('hidden');
});

document.getElementById('btn-pubg-start').addEventListener('click', () => {
    playSound('reload_slide');
    document.getElementById('btn-pubg-start').innerHTML = '<span>DEPLOYING...</span>';
    enterGame();
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

        card.addEventListener('click', () => {
            if (item.type === 'gun') weaponSystem.equip(item);
            else if (item.type === 'grenade') gameState.grenadesCount += 2;
            playSound('buy');
            renderBuyMenu();
        });

        parent.appendChild(card);
    });
}

function toggleShop() {
    gameState.isShopOpen = !gameState.isShopOpen;
    const shop = document.getElementById('shop-menu');
    if (gameState.isShopOpen) {
        document.exitPointerLock();
        shop.classList.remove('hidden');
        renderBuyMenu();
    } else {
        shop.classList.add('hidden');
        if (gameState.inGame) canvas.requestPointerLock();
    }
}
document.getElementById('btn-close-shop').addEventListener('click', toggleShop);

// Enter Game
let gameStarted = false;
async function enterGame() {
    if (gameStarted) return;
    gameStarted = true;

    gameState.matchesPlayed++;
    updateStatsModal();

    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
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
// 11. ANIMATION & PHYSICS TICK LOOP
// =========================================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // Mixer Animation Tick (Mixamo Mocap tracks)
    if (mixer) mixer.update(delta);

    vfxManager.update(delta);
    reloadSystem.update(delta, weaponSystem.current);
    updateGrenades(delta);

    if (!gameState.inGame) {
        if (playerMesh) playerMesh.position.set(0, 0.02, 0);
        camera.position.set(0, 1.35, 3.2);
        camera.lookAt(0, 0.85, 0);
    } else {
        world.step(timeStep, delta, 3);
        updatePlayerPhysics(delta, time);
    }

    renderer.render(scene, camera);
}

function updatePlayerPhysics(delta, time) {
    if (!playerBody || !gameState.inGame) return;

    if (playerBody.position.y < -2.0) {
        playerBody.position.set(6, 0.9, 6);
        playerBody.velocity.set(0, 0, 0);
    }

    const isSprinting = keys.shift && !keys.ctrl;
    isCrouching = keys.ctrl;
    const speed = isSprinting ? sprintSpeed : (isCrouching ? walkSpeed * 0.5 : walkSpeed);

    const direction = new THREE.Vector3();
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;

    direction.normalize();
    const isMoving = direction.lengthSq() > 0;

    if (isMoving) {
        const euler = new THREE.Euler(0, cameraYaw, 0, 'YXZ');
        direction.applyEuler(euler);
        playerBody.velocity.x = direction.x * speed;
        playerBody.velocity.z = direction.z * speed;

        if (playerMesh) {
            playerMesh.rotation.y = Math.atan2(playerBody.velocity.x, playerBody.velocity.z);
        }

        // Trigger Run vs Walk animation
        if (!reloadSystem.isReloading) {
            if (isSprinting) playAnimation('run', 0.2);
            else playAnimation('walk', 0.2);
        }
    } else {
        playerBody.velocity.x *= 0.5;
        playerBody.velocity.z *= 0.5;

        // Trigger Idle animation
        if (!reloadSystem.isReloading && currentActionName !== 'toss' && currentActionName !== 'fire') {
            playAnimation('idle', 0.2);
        }
    }

    // Jump
    const isGrounded = Math.abs(playerBody.velocity.y) < 0.15;
    if (keys.space && isGrounded) {
        playerBody.velocity.y = jumpVelocity;
        playSound('jump_sfx');
        if (animActions.jump) playAnimation('jump', 0.1, false);
        keys.space = false;
    }

    // Sync mesh to physics body
    if (playerMesh) {
        const groundContactY = playerBody.position.y - 0.7;
        playerMesh.position.x = playerBody.position.x;
        playerMesh.position.z = playerBody.position.z;
        playerMesh.position.y = groundContactY - playerFeetOffsetY;
    }

    // Camera Rig
    const orbitDist = weaponSystem.isADS ? 2.2 : 3.8;
    const yOffset = weaponSystem.isADS ? 1.35 : 1.45;

    const camX = playerBody.position.x + orbitDist * Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const camY = playerBody.position.y + yOffset + orbitDist * Math.sin(cameraPitch);
    const camZ = playerBody.position.z + orbitDist * Math.cos(cameraYaw) * Math.cos(cameraPitch);

    camera.position.set(camX, camY, camZ);
    camera.lookAt(playerBody.position.x, playerBody.position.y + yOffset, playerBody.position.z);

    weaponSystem.update(delta);
}

// Initial Run
loadCharacter();
animate();
updateHUD();
updateStatsModal();
