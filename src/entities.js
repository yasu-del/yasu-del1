// Game Entities: Drone, Projectile, PowerUp, and Particles

// 1. Particle System for Neon Sparks and Explosion Effects
export class Particle {
    constructor(scene, position, color, size = 0.2, speed = 8) {
        this.scene = scene;
        
        // Use small box or octahedron for cyberpunk particle shard look
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.scene.add(this.mesh);
        
        // Random velocity vector
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        
        this.velocity = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta) * 0.7 + 0.3, // slight upward bias
            Math.cos(phi)
        ).multiplyScalar(Math.random() * speed + 2);
        
        this.gravity = -9.8;
        this.friction = 0.95;
        this.lifetime = Math.random() * 0.5 + 0.3; // 0.3 - 0.8 seconds
        this.age = 0;
        this.isDead = false;
    }

    update(deltaTime) {
        this.age += deltaTime;
        if (this.age >= this.lifetime) {
            this.destroy();
            return;
        }

        // Apply physics
        this.velocity.y += this.gravity * deltaTime;
        this.velocity.multiplyScalar(this.friction);
        this.mesh.position.addScaledVector(this.velocity, deltaTime);
        
        // Fade out and shrink
        const lifePercent = 1 - (this.age / this.lifetime);
        this.mesh.material.opacity = lifePercent;
        this.mesh.scale.setScalar(lifePercent);
    }

    destroy() {
        this.isDead = true;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// 2. Drone Enemy Class
export class Drone {
    constructor(scene, position, player, wave = 1) {
        this.scene = scene;
        this.player = player;
        
        this.health = 40 + (wave * 10);
        this.maxHealth = this.health;
        this.scoreValue = 100 * wave;
        
        // Visual design: Glowing core with a rotating outer neon ring
        this.group = new THREE.Group();
        this.group.position.copy(position);
        
        // 2a. Glowing core (Icosahedron for sci-fi look)
        const coreGeo = new THREE.IcosahedronGeometry(0.8, 1);
        this.coreMat = new THREE.MeshBasicMaterial({
            color: 0xff007f, // Neon Magenta
            wireframe: false
        });
        this.core = new THREE.Mesh(coreGeo, this.coreMat);
        this.group.add(this.core);
        
        // 2b. Outer spinning rings
        const ringGeo = new THREE.TorusGeometry(1.3, 0.08, 8, 24);
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff, // Neon Cyan
            wireframe: true
        });
        this.ring1 = new THREE.Mesh(ringGeo, this.ringMat);
        this.ring2 = new THREE.Mesh(ringGeo, this.ringMat);
        
        // Angle them differently
        this.ring2.rotation.x = Math.PI / 2;
        
        this.group.add(this.ring1);
        this.group.add(this.ring2);
        
        // Add point light inside the drone for atmospheric glow
        this.light = new THREE.PointLight(0xff007f, 1.5, 8);
        this.group.add(this.light);
        
        this.scene.add(this.group);
        
        // Hitbox parameters
        this.radius = 1.2;
        
        // AI State
        this.hoverOffset = Math.random() * Math.PI * 2;
        this.speed = 4 + Math.min(wave * 0.5, 6);
        this.shootCooldown = 2.0 - Math.min(wave * 0.1, 1.2); // Shoot faster in later waves
        this.timeSinceLastShot = Math.random() * this.shootCooldown; // stagger shots
        this.isDead = false;
        
        // Hit flash animation
        this.flashTime = 0;
    }

    update(deltaTime, projectiles) {
        if (this.isDead) return;
        
        const now = performance.now();
        
        // 1. Hit Flash recovery
        if (this.flashTime > 0) {
            this.flashTime -= deltaTime;
            if (this.flashTime <= 0) {
                this.coreMat.color.setHex(0xff007f); // revert to magenta
                this.ringMat.color.setHex(0x00f0ff); // revert to cyan
            }
        }
        
        // 2. Animations (spin rings, bob core up/down)
        this.ring1.rotation.y += 1.5 * deltaTime;
        this.ring1.rotation.x += 0.5 * deltaTime;
        this.ring2.rotation.y -= 1.0 * deltaTime;
        this.ring2.rotation.z += 0.8 * deltaTime;
        
        const bob = Math.sin((now * 0.003) + this.hoverOffset) * 0.15;
        this.core.position.y = bob;
        this.light.intensity = 1.5 + Math.sin(now * 0.01) * 0.5; // pulsing glow
        
        // 3. AI Movement (Move toward player but keep some distance)
        const toPlayer = new THREE.Vector3().copy(this.player.position).sub(this.group.position);
        // Ignore Y for floor-based distance logic
        const dist2D = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z);
        
        toPlayer.normalize();
        
        const targetVelocity = new THREE.Vector3();
        
        if (dist2D > 18) {
            // Far away: Move closer
            targetVelocity.copy(toPlayer).multiplyScalar(this.speed);
        } else if (dist2D < 10) {
            // Too close: Back up
            targetVelocity.copy(toPlayer).multiplyScalar(-this.speed);
        } else {
            // Ideal range: Strafe side to side slowly
            const strafeDir = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
            const strafeSpeed = Math.sin((now * 0.001) + this.hoverOffset) * this.speed * 0.6;
            targetVelocity.copy(strafeDir).multiplyScalar(strafeSpeed);
        }
        
        // Maintain hovering height (typically 4-8 units above ground)
        const targetHeight = 5.0 + Math.sin((now * 0.002) + this.hoverOffset) * 1.5;
        targetVelocity.y = (targetHeight - this.group.position.y) * 2.0; // P-controller style height drift
        
        // Apply velocity
        this.group.position.addScaledVector(targetVelocity, deltaTime);
        
        // Keep drone inside boundary limits (-48 to 48)
        this.group.position.x = Math.max(-48, Math.min(48, this.group.position.x));
        this.group.position.z = Math.max(-48, Math.min(48, this.group.position.z));
        this.group.position.y = Math.max(1, Math.min(15, this.group.position.y));
        
        // 4. Shooting AI
        this.timeSinceLastShot += deltaTime;
        if (this.timeSinceLastShot >= this.shootCooldown) {
            this.shoot(projectiles);
            this.timeSinceLastShot = 0;
        }
    }

    shoot(projectiles) {
        // Shoot directly towards the player's chest height (Y is player height / camera height)
        const targetPos = new THREE.Vector3().copy(this.player.position);
        targetPos.y += 1.6; // average camera height
        
        const spawnPos = new THREE.Vector3().copy(this.group.position);
        const direction = new THREE.Vector3().copy(targetPos).sub(spawnPos).normalize();
        
        // Push slightly ahead of the core
        spawnPos.addScaledVector(direction, 1.2);
        
        projectiles.push(new PlasmaProjectile(this.scene, spawnPos, direction));
    }

    takeDamage(damage) {
        if (this.isDead) return false;
        
        this.health -= damage;
        
        // Flash bright white when damaged
        this.coreMat.color.setHex(0xffffff);
        this.ringMat.color.setHex(0xffffff);
        this.flashTime = 0.08;
        
        if (this.health <= 0) {
            this.isDead = true;
            return true; // Enemy destroyed
        }
        return false;
    }

    destroy() {
        this.scene.remove(this.group);
        
        // Recursive disposal of child meshes
        this.group.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}

