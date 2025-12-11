// simulation.js - 3D Physics simulation
// Handles creature spawning, physics, camera controls, and creature selection

class Simulation {
    constructor(containerElement) {
        this.container = containerElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.ground = null;
        
        this.isRunning = false;
        this.isPaused = false;
        this.timeElapsed = 0;
        this.maxTime = 60; // Default duration in seconds, configurable via setMaxTime()
        this.fixedTimeStep = 1.0 / 60.0;
        this.maxSubSteps = 3;
        
        // Gravity settings - base value is Earth gravity (9.82 m/sÃ‚Â²)
        // Multiplier can be adjusted from 0.1 (10%) to 2.0 (200%)
        this.baseGravity = 9.82;
        this.gravityMultiplier = 1.0;
        
        this.fitnessMode = 'distance';
        
        this.currentCreature = null;
        this.activeCreatures = [];
        this.creatureStartPosition = [0, 3, 0];
        
        this.selectedCreature = null;
        this.raycaster = null;
        this.mousePosition = null;
        
        // Camera control state - using boolean flags for different modes
        this.cameraDistance = 40;
        this.cameraRotationX = 0;
        this.cameraRotationY = Math.PI / 6;
        
        this.overviewMode = false;
        this.overviewHeight = 120;
        this.overviewRotation = 0;
        this.overviewCenter = new THREE.Vector3(0, 0, 0);
        this.savedCameraState = null;
        
        this.cameraLookAt = new THREE.Vector3(0, 3, 0);
        this.cameraPosition = new THREE.Vector3(0, 50, 80);
        this.cameraVelocity = new THREE.Vector3(0, 0, 0);
        this.lookAtVelocity = new THREE.Vector3(0, 0, 0);
        this.cameraSmoothTime = 0.4;
        this.followLeader = true;
        this.lastFollowedCreature = null;
        
        this.mouseDown = false;
        this.mouseButton = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseMoved = false;
        
        this.onSelectionChanged = null;
        this.onFollowLeaderChanged = null;
        
        this.isCelebrating = false;
        this.celebrationDebris = [];
        this.spotlight = null;
        this.spotlightTarget = null;
        this.celebrationStartTime = 0;
        
        this.suddenDeathMode = false;
        this.suddenDeathStartTime = 10;
        this.suddenDeathPercent = 0.75;
        this.eliminatedCreatures = new Set();
        this.lastEliminationTime = 0;
        this.eliminationQueue = [];
        this.isEliminatingCreature = false;
        
        this.groundCanvas = null;
        this.groundCtx = null;
        this.groundTexture = null;
        this.groundSize = 200;
        this.tileResolution = 2048;
        this.litTiles = new Set();
        
        this.COLLISION_GROUP_GROUND = 1;
        this.nextCreatureCollisionGroup = 2;
        
        this.init();
    }
    
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 100, 400);
        
        // Store lighting references for day/night cycle
        this.ambientLight = null;
        this.sunLight = null;
        this.hemiLight = null;
        this.fillLight = null;
        
        // Override for day progress (used by lineage playback mode)
        // When >= 0, this value is used instead of timeElapsed/maxTime
        this.overrideDayProgress = -1;
        
        // Visual sky elements
        this.sunMesh = null;      // Visible sun in the sky
        this.clouds = [];         // Array of cloud meshes
        
        this.camera = new THREE.PerspectiveCamera(
            60, window.innerWidth / window.innerHeight, 0.1, 1000
        );
        this.camera.position.set(0, 50, 80);
        this.camera.lookAt(0, 0, 0);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        
        // Ambient light - provides base illumination
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);
        
        // Hemisphere light - simulates sky and ground reflection
        this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.25);
        this.hemiLight.position.set(0, 50, 0);
        this.scene.add(this.hemiLight);
        
        // Sun (directional light) - main light source that will move across the sky
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.scene.add(this.sunLight);
        
        // Fill light - adds dimension and softens shadows
        this.fillLight = new THREE.DirectionalLight(0xaabbff, 0.3);
        this.fillLight.position.set(-30, 40, -30);
        this.scene.add(this.fillLight);
        
        // Create visual sky elements (sun and clouds)
        this.createSkyElements();
        
        this.world = new CANNON.World();
        this.world.gravity.set(0, -this.baseGravity * this.gravityMultiplier, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        this.world.defaultContactMaterial.friction = 0.4;
        
        this.createGround();
        this.initTileInstances();
        this.createCrownIndicator();
        this.currentBestCreature = null;
        
        this.raycaster = new THREE.Raycaster();
        this.mousePosition = new THREE.Vector2();
        
        window.addEventListener('resize', () => this.onWindowResize(), false);
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e), false);
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
        this.renderer.domElement.addEventListener('mouseup', (e) => this.onMouseUp(e), false);
        this.renderer.domElement.addEventListener('wheel', (e) => this.onMouseWheel(e), false);
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault(), false);
        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e), false);
        
        this.visualEffects = new VisualEffects(this.scene);
    }
    
    /**
     * Create visual sky elements - sun and clouds
     */
    createSkyElements() {
        // Create the sun - a glowing sphere in the sky
        const sunGeometry = new THREE.SphereGeometry(8, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff99,
            fog: false, // Don't let fog affect the sun
        });
        this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sunMesh.position.set(50, 100, 50); // Initial position (will be updated)
        this.scene.add(this.sunMesh);
        
        // Create clouds - simple fluffy shapes using grouped spheres
        const cloudCount = 12;
        for (let i = 0; i < cloudCount; i++) {
            const cloud = this.createCloud();
            
            // Position clouds at various heights and distances
            const angle = (i / cloudCount) * Math.PI * 2;
            const distance = 80 + Math.random() * 60;
            const height = 50 + Math.random() * 40;
            
            cloud.position.set(
                Math.cos(angle) * distance,
                height,
                Math.sin(angle) * distance
            );
            
            // Random rotation for variety
            cloud.rotation.y = Math.random() * Math.PI * 2;
            
            // Store initial angle for drift animation
            cloud.userData.angle = angle;
            cloud.userData.distance = distance;
            cloud.userData.driftSpeed = 0.01 + Math.random() * 0.02;
            
            this.clouds.push(cloud);
            this.scene.add(cloud);
        }
    }
    
    /**
     * Create a single cloud using grouped spheres
     */
    createCloud() {
        const cloudGroup = new THREE.Group();
        
        // Cloud material - semi-transparent white
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            fog: true,
        });
        
        // Create 3-5 puffs per cloud
        const puffCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < puffCount; i++) {
            const size = 3 + Math.random() * 4;
            const puff = new THREE.Mesh(
                new THREE.SphereGeometry(size, 8, 8),
                cloudMaterial
            );
            
            // Position puffs to form an elongated cloud shape
            puff.position.set(
                (i - puffCount / 2) * (size * 0.6),
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            );
            
            // Slightly squash vertically for flatter cloud look
            puff.scale.y = 0.6 + Math.random() * 0.3;
            
            cloudGroup.add(puff);
        }
        
        // Overall cloud scale variation
        const cloudScale = 0.8 + Math.random() * 0.6;
        cloudGroup.scale.setScalar(cloudScale);
        
        return cloudGroup;
    }
    
    /**
     * Update cloud positions - slowly drift them around the sky
     */
    updateClouds(deltaTime) {
        for (let cloud of this.clouds) {
            // Drift clouds slowly around in a circle
            cloud.userData.angle += cloud.userData.driftSpeed * deltaTime;
            
            cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.distance;
            cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.distance;
        }
    }
    
    /**
     * Set the maximum time for evolution rounds
     * @param {number} seconds - Duration in seconds (30-600)
     */
    setMaxTime(seconds) {
        // Clamp between 30 seconds and 10 minutes (600 seconds)
        this.maxTime = Math.max(30, Math.min(600, seconds));
        console.log(`Evolution round duration set to ${this.maxTime} seconds`);
    }
    
    /**
     * Set the gravity multiplier for the simulation
     * @param {number} multiplier - Gravity multiplier (0.1 to 2.0, where 1.0 = Earth gravity)
     */
    setGravity(multiplier) {
        // Clamp between 10% and 200% of Earth gravity
        this.gravityMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
        
        // Update the physics world gravity
        const gravityValue = -this.baseGravity * this.gravityMultiplier;
        this.world.gravity.set(0, gravityValue, 0);
        
        // Wake up all physics bodies so they respond to the new gravity
        for (let creature of this.activeCreatures) {
            if (creature.bodies) {
                for (let body of creature.bodies) {
                    body.wakeUp();
                }
            }
        }
        
        const percentDisplay = Math.round(this.gravityMultiplier * 100);
        console.log(`Gravity set to ${percentDisplay}% (${Math.abs(gravityValue).toFixed(2)} m/sÃ‚Â²)`);
    }
    
    /**
     * Get current gravity as a percentage (for UI display)
     * @returns {number} Gravity percentage (10-200)
     */
    getGravityPercent() {
        return Math.round(this.gravityMultiplier * 100);
    }
    
    /**
     * Update day/night cycle based on time progression
     * The sun rises at the start, reaches noon at midpoint, and sets at the end
     */
    updateDayNightCycle() {
        // Allow day/night cycle even when paused if we have an override (for lineage mode)
        if (!this.isRunning && this.overrideDayProgress < 0) return;
        if (this.isPaused && this.overrideDayProgress < 0) return;
        
        // Calculate progress through the day (0 = sunrise, 0.5 = noon, 1 = sunset)
        // Use override value if set (for lineage playback mode), otherwise use normal calculation
        const dayProgress = this.overrideDayProgress >= 0 
            ? this.overrideDayProgress 
            : this.timeElapsed / this.maxTime;
        
        // Sun angle: starts at horizon (east), arcs to zenith, sets at horizon (west)
        // Using sine wave to create smooth arc across sky
        const sunAngle = dayProgress * Math.PI; // 0 to PI (180 degrees)
        const sunHeight = Math.sin(sunAngle) * 120; // Height: 0 -> 120 -> 0
        const sunX = Math.cos(sunAngle * 2 - Math.PI) * 100; // East to West
        
        // Update sun light position
        this.sunLight.position.set(sunX, Math.max(20, sunHeight), 50);
        
        // Update visible sun mesh position (further away and scaled for perspective)
        if (this.sunMesh) {
            this.sunMesh.position.set(sunX * 3, Math.max(60, sunHeight * 2.5), 150);
        }
        
        // Calculate lighting based on sun height
        // Early morning (0-0.15): Dark blue (night -> dawn)
        // Morning (0.15-0.35): Dawn blue transitioning to day
        // Noon (0.35-0.65): Bright daylight
        // Evening (0.65-0.85): Day transitioning to dusk blue
        // Late evening (0.85-1.0): Dusk blue to dark blue (night)
        
        let skyColor, fogColor, sunColor, sunIntensity, ambientIntensity, hemiIntensity, sunMeshColor;
        
        if (dayProgress < 0.15) {
            // EARLY DAWN (0-0.15) - Very dark blue, almost night
            const t = dayProgress / 0.15; // 0 to 1
            
            skyColor = this.lerpColor(0x0a1428, 0x1a3a5c, t); // Deep night blue to dark dawn blue
            fogColor = this.lerpColor(0x0a1428, 0x1a3a5c, t);
            sunColor = this.lerpColor(0x4a6a8a, 0xffa366, t); // Cool blue to warm orange
            
            sunIntensity = 0.1 + t * 0.2; // 0.1 to 0.3
            ambientIntensity = 0.1 + t * 0.1; // 0.1 to 0.2
            hemiIntensity = 0.08 + t * 0.07; // 0.08 to 0.15
            
            sunMeshColor = this.lerpColor(0x6688aa, 0xffcc88, t); // Cool to warm
            
        } else if (dayProgress < 0.35) {
            // SUNRISE/MORNING (0.15-0.35) - Dawn blue to bright day
            const t = (dayProgress - 0.15) / 0.2; // 0 to 1
            
            skyColor = this.lerpColor(0x1a3a5c, 0x87ceeb, t); // Dark blue to sky blue
            fogColor = this.lerpColor(0x1a3a5c, 0x87ceeb, t);
            sunColor = this.lerpColor(0xffa366, 0xffffee, t); // Orange to white
            
            sunIntensity = 0.3 + t * 0.3; // 0.3 to 0.6
            ambientIntensity = 0.2 + t * 0.1; // 0.2 to 0.3
            hemiIntensity = 0.15 + t * 0.1; // 0.15 to 0.25
            
            sunMeshColor = this.lerpColor(0xffcc88, 0xffffdd, t); // Warm to bright
            
        } else if (dayProgress < 0.65) {
            // MIDDAY (0.35-0.65) - Bright daylight
            const t = (dayProgress - 0.35) / 0.3; // 0 to 1
            
            skyColor = 0x87ceeb; // Sky blue
            fogColor = 0x87ceeb;
            sunColor = 0xffffee; // Bright white-yellow
            
            sunIntensity = 0.6 + t * 0.1; // 0.6 to 0.7 (peak brightness)
            ambientIntensity = 0.3 + t * 0.05; // 0.3 to 0.35
            hemiIntensity = 0.25;
            
            sunMeshColor = 0xffffdd; // Bright yellow-white
            
        } else if (dayProgress < 0.85) {
            // SUNSET/EVENING (0.65-0.85) - Day to dusk blue
            const t = (dayProgress - 0.65) / 0.2; // 0 to 1
            
            skyColor = this.lerpColor(0x87ceeb, 0x1a3a5c, t); // Sky blue to dark blue
            fogColor = this.lerpColor(0x87ceeb, 0x2a4a6c, t); // Sky blue to dusk blue
            sunColor = this.lerpColor(0xffffee, 0xff8844, t); // White to orange
            
            sunIntensity = 0.7 - t * 0.4; // 0.7 to 0.3
            ambientIntensity = 0.35 - t * 0.15; // 0.35 to 0.2
            hemiIntensity = 0.25 - t * 0.1; // 0.25 to 0.15
            
            sunMeshColor = this.lerpColor(0xffffdd, 0xff9944, t); // Bright to orange
            
        } else {
            // LATE DUSK (0.85-1.0) - Dusk blue to deep night
            const t = (dayProgress - 0.85) / 0.15; // 0 to 1
            
            skyColor = this.lerpColor(0x1a3a5c, 0x0a1428, t); // Dark blue to very dark blue
            fogColor = this.lerpColor(0x2a4a6c, 0x0a1428, t);
            sunColor = this.lerpColor(0xff8844, 0x4a6a8a, t); // Orange to cool blue
            
            sunIntensity = 0.3 - t * 0.2; // 0.3 to 0.1
            ambientIntensity = 0.2 - t * 0.1; // 0.2 to 0.1
            hemiIntensity = 0.15 - t * 0.07; // 0.15 to 0.08
            
            sunMeshColor = this.lerpColor(0xff9944, 0x6688aa, t); // Orange to cool
        }
        
        // Apply lighting changes
        this.scene.background.setHex(skyColor);
        this.scene.fog.color.setHex(fogColor);
        this.sunLight.color.setHex(sunColor);
        this.sunLight.intensity = sunIntensity;
        this.ambientLight.intensity = ambientIntensity;
        this.hemiLight.intensity = hemiIntensity;
        
        // Update sun mesh appearance
        if (this.sunMesh) {
            this.sunMesh.material.color.setHex(sunMeshColor);
            
            // Make sun larger and more visible at horizon (sunrise/sunset)
            const horizonFactor = 1 - Math.abs(dayProgress - 0.5) * 2; // 1 at edges, 0 at noon
            const sunScale = 1 + horizonFactor * 0.5; // Bigger at horizon
            this.sunMesh.scale.setScalar(sunScale);
            
            // Fade sun below horizon
            if (sunHeight < 30) {
                this.sunMesh.visible = false;
            } else {
                this.sunMesh.visible = true;
            }
        }
        
        // Update hemisphere light colors to match time of day
        if (dayProgress < 0.5) {
            // Morning - cool sky, warm ground
            this.hemiLight.color.setHex(skyColor);
            this.hemiLight.groundColor.setHex(0x8b7355);
        } else {
            // Evening - cool sky, cool ground
            this.hemiLight.color.setHex(skyColor);
            this.hemiLight.groundColor.setHex(0x6b5b4a);
        }
    }
    
    /**
     * Linear interpolation between two hex colors
     */
    lerpColor(color1, color2, t) {
        const c1 = new THREE.Color(color1);
        const c2 = new THREE.Color(color2);
        return c1.lerp(c2, t).getHex();
    }
    
    createGround() {
        this.groundCanvas = document.createElement('canvas');
        this.groundCanvas.width = this.tileResolution;
        this.groundCanvas.height = this.tileResolution;
        this.groundCtx = this.groundCanvas.getContext('2d');
        
        this.drawGroundGrid();
        
        this.groundTexture = new THREE.CanvasTexture(this.groundCanvas);
        this.groundTexture.magFilter = THREE.NearestFilter;
        this.groundTexture.minFilter = THREE.LinearFilter;
        
        const groundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(this.groundSize, this.groundSize),
            new THREE.MeshLambertMaterial({ 
                map: this.groundTexture,
                side: THREE.DoubleSide 
            })
        );
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);
        
        const groundBody = new CANNON.Body({ 
            mass: 0,
            collisionFilterGroup: this.COLLISION_GROUP_GROUND,
            collisionFilterMask: 0xFFFFFFFF
        });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);
        
        this.ground = { mesh: groundMesh, body: groundBody };
    }
    
    drawGroundGrid() {
        const ctx = this.groundCtx;
        const w = this.groundCanvas.width;
        const h = this.groundCanvas.height;
        
        ctx.fillStyle = '#3d6428';
        ctx.fillRect(0, 0, w, h);
        
        const pixelsPerUnit = w / this.groundSize;
        const tileSize = 0.1;
        const pixelsPerTile = pixelsPerUnit * tileSize;
        
        ctx.strokeStyle = 'rgba(60, 90, 40, 0.4)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= w; i += pixelsPerTile * 5) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(w, i);
            ctx.stroke();
        }
        
        ctx.strokeStyle = 'rgba(45, 75, 30, 0.6)';
        ctx.lineWidth = 1;
        const majorGridPixels = pixelsPerUnit * 1;
        for (let i = 0; i <= w; i += majorGridPixels) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(w, i);
            ctx.stroke();
        }
        
        ctx.strokeStyle = 'rgba(30, 60, 20, 0.8)';
        ctx.lineWidth = 2;
        const majorGridPixels5 = pixelsPerUnit * 5;
        for (let i = 0; i <= w; i += majorGridPixels5) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(w, i);
            ctx.stroke();
        }
    }
    
    initTileInstances() {
        this.tileWorldSize = 0.1;
        // Increased from 100,000 - complex creature movements can easily exceed that
        // especially with area-coverage fitness mode or many creatures
        this.maxTileInstances = 300000;
        this.tileLimitWarned = false;  // Track if we've already warned about hitting limit
        
        const tileGeometry = new THREE.PlaneGeometry(
            this.tileWorldSize * 0.8,
            this.tileWorldSize * 0.8
        );
        
        const tileMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        this.tileInstanceMesh = new THREE.InstancedMesh(
            tileGeometry, 
            tileMaterial, 
            this.maxTileInstances
        );
        
        this.tileInstanceMesh.count = 0;
        this.tileInstanceMesh.castShadow = false;
        this.tileInstanceMesh.receiveShadow = false;
        this.tileInstanceMesh.frustumCulled = false;
        
        this.scene.add(this.tileInstanceMesh);
        
        this.tileKeyToIndex = new Map();
        this.nextTileIndex = 0;
        
        this.tileRotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        this.tileTranslationMatrix = new THREE.Matrix4();
        this.tileMatrix = new THREE.Matrix4();
    }
    
    lightTile(worldX, worldZ, creature = null) {
        const tileX = Math.floor(worldX / this.tileWorldSize);
        const tileZ = Math.floor(worldZ / this.tileWorldSize);
        const tileKey = `${tileX},${tileZ}`;
        
        if (creature && creature.tilesLit) {
            creature.tilesLit.add(tileKey);
        }
        
        if (this.litTiles.has(tileKey)) {
            return tileKey;
        }
        
        this.litTiles.add(tileKey);
        
        // Check if we've hit the instance limit
        if (this.nextTileIndex >= this.maxTileInstances) {
            // Only warn once per generation to avoid console spam
            if (!this.tileLimitWarned) {
                console.warn(`[Tiles] Hit maximum tile instance limit (${this.maxTileInstances}). ` +
                    `New creature paths won't show visual trails until next generation.`);
                this.tileLimitWarned = true;
            }
            return tileKey;
        }
        
        const tileCenterX = (tileX + 0.5) * this.tileWorldSize;
        const tileCenterZ = (tileZ + 0.5) * this.tileWorldSize;
        
        this.tileTranslationMatrix.makeTranslation(tileCenterX, 0.03, tileCenterZ);
        this.tileMatrix.multiplyMatrices(this.tileTranslationMatrix, this.tileRotationMatrix);
        
        const instanceIndex = this.nextTileIndex;
        this.tileInstanceMesh.setMatrixAt(instanceIndex, this.tileMatrix);
        this.nextTileIndex++;
        
        this.tileInstanceMesh.count = this.nextTileIndex;
        this.tileInstanceMesh.instanceMatrix.needsUpdate = true;
        
        this.tileKeyToIndex.set(tileKey, instanceIndex);
        
        return tileKey;
    }
    
    updateCreatureTracks(creature) {
        if (!creature || !creature.bodies || !creature.blocks) return;
        
        const tileSize = this.tileWorldSize;
        const groundTolerance = 0.03;
        const sampleSpacing = tileSize / 2;
        
        if (!this._samplePoint) {
            this._samplePoint = new THREE.Vector3();
            this._trackingQuat = new THREE.Quaternion();
            this._trackingPos = new THREE.Vector3();
        }
        
        for (let i = 0; i < creature.bodies.length; i++) {
            const body = creature.bodies[i];
            const block = creature.blocks[i];
            
            if (!body || !block) continue;
            
            const halfW = block.size[0] / 2;
            const halfH = block.size[1] / 2;
            const halfD = block.size[2] / 2;
            
            const maxExtent = Math.sqrt(halfW*halfW + halfH*halfH + halfD*halfD);
            if (body.position.y > maxExtent + groundTolerance) continue;
            
            this._trackingQuat.set(
                body.quaternion.x,
                body.quaternion.y,
                body.quaternion.z,
                body.quaternion.w
            );
            this._trackingPos.set(
                body.position.x,
                body.position.y,
                body.position.z
            );
            
            for (let ly = -halfH; ly <= halfH; ly += sampleSpacing) {
                for (let lz = -halfD; lz <= halfD; lz += sampleSpacing) {
                    this._checkGroundContact(-halfW, ly, lz, groundTolerance, creature);
                }
            }
            
            for (let ly = -halfH; ly <= halfH; ly += sampleSpacing) {
                for (let lz = -halfD; lz <= halfD; lz += sampleSpacing) {
                    this._checkGroundContact(halfW, ly, lz, groundTolerance, creature);
                }
            }
            
            for (let lx = -halfW; lx <= halfW; lx += sampleSpacing) {
                for (let lz = -halfD; lz <= halfD; lz += sampleSpacing) {
                    this._checkGroundContact(lx, -halfH, lz, groundTolerance, creature);
                }
            }
            
            for (let lx = -halfW; lx <= halfW; lx += sampleSpacing) {
                for (let lz = -halfD; lz <= halfD; lz += sampleSpacing) {
                    this._checkGroundContact(lx, halfH, lz, groundTolerance, creature);
                }
            }
            
            for (let lx = -halfW; lx <= halfW; lx += sampleSpacing) {
                for (let ly = -halfH; ly <= halfH; ly += sampleSpacing) {
                    this._checkGroundContact(lx, ly, -halfD, groundTolerance, creature);
                }
            }
            
            for (let lx = -halfW; lx <= halfW; lx += sampleSpacing) {
                for (let ly = -halfH; ly <= halfH; ly += sampleSpacing) {
                    this._checkGroundContact(lx, ly, halfD, groundTolerance, creature);
                }
            }
        }
        
        this.updateCreatureJumpTracking(creature);
    }
    
    _checkGroundContact(lx, ly, lz, tolerance, creature) {
        this._samplePoint.set(lx, ly, lz);
        this._samplePoint.applyQuaternion(this._trackingQuat);
        this._samplePoint.add(this._trackingPos);
        
        if (this._samplePoint.y <= tolerance && this._samplePoint.y >= -tolerance) {
            this.lightTile(this._samplePoint.x, this._samplePoint.z, creature);
        }
    }
    
    updateCreatureJumpTracking(creature) {
        if (!creature || !creature.bodies || creature.bodies.length === 0) return;
        
        let lowestY = Infinity;
        for (let body of creature.bodies) {
            lowestY = Math.min(lowestY, body.position.y);
        }
        
        const groundThreshold = 0.7;
        const isGrounded = lowestY < groundThreshold;
        
        if (!creature.hasLandedAfterSpawn && isGrounded) {
            creature.hasLandedAfterSpawn = true;
            creature.groundedY = lowestY;
            creature.maxJumpHeight = 0;
        }
        
        if (creature.hasLandedAfterSpawn) {
            let comY = 0;
            for (let body of creature.bodies) {
                comY += body.position.y;
            }
            comY /= creature.bodies.length;
            
            const heightAboveGround = comY - creature.groundedY;
            
            if (!isGrounded && heightAboveGround > 0) {
                creature.maxJumpHeight = Math.max(creature.maxJumpHeight, heightAboveGround);
            }
        }
    }
    
    clearTracks() {
        this.litTiles.clear();
        this.tileLimitWarned = false;  // Reset warning flag for next generation
        
        if (this.tileInstanceMesh) {
            this.tileInstanceMesh.count = 0;
            this.tileInstanceMesh.instanceMatrix.needsUpdate = true;
            
            this.tileKeyToIndex.clear();
            this.nextTileIndex = 0;
        }
        
        this.drawGroundGrid();
        if (this.groundTexture) {
            this.groundTexture.needsUpdate = true;
        }
    }
    
    createCrownIndicator() {
        this.crownGroup = new THREE.Group();
        
        const goldMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffd700, shininess: 100, emissive: 0x996600, emissiveIntensity: 0.3
        });
        
        const torus = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 8, 16), goldMaterial);
        torus.rotation.x = Math.PI / 2;
        this.crownGroup.add(torus);
        
        const coneGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
        for (let i = 0; i < 5; i++) {
            const cone = new THREE.Mesh(coneGeo, goldMaterial);
            const angle = (i / 5) * Math.PI * 2;
            cone.position.set(Math.cos(angle) * 0.4, 0.2, Math.sin(angle) * 0.4);
            this.crownGroup.add(cone);
        }
        
        const gem = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshPhongMaterial({ color: 0xff0000, shininess: 150, emissive: 0x660000, emissiveIntensity: 0.5 })
        );
        gem.position.y = 0.5;
        this.crownGroup.add(gem);
        
        this.crownGroup.visible = false;
        this.scene.add(this.crownGroup);
    }
    
    updateCrownPosition() {
        if (!this.activeCreatures || this.activeCreatures.length === 0) {
            this.crownGroup.visible = false;
            return;
        }
        
        let bestCreature = null;
        let bestFitness = -Infinity;
        
        for (let creature of this.activeCreatures) {
            if (!creature.bodies || creature.bodies.length === 0) {
                continue;
            }
            
            creature.calculateFitness(this.fitnessMode);
            if (creature.fitness > bestFitness) {
                bestFitness = creature.fitness;
                bestCreature = creature;
            }
        }
        
        if (bestCreature && bestCreature.bodies && bestCreature.bodies.length > 0) {
            const com = this.getCreatureCenterOfMass(bestCreature);
            this.crownGroup.position.set(com.x, com.y + 2.5 + Math.sin(Date.now() * 0.003) * 0.1, com.z);
            this.crownGroup.rotation.y += 0.02;
            this.crownGroup.visible = true;
            this.currentBestCreature = bestCreature;
        } else {
            this.crownGroup.visible = false;
            this.currentBestCreature = null;
        }
    }
    
    spawnCreature(creature, startPosition = null) {
        creature.startPosition = startPosition ? [...startPosition] : [...this.creatureStartPosition];
        
        const creatureGroup = this.nextCreatureCollisionGroup;
        this.nextCreatureCollisionGroup = this.nextCreatureCollisionGroup << 1;
        if (this.nextCreatureCollisionGroup > 0x40000000) this.nextCreatureCollisionGroup = 2;
        const creatureMask = this.COLLISION_GROUP_GROUND | creatureGroup;
        
        creature.bodies = [];
        creature.meshes = [];
        
        for (let i = 0; i < creature.blocks.length; i++) {
            const block = creature.blocks[i];
            
            const material = this.visualEffects.createBlockMaterial(block.materialType, block.color);
            
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(block.size[0], block.size[1], block.size[2]),
                material
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.creature = creature;
            mesh.userData.blockIndex = i;
            mesh.userData.materialType = block.materialType;
            mesh.position.set(
                creature.startPosition[0] + block.position[0],
                creature.startPosition[1] + block.position[1],
                creature.startPosition[2] + block.position[2]
            );
            this.scene.add(mesh);
            creature.meshes.push(mesh);
            
            if (block.materialType === 'emissive') {
                this.visualEffects.emissiveBlocks.push({
                    mesh: mesh,
                    color: new THREE.Color(block.color),
                    lastParticleTime: 0
                });
            }
            
            const blockMass = this.visualEffects.getMaterialMass(block.materialType);
            const body = new CANNON.Body({
                mass: blockMass,
                shape: new CANNON.Box(new CANNON.Vec3(block.size[0]/2, block.size[1]/2, block.size[2]/2)),
                position: new CANNON.Vec3(
                    creature.startPosition[0] + block.position[0],
                    creature.startPosition[1] + block.position[1],
                    creature.startPosition[2] + block.position[2]
                ),
                collisionFilterGroup: creatureGroup,
                collisionFilterMask: creatureMask
            });
            this.world.addBody(body);
            creature.bodies.push(body);
            
            body.userData = { prevY: body.position.y, wasGrounded: false };
        }
        
        creature.constraints = [];
        for (let joint of creature.joints) {
            const bodyA = creature.bodies[joint.blockIndexA];
            const bodyB = creature.bodies[joint.blockIndexB];
            
            const getPivot = (face) => {
                switch(face) {
                    case 0: return new CANNON.Vec3(0.5, 0, 0);
                    case 1: return new CANNON.Vec3(-0.5, 0, 0);
                    case 2: return new CANNON.Vec3(0, 0.5, 0);
                    case 3: return new CANNON.Vec3(0, -0.5, 0);
                    case 4: return new CANNON.Vec3(0, 0, 0.5);
                    case 5: return new CANNON.Vec3(0, 0, -0.5);
                    default: return new CANNON.Vec3(0, 0, 0);
                }
            };
            
            const getAxis = (axis) => {
                switch(axis) {
                    case 'x': return new CANNON.Vec3(1, 0, 0);
                    case 'y': return new CANNON.Vec3(0, 1, 0);
                    case 'z': return new CANNON.Vec3(0, 0, 1);
                    default: return new CANNON.Vec3(1, 0, 0);
                }
            };
            
            const constraint = new CANNON.HingeConstraint(bodyA, bodyB, {
                pivotA: getPivot(joint.faceA),
                axisA: getAxis(joint.axis),
                pivotB: getPivot(joint.faceB),
                axisB: getAxis(joint.axis),
                maxForce: 100
            });
            
            this.world.addConstraint(constraint);
            creature.constraints.push(constraint);
            joint.constraint = constraint;
        }
        
        if (creature.resetFitnessTracking) {
            creature.resetFitnessTracking();
        } else {
            creature.maxDistance = 0;
            creature.maxHeight = 0;
            creature.tilesLit = new Set();
            creature.maxJumpHeight = 0;
            creature.hasLandedAfterSpawn = false;
            creature.groundedY = 0;
        }
    }
    
    spawnMultipleCreatures(creatures) {
        this.removeAllCreatures();
        this.clearTracks();
        this.resetSuddenDeathState();
        this.activeCreatures = creatures;
        this.selectedCreature = null;
        this.currentBestCreature = null;
        this.followLeader = true;
        this.lastFollowedCreature = null;
        this.cameraLookAt.set(0, 3, 0);
        this.cameraVelocity.set(0, 0, 0);
        this.lookAtVelocity.set(0, 0, 0);
        
        const configGroups = {};
        for (let c of creatures) {
            const idx = c.configIndex || 0;
            if (!configGroups[idx]) configGroups[idx] = [];
            configGroups[idx].push(c);
        }
        
        const rowSpacing = 25, colSpacing = 20;
        const indices = Object.keys(configGroups).map(k => parseInt(k)).sort((a,b) => a-b);
        const startZ = -((indices.length - 1) * rowSpacing) / 2;
        
        for (let row = 0; row < indices.length; row++) {
            const variants = configGroups[indices[row]];
            const startX = -((variants.length - 1) * colSpacing) / 2;
            for (let col = 0; col < variants.length; col++) {
                this.spawnCreature(variants[col], [startX + col * colSpacing, 3, startZ + row * rowSpacing]);
            }
        }
        
        this.timeElapsed = 0;
    }
    
    removeAllCreatures() {
        for (let c of this.activeCreatures || []) this.removeCreature(c);
        this.activeCreatures = [];
        this.selectedCreature = null;
        this.currentBestCreature = null;
        this.nextCreatureCollisionGroup = 2;
        if (this.crownGroup) this.crownGroup.visible = false;
        if (this.currentCreature) {
            this.removeCreature(this.currentCreature);
            this.currentCreature = null;
        }
        this.visualEffects.clearAllParticles();
        
        if (this.suddenDeathDebris) {
            for (let debris of this.suddenDeathDebris) {
                this.scene.remove(debris.mesh);
                debris.mesh.geometry.dispose();
                debris.mesh.material.dispose();
            }
            this.suddenDeathDebris = [];
        }
    }
    
    removeCreature(creature) {
        if (!creature) return;
        if (creature.meshes) {
            this.visualEffects.emissiveBlocks = this.visualEffects.emissiveBlocks.filter(eb => !creature.meshes.includes(eb.mesh));
        }
        for (let m of creature.meshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
        for (let b of creature.bodies) this.world.removeBody(b);
        for (let c of creature.constraints) this.world.removeConstraint(c);
        creature.meshes = [];
        creature.bodies = [];
        creature.constraints = [];
    }
    
    startCelebration(champion, onComplete) {
        this.isCelebrating = true;
        this.celebrationStartTime = Date.now();
        this.celebrationCallback = onComplete;
        this.spotlightTarget = champion;
        this.lastCelebrationParticleTime = 0;
        this.celebrationPhase = 0;
        
        if (this.crownGroup) {
            this.crownGroup.visible = false;
        }
        
        let championCenter = new THREE.Vector3(0, 3, 0);
        if (champion && champion.bodies && champion.bodies.length > 0) {
            championCenter = this.getCreatureCenterOfMass(champion);
        }
        
        this.visualEffects.spawnConfettiBurst(championCenter, 100);
        
        const fireworkColors = [
            new THREE.Color(0xff0000),
            new THREE.Color(0x00ff00),
            new THREE.Color(0x0000ff),
            new THREE.Color(0xffff00),
            new THREE.Color(0xff00ff),
            new THREE.Color(0x00ffff)
        ];
        
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const dist = 15 + Math.random() * 10;
            const height = 8 + Math.random() * 10;
            const pos = new THREE.Vector3(
                championCenter.x + Math.cos(angle) * dist,
                height,
                championCenter.z + Math.sin(angle) * dist
            );
            setTimeout(() => {
                if (this.isCelebrating) {
                    this.visualEffects.spawnFireworkBurst(pos, fireworkColors[i], 100);
                    this.visualEffects.spawnEnergyRing(pos, fireworkColors[i]);
                }
            }, i * 150);
        }
        
        this.visualEffects.spawnStarBurst(championCenter, 40);
        this.visualEffects.spawnEnergyRing(championCenter, new THREE.Color(0x64ffda));
        
        for (let creature of this.activeCreatures) {
            if (creature !== champion) {
                this.explodeCreature(creature);
                
                const loserCenter = this.getCreatureCenterOfMass(creature);
                this.visualEffects.spawnFireworkBurst(loserCenter, new THREE.Color(0xff4400), 40);
                this.visualEffects.spawnDustParticles(loserCenter, 3.0);
            }
        }
        
        this.createSpotlight(champion);
        
        if (champion && champion.meshes) {
            for (let mesh of champion.meshes) {
                mesh.userData.celebrationOriginalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0x000000);
                mesh.userData.celebrationOriginalIntensity = mesh.material.emissiveIntensity || 0;
                
                if (mesh.material.emissive) {
                    mesh.material.emissive = new THREE.Color(0x4488ff);
                    mesh.material.emissiveIntensity = Math.max(0.4, mesh.userData.celebrationOriginalIntensity);
                }
            }
        }
    }
    
    explodeCreature(creature) {
        if (!creature || !creature.meshes) return;
        
        const center = this.getCreatureCenterOfMass(creature);
        
        for (let i = 0; i < creature.meshes.length; i++) {
            const mesh = creature.meshes[i];
            const body = creature.bodies[i];
            
            const dir = new THREE.Vector3(
                mesh.position.x - center.x,
                mesh.position.y - center.y + 0.5,
                mesh.position.z - center.z
            ).normalize();
            
            const force = 12 + Math.random() * 15;
            const spin = (Math.random() - 0.5) * 10;
            
            const debris = {
                mesh: mesh,
                velocity: new THREE.Vector3(
                    dir.x * force + (Math.random() - 0.5) * 8,
                    dir.y * force + Math.random() * 12,
                    dir.z * force + (Math.random() - 0.5) * 8
                ),
                angularVelocity: new THREE.Vector3(
                    (Math.random() - 0.5) * spin,
                    (Math.random() - 0.5) * spin,
                    (Math.random() - 0.5) * spin
                ),
                phase: 'explode',
                explodeTime: 600 + Math.random() * 300,
                phaseStartTime: Date.now(),
                originalColor: mesh.material.color.getHex(),
                absorbed: false,
                orbitAngle: Math.random() * Math.PI * 2,
                orbitSpeed: 3 + Math.random() * 2,
                orbitDirection: Math.random() < 0.5 ? 1 : -1
            };
            
            this.celebrationDebris.push(debris);
            
            if (body) {
                this.world.removeBody(body);
            }
        }
        
        for (let c of creature.constraints) {
            this.world.removeConstraint(c);
        }
        
        creature.meshes = [];
        creature.bodies = [];
        creature.constraints = [];
    }
    
    setSuddenDeathMode(enabled) {
        this.suddenDeathMode = enabled;
    }
    
    resetSuddenDeathState() {
        this.eliminatedCreatures.clear();
        this.eliminationQueue = [];
        this.lastEliminationTime = 0;
        this.isEliminatingCreature = false;
        this.suddenDeathDebris = [];
    }
    
    updateSuddenDeath() {
        if (!this.suddenDeathMode || !this.isRunning || this.isPaused || this.isCelebrating) {
            return;
        }
        
        if (this.timeElapsed < this.suddenDeathStartTime) {
            return;
        }
        
        if (this.isEliminatingCreature) {
            return;
        }
        
        const aliveCreatures = this.activeCreatures.filter(c => 
            c && c.bodies && c.bodies.length > 0 && !this.eliminatedCreatures.has(c)
        );
        
        if (aliveCreatures.length <= 1) {
            return;
        }
        
        const totalCreatures = this.activeCreatures.length;
        const totalToEliminate = Math.floor(totalCreatures * this.suddenDeathPercent);
        
        const eliminationWindow = this.maxTime - this.suddenDeathStartTime;
        const timeIntoWindow = this.timeElapsed - this.suddenDeathStartTime;
        const progress = Math.min(1, timeIntoWindow / eliminationWindow);
        const shouldHaveEliminated = Math.floor(totalToEliminate * progress);
        
        const currentlyEliminated = this.eliminatedCreatures.size;
        if (currentlyEliminated >= shouldHaveEliminated) {
            return;
        }
        
        if (aliveCreatures.length <= 1) {
            return;
        }
        
        for (let creature of aliveCreatures) {
            creature.calculateFitness(this.fitnessMode);
        }
        
        aliveCreatures.sort((a, b) => a.fitness - b.fitness);
        
        const victim = aliveCreatures[0];
        
        this.eliminateCreatureSuddenDeath(victim);
    }
    
    eliminateCreatureSuddenDeath(creature) {
        if (!creature || !creature.meshes || creature.meshes.length === 0) {
            return;
        }
        
        this.eliminatedCreatures.add(creature);
        this.isEliminatingCreature = true;
        this.lastEliminationTime = this.timeElapsed;
        
        const center = this.getCreatureCenterOfMass(creature);
        
        this.visualEffects.spawnFireworkBurst(center, new THREE.Color(0xff4400), 60);
        this.visualEffects.spawnDustParticles(center, 2.5);
        this.visualEffects.spawnEnergyRing(center, new THREE.Color(0xff6600));
        
        if (creature.meshes) {
            this.visualEffects.emissiveBlocks = this.visualEffects.emissiveBlocks.filter(eb => !creature.meshes.includes(eb.mesh));
        }
        
        for (let i = 0; i < creature.meshes.length; i++) {
            const mesh = creature.meshes[i];
            const body = creature.bodies[i];
            
            const dir = new THREE.Vector3(
                mesh.position.x - center.x,
                mesh.position.y - center.y + 0.5,
                mesh.position.z - center.z
            ).normalize();
            
            const force = 8 + Math.random() * 10;
            const spin = (Math.random() - 0.5) * 8;
            
            const debris = {
                mesh: mesh,
                velocity: new THREE.Vector3(
                    dir.x * force + (Math.random() - 0.5) * 6,
                    dir.y * force + Math.random() * 8 + 3,
                    dir.z * force + (Math.random() - 0.5) * 6
                ),
                angularVelocity: new THREE.Vector3(
                    (Math.random() - 0.5) * spin,
                    (Math.random() - 0.5) * spin,
                    (Math.random() - 0.5) * spin
                ),
                life: 1.5 + Math.random() * 0.5,
                maxLife: 2.0,
                originalScale: mesh.scale.x
            };
            
            if (!this.suddenDeathDebris) {
                this.suddenDeathDebris = [];
            }
            this.suddenDeathDebris.push(debris);
            
            if (body) {
                this.world.removeBody(body);
            }
        }
        
        for (let c of creature.constraints) {
            this.world.removeConstraint(c);
        }
        
        creature.meshes = [];
        creature.bodies = [];
        creature.constraints = [];
        
        if (this.selectedCreature === creature) {
            this.deselectCreature();
        }
        
        setTimeout(() => {
            this.isEliminatingCreature = false;
        }, 300);
    }
    
    updateSuddenDeathDebris(deltaTime) {
        if (!this.suddenDeathDebris || this.suddenDeathDebris.length === 0) {
            return;
        }
        
        const gravity = -15;
        
        for (let i = this.suddenDeathDebris.length - 1; i >= 0; i--) {
            const debris = this.suddenDeathDebris[i];
            
            debris.life -= deltaTime;
            
            if (debris.life <= 0) {
                this.scene.remove(debris.mesh);
                debris.mesh.geometry.dispose();
                debris.mesh.material.dispose();
                this.suddenDeathDebris.splice(i, 1);
                continue;
            }
            
            debris.velocity.y += gravity * deltaTime;
            debris.mesh.position.x += debris.velocity.x * deltaTime;
            debris.mesh.position.y += debris.velocity.y * deltaTime;
            debris.mesh.position.z += debris.velocity.z * deltaTime;
            
            debris.mesh.rotation.x += debris.angularVelocity.x * deltaTime;
            debris.mesh.rotation.y += debris.angularVelocity.y * deltaTime;
            debris.mesh.rotation.z += debris.angularVelocity.z * deltaTime;
            
            if (debris.mesh.position.y < 0.5) {
                debris.mesh.position.y = 0.5;
                debris.velocity.y = Math.abs(debris.velocity.y) * 0.3;
                debris.velocity.x *= 0.7;
                debris.velocity.z *= 0.7;
                debris.angularVelocity.multiplyScalar(0.7);
            }
            
            const lifeRatio = debris.life / debris.maxLife;
            debris.mesh.material.opacity = lifeRatio;
            debris.mesh.material.transparent = true;
            const scale = debris.originalScale * (0.3 + lifeRatio * 0.7);
            debris.mesh.scale.setScalar(scale);
            
            if (debris.mesh.material.emissive) {
                debris.mesh.material.emissive.setRGB(
                    1.0 - lifeRatio,
                    0.3 * (1.0 - lifeRatio),
                    0
                );
                debris.mesh.material.emissiveIntensity = (1.0 - lifeRatio) * 0.5;
            }
        }
    }
    
    getAliveCreatureCount() {
        return this.activeCreatures.filter(c => 
            c && c.bodies && c.bodies.length > 0 && !this.eliminatedCreatures.has(c)
        ).length;
    }
    
    createSpotlight(champion) {
        if (!champion) return;
        
        const center = this.getCreatureCenterOfMass(champion);
        
        const coneGeometry = new THREE.CylinderGeometry(0.5, 10, 35, 32, 1, true);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.spotlight = new THREE.Mesh(coneGeometry, coneMaterial);
        this.spotlight.position.set(center.x, center.y + 17, center.z);
        this.scene.add(this.spotlight);
        
        const glowGeometry = new THREE.CircleGeometry(10, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.spotlightGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.spotlightGlow.rotation.x = -Math.PI / 2;
        this.spotlightGlow.position.set(center.x, 0.05, center.z);
        this.scene.add(this.spotlightGlow);
        
        this.celebrationLight = new THREE.PointLight(0x6699ff, 1.5, 60);
        this.celebrationLight.position.set(center.x, center.y + 12, center.z);
        this.scene.add(this.celebrationLight);
    }
    
    updateCelebration(deltaTime) {
        if (!this.isCelebrating) return;
        
        const elapsed = Date.now() - this.celebrationStartTime;
        const celebrationDuration = 5000;
        const gravity = -25;
        
        let championCenter = new THREE.Vector3(0, 3, 0);
        if (this.spotlightTarget && this.spotlightTarget.bodies && this.spotlightTarget.bodies.length > 0) {
            championCenter = this.getCreatureCenterOfMass(this.spotlightTarget);
        }
        
        const timeRemaining = Math.max(0.1, (celebrationDuration - elapsed) / 1000);
        const urgency = Math.max(1, 3 / timeRemaining);
        
        const particleInterval = 200;
        if (elapsed - this.lastCelebrationParticleTime > particleInterval) {
            this.lastCelebrationParticleTime = elapsed;
            
            for (let i = 0; i < 8; i++) {
                const pos = new THREE.Vector3(
                    championCenter.x + (Math.random() - 0.5) * 30,
                    championCenter.y + 15 + Math.random() * 10,
                    championCenter.z + (Math.random() - 0.5) * 30
                );
                this.visualEffects.spawnConfettiBurst(pos, 5);
            }
            
            if (Math.random() < 0.4) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 10 + Math.random() * 20;
                const pos = new THREE.Vector3(
                    championCenter.x + Math.cos(angle) * dist,
                    10 + Math.random() * 15,
                    championCenter.z + Math.sin(angle) * dist
                );
                const color = new THREE.Color().setHSL(Math.random(), 1.0, 0.6);
                this.visualEffects.spawnFireworkBurst(pos, color, 60);
            }
            
            for (let i = 0; i < 3; i++) {
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 3,
                    -1,
                    (Math.random() - 0.5) * 3
                );
                this.visualEffects.spawnGlowParticle(championCenter.clone().add(offset), new THREE.Color(0x64ffda));
            }
            
            if (Math.random() < 0.3) {
                this.visualEffects.spawnEnergyRing(championCenter, new THREE.Color(0x4488ff));
            }
            
            if (elapsed % 1000 < particleInterval) {
                this.visualEffects.spawnStarBurst(championCenter, 15);
            }
        }
        
        for (let debris of this.celebrationDebris) {
            if (debris.phase === 'absorb' && Math.random() < 0.15) {
                this.visualEffects.spawnSparkParticles(debris.mesh.position, new THREE.Color(0x44aaff));
            }
            if (debris.velocity && debris.velocity.length() > 5) {
                this.visualEffects.spawnTrailParticle(
                    debris.mesh.position.clone(),
                    new THREE.Color(debris.originalColor || 0x4488ff),
                    debris.velocity
                );
            }
        }
        
        let absorbedThisFrame = 0;
        
        for (let i = this.celebrationDebris.length - 1; i >= 0; i--) {
            const debris = this.celebrationDebris[i];
            const phaseElapsed = Date.now() - debris.phaseStartTime;
            
            if (debris.phase === 'explode' && phaseElapsed > debris.explodeTime) {
                debris.phase = 'absorb';
                debris.phaseStartTime = Date.now();
                debris.mesh.material.emissive = new THREE.Color(0x4488ff);
                debris.mesh.material.emissiveIntensity = 0.3;
                
                this.visualEffects.spawnSparkParticles(debris.mesh.position, new THREE.Color(0x88ccff));
            }
            
            if (debris.phase === 'explode') {
                debris.mesh.position.x += debris.velocity.x * deltaTime;
                debris.mesh.position.y += debris.velocity.y * deltaTime;
                debris.mesh.position.z += debris.velocity.z * deltaTime;
                
                debris.velocity.y += gravity * deltaTime;
                
                if (debris.mesh.position.y < 0.5) {
                    debris.mesh.position.y = 0.5;
                    
                    if (Math.abs(debris.velocity.y) > 3) {
                        this.visualEffects.spawnDustParticles(debris.mesh.position, 1.5);
                        this.visualEffects.spawnSparkParticles(debris.mesh.position, new THREE.Color(0xffaa00));
                    }
                    
                    debris.velocity.y = Math.abs(debris.velocity.y) * 0.3;
                    debris.velocity.x *= 0.6;
                    debris.velocity.z *= 0.6;
                }
                
                debris.mesh.rotation.x += debris.angularVelocity.x * deltaTime;
                debris.mesh.rotation.y += debris.angularVelocity.y * deltaTime;
                debris.mesh.rotation.z += debris.angularVelocity.z * deltaTime;
                
            } else if (debris.phase === 'absorb') {
                const toChampion = new THREE.Vector3(
                    championCenter.x - debris.mesh.position.x,
                    championCenter.y - debris.mesh.position.y,
                    championCenter.z - debris.mesh.position.z
                );
                const distance = toChampion.length();
                
                debris.orbitAngle += debris.orbitSpeed * debris.orbitDirection * deltaTime;
                
                const orbitRadius = Math.min(distance * 0.6, 8);
                const swirlX = Math.cos(debris.orbitAngle) * orbitRadius;
                const swirlZ = Math.sin(debris.orbitAngle) * orbitRadius;
                
                const spiralHeight = Math.max(0, (distance - 2) * 0.3);
                const targetPos = new THREE.Vector3(
                    championCenter.x + swirlX,
                    championCenter.y + spiralHeight,
                    championCenter.z + swirlZ
                );
                
                const toTarget = new THREE.Vector3(
                    targetPos.x - debris.mesh.position.x,
                    targetPos.y - debris.mesh.position.y,
                    targetPos.z - debris.mesh.position.z
                );
                
                const baseSpeed = 15 + (30 / Math.max(distance, 1));
                const absorptionSpeed = baseSpeed * urgency;
                toTarget.normalize().multiplyScalar(absorptionSpeed);
                
                const directPull = toChampion.clone().normalize().multiplyScalar(10 * urgency / Math.max(distance, 0.5));
                toTarget.add(directPull);
                
                debris.velocity.lerp(toTarget, 0.2);
                
                debris.mesh.position.x += debris.velocity.x * deltaTime;
                debris.mesh.position.y += debris.velocity.y * deltaTime;
                debris.mesh.position.z += debris.velocity.z * deltaTime;
                
                const spinMultiplier = (1 + (15 / Math.max(distance, 1))) * Math.min(urgency, 3);
                debris.mesh.rotation.x += debris.angularVelocity.x * deltaTime * spinMultiplier;
                debris.mesh.rotation.y += debris.angularVelocity.y * deltaTime * spinMultiplier;
                debris.mesh.rotation.z += debris.angularVelocity.z * deltaTime * spinMultiplier;
                
                debris.orbitSpeed = 3 + (10 / Math.max(distance, 1));
                
                const scale = Math.min(1, distance / 8);
                debris.mesh.scale.setScalar(Math.max(0.1, scale));
                
                const glowIntensity = Math.min(1.5, 0.3 + (3 / Math.max(distance, 1)));
                debris.mesh.material.emissive = new THREE.Color(0x44aaff);
                debris.mesh.material.emissiveIntensity = glowIntensity;
                
                const absorptionRadius = timeRemaining < 0.5 ? 5 : 1.5;
                if (distance < absorptionRadius) {
                    debris.absorbed = true;
                    absorbedThisFrame++;
                    
                    this.visualEffects.createAbsorptionFlash(championCenter.clone());
                    this.visualEffects.spawnSparkParticles(championCenter, new THREE.Color(0x88ffff));
                    this.visualEffects.spawnStarBurst(championCenter, 5);
                    
                    if (absorbedThisFrame === 1) {
                        this.visualEffects.spawnEnergyRing(championCenter, new THREE.Color(0x64ffda));
                    }
                    
                    this.scene.remove(debris.mesh);
                    debris.mesh.geometry.dispose();
                    debris.mesh.material.dispose();
                    this.celebrationDebris.splice(i, 1);
                }
            }
        }
        
        if (timeRemaining < 0.3 && this.celebrationDebris.length > 0) {
            this.visualEffects.spawnFireworkBurst(championCenter, new THREE.Color(0x64ffda), 150);
            this.visualEffects.spawnConfettiBurst(championCenter, 80);
            this.visualEffects.spawnStarBurst(championCenter, 50);
            
            for (let i = this.celebrationDebris.length - 1; i >= 0; i--) {
                const debris = this.celebrationDebris[i];
                absorbedThisFrame++;
                this.visualEffects.createAbsorptionFlash(championCenter.clone());
                this.scene.remove(debris.mesh);
                debris.mesh.geometry.dispose();
                debris.mesh.material.dispose();
            }
            this.celebrationDebris = [];
        }
        
        if (absorbedThisFrame > 0 && this.spotlightTarget && this.spotlightTarget.meshes) {
            for (let mesh of this.spotlightTarget.meshes) {
                if (mesh.material.emissiveIntensity !== undefined) {
                    mesh.material.emissiveIntensity = Math.min(1.0, mesh.material.emissiveIntensity + 0.15);
                }
            }
            if (this.celebrationLight) {
                this.celebrationLight.intensity = Math.min(3, this.celebrationLight.intensity + 0.5);
            }
        }
        
        if (this.spotlightTarget && this.spotlightTarget.meshes) {
            for (let mesh of this.spotlightTarget.meshes) {
                if (mesh.material.emissiveIntensity !== undefined) {
                    const targetIntensity = Math.max(0.4, mesh.userData.celebrationOriginalIntensity || 0);
                    if (mesh.material.emissiveIntensity > targetIntensity) {
                        mesh.material.emissiveIntensity *= 0.97;
                    }
                }
            }
        }
        
        if (this.spotlight) {
            const pulse = 0.06 + Math.sin(elapsed * 0.003) * 0.03;
            this.spotlight.material.opacity = pulse;
            
            if (this.spotlightTarget && this.spotlightTarget.bodies && this.spotlightTarget.bodies.length > 0) {
                this.spotlight.position.x = championCenter.x;
                this.spotlight.position.z = championCenter.z;
                this.spotlight.position.y = championCenter.y + 17;
                
                if (this.spotlightGlow) {
                    this.spotlightGlow.position.x = championCenter.x;
                    this.spotlightGlow.position.z = championCenter.z;
                    this.spotlightGlow.material.opacity = 0.12 + Math.sin(elapsed * 0.004) * 0.05;
                }
                if (this.celebrationLight) {
                    this.celebrationLight.position.x = championCenter.x;
                    this.celebrationLight.position.z = championCenter.z;
                    this.celebrationLight.position.y = championCenter.y + 12;
                    this.celebrationLight.intensity = Math.max(1.5, this.celebrationLight.intensity * 0.98);
                }
            }
        }
        
        this.visualEffects.updateAbsorptionFlashes(deltaTime);
        
        if (elapsed >= celebrationDuration) {
            this.visualEffects.spawnFireworkBurst(championCenter.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Color(0xffd700), 200);
            this.visualEffects.spawnConfettiBurst(championCenter, 150);
            this.visualEffects.spawnStarBurst(championCenter, 60);
            for (let i = 0; i < 5; i++) {
                this.visualEffects.spawnEnergyRing(championCenter, new THREE.Color(0x64ffda));
            }
            
            this.endCelebration();
        }
    }
    
    endCelebration() {
        this.isCelebrating = false;
        
        for (let debris of this.celebrationDebris) {
            this.scene.remove(debris.mesh);
            debris.mesh.geometry.dispose();
            debris.mesh.material.dispose();
        }
        this.celebrationDebris = [];
        
        if (this.spotlight) {
            this.scene.remove(this.spotlight);
            this.spotlight.geometry.dispose();
            this.spotlight.material.dispose();
            this.spotlight = null;
        }
        
        if (this.spotlightGlow) {
            this.scene.remove(this.spotlightGlow);
            this.spotlightGlow.geometry.dispose();
            this.spotlightGlow.material.dispose();
            this.spotlightGlow = null;
        }
        
        if (this.celebrationLight) {
            this.scene.remove(this.celebrationLight);
            this.celebrationLight = null;
        }
        
        if (this.spotlightTarget && this.spotlightTarget.meshes) {
            for (let mesh of this.spotlightTarget.meshes) {
                if (mesh.userData.celebrationOriginalEmissive && mesh.material.emissive) {
                    mesh.material.emissive.copy(mesh.userData.celebrationOriginalEmissive);
                    mesh.material.emissiveIntensity = mesh.userData.celebrationOriginalIntensity;
                }
            }
        }
        this.spotlightTarget = null;
        
        if (this.celebrationCallback) {
            this.celebrationCallback();
            this.celebrationCallback = null;
        }
    }
    
    onMouseClick(event) {
        if (this.mouseMoved) return;
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mousePosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mousePosition.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mousePosition, this.camera);
        
        const meshes = [];
        for (let c of this.activeCreatures) if (c.meshes) meshes.push(...c.meshes);
        
        const hits = this.raycaster.intersectObjects(meshes);
        if (hits.length > 0 && hits[0].object.userData.creature) {
            this.selectCreature(hits[0].object.userData.creature);
        } else {
            this.deselectCreature();
        }
    }
    
    selectCreature(creature) {
        if (this.selectedCreature && this.selectedCreature !== creature) {
            this.unhighlightCreature(this.selectedCreature);
        }
        this.selectedCreature = creature;
        this.highlightCreature(creature);
        if (this.onSelectionChanged) this.onSelectionChanged(creature);
    }
    
    deselectCreature() {
        if (this.selectedCreature) {
            this.unhighlightCreature(this.selectedCreature);
            this.selectedCreature = null;
            this.followLeader = true;
            if (this.onSelectionChanged) this.onSelectionChanged(null);
        }
    }
    
    highlightCreature(creature) {
        if (!creature?.meshes) return;
        for (let m of creature.meshes) {
            if (!m.userData.originalEmissive) {
                m.userData.originalEmissive = m.material.emissive ? m.material.emissive.clone() : new THREE.Color(0x000000);
                m.userData.originalEmissiveIntensity = m.material.emissiveIntensity || 0;
            }
            if (m.material.emissive) {
                m.material.emissive = new THREE.Color(0x444444);
                m.material.emissiveIntensity = Math.max(0.5, m.userData.originalEmissiveIntensity);
            }
        }
    }
    
    unhighlightCreature(creature) {
        if (!creature?.meshes) return;
        for (let m of creature.meshes) {
            if (m.userData.originalEmissive && m.material.emissive) {
                m.material.emissive.copy(m.userData.originalEmissive);
                m.material.emissiveIntensity = m.userData.originalEmissiveIntensity;
            }
        }
    }
    
    getSelectedCreature() { return this.selectedCreature; }
    
    update(deltaTime) {
        if (this.isCelebrating) {
            this.updateCelebration(deltaTime);
            if (this.spotlightTarget) {
                this.world.step(this.fixedTimeStep, deltaTime, this.maxSubSteps);
                this.updateCreature(this.spotlightTarget);
            }
            this.updateCamera();
            this.visualEffects.updateParticles(deltaTime);
            return;
        }
        
        if (!this.isRunning || this.isPaused) return;
        
        this.world.step(this.fixedTimeStep, deltaTime, this.maxSubSteps);
        
        for (let c of this.activeCreatures) this.updateCreature(c);
        
        for (let c of this.activeCreatures) this.updateCreatureTracks(c);
        
        this.checkGroundImpacts();
        this.visualEffects.updateEmissiveGlow();
        this.visualEffects.updateParticles(deltaTime);
        
        this.updateSuddenDeath();
        this.updateSuddenDeathDebris(deltaTime);
        
        this.timeElapsed += deltaTime;
        
        // Update day/night cycle
        this.updateDayNightCycle();
        
        // Animate clouds
        this.updateClouds(deltaTime);
        
        this.updateCrownPosition();
        this.updateCamera();
    }
    
    checkGroundImpacts() {
        for (let creature of this.activeCreatures) {
            if (!creature.bodies) continue;
            
            for (let i = 0; i < creature.bodies.length; i++) {
                const body = creature.bodies[i];
                if (!body.userData) continue;
                
                const currentY = body.position.y;
                const prevY = body.userData.prevY;
                const velocity = body.velocity;
                
                const groundLevel = 0.55;
                const isGrounded = currentY <= groundLevel;
                const wasAbove = prevY > groundLevel;
                
                if (isGrounded && wasAbove) {
                    const impactVelocity = Math.abs(velocity.y);
                    if (impactVelocity > 1.0) {
                        const intensity = Math.min(3, impactVelocity / 3);
                        const impactPos = new THREE.Vector3(
                            body.position.x,
                            0.1,
                            body.position.z
                        );
                        
                        this.visualEffects.spawnDustParticles(impactPos, intensity);
                        
                        if (impactVelocity > 5) {
                            this.visualEffects.spawnSparkParticles(impactPos, new THREE.Color(0xffaa44));
                        }
                    }
                }
                
                if (isGrounded) {
                    const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
                    if (horizontalSpeed > 8 && Math.random() < 0.1) {
                        const sparkPos = new THREE.Vector3(body.position.x, 0.15, body.position.z);
                        this.visualEffects.spawnSparkParticles(sparkPos, new THREE.Color(0xffcc00));
                        this.visualEffects.spawnDustParticles(sparkPos, 0.5);
                    }
                }
                
                body.userData.prevY = currentY;
                body.userData.wasGrounded = isGrounded;
            }
        }
    }
    
    updateCreature(creature) {
        if (!creature?.bodies?.length) return;
        
        const collisions = this.detectBlockCollisions(creature);
        
        for (let joint of creature.joints) {
            const delta = joint.update();
            if (joint.constraint) {
                joint.constraint.enableMotor();
                joint.constraint.setMotorSpeed(delta * 10);
                joint.constraint.setMotorMaxForce(50);
            }
            
            let hasCollision = collisions.some(c => c.includes(joint.blockIndexA) || c.includes(joint.blockIndexB));
            joint.handleFeedback(hasCollision);
            
            if (hasCollision && Math.random() < 0.35) {
                const bodyA = creature.bodies[joint.blockIndexA];
                const bodyB = creature.bodies[joint.blockIndexB];
                const sparkPos = new THREE.Vector3(
                    (bodyA.position.x + bodyB.position.x) / 2,
                    (bodyA.position.y + bodyB.position.y) / 2,
                    (bodyA.position.z + bodyB.position.z) / 2
                );
                const mesh = creature.meshes[joint.blockIndexA];
                const sparkColor = mesh ? mesh.material.color : null;
                this.visualEffects.spawnSparkParticles(sparkPos, sparkColor);
            }
            
            if (Math.abs(delta) > 0.2 && Math.random() < 0.08) {
                const bodyA = creature.bodies[joint.blockIndexA];
                const bodyB = creature.bodies[joint.blockIndexB];
                const jointPos = new THREE.Vector3(
                    (bodyA.position.x + bodyB.position.x) / 2,
                    (bodyA.position.y + bodyB.position.y) / 2,
                    (bodyA.position.z + bodyB.position.z) / 2
                );
                this.visualEffects.spawnSparkParticles(jointPos, new THREE.Color(0xffdd00));
            }
        }
        
        for (let i = 0; i < creature.bodies.length; i++) {
            const body = creature.bodies[i];
            const mesh = creature.meshes[i];
            const speed = Math.sqrt(
                body.velocity.x * body.velocity.x +
                body.velocity.y * body.velocity.y +
                body.velocity.z * body.velocity.z
            );
            
            if (speed > 10 && Math.random() < 0.2) {
                const trailPos = new THREE.Vector3(
                    body.position.x,
                    body.position.y,
                    body.position.z
                );
                const trailVel = new THREE.Vector3(
                    body.velocity.x,
                    body.velocity.y,
                    body.velocity.z
                );
                const trailColor = mesh ? mesh.material.color.clone() : new THREE.Color(0x88aaff);
                this.visualEffects.spawnTrailParticle(trailPos, trailColor, trailVel);
            }
        }
        
        for (let i = 0; i < creature.bodies.length; i++) {
            creature.meshes[i].position.copy(creature.bodies[i].position);
            creature.meshes[i].quaternion.copy(creature.bodies[i].quaternion);
        }
        
        const com = this.getCreatureCenterOfMass(creature);
        const dx = com.x - creature.startPosition[0];
        const dz = com.z - creature.startPosition[2];
        creature.maxDistance = Math.max(creature.maxDistance, Math.sqrt(dx*dx + dz*dz));
        creature.maxHeight = Math.max(creature.maxHeight, com.y);
    }
    
    detectBlockCollisions(creature) {
        const collisions = [];
        const bodies = creature.bodies;
        if (!bodies || bodies.length < 2) return collisions;
        
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const dx = bodies[i].position.x - bodies[j].position.x;
                const dy = bodies[i].position.y - bodies[j].position.y;
                const dz = bodies[i].position.z - bodies[j].position.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                const connected = creature.joints.some(jt => 
                    (jt.blockIndexA === i && jt.blockIndexB === j) ||
                    (jt.blockIndexA === j && jt.blockIndexB === i)
                );
                
                if (!connected && dist < 1.0) collisions.push([i, j]);
            }
        }
        return collisions;
    }
    
    getCreatureCenterOfMass(creature) {
        if (!creature?.bodies?.length) return new THREE.Vector3(0, 0, 0);
        let x = 0, y = 0, z = 0;
        for (let b of creature.bodies) { x += b.position.x; y += b.position.y; z += b.position.z; }
        return new THREE.Vector3(x / creature.bodies.length, y / creature.bodies.length, z / creature.bodies.length);
    }
    
    smoothDamp(current, target, velocity, smoothTime, deltaTime) {
        const omega = 2.0 / smoothTime;
        const x = omega * deltaTime;
        const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
        const change = current - target;
        const temp = (velocity + omega * change) * deltaTime;
        velocity = (velocity - omega * temp) * exp;
        return {
            value: target + (change + temp) * exp,
            velocity: velocity
        };
    }
    
    updateCamera() {
        const deltaTime = 1/60;
        
        let targetLookAt = new THREE.Vector3(0, 3, 0);
        let targetPosition = new THREE.Vector3(0, 50, 80);
        
        // Celebration mode - always takes priority
        if (this.isCelebrating && this.spotlightTarget) {
            const toFollow = this.spotlightTarget;
            
            if (toFollow?.bodies?.length) {
                targetLookAt = this.getCreatureCenterOfMass(toFollow);
            }
            
            const smoothTime = 0.3;
            
            // If in overview mode, use top-down celebration view
            if (this.overviewMode) {
                // Look at the champion from directly above
                targetLookAt.y = 0; // Look at ground level
                
                // Camera directly above at celebration height
                const celebrationHeight = 80;
                targetPosition.set(
                    targetLookAt.x,
                    celebrationHeight,
                    targetLookAt.z
                );
                
                // Smooth camera movement to track champion
                const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
                const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
                const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
                
                this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
                this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
                
                const posX = this.smoothDamp(this.cameraPosition.x, targetPosition.x, this.cameraVelocity.x, smoothTime, deltaTime);
                const posY = this.smoothDamp(this.cameraPosition.y, targetPosition.y, this.cameraVelocity.y, smoothTime, deltaTime);
                const posZ = this.smoothDamp(this.cameraPosition.z, targetPosition.z, this.cameraVelocity.z, smoothTime, deltaTime);
                
                this.cameraPosition.set(posX.value, posY.value, posZ.value);
                this.cameraVelocity.set(posX.velocity, posY.velocity, posZ.velocity);
                
                this.camera.position.copy(this.cameraPosition);
                this.camera.lookAt(this.cameraLookAt);
                
                // Keep camera locked to north orientation
                this.camera.up.set(0, 1, 0);
                this.camera.lookAt(this.cameraLookAt);
            } else {
                // Normal circular celebration camera
                const celebrationAngle = this.cameraRotationX + 0.002;
                this.cameraRotationX = celebrationAngle;
                
                targetPosition.set(
                    targetLookAt.x + Math.cos(celebrationAngle) * 25,
                    targetLookAt.y + 12,
                    targetLookAt.z + Math.sin(celebrationAngle) * 25
                );
                
                const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
                const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
                const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
                
                this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
                this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
                
                const posX = this.smoothDamp(this.cameraPosition.x, targetPosition.x, this.cameraVelocity.x, smoothTime, deltaTime);
                const posY = this.smoothDamp(this.cameraPosition.y, targetPosition.y, this.cameraVelocity.y, smoothTime, deltaTime);
                const posZ = this.smoothDamp(this.cameraPosition.z, targetPosition.z, this.cameraVelocity.z, smoothTime, deltaTime);
                
                this.cameraPosition.set(posX.value, posY.value, posZ.value);
                this.cameraVelocity.set(posX.velocity, posY.velocity, posZ.velocity);
                
                this.camera.position.copy(this.cameraPosition);
                this.camera.lookAt(this.cameraLookAt);
            }
            
            return;
        }
        
        // OVERVIEW + FOLLOW MODES: Top-down view that tracks the creature
        // User can only zoom, no rotation or panning allowed
        if (this.overviewMode && this.followLeader) {
            const toFollow = this.selectedCreature || this.currentBestCreature;
            
            let smoothTime = this.cameraSmoothTime;
            if (toFollow !== this.lastFollowedCreature && this.lastFollowedCreature !== null) {
                smoothTime = 0.6;
            }
            this.lastFollowedCreature = toFollow;
            
            // Get creature position and track it
            if (toFollow?.bodies?.length) {
                targetLookAt = this.getCreatureCenterOfMass(toFollow);
                targetLookAt.y = 0; // Look at ground level
            }
            
            // Camera is directly above the look-at point
            const effectiveHeight = this.overviewHeight;
            targetPosition.set(
                targetLookAt.x,
                effectiveHeight,
                targetLookAt.z
            );
            
            // Smooth camera movement
            const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
            const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
            const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
            
            const posX = this.smoothDamp(this.cameraPosition.x, targetPosition.x, this.cameraVelocity.x, smoothTime, deltaTime);
            const posY = this.smoothDamp(this.cameraPosition.y, targetPosition.y, this.cameraVelocity.y, smoothTime, deltaTime);
            const posZ = this.smoothDamp(this.cameraPosition.z, targetPosition.z, this.cameraVelocity.z, smoothTime, deltaTime);
            
            this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
            this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
            
            this.cameraPosition.set(posX.value, posY.value, posZ.value);
            this.cameraVelocity.set(posX.velocity, posY.velocity, posZ.velocity);
            
            this.camera.position.copy(this.cameraPosition);
            this.camera.lookAt(this.cameraLookAt);
            
            // Lock camera orientation to north (0,1,0 up vector)
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(this.cameraLookAt);
        }
        // OVERVIEW ONLY: Top-down view with user control of rotation and panning
        else if (this.overviewMode && !this.followLeader) {
            const effectiveHeight = this.overviewHeight;
            const offset = 0.01;
            targetLookAt.copy(this.overviewCenter);
            targetPosition.set(
                this.overviewCenter.x + Math.sin(this.overviewRotation) * offset,
                effectiveHeight,
                this.overviewCenter.z + Math.cos(this.overviewRotation) * offset
            );
            
            const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, 0.3, deltaTime);
            const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, 0.3, deltaTime);
            const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, 0.3, deltaTime);
            
            const posX = this.smoothDamp(this.cameraPosition.x, targetPosition.x, this.cameraVelocity.x, 0.3, deltaTime);
            const posY = this.smoothDamp(this.cameraPosition.y, targetPosition.y, this.cameraVelocity.y, 0.3, deltaTime);
            const posZ = this.smoothDamp(this.cameraPosition.z, targetPosition.z, this.cameraVelocity.z, 0.3, deltaTime);
            
            this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
            this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
            
            this.cameraPosition.set(posX.value, posY.value, posZ.value);
            this.cameraVelocity.set(posX.velocity, posY.velocity, posZ.velocity);
            
            this.camera.position.copy(this.cameraPosition);
            this.camera.lookAt(this.cameraLookAt);
            
            // Apply rotation to up vector for compass effect
            this.camera.up.set(
                Math.sin(this.overviewRotation),
                0,
                Math.cos(this.overviewRotation)
            );
            this.camera.lookAt(this.cameraLookAt);
        }
        // FOLLOW ONLY: Normal 3D following camera
        else if (!this.overviewMode && this.followLeader) {
            const toFollow = this.selectedCreature || this.currentBestCreature;
            
            let smoothTime = this.cameraSmoothTime;
            if (toFollow !== this.lastFollowedCreature && this.lastFollowedCreature !== null) {
                smoothTime = 0.6;
            }
            this.lastFollowedCreature = toFollow;
            
            if (toFollow?.bodies?.length) {
                targetLookAt = this.getCreatureCenterOfMass(toFollow);
            }
            
            targetPosition.set(
                this.cameraLookAt.x + Math.cos(this.cameraRotationX) * this.cameraDistance,
                this.cameraLookAt.y + this.cameraDistance * Math.sin(this.cameraRotationY) + 5,
                this.cameraLookAt.z + Math.sin(this.cameraRotationX) * this.cameraDistance
            );
            
            const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
            const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
            const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
            
            this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
            this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
            
            targetPosition.set(
                this.cameraLookAt.x + Math.cos(this.cameraRotationX) * this.cameraDistance,
                this.cameraLookAt.y + this.cameraDistance * Math.sin(this.cameraRotationY) + 5,
                this.cameraLookAt.z + Math.sin(this.cameraRotationX) * this.cameraDistance
            );
            
            this.camera.position.copy(targetPosition);
            this.cameraPosition.copy(targetPosition);
            this.camera.lookAt(this.cameraLookAt);
        }
        // NEITHER MODE: Free camera - user has full control
        else {
            // Just use current camera position/rotation without any automatic movement
            // User controls are handled entirely in mouse events
            targetPosition.set(
                this.cameraLookAt.x + Math.cos(this.cameraRotationX) * this.cameraDistance,
                this.cameraLookAt.y + this.cameraDistance * Math.sin(this.cameraRotationY) + 5,
                this.cameraLookAt.z + Math.sin(this.cameraRotationX) * this.cameraDistance
            );
            
            this.camera.position.copy(targetPosition);
            this.cameraPosition.copy(targetPosition);
            this.camera.lookAt(this.cameraLookAt);
        }
    }
    
    render() { 
        this.renderer.render(this.scene, this.camera); 
    }
    start() { 
        this.isRunning = true; 
        this.isPaused = false; 
        
        // Reset to sunrise lighting at start of round
        this.timeElapsed = 0;
        this.updateDayNightCycle();
    }
    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }
    stop() { this.isRunning = false; this.isPaused = false; }
    isTimeUp() { return this.timeElapsed >= this.maxTime; }
    getRemainingTime() { return Math.max(0, this.maxTime - this.timeElapsed); }
    
    setCameraMode(mode) {
        // Handle switching to overview mode from normal mode
        if (mode === 'overview' && !this.overviewMode) {
            // Save current camera state for potential restoration
            this.savedCameraState = {
                cameraRotationX: this.cameraRotationX,
                cameraRotationY: this.cameraRotationY,
                cameraDistance: this.cameraDistance,
                cameraLookAt: this.cameraLookAt.clone(),
                cameraPosition: this.cameraPosition.clone()
            };
            
            // Set overview center to current look-at position
            this.overviewCenter.copy(this.cameraLookAt);
            this.overviewCenter.y = 0;
            this.overviewRotation = 0;
            
            // Calculate appropriate overview height based on creature positions
            let maxExtent = 50;
            if (this.activeCreatures && this.activeCreatures.length > 0) {
                for (let creature of this.activeCreatures) {
                    if (creature.bodies && creature.bodies.length > 0) {
                        for (let body of creature.bodies) {
                            maxExtent = Math.max(maxExtent, Math.abs(body.position.x) + 10);
                            maxExtent = Math.max(maxExtent, Math.abs(body.position.z) + 10);
                        }
                    }
                }
            }
            this.overviewHeight = Math.max(120, maxExtent * 1.5);
        }
        
        // Set the mode flags
        if (mode === 'overview') {
            this.overviewMode = true;
        } else if (mode === 'follow') {
            this.followLeader = true;
            this.lastFollowedCreature = null;
            this.camera.up.set(0, 1, 0);
            if (this.onFollowLeaderChanged) {
                this.onFollowLeaderChanged();
            }
        }
    }
    
    returnFromOverview() {
        // Reset camera orientation to normal
        this.camera.up.set(0, 1, 0);
        
        // Restore saved camera state if available
        if (this.savedCameraState) {
            this.cameraRotationX = this.savedCameraState.cameraRotationX;
            this.cameraRotationY = this.savedCameraState.cameraRotationY;
            this.cameraDistance = this.savedCameraState.cameraDistance;
            this.savedCameraState = null;
        }
        
        // Reset velocities for smooth transition
        this.cameraVelocity.set(0, 0, 0);
        this.lookAtVelocity.set(0, 0, 0);
    }
    
    resetCamera() {
        // Reset rotation and distance
        this.cameraRotationX = 0;
        this.cameraRotationY = Math.PI / 6;
        this.cameraDistance = 40;
        
        // Turn on follow mode, turn off overview mode
        this.followLeader = true;
        this.overviewMode = false;
        this.lastFollowedCreature = null;
        
        // Reset camera orientation
        this.camera.up.set(0, 1, 0);
        
        // Reset velocities
        this.cameraVelocity.set(0, 0, 0);
        this.lookAtVelocity.set(0, 0, 0);
        
        // Reset overview state
        this.overviewCenter.set(0, 0, 0);
        this.overviewRotation = 0;
        this.overviewHeight = 120;
        this.savedCameraState = null;
        
        // Notify about mode change
        if (this.onFollowLeaderChanged) {
            this.onFollowLeaderChanged();
        }
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    onMouseDown(e) {
        this.mouseDown = true;
        this.mouseButton = e.button;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.mouseMoved = false;
    }
    
    onMouseMove(e) {
        if (!this.mouseDown) return;
        
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.mouseMoved = true;
        
        // OVERVIEW + FOLLOW: Only zoom allowed, mouse drag does nothing
        if (this.overviewMode && this.followLeader) {
            // Do nothing - user can only zoom via scroll wheel
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            return;
        }
        
        // OVERVIEW ONLY: Allow rotation (left drag) and panning (right drag)
        if (this.overviewMode && !this.followLeader) {
            if (this.mouseButton === 0) {
                // Left drag: Rotate the view (changes which direction is "north")
                this.overviewRotation += dx * 0.01;
            } else if (this.mouseButton === 2) {
                // Right drag: Pan the camera center
                // Calculate pan direction based on current rotation
                const cosR = Math.cos(this.overviewRotation);
                const sinR = Math.sin(this.overviewRotation);
                const panSpeed = this.overviewHeight * 0.002;
                
                // Fixed panning: drag right moves camera right, drag up moves camera up
                // The view is rotated, so we need to transform the pan direction
                this.overviewCenter.x += (dx * cosR + dy * sinR) * panSpeed;
                this.overviewCenter.z += (-dx * sinR + dy * cosR) * panSpeed;
            }
        }
        // FOLLOW ONLY or NEITHER: Normal 3D camera controls
        else {
            if (this.mouseButton === 0) {
                // Left drag: Rotate camera around look-at point
                this.cameraRotationX += dx * 0.01;
                this.cameraRotationY += dy * 0.01;
                this.cameraRotationY = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.cameraRotationY));
                
                // If following a creature, we stay in follow mode
                if (this.selectedCreature || (this.followLeader && this.currentBestCreature)) {
                    // Camera will follow but use our rotation
                }
            } else if (this.mouseButton === 2) {
                // Right drag: Pan the look-at point
                // This disables follow leader if it was on
                if (this.followLeader) {
                    this.followLeader = false;
                    if (this.onFollowLeaderChanged) {
                        this.onFollowLeaderChanged();
                    }
                }
                
                // Calculate pan direction based on camera orientation
                const right = new THREE.Vector3();
                this.camera.getWorldDirection(right);
                right.cross(new THREE.Vector3(0, 1, 0)).normalize();
                
                // Pan the look-at point
                this.cameraLookAt.add(right.multiplyScalar(-dx * 0.1));
                this.cameraLookAt.y += dy * 0.1;
            }
        }
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }
    
    onMouseUp() { this.mouseDown = false; }
    
    onMouseWheel(e) {
        e.preventDefault();
        
        // In any overview mode (with or without follow), zoom controls the height
        if (this.overviewMode) {
            this.overviewHeight += e.deltaY * 0.1;
            this.overviewHeight = Math.max(20, Math.min(400, this.overviewHeight));
        } 
        // In normal 3D mode (follow only or free camera), zoom controls the distance
        else {
            this.cameraDistance += e.deltaY * 0.03;
            this.cameraDistance = Math.max(5, Math.min(120, this.cameraDistance));
        }
    }
}
