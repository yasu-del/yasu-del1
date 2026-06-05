// Core Game Controller - Main Loop, Physics, Controls & UI
import { audio } from './audio.js';
import { createWorld } from './world.js';
import { Drone, PlasmaProjectile, Particle, PowerUp } from './entities.js';

// --- GAME VARIABLES ---
let scene, camera, renderer;
let colliders = [];
let spawnPoints = [];

// Game state
let isPaused = true;
let score = 0;
let wave = 1;
let lastTime = 0;
let waveActive = false;
let waveTransitionTime = 0;
let lastHitTime = 0; // for shield recharge timer

// Player physics state
const player = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(0, 0, 0),
    speed: 10,
    jumpForce: 8,
    isGrounded: true,
    radius: 0.8,
    height: 1.8,
    // Stats
    health: 100,
    maxHealth: 100,
    shield: 100,
    maxShield: 100,
    ammoClip: 30,
    maxClip: 30,
    isReloading: false,
    reloadTimer: 0,
    shootCooldown: 0.12, // 120ms between shots
    lastShootTime: 0,
    invulnerable: false,
    invulnerableTime: 0
};

// Player object container in Three.js
let playerGroup;

// Mouse look state
let playerYaw = 0;
let cameraPitch = 0;
const mouseSensitivity = 0.002;

// Weapons mesh components
let gunGroup;
let muzzleFlash;
let laserBeams = []; // Array to track active firing laser visual effects

// Play collections
const drones = [];
const projectiles = [];
const particles = [];
const powerUps = [];
const activePowerUpSpawns = new Map(); // tracks spawn index -> active item

// Input key maps
const keys = { w: false, a: false, s: false, d: false, space: false };

// UI Elements cache
const canvas = document.getElementById('game-canvas');
const hudOverlay = document.getElementById('hud-overlay');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const hpText = document.getElementById('hp-text');
const hpBar = document.getElementById('bar-hp');
const shieldText = document.getElementById('shield-text');
const shieldBar = document.getElementById('bar-shield');
const ammoClipText = document.getElementById('ammo-clip');
const scoreText = document.getElementById('score-value');
const waveText = document.getElementById('wave-value');
const finalScoreText = document.getElementById('final-score');
const finalWaveText = document.getElementById('final-wave');
const soundToggleBtn = document.getElementById('sound-toggle');
const soundIconOn = document.getElementById('sound-icon-on');
const soundIconOff = document.getElementById('sound-icon-off');
const damageFlashOverlay = document.getElementById('damage-flash');
const lowHealthOverlay = document.getElementById('low-health-warning');

// Minimap
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
minimapCanvas.width = 140;
minimapCanvas.height = 140;

// --- INITIALIZATION ---
function init() {
    // 1. Create Scene & Renderer
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05050a, 0.015);

    // Performance optimization: Cap pixel ratio to reduce heavy rendering load on high-DPI displays
    const pixelRatio = window.devicePixelRatio;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: pixelRatio === 1 });
    renderer.setPixelRatio(Math.min(pixelRatio, 1.25)); // Cap pixel ratio for smoother FPS
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // 2. Camera setup inside Player group
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, player.height, 0); // Position camera at head height

    playerGroup = new THREE.Group();
    playerGroup.position.copy(player.position);
    playerGroup.add(camera);
    scene.add(playerGroup);

    // 3. Setup procedurally designed cyber-blaster gun model
    setupGunModel();

    // 4. Generate map
    const worldData = createWorld(scene);
    colliders = worldData.colliders;
    spawnPoints = worldData.spawnPoints;

    // Pre-populate items at the start
    spawnPowerUps(6);

    // 5. Event Listeners
    setupInputListeners();

    // 6. Handle Window resizing
    window.addEventListener('resize', onWindowResize);

    // Start loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// Procedural 3D Weapon Model attachment