// 3. Enemy Plasma Projectile
export class PlasmaProjectile {
    constructor(scene, position, direction) {
        this.scene = scene;
        this.direction = new THREE.Vector3().copy(direction).normalize();
        this.speed = 15;
        this.damage = 15;
        this.radius = 0.35;
        this.isDead = false;
        this.lifetime = 5.0; // Destroy after 5 seconds to prevent memory leaks
        this.age = 0;
        
        // Glowing sphere mesh
        const geometry = new THREE.SphereGeometry(this.radius, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x39ff14, // Neon Green plasma
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        
        // Mini point light for neon plasma effect
        this.light = new THREE.PointLight(0x39ff14, 1.0, 4);
        this.mesh.add(this.light);
        
        this.scene.add(this.mesh);
    }

    update(deltaTime) {
        this.age += deltaTime;
        if (this.age >= this.lifetime) {
            this.destroy();
            return;
        }
        
        // Move projectile forward
        this.mesh.position.addScaledVector(this.direction, this.speed * deltaTime);
    }

    destroy() {
        this.isDead = true;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// 4. Floating Power-Up Items (Health, Shield, Ammo)
export class PowerUp {
    constructor(scene, position, type) {
        this.scene = scene;
        this.position = new THREE.Vector3().copy(position);
        this.type = type; // 'health', 'shield', 'ammo'
        this.isDead = false;
        this.radius = 0.8;
        
        this.group = new THREE.Group();
        this.group.position.copy(this.position);
        
        // Create procedurally styled 3D meshes based on type
        let color = 0xffffff;
        let geometry;
        
        if (type === 'health') {
            color = 0xff007f; // Neon Magenta (Cross shapes represent health)
            
            // Draw a 3D Cross using a horizontal and vertical box
            const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.25), new THREE.MeshBasicMaterial({ color }));
            const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), new THREE.MeshBasicMaterial({ color }));
            this.group.add(box1);
            this.group.add(box2);
        } else if (type === 'shield') {
            color = 0x00f0ff; // Neon Cyan (Shield cells: diamond/torus shape)
            
            geometry = new THREE.OctahedronGeometry(0.5, 0);
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, wireframe: true }));
            
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 4, 16), new THREE.MeshBasicMaterial({ color }));
            ring.rotation.x = Math.PI / 2;
            
            this.group.add(mesh);
            this.group.add(ring);
        } else if (type === 'ammo') {
            color = 0xfffb00; // Neon Yellow (Ammo crate: double glowing cylinders/cubes)
            color = 0xfffb00;
            
            geometry = new THREE.BoxGeometry(0.6, 0.5, 0.6);
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, wireframe: true }));
            
            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8), new THREE.MeshBasicMaterial({ color }));
            
            this.group.add(mesh);
            this.group.add(core);
        }
        
        // Ring base glow
        const glowRing = new THREE.Mesh(
            new THREE.RingGeometry(0.4, 0.5, 16),
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
        );
        glowRing.rotation.x = Math.PI / 2;
        glowRing.position.y = -0.5;
        this.group.add(glowRing);
        
        this.light = new THREE.PointLight(color, 0.8, 4);
        this.group.add(this.light);
        
        this.scene.add(this.group);
        this.hoverOffset = Math.random() * Math.PI * 2;
    }

    update(deltaTime) {
        if (this.isDead) return;
        
        const now = performance.now();
        
        // Spin and float animations
        this.group.rotation.y += 1.0 * deltaTime;
        this.group.position.y = this.position.y + Math.sin((now * 0.003) + this.hoverOffset) * 0.25;
    }

    destroy() {
        this.isDead = true;
        this.scene.remove(this.group);
        
        this.group.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
