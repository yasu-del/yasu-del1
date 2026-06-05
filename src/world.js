// Cyberpunk Arena Generation and Collision Geometry

export function createWorld(scene) {
    const colliders = [];
    const spawnPoints = [];

    // 1. Ambient Lighting (dark indigo/purple atmosphere)
    const ambientLight = new THREE.AmbientLight(0x0a0a20, 1.2);
    scene.add(ambientLight);

    // Subtle overhead moon light
    const dirLight = new THREE.DirectionalLight(0x334466, 0.6);
    dirLight.position.set(0, 30, 0);
    scene.add(dirLight);

    // 2. Floor System
    // Solid dark plane to catch point light reflections and raycasts
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshPhongMaterial({
        color: 0x04040a,
        specular: 0x222233,
        shininess: 40,
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Add GridHelper overlay for that classic Tron/Cyberpunk vector grid
    const grid = new THREE.GridHelper(100, 40, 0x00f0ff, 0x112233);
    grid.position.y = 0.01; // slightly above floor plane to avoid z-fighting
    scene.add(grid);

    // 3. Boundary Walls (-50 to 50 on X/Z coordinates)
    const wallHeight = 8;
    const wallThickness = 1.0;
    
    // Create wall geometries
    const wallGeoX = new THREE.BoxGeometry(100, wallHeight, wallThickness);
    const wallGeoZ = new THREE.BoxGeometry(wallThickness, wallHeight, 100);
    const wallMat = new THREE.MeshPhongMaterial({
        color: 0x0a0a14,
        specular: 0x111122,
        shininess: 20
    });

    const northWall = new THREE.Mesh(wallGeoX, wallMat);
    northWall.position.set(0, wallHeight/2, -50);
    scene.add(northWall);
    colliders.push(northWall);

    const southWall = new THREE.Mesh(wallGeoX, wallMat);
    southWall.position.set(0, wallHeight/2, 50);
    scene.add(southWall);
    colliders.push(southWall);

    const eastWall = new THREE.Mesh(wallGeoZ, wallMat);
    eastWall.position.set(50, wallHeight/2, 0);
    scene.add(eastWall);
    colliders.push(eastWall);

    const westWall = new THREE.Mesh(wallGeoZ, wallMat);
    westWall.position.set(-50, wallHeight/2, 0);
    scene.add(westWall);
    colliders.push(westWall);

    // Add decorative neon horizontal trims along the top edge of walls
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xff007f }); // Neon Magenta
    
    const northTrim = new THREE.Mesh(new THREE.BoxGeometry(100, 0.15, 0.15), trimMat);
    northTrim.position.set(0, wallHeight - 0.1, -49.8);
    scene.add(northTrim);
    
    const southTrim = new THREE.Mesh(new THREE.BoxGeometry(100, 0.15, 0.15), trimMat);
    southTrim.position.set(0, wallHeight - 0.1, 49.8);
    scene.add(southTrim);

    const eastTrim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 100), trimMat);
    eastTrim.position.set(49.8, wallHeight - 0.1, 0);
    scene.add(eastTrim);

    const westTrim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 100), trimMat);
    westTrim.position.set(-49.8, wallHeight - 0.1, 0);
    scene.add(westTrim);

    // 4. Columns & Obstacles
    // Symmetrical pillars with glowing neon rings
    const pillarPositions = [
        { x: -20, z: -20, color: 0x00f0ff }, // Cyan pillar
        { x: 20, z: -20, color: 0xff007f },  // Magenta pillar
        { x: -20, z: 20, color: 0xff007f },  // Magenta pillar
        { x: 20, z: 20, color: 0x00f0ff },   // Cyan pillar
        { x: 0, z: -35, color: 0xfffb00 },    // Yellow pillar (rear)
        { x: 0, z: 35, color: 0xfffb00 },     // Yellow pillar (front)
        { x: -35, z: 0, color: 0x00f0ff },    // Cyan pillar (left)
        { x: 35, z: 0, color: 0xff007f }      // Magenta pillar (right)
    ];

    pillarPositions.forEach((pos) => {
        const pillarGeo = new THREE.CylinderGeometry(1.5, 1.8, 10, 8);
        const pillarMat = new THREE.MeshPhongMaterial({
            color: 0x080812,
            specular: 0x222233,
            shininess: 30
        });
        
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(pos.x, 5, pos.z);
        scene.add(pillar);
        colliders.push(pillar);

        // Neon stripe running down the pillar
        const stripeGeo = new THREE.BoxGeometry(0.2, 9.8, 0.2);
        const stripeMat = new THREE.MeshBasicMaterial({ color: pos.color });
        
        // Add 4 stripes around the column
        const offsets = [[1.55,0], [-1.55,0], [0,1.55], [0,-1.55]];
        offsets.forEach(([ox, oz]) => {
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            stripe.position.set(pos.x + ox, 5, pos.z + oz);
            scene.add(stripe);
        });

        // Add point light near the center of the pillar for colored wall reflections
        const pLight = new THREE.PointLight(pos.color, 1.5, 12);
        pLight.position.set(pos.x, 3, pos.z);
        scene.add(pLight);
    });

    // 5. Center Obstacle Arena Structure (Tactical cover in center)
    const centerBlockGeo = new THREE.BoxGeometry(6, 4, 6);
    const centerBlockMat = new THREE.MeshPhongMaterial({
        color: 0x06060c,
        specular: 0x111122,
        shininess: 15
    });
    const centerBlock = new THREE.Mesh(centerBlockGeo, centerBlockMat);
    centerBlock.position.set(0, 2, 0);
    scene.add(centerBlock);
    colliders.push(centerBlock);

    // Core glass box above center block
    const coreGlassGeo = new THREE.BoxGeometry(4, 2, 4);
    const coreGlassMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    const coreGlass = new THREE.Mesh(coreGlassGeo, coreGlassMat);
    coreGlass.position.set(0, 5, 0);
    scene.add(coreGlass);

    // Glowing core floating inside the glass
    const coreHeart = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6, 0),
        new THREE.MeshBasicMaterial({ color: 0xff007f })
    );
    coreHeart.position.set(0, 5, 0);
    scene.add(coreHeart);
    
    // Animate helper rotation during tick
    scene.userData.centerCore = coreHeart;

    const centerLight = new THREE.PointLight(0xff007f, 2, 15);
    centerLight.position.set(0, 5.2, 0);
    scene.add(centerLight);

    // 6. Define Item Spawning Coordinates
    // Spawns will be placed around pillars and in corners, elevated 0.8 units off the floor
    spawnPoints.push(
        new THREE.Vector3(-15, 0.8, -15),
        new THREE.Vector3(15, 0.8, -15),
        new THREE.Vector3(-15, 0.8, 15),
        new THREE.Vector3(15, 0.8, 15),
        new THREE.Vector3(0, 0.8, -25),
        new THREE.Vector3(0, 0.8, 25),
        new THREE.Vector3(-25, 0.8, 0),
        new THREE.Vector3(25, 0.8, 0),
        new THREE.Vector3(-40, 0.8, -40),
        new THREE.Vector3(40, 0.8, -40),
        new THREE.Vector3(-40, 0.8, 40),
        new THREE.Vector3(40, 0.8, 40)
    );

    return {
        colliders: colliders,
        spawnPoints: spawnPoints
    };
}