function setupGunModel() {
    gunGroup = new THREE.Group();
    
    // Placement: bottom right of camera viewport
    gunGroup.position.set(0.35, -0.3, -0.6);
    gunGroup.rotation.y = -Math.PI / 16;
    camera.add(gunGroup);

    const gunMat = new THREE.MeshPhongMaterial({
        color: 0x11111d,
        specular: 0x00f0ff,
        shininess: 60
    });
    
    const neonTrimMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff }); // Neon Cyan emissive trim

    // Main barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.25);
    gunGroup.add(barrel);

    // Neon stripe on barrel
    const barrelStripe = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.015, 0.48), neonTrimMat);
    barrelStripe.position.set(0, 0.055, -0.25);
    gunGroup.add(barrelStripe);

    // Receiver (back body)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.25), gunMat);
    receiver.position.set(0, -0.01, -0.05);
    gunGroup.add(receiver);

    // Handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), gunMat);
    handle.rotation.x = Math.PI / 6;
    handle.position.set(0, -0.12, 0);
    gunGroup.add(handle);

    // Scope / Target finder (glowing neon rings)
    const scopeRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 16), neonTrimMat);
    scopeRing.position.set(0, 0.09, -0.1);
    gunGroup.add(scopeRing);

    // Small laser guide dot
    const laserTip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff007f }));
    laserTip.position.set(0, 0.09, -0.12);
    gunGroup.add(laserTip);

    // Muzzle Flash shell (starts scaled to 0)
    const flashGeo = new THREE.CylinderGeometry(0, 0.08, 0.2, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xfffb00, transparent: true, opacity: 0.8 });
    muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    muzzleFlash.rotation.x = Math.PI / 2;
    muzzleFlash.position.set(0, 0, -0.52);
    muzzleFlash.scale.set(0, 0, 0);
    gunGroup.add(muzzleFlash);

    // Firing flash point light
    const flashLight = new THREE.PointLight(0xfffb00, 0, 4);
    flashLight.position.set(0, 0, -0.52);
    gunGroup.add(flashLight);
    muzzleFlash.userData = { light: flashLight };
}

// --- CONTROLS & EVENTS ---
function setupInputListeners() {
    // Mouse Click to request pointer lock and start game
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    const triggerPointerLock = () => {
        if (player.health <= 0) return;
        canvas.requestPointerLock();
    };

    startBtn.addEventListener('click', triggerPointerLock);
    restartBtn.addEventListener('click', () => {
        resetGame();
        canvas.requestPointerLock();
    });

    // Pointer Lock state changes
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            // Lock achieved: Game resumes
            isPaused = false;
            startScreen.style.display = 'none';
            gameOverScreen.style.display = 'none';
            hudOverlay.style.display = 'block';
            
            // Lazy sound init on first user click
            if (audio.isEnabled) {
                audio.init();
            }
        } else {
            // Lock lost: Game pauses (if player still alive)
            isPaused = true;
            if (player.health > 0) {
                startScreen.style.display = 'flex';
                document.querySelector('#start-screen .glitch-title').textContent = 'SYSTEM PAUSED';
                document.querySelector('#start-screen .cyber-btn').textContent = 'RESUME LINK';
            }
        }
    });

    // Mouse Movement for looking around
    document.addEventListener('mousemove', (event) => {
        if (isPaused || document.pointerLockElement !== canvas) return;

        playerYaw -= event.movementX * mouseSensitivity;
        cameraPitch -= event.movementY * mouseSensitivity;

        // Clamp up/down rotation to prevent flipping upside down
        cameraPitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraPitch));

        playerGroup.rotation.y = playerYaw;
        camera.rotation.x = cameraPitch;
    });

    // Keyboard keys pressed
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW': keys.w = true; break;
            case 'KeyA': keys.a = true; break;
            case 'KeyS': keys.s = true; break;
            case 'KeyD': keys.d = true; break;
            case 'Space': keys.space = true; break;
            case 'KeyR': reloadWeapon(); break;
        }
    });

    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': keys.w = false; break;
            case 'KeyA': keys.a = false; break;
            case 'KeyS': keys.s = false; break;
            case 'KeyD': keys.d = false; break;
            case 'Space': keys.space = false; break;
        }
    });

    // Shooting: left mouse click
    document.addEventListener('mousedown', (event) => {
        if (isPaused || event.button !== 0 || document.pointerLockElement !== canvas) return;
        shootWeapon();
    });

    // Audio Controller Button Toggle
    soundToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = audio.toggle();
        if (active) {
            soundIconOn.style.display = 'block';
            soundIconOff.style.display = 'none';
        } else {
            soundIconOn.style.display = 'none';
            soundIconOff.style.display = 'block';
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- GAME STATE COMMANDS ---
function resetGame() {
    score = 0;
    wave = 1;
    waveActive = false;
    
    player.health = 100;
    player.shield = 100;
    player.ammoClip = player.maxClip;
    player.isReloading = false;
    player.position.set(0, 0, 15);
    player.velocity.set(0, 0, 0);
    playerGroup.position.copy(player.position);
    
    playerYaw = 0;
    cameraPitch = 0;
    playerGroup.rotation.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);

    // Empty arrays
    drones.forEach(d => d.destroy());
    drones.length = 0;

    projectiles.forEach(p => p.destroy());
    projectiles.length = 0;

    particles.forEach(p => p.destroy());
    particles.length = 0;

    laserBeams.forEach(b => {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
    });
    laserBeams.length = 0;

    // Reset items
    powerUps.forEach(p => p.destroy());
    powerUps.length = 0;
    activePowerUpSpawns.clear();
    spawnPowerUps(6);

    updateHUD();
    lowHealthOverlay.classList.remove('low-hp-active');
    
    gameOverScreen.style.opacity = '0';
    setTimeout(() => {
        gameOverScreen.style.display = 'none';
    }, 500);
}

