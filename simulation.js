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
        
        // Gravity settings - base value is Earth gravity (9.82 m/s^2)
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
        this.cameraDistance = 15;
        this.targetCameraDistance = 15;  // For smooth distance transitions
        this.userOverrideZoom = false;   // True when user has manually zoomed
        this.cameraRotationX = 0;
        this.cameraRotationY = 0.15;  // ~8 degrees - very low angle to see horizon/sky
        
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
        
        // Camera transition state for ease-in effect when switching targets
        // Transition progress goes from 0 (just started) to 1 (complete)
        this.cameraTransitionProgress = 1.0;  // Start at 1 = no transition
        this.cameraTransitionDuration = 0.8;  // How long the ease-in period lasts (seconds)
        this.previousTargetPosition = null;   // Where camera was looking before switch
        
        // Minimum height for camera - prevents going below ground plane
        this.cameraMinHeight = 1.0;
        
        // Pan offset for overview+follow mode - lets user pan while still following
        // This offset is added to the followed creature's position
        // It gradually decays back to zero so camera re-centers on the target
        this.overviewPanOffset = new THREE.Vector3(0, 0, 0);
        
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
        this.moonLight = null;  // Blue ambient light for nighttime
        this.hemiLight = null;
        this.fillLight = null;
        
        // Override for day progress (used by lineage playback mode)
        // When >= 0, this value is used instead of timeElapsed/maxTime
        this.overrideDayProgress = -1;
        
        // Visual sky elements
        this.sunMesh = null;         // Visible sun in the sky
        this.clouds = [];            // Array of cloud meshes
        this.skyDome = null;         // Day sky dome that fades to reveal stars
        this.innerStarSphere = null; // Inner star sphere (dimmer parallax layer)
        this.innerStarGroup = null;  // Parent group for inner star sphere (tilted)
        this.outerStarSphere = null; // Outer star sphere (main stars)
        this.outerStarGroup = null;  // Parent group for outer star sphere (tilted)
        this.starTexture = null;     // Night sky texture
        
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
        
        // Moon light - blue ambient light for nighttime illumination
        // Active when sun is below horizon, provides soft blue glow
        this.moonLight = new THREE.AmbientLight(0x4466aa, 0.15);
        this.moonLight.visible = true;  // Starts visible (night at beginning)
        this.scene.add(this.moonLight);
        
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
     * Create visual sky elements - sun, clouds, and night sky
     */
    createSkyElements() {
        // Create dual star spheres for parallax effect
        // Both use additive blending so dark = invisible, bright = visible
        // Inner sphere is dimmer to create depth
        
        // Outer star sphere (behind, rotates slower for parallax)
        // Use a parent group tilted so poles are at horizon, then rotate sphere inside
        const outerStarGeometry = new THREE.SphereGeometry(480, 64, 32);
        const outerStarMaterial = new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            fog: false,
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
        });
        this.outerStarSphere = new THREE.Mesh(outerStarGeometry, outerStarMaterial);
        // Create parent group tilted 90 degrees so sphere poles are at front/back
        // Lower the group so the poles (pinched texture) are below ground level
        this.outerStarGroup = new THREE.Group();
        this.outerStarGroup.rotation.x = Math.PI / 2;
        this.outerStarGroup.position.y = -150;  // Lower so poles are hidden below ground
        this.outerStarGroup.add(this.outerStarSphere);
        this.scene.add(this.outerStarGroup);
        
        // Inner star sphere (closer, dimmer, rotates at different speed)
        const innerStarGeometry = new THREE.SphereGeometry(450, 64, 32);
        const innerStarMaterial = new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            fog: false,
            color: new THREE.Color(2.5, 2.5, 2.5),  // Multiply texture brightness
            transparent: true,
            opacity: 0.4,  // Dimmer layer
            blending: THREE.AdditiveBlending,
        });
        this.innerStarSphere = new THREE.Mesh(innerStarGeometry, innerStarMaterial);
        // Same parent group setup - lowered to hide poles
        this.innerStarGroup = new THREE.Group();
        this.innerStarGroup.rotation.x = Math.PI / 2;
        this.innerStarGroup.position.y = -150;  // Lower so poles are hidden below ground
        this.innerStarGroup.add(this.innerStarSphere);
        this.scene.add(this.innerStarGroup);
        
        // Create a procedural star texture as fallback
        const createProceduralStarTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 2048;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            
            // Black background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw random stars of varying sizes and brightness
            const starCount = 3000;
            for (let i = 0; i < starCount; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const brightness = Math.random();
                const size = Math.random() * 2 + 0.5;
                
                // Star color varies from white to slightly blue/yellow
                const colorVariation = Math.random();
                let r, g, b;
                if (colorVariation < 0.7) {
                    // White/blue stars (most common)
                    r = 200 + Math.floor(brightness * 55);
                    g = 200 + Math.floor(brightness * 55);
                    b = 220 + Math.floor(brightness * 35);
                } else if (colorVariation < 0.9) {
                    // Warm yellow/orange stars
                    r = 255;
                    g = 200 + Math.floor(brightness * 40);
                    b = 150 + Math.floor(brightness * 50);
                } else {
                    // Bright blue stars (rare)
                    r = 180 + Math.floor(brightness * 40);
                    g = 200 + Math.floor(brightness * 55);
                    b = 255;
                }
                
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + brightness * 0.7})`;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
                
                // Add glow to brighter stars
                if (brightness > 0.7 && size > 1) {
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${brightness * 0.2})`;
                    ctx.beginPath();
                    ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            // Add a few nebula-like regions for visual interest
            for (let i = 0; i < 5; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, 100 + Math.random() * 100);
                const hue = Math.random() * 60 + 200; // Blue to purple range
                gradient.addColorStop(0, `hsla(${hue}, 50%, 30%, 0.15)`);
                gradient.addColorStop(0.5, `hsla(${hue}, 40%, 20%, 0.08)`);
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.fillRect(x - 200, y - 200, 400, 400);
            }
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        };
        
        // Try to load external texture, fall back to procedural
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('stars.jpg', (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            this.starTexture = texture;
            
            // Apply to outer sphere
            outerStarMaterial.map = texture;
            outerStarMaterial.needsUpdate = true;
            
            // Clone texture for inner sphere with offset
            const innerTexture = texture.clone();
            innerTexture.wrapS = THREE.RepeatWrapping;
            innerTexture.wrapT = THREE.RepeatWrapping;
            innerTexture.offset.set(0.5, 0.0);  // Offset by half so stars don't overlap
            innerTexture.needsUpdate = true;
            innerStarMaterial.map = innerTexture;
            innerStarMaterial.needsUpdate = true;
            
            console.log('Night sky texture loaded (dual parallax spheres)');
        }, undefined, (error) => {
            // Create procedural star texture as fallback
            console.log('Using procedural star texture (stars.jpg not found)');
            const proceduralTexture = createProceduralStarTexture();
            this.starTexture = proceduralTexture;
            
            // Apply to outer sphere
            outerStarMaterial.map = proceduralTexture;
            outerStarMaterial.needsUpdate = true;
            
            // Create second procedural texture with different seed for inner sphere
            const innerTexture = createProceduralStarTexture();
            innerTexture.offset.set(0.3, 0.15);  // Offset so stars don't overlap
            innerStarMaterial.map = innerTexture;
            innerStarMaterial.needsUpdate = true;
        });
        
        // Black background behind the star spheres
        this.scene.background = new THREE.Color(0x000000);
        
        // Create a sky dome - a large inverted sphere with the day sky color
        // This fades in during the day to cover the stars, and fades out at night
        // Centered at same Y position as star spheres, with smaller radius to fit inside
        const skyGeometry = new THREE.SphereGeometry(420, 32, 32);  // Smaller than inner star sphere (450)
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87ceeb,        // Sky blue - will be updated by day/night cycle
            side: THREE.BackSide,   // Render on inside of sphere
            fog: false,
            transparent: true,
            opacity: 1.0,           // Will be controlled by day/night cycle
        });
        this.skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyDome.position.y = -150;  // Match star sphere center position
        this.scene.add(this.skyDome);
        
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
        console.log(`Gravity set to ${percentDisplay}% (${Math.abs(gravityValue).toFixed(2)} m/s^2)`);
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
        
        // Sun position - rises in east, arcs through southern sky, sets in west
        // Rotates in same direction as star spheres (east to west)
        //
        // Timing: Dawn light begins BEFORE sunrise, dusk light continues AFTER sunset
        // This matches real-world behavior where sky lightens/darkens gradually
        //
        // Lighting phases (existing):
        //   0.0-0.15:  pre-dawn (dark, starting to lighten)
        //   0.15-0.35: dawn/morning (sky brightening)
        //   0.35-0.65: midday (full daylight)
        //   0.65-0.85: evening/dusk (sky darkening)
        //   0.85-1.0:  post-dusk (dark)
        //
        // Sun timing (adjusted to lag behind lighting):
        //   0.20: sunrise (sun breaks horizon AFTER sky starts lightening)
        //   0.50: noon (sun at peak)
        //   0.80: sunset (sun sets BEFORE sky goes fully dark)
        //
        // Map dayProgress to sun angle:
        //   progress 0.20 -> angle 0 deg (sunrise, horizon east)
        //   progress 0.50 -> angle 90 deg (noon, zenith)
        //   progress 0.80 -> angle 180 deg (sunset, horizon west)
        
        const sunAngle = ((dayProgress - 0.20) / 0.60) * Math.PI;
        
        // Sun orbit parameters
        const orbitRadius = 300;  // East-west travel distance
        const maxHeight = 200;    // Peak height at noon
        const southOffset = 80;   // Sun stays in southern sky
        
        // Calculate sun position
        // Negate X so sun rotates same direction as star spheres (east to west)
        // sin gives 0 at horizons, 1 at noon for height
        // cos gives 1 at sunrise, -1 at sunset - negate to match star rotation direction
        const sunX = -Math.cos(sunAngle) * orbitRadius;
        const sunY = Math.sin(sunAngle) * maxHeight;
        const sunZ = southOffset;
        
        // Update directional light position to match sun mesh exactly
        // This ensures shadows are cast from the correct direction
        this.sunLight.position.set(sunX, sunY, sunZ);
        
        // Update visible sun mesh
        // Sun appears larger at horizon due to atmospheric effect
        // horizonFactor is 1 at horizons, 0 at noon
        const horizonFactor = 1 - Math.abs(Math.sin(sunAngle));
        const sunScale = 1 + horizonFactor * 0.5;
        const sunRadius = 8 * sunScale;
        
        if (this.sunMesh) {
            this.sunMesh.position.set(sunX, sunY, sunZ);
            this.sunMesh.scale.setScalar(sunScale);
            
            // Only hide sun when completely below ground plane
            this.sunMesh.visible = (sunY > -sunRadius);
        }
        
        // Toggle sun light and moon light based on whether any part of sun is above horizon
        // Sun light turns on when top edge of sun crests horizon (sunY > -sunRadius)
        // Sun light turns off when bottom edge of sun drops below horizon (sunY <= -sunRadius)
        // Moon light provides blue ambient glow only when sun is completely below horizon
        const sunVisible = sunY > -sunRadius;
        
        if (sunVisible) {
            // Daytime: sun casts light and shadows, moonlight off
            this.sunLight.visible = true;
            this.sunLight.castShadow = true;
            if (this.moonLight) {
                this.moonLight.visible = false;
            }
        } else {
            // Nighttime: no sun light, moonlight provides ambient blue glow
            this.sunLight.visible = false;
            this.sunLight.castShadow = false;
            if (this.moonLight) {
                this.moonLight.visible = true;
            }
        }
        
        // Rotate star spheres with day cycle (tied to Earth's rotation like the sun)
        // Spheres are inside groups tilted 90 degrees on X, so rotating on Y creates horizontal motion
        // Negative rotation to match sun's east-to-west movement
        const starRotation = dayProgress * Math.PI * 2;  // Full rotation over a day
        if (this.innerStarSphere) {
            this.innerStarSphere.rotation.y = -starRotation;
        }
        if (this.outerStarSphere) {
            // Outer sphere rotates 15% slower for noticeable parallax
            this.outerStarSphere.rotation.y = -starRotation * 0.85;
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
        this.scene.fog.color.setHex(fogColor);
        this.sunLight.color.setHex(sunColor);
        this.sunLight.intensity = sunIntensity;
        this.ambientLight.intensity = ambientIntensity;
        this.hemiLight.intensity = hemiIntensity;
        
        // Update sky dome color and opacity
        // The dome covers the star background - opaque during day, transparent at night
        if (this.skyDome && this.skyDome.material) {
            this.skyDome.material.color.setHex(skyColor);
            
            // Calculate sky dome opacity (inverse of star visibility)
            // Stars visible at night means dome should be transparent
            let domeOpacity;
            
            if (dayProgress < 0.15) {
                // Early dawn - stars fully visible, dome transparent
                domeOpacity = 0.0;
            } else if (dayProgress < 0.35) {
                // Sunrise - dome fades in to cover stars
                const t = (dayProgress - 0.15) / 0.2;
                domeOpacity = t;
            } else if (dayProgress < 0.65) {
                // Midday - dome fully opaque, no stars visible
                domeOpacity = 1.0;
            } else if (dayProgress < 0.85) {
                // Sunset - dome fades out to reveal stars
                const t = (dayProgress - 0.65) / 0.2;
                domeOpacity = 1.0 - t;
            } else {
                // Late dusk - stars fully visible, dome transparent
                domeOpacity = 0.0;
            }
            
            this.skyDome.material.opacity = domeOpacity;
        } else {
            // Fallback if skyDome not ready - update scene.background as color
            if (this.scene.background && this.scene.background.isColor) {
                this.scene.background.setHex(skyColor);
            }
        }
        
        // Update sun mesh color based on time of day
        if (this.sunMesh) {
            this.sunMesh.material.color.setHex(sunMeshColor);
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
        // Create a small tileable grid texture representing 5x5 world units
        // Contains all grid detail levels and repeats many times across the ground
        const tilePixels = 256;
        this.groundCanvas = document.createElement('canvas');
        this.groundCanvas.width = tilePixels;
        this.groundCanvas.height = tilePixels;
        this.groundCtx = this.groundCanvas.getContext('2d');
        
        this.drawGroundGrid(tilePixels);
        
        this.groundTexture = new THREE.CanvasTexture(this.groundCanvas);
        this.groundTexture.magFilter = THREE.LinearFilter;
        this.groundTexture.minFilter = THREE.LinearMipmapLinearFilter;
        this.groundTexture.wrapS = THREE.RepeatWrapping;
        this.groundTexture.wrapT = THREE.RepeatWrapping;
        
        // Each tile represents 5 world units, calculate repeats for doubled ground
        const worldUnitsPerTile = 5;
        const groundWorldSize = this.groundSize * 2;  // 400 units
        const repeatCount = groundWorldSize / worldUnitsPerTile;  // 80 repeats
        this.groundTexture.repeat.set(repeatCount, repeatCount);
        
        // Create horizon plane - a circular plane that extends to the inner star sphere
        // Sits at ground level (y=0) to hide star sphere pinching at the horizon
        // Uses a slightly darker green to differentiate from main arena
        // Inner star sphere radius=450, center at y=-150, so at y=0 it intersects at:
        // radius = sqrt(450^2 - 150^2) = sqrt(180000) ~= 424 units
        const horizonRadius = 425;  // Just past the star sphere intersection
        const horizonMesh = new THREE.Mesh(
            new THREE.CircleGeometry(horizonRadius, 64),  // 64 segments for smooth circle
            new THREE.MeshLambertMaterial({ 
                color: 0x2d4a1e,  // Darker green than main ground
                side: THREE.DoubleSide 
            })
        );
        horizonMesh.rotation.x = -Math.PI / 2;
        horizonMesh.position.y = -0.1;  // Just below main ground to avoid z-fighting
        horizonMesh.receiveShadow = false;  // No shadows needed on horizon
        this.scene.add(horizonMesh);
        
        // Main ground plane with grid texture (doubled size)
        const groundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(this.groundSize * 2, this.groundSize * 2),
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
    
    /**
     * Draw a tileable ground grid cell (5x5 world units)
     * Grid levels to match the lit tile system (0.1 unit tiles):
     * - Fine lines every 0.5 units (10 cells across tile)
     * - Medium lines every 1 unit (5 cells across tile)
     * - Major lines at edges (every 5 units = tile boundary)
     */
    drawGroundGrid(size) {
        const ctx = this.groundCtx;
        
        // Base green color
        ctx.fillStyle = '#3d6428';
        ctx.fillRect(0, 0, size, size);
        
        // Pixels per world unit (tile represents 5 world units)
        const pixelsPerUnit = size / 5;
        
        // Fine grid lines every 0.5 units
        ctx.strokeStyle = 'rgba(30, 50, 20, 0.7)';
        ctx.lineWidth = 1;
        const fineGridPixels = pixelsPerUnit * 0.5;
        for (let i = fineGridPixels; i < size; i += fineGridPixels) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(size, i);
            ctx.stroke();
        }
        
        // Medium grid lines every 1 unit
        ctx.strokeStyle = 'rgba(20, 40, 15, 0.85)';
        ctx.lineWidth = 2;
        const mediumGridPixels = pixelsPerUnit * 1;
        for (let i = mediumGridPixels; i < size; i += mediumGridPixels) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(size, i);
            ctx.stroke();
        }
        
        // Major grid lines at tile edges (every 5 units)
        // Draw on left and top edges so they connect when tiled
        ctx.strokeStyle = 'rgba(15, 30, 10, 1.0)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size, 0);
        ctx.stroke();
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
        
        // Track tile for creature (array preserves visitation order)
        if (creature && creature.tilesLit) {
            if (!creature.tilesLit.includes(tileKey)) {
                creature.tilesLit.push(tileKey);
            }
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
        
        // Filter to valid creatures (have bodies, not eliminated)
        const validCreatures = this.activeCreatures.filter(c => 
            c && c.bodies && c.bodies.length > 0 && 
            (!this.eliminatedCreatures || !this.eliminatedCreatures.has(c))
        );
        
        if (validCreatures.length === 0) {
            this.crownGroup.visible = false;
            this.currentBestCreature = null;
            return;
        }
        
        let bestCreature = null;
        
        // Outcast mode requires population-level analysis
        if (this.fitnessMode === 'outcast') {
            const result = this.calculateOutcastFitnessForPopulation(validCreatures);
            bestCreature = result.bestCreature;
        } else {
            // Standard fitness modes - calculate individually
            let bestFitness = -Infinity;
            for (let creature of validCreatures) {
                creature.calculateFitness(this.fitnessMode);
                if (creature.fitness > bestFitness) {
                    bestFitness = creature.fitness;
                    bestCreature = creature;
                }
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
    
    /**
     * Calculate outcast fitness for all active creatures.
     * Outcast mode requires population-level analysis - we need to find the average
     * of all creatures, then score each by how different they are from that average.
     * 
     * This sets the .fitness property on each creature in the provided array.
     * 
     * @param {Array} creatures - Array of creatures to calculate fitness for
     * @returns {Object} Object with bestCreature and worstCreature references
     */
    calculateOutcastFitnessForPopulation(creatures) {
        if (!creatures || creatures.length === 0) {
            return { bestCreature: null, worstCreature: null };
        }
        
        // First pass: gather all metrics and find ranges for normalization
        const metrics = creatures.map(creature => {
            const tilesCount = creature.tilesLit ? creature.tilesLit.length : 0;
            return {
                creature: creature,
                distance: creature.maxDistance || 0,
                height: creature.maxHeight || 0,
                tiles: tilesCount,
                jump: creature.maxJumpHeight || 0
            };
        });
        
        // Find max values for normalization (avoid division by zero)
        const maxDistance = Math.max(0.001, ...metrics.map(m => m.distance));
        const maxHeight = Math.max(0.001, ...metrics.map(m => m.height));
        const maxTiles = Math.max(1, ...metrics.map(m => m.tiles));
        const maxJump = Math.max(0.001, ...metrics.map(m => m.jump));
        
        // Calculate population averages (normalized 0-1)
        let avgDistance = 0, avgHeight = 0, avgTiles = 0, avgJump = 0;
        for (let m of metrics) {
            avgDistance += m.distance / maxDistance;
            avgHeight += m.height / maxHeight;
            avgTiles += m.tiles / maxTiles;
            avgJump += m.jump / maxJump;
        }
        const count = metrics.length;
        avgDistance /= count;
        avgHeight /= count;
        avgTiles /= count;
        avgJump /= count;
        
        // Second pass: calculate "outcast score" (deviation from average)
        let bestCreature = null;
        let worstCreature = null;
        let bestFitness = -Infinity;
        let worstFitness = Infinity;
        
        for (let m of metrics) {
            // Normalize this creature's metrics
            const normDist = m.distance / maxDistance;
            const normHeight = m.height / maxHeight;
            const normTiles = m.tiles / maxTiles;
            const normJump = m.jump / maxJump;
            
            // Calculate absolute deviation from average for each metric
            const devDist = Math.abs(normDist - avgDistance);
            const devHeight = Math.abs(normHeight - avgHeight);
            const devTiles = Math.abs(normTiles - avgTiles);
            const devJump = Math.abs(normJump - avgJump);
            
            // Total deviation = outcast score (sum of all deviations)
            // Scale up for more readable numbers
            const outcastScore = (devDist + devHeight + devTiles + devJump) * 100;
            
            // Store the fitness on the creature
            m.creature.fitness = outcastScore;
            
            // Track best and worst
            if (outcastScore > bestFitness) {
                bestFitness = outcastScore;
                bestCreature = m.creature;
            }
            if (outcastScore < worstFitness) {
                worstFitness = outcastScore;
                worstCreature = m.creature;
            }
        }
        
        return { bestCreature, worstCreature };
    }
    
    spawnCreature(creature, startPosition = null) {
        // Calculate the creature's bounding box to find lowest point
        // This ensures creatures don't spawn intersecting the ground
        let lowestPoint = Infinity;
        for (const block of creature.blocks) {
            // Block's lowest point = block center Y - half of block height
            const blockBottom = block.position[1] - block.size[1] / 2;
            if (blockBottom < lowestPoint) {
                lowestPoint = blockBottom;
            }
        }
        
        // Calculate spawn height so the lowest block is just above ground
        // lowestPoint is relative to creature origin, so we need to offset
        // to make the absolute lowest point sit at groundClearance height
        const groundClearance = 0.1;
        const spawnHeight = groundClearance - lowestPoint;
        
        // Set start position with calculated Y to keep creature above ground
        const basePosition = startPosition ? [...startPosition] : [...this.creatureStartPosition];
        creature.startPosition = [
            basePosition[0],
            spawnHeight,
            basePosition[2]
        ];
        
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
            creature.tilesLit = [];
            creature.maxJumpHeight = 0;
            creature.hasLandedAfterSpawn = false;
            creature.groundedY = 0;
        }
        
        // Initialize influence system - find blocks that provide influences
        creature.influenceProviders = findInfluenceProviders(creature);
        creature.influences = {};
        
        // Add visual indicators for influence-providing blocks
        for (const provider of creature.influenceProviders) {
            const mesh = creature.meshes[provider.blockIndex];
            if (mesh) {
                this.addInfluenceBlockVisual(mesh, provider.channelName);
            }
        }
    }
    
    /**
     * Add visual indicator to an influence-providing block.
     * @param {THREE.Mesh} mesh - The block's mesh
     * @param {string} influenceType - The type of influence ('gravity', 'light', etc.)
     */
    addInfluenceBlockVisual(mesh, influenceType) {
        const config = getInfluenceVisualConfig(influenceType);
        if (!config) return;
        
        // Store influence type on mesh for later updates
        mesh.userData.influenceType = influenceType;
        
        if (influenceType === 'gravity') {
            // Gravity sensor: small pendulum sphere that hangs "down"
            const pendulumGeo = new THREE.SphereGeometry(0.12, 8, 8);
            const pendulumMat = new THREE.MeshPhongMaterial({
                color: config.color,
                emissive: config.glowColor,
                emissiveIntensity: 0.4
            });
            const pendulum = new THREE.Mesh(pendulumGeo, pendulumMat);
            pendulum.position.y = -0.3;
            mesh.add(pendulum);
            mesh.userData.influenceVisual = pendulum;
            
        } else if (influenceType === 'light') {
            // Light sensor: lens/eye on top that glows when facing sun
            const lensGeo = new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const lensMat = new THREE.MeshPhongMaterial({
                color: config.color,
                emissive: config.glowColor,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.85
            });
            const lens = new THREE.Mesh(lensGeo, lensMat);
            lens.position.y = 0.45;
            mesh.add(lens);
            mesh.userData.influenceVisual = lens;
            
        } else if (influenceType === 'velocity') {
            // Velocity sensor: arrow/chevron pointing forward
            // Uses a cone shape to suggest speed/direction
            const arrowGeo = new THREE.ConeGeometry(0.1, 0.25, 4);
            const arrowMat = new THREE.MeshPhongMaterial({
                color: config.color,
                emissive: config.glowColor,
                emissiveIntensity: 0.4
            });
            const arrow = new THREE.Mesh(arrowGeo, arrowMat);
            arrow.rotation.x = Math.PI / 2;  // Point forward (along Z)
            arrow.position.z = 0.4;
            arrow.position.y = 0;
            mesh.add(arrow);
            mesh.userData.influenceVisual = arrow;
            
        } else if (influenceType === 'ground') {
            // Ground sensor: contact pad on bottom with small bumps
            const padGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.08, 6);
            const padMat = new THREE.MeshPhongMaterial({
                color: config.color,
                emissive: config.glowColor,
                emissiveIntensity: 0.3
            });
            const pad = new THREE.Mesh(padGeo, padMat);
            pad.position.y = -0.46;
            mesh.add(pad);
            
            // Add small contact bumps
            const bumpGeo = new THREE.SphereGeometry(0.05, 6, 6);
            const positions = [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]];
            for (const [x, z] of positions) {
                const bump = new THREE.Mesh(bumpGeo, padMat);
                bump.position.set(x, -0.5, z);
                mesh.add(bump);
            }
            mesh.userData.influenceVisual = pad;
            
        } else if (influenceType === 'rhythm') {
            // Oscillator: pulsing ring that indicates rhythm
            const ringGeo = new THREE.TorusGeometry(0.2, 0.04, 8, 16);
            const ringMat = new THREE.MeshPhongMaterial({
                color: config.color,
                emissive: config.glowColor,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.9
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;  // Lay flat
            ring.position.y = 0.45;
            mesh.add(ring);
            mesh.userData.influenceVisual = ring;
            mesh.userData.rhythmPhase = Math.random() * Math.PI * 2;  // Random starting phase
            
        } else if (influenceType === 'tilt') {
            // Tilt sensor: balance beam/level indicator
            const beamGeo = new THREE.BoxGeometry(0.4, 0.06, 0.06);
            const beamMat = new THREE.MeshPhongMaterial({
                color: config.color,
                emissive: config.glowColor,
                emissiveIntensity: 0.4
            });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.y = 0.45;
            mesh.add(beam);
            
            // Add small balls at each end to emphasize the balance
            const ballGeo = new THREE.SphereGeometry(0.06, 8, 8);
            const leftBall = new THREE.Mesh(ballGeo, beamMat);
            leftBall.position.set(-0.2, 0.45, 0);
            mesh.add(leftBall);
            const rightBall = new THREE.Mesh(ballGeo, beamMat);
            rightBall.position.set(0.2, 0.45, 0);
            mesh.add(rightBall);
            
            mesh.userData.influenceVisual = beam;
        }
        // Additional influence types can be added here
    }
    
    spawnMultipleCreatures(creatures) {
        this.removeAllCreatures();
        this.clearTracks();
        this.resetSuddenDeathState();
        this.activeCreatures = creatures;
        this.selectedCreature = null;
        this.currentBestCreature = null;
        // Don't force followLeader - respect user's current preference
        this.lastFollowedCreature = null;
        
        // Only reset camera lookAt if we're in follow mode
        if (this.followLeader) {
            this.cameraLookAt.set(0, 3, 0);
            this.cameraVelocity.set(0, 0, 0);
            this.lookAtVelocity.set(0, 0, 0);
        }
        
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
        
        // Calculate fitness for all alive creatures
        // Outcast mode requires population-level analysis
        if (this.fitnessMode === 'outcast') {
            // This sets .fitness on all creatures based on their deviation from average
            this.calculateOutcastFitnessForPopulation(aliveCreatures);
        } else {
            // Standard fitness modes - calculate individually
            for (let creature of aliveCreatures) {
                creature.calculateFitness(this.fitnessMode);
            }
        }
        
        // Sort by fitness ascending (lowest first = worst performer to eliminate)
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
            // Don't force followLeader - respect user's current preference
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
        
        // When paused, still allow camera movement and visual updates
        // This lets the user look around while the simulation is frozen
        if (!this.isRunning || this.isPaused) {
            // Update camera so user can still pan/rotate/zoom while paused
            this.updateCamera();
            // Keep visual effects animating (particles, glows)
            this.visualEffects.updateParticles(deltaTime);
            this.visualEffects.updateEmissiveGlow();
            return;
        }
        
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
        
        // Update influence channels if creature has any influence providers
        if (creature.influenceProviders && creature.influenceProviders.length > 0) {
            const context = this.buildInfluenceContext();
            creature.influences = updateCreatureInfluences(creature, context);
        }
        
        const collisions = this.detectBlockCollisions(creature);
        
        for (let joint of creature.joints) {
            // Pass influences to joint update (will be ignored if joint has no responses)
            const delta = joint.update(creature.influences);
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
    
    /**
     * Build context object for influence calculations.
     * Provides environmental information that influence providers may need.
     * @returns {Object} Context with sunDirection, dayProgress, simulationTime, etc.
     */
    buildInfluenceContext() {
        const context = {};
        
        // Sun direction (normalized) for light sensors
        if (this.sunLight) {
            const pos = this.sunLight.position;
            const length = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
            if (length > 0) {
                context.sunDirection = {
                    x: pos.x / length,
                    y: pos.y / length,
                    z: pos.z / length
                };
            }
        }
        
        // Day progress (0 to 1) for potential time-based influences
        context.dayProgress = this.maxTime > 0 ? this.timeElapsed / this.maxTime : 0;
        
        // Simulation time in seconds for oscillator/rhythm sensors
        context.simulationTime = this.timeElapsed;
        
        // Add more context here as needed for future influence types
        // context.temperature = ...
        // context.windDirection = ...
        
        return context;
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
                
                // Smooth only the look-at position
                const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
                const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
                const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
                
                this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
                this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
                
                // Camera is ALWAYS directly above the look-at point (no separate smoothing)
                // This prevents any apparent rotation
                const celebrationHeight = 80;
                this.cameraPosition.set(this.cameraLookAt.x, celebrationHeight, this.cameraLookAt.z);
                
                // Lock camera orientation - up is always Y axis
                this.camera.up.set(0, 1, 0);
                this.camera.position.copy(this.cameraPosition);
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
        // User can pan (right drag) to offset view, but camera re-centers over time
        if (this.overviewMode && this.followLeader) {
            const toFollow = this.selectedCreature || this.currentBestCreature;
            
            // Detect when we're switching to a new target creature
            // This triggers the ease-in transition effect
            if (toFollow !== this.lastFollowedCreature) {
                if (this.lastFollowedCreature !== null) {
                    // Switching between creatures while already following
                    // Start a new ease-in transition for smooth camera movement
                    this.cameraTransitionProgress = 0.0;
                    // Save current look-at position as starting point
                    this.previousTargetPosition = this.cameraLookAt.clone();
                    // Reset velocities for a clean start (prevents jerky continuation)
                    this.lookAtVelocity.set(0, 0, 0);
                    // Reset pan offset when switching creatures
                    this.overviewPanOffset.set(0, 0, 0);
                    // NOTE: Don't reset zoom when switching targets - keep current height
                } else {
                    // Overview+follow mode was just enabled (lastFollowedCreature was null)
                    // Allow auto-zoom to frame the first creature properly
                    this.userOverrideZoom = false;
                }
            }
            this.lastFollowedCreature = toFollow;
            
            // Calculate and smoothly adjust overview height based on creature size
            // Only when mode first starts (userOverrideZoom is false)
            // Once user zooms manually OR we've auto-framed once, this stops
            if (!this.userOverrideZoom && toFollow) {
                const targetHeight = this.calculateCameraDistanceForCreature(toFollow);
                this.overviewHeight += (targetHeight - this.overviewHeight) * 0.05;
                // After initial framing settles, lock it in so target switches don't re-zoom
                if (Math.abs(targetHeight - this.overviewHeight) < 0.5) {
                    this.userOverrideZoom = true;
                }
            }
            
            // Gradually decay the pan offset so camera re-centers on creature
            // Decay rate: offset reduces by ~63% per second (exponential decay)
            const decayRate = 2.0;  // Higher = faster re-centering
            const decayFactor = Math.exp(-decayRate * deltaTime);
            this.overviewPanOffset.x *= decayFactor;
            this.overviewPanOffset.z *= decayFactor;
            
            // Get creature position and track it
            if (toFollow?.bodies?.length) {
                targetLookAt = this.getCreatureCenterOfMass(toFollow);
            }
            targetLookAt.y = 0; // Always look at ground level
            
            // Apply pan offset to target position
            targetLookAt.x += this.overviewPanOffset.x;
            targetLookAt.z += this.overviewPanOffset.z;
            
            // Update transition progress if we're in an ease-in transition
            if (this.cameraTransitionProgress < 1.0) {
                this.cameraTransitionProgress += deltaTime / this.cameraTransitionDuration;
                this.cameraTransitionProgress = Math.min(1.0, this.cameraTransitionProgress);
            }
            
            // Apply ease-in curve: starts slow, accelerates toward end
            // Using cubic ease-in: t^3 gives a nice slow-start feel
            const easeT = this.cameraTransitionProgress;
            const easedProgress = easeT * easeT * easeT;  // Cubic ease-in
            
            // During transition, blend between slow and normal smooth time
            const slowSmoothTime = 1.2;
            const normalSmoothTime = this.cameraSmoothTime;
            const smoothTime = slowSmoothTime + (normalSmoothTime - slowSmoothTime) * easedProgress;
            
            // If in transition, blend the target position for even smoother start
            if (this.cameraTransitionProgress < 1.0 && this.previousTargetPosition) {
                // Blend horizontal position, keep y at ground level
                targetLookAt.x = this.previousTargetPosition.x + (targetLookAt.x - this.previousTargetPosition.x) * easedProgress;
                targetLookAt.z = this.previousTargetPosition.z + (targetLookAt.z - this.previousTargetPosition.z) * easedProgress;
            }
            
            // Smooth only the look-at position
            const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
            const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
            const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
            
            this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
            this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
            
            // Camera is ALWAYS directly above the look-at point (no separate smoothing)
            // This prevents any apparent rotation
            const effectiveHeight = this.overviewHeight;
            this.cameraPosition.set(this.cameraLookAt.x, effectiveHeight, this.cameraLookAt.z);
            
            // Lock camera orientation - up is always Y axis
            this.camera.up.set(0, 1, 0);
            this.camera.position.copy(this.cameraPosition);
            this.camera.lookAt(this.cameraLookAt);
        }
        // OVERVIEW ONLY: Top-down view with panning, no rotation
        // Camera always looks straight down, aligned with ground plane
        else if (this.overviewMode && !this.followLeader) {
            targetLookAt.copy(this.overviewCenter);
            targetLookAt.y = 0;  // Look at ground level
            
            // Smooth only the look-at position
            const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, 0.3, deltaTime);
            const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, 0.3, deltaTime);
            const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, 0.3, deltaTime);
            
            this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
            this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
            
            // Camera is ALWAYS directly above the look-at point (no separate smoothing)
            // This prevents any apparent rotation
            const effectiveHeight = this.overviewHeight;
            this.cameraPosition.set(this.cameraLookAt.x, effectiveHeight, this.cameraLookAt.z);
            
            // Lock camera orientation - up is always Y axis
            this.camera.up.set(0, 1, 0);
            this.camera.position.copy(this.cameraPosition);
            this.camera.lookAt(this.cameraLookAt);
        }
        // FOLLOW ONLY: Normal 3D following camera
        else if (!this.overviewMode && this.followLeader) {
            const toFollow = this.selectedCreature || this.currentBestCreature;
            
            // Detect when we're switching to a new target creature
            // This triggers the ease-in transition effect
            if (toFollow !== this.lastFollowedCreature) {
                if (this.lastFollowedCreature !== null) {
                    // Switching between creatures while already following
                    // Start a new ease-in transition for smooth camera movement
                    this.cameraTransitionProgress = 0.0;
                    // Save current look-at position as starting point
                    this.previousTargetPosition = this.cameraLookAt.clone();
                    // Reset velocities for a clean start (prevents jerky continuation)
                    this.cameraVelocity.set(0, 0, 0);
                    this.lookAtVelocity.set(0, 0, 0);
                    // NOTE: Don't reset zoom when switching targets - keep current zoom/rotation
                } else {
                    // Follow mode was just enabled (lastFollowedCreature was null)
                    // Allow auto-zoom to frame the first creature properly
                    this.userOverrideZoom = false;
                }
            }
            this.lastFollowedCreature = toFollow;
            
            // Calculate and smoothly adjust camera distance based on creature size
            // Only when follow mode first starts (userOverrideZoom is false)
            // Once user zooms manually OR we've auto-framed once, this stops
            if (!this.userOverrideZoom && toFollow) {
                this.targetCameraDistance = this.calculateCameraDistanceForCreature(toFollow);
                // Smoothly interpolate to target distance
                this.cameraDistance += (this.targetCameraDistance - this.cameraDistance) * 0.05;
                // After initial framing settles, lock it in so target switches don't re-zoom
                if (Math.abs(this.targetCameraDistance - this.cameraDistance) < 0.5) {
                    this.userOverrideZoom = true;
                }
            }
            
            // Get the target position (where we want to look)
            if (toFollow?.bodies?.length) {
                targetLookAt = this.getCreatureCenterOfMass(toFollow);
            }
            
            // Update transition progress if we're in an ease-in transition
            if (this.cameraTransitionProgress < 1.0) {
                this.cameraTransitionProgress += deltaTime / this.cameraTransitionDuration;
                this.cameraTransitionProgress = Math.min(1.0, this.cameraTransitionProgress);
            }
            
            // Apply ease-in curve: starts slow, accelerates toward end
            // Using cubic ease-in: t^3 gives a nice slow-start feel
            const easeT = this.cameraTransitionProgress;
            const easedProgress = easeT * easeT * easeT;  // Cubic ease-in
            
            // During transition, blend between slow and normal smooth time
            // smoothTime is higher (slower) at start, decreases (faster) as we progress
            const slowSmoothTime = 1.2;   // Very slow at start
            const normalSmoothTime = this.cameraSmoothTime;  // Normal speed at end
            const smoothTime = slowSmoothTime + (normalSmoothTime - slowSmoothTime) * easedProgress;
            
            // If in transition, blend the target position for even smoother start
            if (this.cameraTransitionProgress < 1.0 && this.previousTargetPosition) {
                // Blend between old position and new target based on eased progress
                targetLookAt.x = this.previousTargetPosition.x + (targetLookAt.x - this.previousTargetPosition.x) * easedProgress;
                targetLookAt.y = this.previousTargetPosition.y + (targetLookAt.y - this.previousTargetPosition.y) * easedProgress;
                targetLookAt.z = this.previousTargetPosition.z + (targetLookAt.z - this.previousTargetPosition.z) * easedProgress;
            }
            
            targetPosition.set(
                this.cameraLookAt.x + Math.cos(this.cameraRotationX) * this.cameraDistance,
                this.cameraLookAt.y + this.cameraDistance * Math.sin(this.cameraRotationY) + 2,
                this.cameraLookAt.z + Math.sin(this.cameraRotationX) * this.cameraDistance
            );
            
            const lookX = this.smoothDamp(this.cameraLookAt.x, targetLookAt.x, this.lookAtVelocity.x, smoothTime, deltaTime);
            const lookY = this.smoothDamp(this.cameraLookAt.y, targetLookAt.y, this.lookAtVelocity.y, smoothTime, deltaTime);
            const lookZ = this.smoothDamp(this.cameraLookAt.z, targetLookAt.z, this.lookAtVelocity.z, smoothTime, deltaTime);
            
            this.cameraLookAt.set(lookX.value, lookY.value, lookZ.value);
            this.lookAtVelocity.set(lookX.velocity, lookY.velocity, lookZ.velocity);
            
            targetPosition.set(
                this.cameraLookAt.x + Math.cos(this.cameraRotationX) * this.cameraDistance,
                this.cameraLookAt.y + this.cameraDistance * Math.sin(this.cameraRotationY) + 2,
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
                this.cameraLookAt.y + this.cameraDistance * Math.sin(this.cameraRotationY) + 2,
                this.cameraLookAt.z + Math.sin(this.cameraRotationX) * this.cameraDistance
            );
            
            this.camera.position.copy(targetPosition);
            this.cameraPosition.copy(targetPosition);
            this.camera.lookAt(this.cameraLookAt);
        }
        
        // Clamp camera height to stay above ground plane
        // This applies to all camera modes as a final safety check
        if (this.camera.position.y < this.cameraMinHeight) {
            this.camera.position.y = this.cameraMinHeight;
            this.cameraPosition.y = this.cameraMinHeight;
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
            
            // Set initial height based on whether follow is enabled
            if (this.followLeader) {
                // Overview + Follow: Use height based on creature size
                const toFollow = this.selectedCreature || this.currentBestCreature;
                if (toFollow) {
                    this.overviewHeight = this.calculateCameraDistanceForCreature(toFollow);
                } else {
                    this.overviewHeight = 15;
                }
            } else {
                // Overview only: Zoom out to show all creatures
                this.overviewHeight = this.calculateOverviewHeightForAllCreatures();
            }
        }
        
        // Set the mode flags
        if (mode === 'overview') {
            this.overviewMode = true;
            // Reset pan offset when entering overview mode
            this.overviewPanOffset.set(0, 0, 0);
            // Reset zoom override so auto-framing takes effect
            this.userOverrideZoom = false;
        } else if (mode === 'follow') {
            this.followLeader = true;
            this.lastFollowedCreature = null;
            this.camera.up.set(0, 1, 0);
            // Reset zoom override so auto-framing takes effect
            this.userOverrideZoom = false;
            if (this.onFollowLeaderChanged) {
                this.onFollowLeaderChanged();
            }
        }
    }
    
    /**
     * Calculate overview height to fit all creatures in view with some buffer
     * Used when in overview-only mode (no follow)
     */
    calculateOverviewHeightForAllCreatures() {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        if (this.activeCreatures && this.activeCreatures.length > 0) {
            for (let creature of this.activeCreatures) {
                if (creature.bodies && creature.bodies.length > 0) {
                    for (let body of creature.bodies) {
                        minX = Math.min(minX, body.position.x);
                        maxX = Math.max(maxX, body.position.x);
                        minZ = Math.min(minZ, body.position.z);
                        maxZ = Math.max(maxZ, body.position.z);
                    }
                }
            }
        }
        
        // If no creatures, use default bounds
        if (minX === Infinity) {
            return 100;
        }
        
        // Calculate bounding box size with buffer
        const buffer = 30;  // Extra space around creatures
        const width = (maxX - minX) + buffer * 2;
        const depth = (maxZ - minZ) + buffer * 2;
        const maxExtent = Math.max(width, depth);
        
        // Calculate height needed to see the full extent
        // For 60 degree FOV, height ~= extent * 0.7 gives good framing
        const height = Math.max(60, maxExtent * 0.7);
        
        // Also set the overview center to the center of all creatures
        this.overviewCenter.set(
            (minX + maxX) / 2,
            0,
            (minZ + maxZ) / 2
        );
        
        return height;
    }
    
    /**
     * Calculate ideal camera distance to frame a creature with buffer
     * @param {Object} creature - The creature to frame
     * @returns {number} Ideal camera distance
     */
    calculateCameraDistanceForCreature(creature) {
        if (!creature || !creature.bodies || creature.bodies.length === 0) {
            return 15;  // Default distance
        }
        
        // Calculate creature's bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        for (let body of creature.bodies) {
            minX = Math.min(minX, body.position.x);
            maxX = Math.max(maxX, body.position.x);
            minY = Math.min(minY, body.position.y);
            maxY = Math.max(maxY, body.position.y);
            minZ = Math.min(minZ, body.position.z);
            maxZ = Math.max(maxZ, body.position.z);
        }
        
        // Calculate size with buffer
        const buffer = 3;  // Extra space around creature
        const width = (maxX - minX) + buffer * 2;
        const height = (maxY - minY) + buffer * 2;
        const depth = (maxZ - minZ) + buffer * 2;
        
        // Use the largest dimension to determine distance
        const maxSize = Math.max(width, height, depth);
        
        // Calculate distance based on FOV (60 degrees)
        // Distance = size / (2 * tan(FOV/2)) with some extra margin
        const distance = Math.max(8, maxSize * 1.5 + 5);
        
        return distance;
    }
    
    returnFromOverview() {
        // Reset camera orientation to normal
        this.camera.up.set(0, 1, 0);
        
        // Reset pan offset
        this.overviewPanOffset.set(0, 0, 0);
        
        // Reset zoom override so auto-framing takes effect
        this.userOverrideZoom = false;
        
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
        this.cameraRotationX = 0;
        this.cameraRotationY = 0.15;  // ~8 degrees - very low angle to see horizon/sky
        this.cameraDistance = 15;
        this.targetCameraDistance = 15;
        this.userOverrideZoom = false;  // Reset zoom override
        
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
        this.overviewPanOffset.set(0, 0, 0);
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
        
        // OVERVIEW + FOLLOW: Allow panning (right drag) to offset from followed creature
        // No rotation allowed - camera always looks straight down
        if (this.overviewMode && this.followLeader) {
            if (this.mouseButton === 2) {
                // Right drag: Pan with offset from followed creature
                // The offset will gradually decay back to zero
                const panSpeed = this.overviewHeight * 0.002;
                this.overviewPanOffset.x -= dx * panSpeed;
                this.overviewPanOffset.z -= dy * panSpeed;
            }
            // Left drag does nothing in this mode (no rotation when looking down)
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            return;
        }
        
        // OVERVIEW ONLY: Allow panning (right drag), no rotation
        // Camera always looks straight down, aligned with ground
        if (this.overviewMode && !this.followLeader) {
            if (this.mouseButton === 2) {
                // Right drag: Pan the camera center
                const panSpeed = this.overviewHeight * 0.002;
                this.overviewCenter.x -= dx * panSpeed;
                this.overviewCenter.z -= dy * panSpeed;
            }
            // Left drag does nothing in overview mode (no rotation)
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            return;
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
                // Right drag: Pan the look-at point along the ground plane
                // This disables follow leader if it was on
                if (this.followLeader) {
                    this.followLeader = false;
                    if (this.onFollowLeaderChanged) {
                        this.onFollowLeaderChanged();
                    }
                }
                
                // Calculate pan directions based on camera's horizontal rotation
                // Right vector: perpendicular to camera facing direction on ground plane
                const rightX = Math.cos(this.cameraRotationX + Math.PI / 2);
                const rightZ = Math.sin(this.cameraRotationX + Math.PI / 2);
                
                // Forward vector: direction camera is facing on ground plane
                const forwardX = Math.cos(this.cameraRotationX);
                const forwardZ = Math.sin(this.cameraRotationX);
                
                // Pan speed scales with distance for consistent feel
                const panSpeed = this.cameraDistance * 0.003;
                
                // Apply horizontal drag to right direction, vertical drag to forward direction
                this.cameraLookAt.x += (dx * rightX - dy * forwardX) * panSpeed;
                this.cameraLookAt.z += (dx * rightZ - dy * forwardZ) * panSpeed;
            }
        }
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }
    
    onMouseUp() { this.mouseDown = false; }
    
    onMouseWheel(e) {
        e.preventDefault();
        
        // User is manually controlling zoom - disable auto-zoom
        this.userOverrideZoom = true;
        
        // In any overview mode (with or without follow), zoom controls the height
        if (this.overviewMode) {
            this.overviewHeight += e.deltaY * 0.1;
            this.overviewHeight = Math.max(20, Math.min(400, this.overviewHeight));
        } 
        // In normal 3D mode (follow only or free camera), zoom controls the distance
        else {
            this.cameraDistance += e.deltaY * 0.03;
            this.cameraDistance = Math.max(5, Math.min(120, this.cameraDistance));
            this.targetCameraDistance = this.cameraDistance;  // Sync target to prevent snap-back
        }
    }
}