function triggerGameOver() {
    isPaused = true;
    document.exitPointerLock();
    
    // Play explosion sound
    audio.playExplosion();
    
    // Update Score Board
    finalScoreText.textContent = score.toLocaleString('en-US', { minimumIntegerDigits: 6 });
    finalWaveText.textContent = wave.toString().padStart(2, '0');
    
    hudOverlay.style.display = 'none';
    gameOverScreen.style.display = 'flex';
    setTimeout(() => {
        gameOverScreen.style.opacity = '1';
    }, 50);
}

// --- WEAPONS MECHANICS ---
function shootWeapon() {
    if (player.isReloading) return;
    
    const now = performance.now();
    if (now - player.lastShootTime < player.shootCooldown * 1000) return;
    
    if (player.ammoClip <= 0) {
        // Play click sound / auto reload
        reloadWeapon();
        return;
    }

    player.ammoClip--;
    player.lastShootTime = now;
    
    // Play SFX
    audio.playLaser();
    
    // UI Update
    ammoClipText.textContent = player.ammoClip;
    if (player.ammoClip < 10) {
        ammoClipText.style.color = 'var(--neon-magenta)';
    }

    // 1. Visual Recoil animation
    gunGroup.position.z += 0.08;
    gunGroup.rotation.x += 0.05;

    // 2. Trigger muzzle flash scale
    muzzleFlash.scale.set(1.5, 1.5, 1.5);
    muzzleFlash.userData.light.intensity = 3.0;

    // 3. Firing Raycast targeting
    const raycaster = new THREE.Raycaster();
    
    // Shoot straight from the center of screen
    const centerScreen = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(centerScreen, camera);
    
    const targets = [];
    
    // Gather target colliders
    colliders.forEach(c => targets.push(c));
    drones.forEach(d => {
        if (!d.isDead) targets.push(d.group);
    });

    const intersections = raycaster.intersectObjects(targets, true);
    
    let endPoint = new THREE.Vector3();
    raycaster.ray.at(100, endPoint); // default laser trace distance is 100 units
    
    let hitObject = null;
    
    if (intersections.length > 0) {
        const hit = intersections[0];
        endPoint.copy(hit.point);
        hitObject = hit.object;
        
        // Spark particles at hit coordinates
        spawnSparkBurst(hit.point, 0x00f0ff, 8);
        
        // Find which drone was hit
        let hitDrone = null;
        for (let i = 0; i < drones.length; i++) {
            const drone = drones[i];
            // Check if hit object is child of drone group
            let parent = hitObject.parent;
            while (parent) {
                if (parent === drone.group) {
                    hitDrone = drone;
                    break;
                }
                parent = parent.parent;
            }
            if (hitDrone) break;
        }

        if (hitDrone) {
            // Damage the Drone
            const destroyed = hitDrone.takeDamage(15);
            audio.playHit();
            
            if (destroyed) {
                audio.playExplosion();
                spawnSparkBurst(hitDrone.group.position, 0xff007f, 25, 0.4, 12);
                score += hitDrone.scoreValue;
                scoreText.textContent = score.toLocaleString('en-US', { minimumIntegerDigits: 6 });
                scoreText.classList.add('pulse-text');
                setTimeout(() => scoreText.classList.remove('pulse-text'), 300);
            }
        }
    }

    // 4. Draw Laser beam cylinder visual
    const startPoint = new THREE.Vector3();
    // Gun muzzle location in world space
    muzzleFlash.getWorldPosition(startPoint);
    
    createLaserBeam(startPoint, endPoint);
}

function createLaserBeam(start, end) {
    const distance = start.distanceTo(end);
    const geometry = new THREE.CylinderGeometry(0.015, 0.015, distance, 4);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.8
    });
    
    const beam = new THREE.Mesh(geometry, material);
    
    // Position beam center midway between start and end points
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    
    // Orient cylinder along vector pointing from start to end
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const upVector = new THREE.Vector3(0, 1, 0);
    beam.quaternion.setFromUnitVectors(upVector, direction);
    
    scene.add(beam);
    
    laserBeams.push({
        mesh: beam,
        age: 0,
        lifetime: 0.06 // show for 60ms
    });
}

function reloadWeapon() {
    if (player.isReloading || player.ammoClip === player.maxClip) return;
    
    player.isReloading = true;
    player.reloadTimer = 0;
    
    // Play pleasant recharge synth arpeggio for reloading
    audio.playPickup();
    
    ammoClipText.style.color = 'rgba(255, 255, 255, 0.4)';
    ammoClipText.textContent = 'REL';
}

// --- PHYSICS & COLLISION CALCULATIONS ---
function checkObstacleCollisions(position, colList) {
    // Player cylindrical bounding volume box representation
    const playerBox = new THREE.Box3(
        new THREE.Vector3(position.x - player.radius, position.y, position.z - player.radius),
        new THREE.Vector3(position.x + player.radius, position.y + player.height, position.z + player.radius)
    );
    
    for (let i = 0; i < colList.length; i++) {
        const obs = colList[i];
        const obsBox = new THREE.Box3().setFromObject(obs);
        if (playerBox.intersectsBox(obsBox)) {
            return true;
        }
    }
    return false;
}

function updatePlayerMovement(deltaTime) {
    // 1. Calculate directional movement input vectors
    const moveVector = new THREE.Vector3(0, 0, 0);
    
    // Forward / backward relative to look yaw
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw).normalize();
    
    if (keys.w) moveVector.add(forward);
    if (keys.s) moveVector.add(forward.clone().negate());
    if (keys.a) moveVector.add(right.clone().negate());
    if (keys.d) moveVector.add(right);
    
    moveVector.normalize();
    
    // Apply speeds
    player.velocity.x = moveVector.x * player.speed;
    player.velocity.z = moveVector.z * player.speed;
    
    // 2. Jumping physics
    if (player.isGrounded && keys.space) {
        player.velocity.y = player.jumpForce;
        player.isGrounded = false;
    }
    
    // Apply standard gravity acceleration
    if (!player.isGrounded) {
        player.velocity.y -= 22.0 * deltaTime; // gravity multiplier
    }
    
    // 3. Slide-Collision Resolvers against obstacles
    const nextPos = player.position.clone();
    nextPos.x += player.velocity.x * deltaTime;
    nextPos.z += player.velocity.z * deltaTime;
    nextPos.y += player.velocity.y * deltaTime;
    
    // Boundary clamp (-48 to 48 area width)
    if (Math.abs(nextPos.x) > 48.5) {
        player.velocity.x = 0;
        nextPos.x = Math.sign(nextPos.x) * 48.5;
    }
    if (Math.abs(nextPos.z) > 48.5) {
        player.velocity.z = 0;
        nextPos.z = Math.sign(nextPos.z) * 48.5;
    }

    // Ground Floor test
    if (nextPos.y <= 0) {
        nextPos.y = 0;
        player.velocity.y = 0;
        player.isGrounded = true;
    } else {
        // Check if player falls off boxes and registers as not grounded
        player.isGrounded = (nextPos.y === 0);
    }
    
    // Horizontal physics axis slide solver
    // Test X axis movement
    const testPosX = player.position.clone();
    testPosX.x = nextPos.x;
    if (checkObstacleCollisions(testPosX, colliders)) {
        player.velocity.x = 0; // stop moving along X
    } else {
        player.position.x = nextPos.x; // apply X
    }
    
    // Test Z axis movement
    const testPosZ = player.position.clone();
    testPosZ.z = nextPos.z;
    if (checkObstacleCollisions(testPosZ, colliders)) {
        player.velocity.z = 0; // stop moving along Z
    } else {
        player.position.z = nextPos.z; // apply Z
    }
    
    // Apply final Y coordinates
    player.position.y = nextPos.y;
    
    // Update player model container node positioning
    playerGroup.position.copy(player.position);
}

// --- COMBAT & DAMAGE RECEPTORS ---
function damagePlayer(amount) {
    if (player.health <= 0 || player.invulnerable) return;
    
    lastHitTime = performance.now();
    
    // Red border flash indicator
    damageFlashOverlay.classList.add('flash');
    setTimeout(() => damageFlashOverlay.classList.remove('flash'), 120);

    // Apply shield absorption first
    if (player.shield > 0) {
        player.shield -= amount;
        if (player.shield < 0) {
            player.health += player.shield; // transfer remainder to health
            player.shield = 0;
        }
    } else {
        player.health -= amount;
    }

    // Play hit SFX
    audio.playHurt();
    
    player.health = Math.max(0, player.health);
    
    // Frame flash invulnerability
    player.invulnerable = true;
    player.invulnerableTime = 0.25; // 250ms frame gap
    
    updateHUD();
    
    // Trigger Game Over
    if (player.health <= 0) {
        triggerGameOver();
    }
}

// Regenerate shields if not damaged for 4 seconds
function handleShieldRegen(deltaTime) {
    if (player.health <= 0 || player.shield >= player.maxShield) return;
    
    const timeSinceLastHit = performance.now() - lastHitTime;
    if (timeSinceLastHit >= 4000) { // 4 seconds delay
        player.shield = Math.min(player.maxShield, player.shield + 15 * deltaTime);
        updateHUD();
    }
}

// --- PARTICLE EMITTERS ---
function spawnSparkBurst(position, color, count = 10, size = 0.2, speed = 8) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(scene, position, color, size, speed));
    }
}

// --- POWER UPS NODE SYSTEM ---
function spawnPowerUps(count) {
    const itemTypes = ['health', 'shield', 'ammo'];
    
    let spawnCount = 0;
    // Iterate points to find empty spots
    for (let i = 0; i < spawnPoints.length; i++) {
        if (spawnCount >= count) break;
        if (!activePowerUpSpawns.has(i)) {
            const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            const powerUp = new PowerUp(scene, spawnPoints[i], type);
            powerUps.push(powerUp);
            activePowerUpSpawns.set(i, { index: i, item: powerUp });
            spawnCount++;
        }
    }
}

function handlePowerUpCollections() {
    const playerBox = new THREE.Box3(
        new THREE.Vector3(player.position.x - player.radius, player.position.y, player.position.z - player.radius),
        new THREE.Vector3(player.position.x + player.radius, player.position.y + player.height, player.position.z + player.radius)
    );
    
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const item = powerUps[i];
        if (item.isDead) continue;
        
        // Cylinder coordinate trigger overlap
        const dist = player.position.distanceTo(item.group.position);
        if (dist <= player.radius + item.radius) {
            // Apply buffs
            let collected = false;
            
            if (item.type === 'health' && player.health < player.maxHealth) {
                player.health = Math.min(player.maxHealth, player.health + 35);
                collected = true;
            } else if (item.type === 'shield' && player.shield < player.maxShield) {
                player.shield = Math.min(player.maxShield, player.shield + 50);
                collected = true;
            } else if (item.type === 'ammo') {
                player.ammoClip = player.maxClip;
                collected = true;
            }

            if (collected) {
                // Play pickup sound
                audio.playPickup();
                
                // Spawn nice glowing cyan/magenta ring of sparks
                spawnSparkBurst(item.group.position, 0x00f0ff, 12, 0.15, 6);
                
                // Remove map mapping
                for (let [spawnIdx, data] of activePowerUpSpawns.entries()) {
                    if (data.item === item) {
                        activePowerUpSpawns.delete(spawnIdx);
                        break;
                    }
                }
                
                item.destroy();
                powerUps.splice(i, 1);
                
                updateHUD();
            }
        }
    }
}

// --- WAVE ENEMY SPARK SYSTEM ---
function spawnWave() {
    waveActive = true;
    const numDrones = 2 + (wave * 2); // incremental enemy count
    
    waveText.textContent = wave.toString().padStart(2, '0');
    waveText.classList.add('pulse-text');
    setTimeout(() => waveText.classList.remove('pulse-text'), 300);

    for (let i = 0; i < numDrones; i++) {
        // Choose spawn position far away from player
        let spawnPos = new THREE.Vector3();
        let valid = false;
        let attempts = 0;
        
        while (!valid && attempts < 20) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 18; // 30 to 48 units out
            
            spawnPos.set(
                Math.cos(angle) * dist,
                3.5 + Math.random() * 4.0, // vertical altitude
                Math.sin(angle) * dist
            );
            
            // Check player distance
            const d = spawnPos.distanceTo(player.position);
            if (d > 22) {
                valid = true;
            }
        }
        
        drones.push(new Drone(scene, spawnPos, player, wave));
    }
    
    // Spawn item boxes to aid next wave survival
    spawnPowerUps(Math.min(wave + 1, 5));
}

function handleEnemySystem(deltaTime) {
    if (isPaused) return;

    // Check if new wave needs to start
    if (drones.length === 0 && !waveActive) {
        waveTransitionTime += deltaTime;
        if (waveTransitionTime >= 3.0) { // 3 seconds delay between waves
            spawnWave();
            waveTransitionTime = 0;
        }
    }
    
    // Update active enemies
    for (let i = drones.length - 1; i >= 0; i--) {
        const drone = drones[i];
        
        if (drone.isDead) {
            drone.destroy();
            drones.splice(i, 1);
            
            // If all dead, end wave trigger
            if (drones.length === 0) {
                waveActive = false;
                wave++;
                audio.playPickup(); // nice chord indicating wave cleared
            }
            continue;
        }
        
        drone.update(deltaTime, projectiles);
    }
}

function handleProjectiles(deltaTime) {
    const playerBox = new THREE.Box3(
        new THREE.Vector3(player.position.x - player.radius, player.position.y, player.position.z - player.radius),
        new THREE.Vector3(player.position.x + player.radius, player.position.y + player.height, player.position.z + player.radius)
    );

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        
        proj.update(deltaTime);
        
        // 1. Check world wall/obstacle bounds
        const projBox = new THREE.Box3(
            new THREE.Vector3(proj.mesh.position.x - proj.radius, proj.mesh.position.y - proj.radius, proj.mesh.position.z - proj.radius),
            new THREE.Vector3(proj.mesh.position.x + proj.radius, proj.mesh.position.y + proj.radius, proj.mesh.position.z + proj.radius)
        );
        
        let hitWorld = false;
        for (let j = 0; j < colliders.length; j++) {
            const obsBox = new THREE.Box3().setFromObject(colliders[j]);
            if (projBox.intersectsBox(obsBox)) {
                hitWorld = true;
                break;
            }
        }

        // Hit floor limits
        if (proj.mesh.position.y <= 0.2) {
            hitWorld = true;
        }

        if (hitWorld) {
            spawnSparkBurst(proj.mesh.position, 0x39ff14, 6, 0.12, 4); // plasma splat particles
            proj.destroy();
            projectiles.splice(i, 1);
            continue;
        }

        // 2. Check collision with Player
        if (projBox.intersectsBox(playerBox)) {
            damagePlayer(proj.damage);
            spawnSparkBurst(proj.mesh.position, 0x39ff14, 8, 0.15, 6);
            proj.destroy();
            projectiles.splice(i, 1);
            continue;
        }
        
        // Remove dead projectile
        if (proj.isDead) {
            projectiles.splice(i, 1);
        }
    }
}

// --- HUD RENDERING & REFRESH ---
function updateHUD() {
    hpText.textContent = `${Math.ceil(player.health)}/100`;
    hpBar.style.width = `${player.health}%`;
    
    shieldText.textContent = `${Math.ceil(player.shield)}/100`;
    shieldBar.style.width = `${player.shield}%`;
    
    ammoClipText.textContent = player.ammoClip;
    
    // Critical health warning pulse overlay
    if (player.health < 30 && player.health > 0) {
        lowHealthOverlay.classList.add('low-hp-active');
    } else {
        lowHealthOverlay.classList.remove('low-hp-active');
    }
}

// 2D Canvas Rotating HUD Radar/Minimap
function drawMinimap() {
    minimapCtx.clearRect(0, 0, 140, 140);
    
    const cx = 70;
    const cy = 70;
    const radarRadius = 65;
    
    // Radar grid ring
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    minimapCtx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();
    
    // Mini concentric ring
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, radarRadius * 0.5, 0, Math.PI * 2);
    minimapCtx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    minimapCtx.stroke();
    
    // Draw crosshair axes
    minimapCtx.beginPath();
    minimapCtx.moveTo(cx - radarRadius, cy);
    minimapCtx.lineTo(cx + radarRadius, cy);
    minimapCtx.moveTo(cx, cy - radarRadius);
    minimapCtx.lineTo(cx, cy + radarRadius);
    minimapCtx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    minimapCtx.stroke();

    // Map rotation matrices (orient North based on player look direction)
    minimapCtx.save();
    minimapCtx.translate(cx, cy);
    minimapCtx.rotate(-playerYaw); // rotates map elements opposite of player yaw to keep radar forward-oriented
    
    const scale = 1.2; // meters to pixels conversion

    // Draw boundary walls outline
    minimapCtx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect((-50 - player.position.x) * scale, (-50 - player.position.z) * scale, 100 * scale, 100 * scale);
    
    // Draw solid obstacles (pillars)
    colliders.forEach(c => {
        // Only draw cylindrical pillars, skip boundary walls (length checks)
        const name = c.geometry.type;
        if (name === 'CylinderGeometry') {
            const px = (c.position.x - player.position.x) * scale;
            const pz = (c.position.z - player.position.z) * scale;
            
            // Check if coordinates fit inside circular clipping bounds
            const d = Math.sqrt(px*px + pz*pz);
            if (d < radarRadius) {
                minimapCtx.beginPath();
                minimapCtx.arc(px, pz, 3.5, 0, Math.PI * 2);
                minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                minimapCtx.fill();
                minimapCtx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
                minimapCtx.stroke();
            }
        }
    });

    // Draw Active Power Up items
    powerUps.forEach(p => {
        const px = (p.position.x - player.position.x) * scale;
        const pz = (p.position.z - player.position.z) * scale;
        const d = Math.sqrt(px*px + pz*pz);
        if (d < radarRadius) {
            minimapCtx.beginPath();
            minimapCtx.arc(px, pz, 2.5, 0, Math.PI * 2);
            if (p.type === 'health') minimapCtx.fillStyle = 'var(--neon-magenta)';
            else if (p.type === 'shield') minimapCtx.fillStyle = 'var(--neon-cyan)';
            else minimapCtx.fillStyle = 'var(--neon-yellow)';
            minimapCtx.fill();
        }
    });

    // Draw Drones (red dots)
    drones.forEach(d => {
        const px = (d.group.position.x - player.position.x) * scale;
        const pz = (d.group.position.z - player.position.z) * scale;
        
        const dist = Math.sqrt(px*px + pz*pz);
        if (dist < radarRadius) {
            minimapCtx.beginPath();
            minimapCtx.arc(px, pz, 3, 0, Math.PI * 2);
            minimapCtx.fillStyle = 'var(--neon-red)';
            minimapCtx.shadowColor = 'var(--neon-red)';
            minimapCtx.shadowBlur = 4;
            minimapCtx.fill();
            minimapCtx.shadowBlur = 0; // reset
        }
    });

    minimapCtx.restore();
    
    // Draw Player marker static in center pointing UP
    minimapCtx.beginPath();
    minimapCtx.moveTo(cx, cy - 6);
    minimapCtx.lineTo(cx - 5, cy + 5);
    minimapCtx.lineTo(cx + 5, cy + 5);
    minimapCtx.closePath();
    minimapCtx.fillStyle = 'var(--neon-cyan)';
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 1;
    minimapCtx.fill();
    minimapCtx.stroke();
}

// --- GUN ANIMATIONS LOOP ---
function updateGunAnimations(deltaTime) {
    // 1. Recoil recovery decay
    gunGroup.position.z += (-0.6 - gunGroup.position.z) * 12.0 * deltaTime;
    gunGroup.rotation.x += (0 - gunGroup.rotation.x) * 10.0 * deltaTime;

    // 2. Muzzle flash scale down decay
    if (muzzleFlash.scale.x > 0) {
        const decay = 25.0 * deltaTime;
        const scale = Math.max(0, muzzleFlash.scale.x - decay);
        muzzleFlash.scale.set(scale, scale, scale);
        
        const light = muzzleFlash.userData.light;
        light.intensity = Math.max(0, light.intensity - decay * 6);
    }

    // 3. Movement Sway and bobbing
    const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
    
    if (horizontalSpeed > 0.1 && player.isGrounded) {
        const time = performance.now() * 0.0075;
        // Sway bobbing curves
        const bobY = Math.sin(time * 2) * 0.018 - 0.3;
        const bobX = Math.cos(time) * 0.015 + 0.35;
        
        gunGroup.position.y += (bobY - gunGroup.position.y) * 8 * deltaTime;
        gunGroup.position.x += (bobX - gunGroup.position.x) * 8 * deltaTime;
    } else {
        // Resting position
        gunGroup.position.y += (-0.3 - gunGroup.position.y) * 6 * deltaTime;
        gunGroup.position.x += (0.35 - gunGroup.position.x) * 6 * deltaTime;
    }

    // 4. Weapon Reload rotations
    if (player.isReloading) {
        player.reloadTimer += deltaTime;
        
        // Spin or dip the gun to show active reloading state
        const reloadProgress = player.reloadTimer / 1.5; // 1.5 seconds reload
        
        if (reloadProgress < 0.5) {
            // Dip gun down
            gunGroup.rotation.x += (Math.PI / 3 - gunGroup.rotation.x) * 8 * deltaTime;
            gunGroup.position.y += (-0.6 - gunGroup.position.y) * 8 * deltaTime;
        } else if (reloadProgress < 1.0) {
            // Return gun up
            gunGroup.rotation.x += (0 - gunGroup.rotation.x) * 8 * deltaTime;
            gunGroup.position.y += (-0.3 - gunGroup.position.y) * 8 * deltaTime;
        } else {
            // Completed
            player.isReloading = false;
            player.ammoClip = player.maxClip;
            ammoClipText.style.color = '#ffffff';
            ammoClipText.textContent = player.ammoClip;
        }
    }
}

// --- MAIN GAME LOOP ---
function gameLoop(time) {
    requestAnimationFrame(gameLoop);

    let deltaTime = (time - lastTime) / 1000;
    // Cap delta time to prevent physics breakages on low FPS spikes
    deltaTime = Math.min(0.06, deltaTime);
    lastTime = time;

    if (isPaused) {
        // Render scene static while paused to prevent blank canvases
        renderer.render(scene, camera);
        return;
    }

    // 1. Invulnerability frames calculation
    if (player.invulnerable) {
        player.invulnerableTime -= deltaTime;
        if (player.invulnerableTime <= 0) {
            player.invulnerable = false;
        }
    }

    // 2. Physics & Collections
    updatePlayerMovement(deltaTime);
    handleShieldRegen(deltaTime);
    handlePowerUpCollections();

    // 3. Entity Systems updates
    handleEnemySystem(deltaTime);
    handleProjectiles(deltaTime);
    
    // Update active procedural particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update(deltaTime);
        if (p.isDead) {
            particles.splice(i, 1);
        }
    }

    // Update laser line cylinder beams visual fades
    for (let i = laserBeams.length - 1; i >= 0; i--) {
        const beam = laserBeams[i];
        beam.age += deltaTime;
        if (beam.age >= beam.lifetime) {
            scene.remove(beam.mesh);
            beam.mesh.geometry.dispose();
            beam.mesh.material.dispose();
            laserBeams.splice(i, 1);
        } else {
            // Scale and fade beam line slightly
            beam.mesh.material.opacity = 1.0 - (beam.age / beam.lifetime);
        }
    }

    // Rotate map core obstacle helper
    if (scene.userData.centerCore) {
        scene.userData.centerCore.rotation.y += 1.0 * deltaTime;
        scene.userData.centerCore.rotation.x += 0.5 * deltaTime;
    }

    // Update weapon model offsets and reload states
    updateGunAnimations(deltaTime);

    // 4. Item collections
    powerUps.forEach(p => p.update(deltaTime));

    // 5. Render Scene
    renderer.render(scene, camera);
    
    // 6. Draw 2D HUD overlays
    drawMinimap();
}

// --- GAME BOOTSTRAP ---
window.addEventListener('DOMContentLoaded', () => {
    init();
});
