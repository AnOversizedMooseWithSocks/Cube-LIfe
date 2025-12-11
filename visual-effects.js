// visual-effects.js - Visual effects, materials, and particle systems
// Particle pools, material factory, celebration effects

class VisualEffects {
    constructor(scene) {
        this.scene = scene;
        
        // Particle pools
        this.dustParticles = [];
        this.sparkParticles = [];
        this.glowParticles = [];
        this.trailParticles = [];
        this.confettiParticles = [];
        this.fireworkParticles = [];
        this.ringParticles = [];
        this.starParticles = [];
        
        // Pool limits
        this.maxDustParticles = 500;
        this.maxSparkParticles = 400;
        this.maxGlowParticles = 200;
        this.maxTrailParticles = 300;
        this.maxConfettiParticles = 300;
        this.maxFireworkParticles = 500;
        this.maxRingParticles = 30;
        this.maxStarParticles = 100;
        
        // Emissive blocks tracking
        this.emissiveBlocks = [];
        
        // Absorption flash effects
        this.absorptionFlashes = [];
        
        this.initParticleSystems();
    }
    
    // Material Factory - Creates visually distinct materials with different weights
    createBlockMaterial(materialType, baseColor) {
        const color = new THREE.Color(baseColor);
        
        switch(materialType) {
            case 'metal':
                return new THREE.MeshPhongMaterial({
                    color: this.desaturateColor(color, 0.3),
                    shininess: 100,
                    specular: 0x888888,
                    reflectivity: 0.9,
                    flatShading: false
                });
                
            case 'plastic':
                return new THREE.MeshPhongMaterial({
                    color: this.saturateColor(color, 1.2),
                    shininess: 50,
                    specular: 0x444444,
                    flatShading: false
                });
                
            case 'ceramic':
                return new THREE.MeshPhongMaterial({
                    color: this.lightenColor(color, 1.1),
                    shininess: 20,
                    specular: 0x222222,
                    flatShading: false
                });
                
            case 'wood':
                const woodColor = this.warmifyColor(color);
                return new THREE.MeshLambertMaterial({
                    color: woodColor,
                    flatShading: false
                });
                
            case 'glass':
                return new THREE.MeshPhongMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.6,
                    shininess: 100,
                    specular: 0xffffff,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                
            case 'emissive':
                return new THREE.MeshPhongMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.6,
                    shininess: 30,
                    specular: 0x333333
                });
                
            case 'rubber':
                return new THREE.MeshLambertMaterial({
                    color: this.darkenColor(color, 0.85),
                    flatShading: false
                });
                
            case 'crystal':
                return new THREE.MeshPhongMaterial({
                    color: this.saturateColor(color, 1.5),
                    shininess: 150,
                    specular: 0xffffff,
                    transparent: true,
                    opacity: 0.85,
                    flatShading: true
                });
                
            default:
                return new THREE.MeshPhongMaterial({
                    color: color,
                    shininess: 30
                });
        }
    }
    
    // Material mass multipliers - affects physics behavior
    getMaterialMass(materialType) {
        const massMultipliers = {
            'metal': 1.8, 'plastic': 1.0, 'ceramic': 1.4, 'wood': 0.7,
            'glass': 0.9, 'emissive': 0.6, 'rubber': 0.8, 'crystal': 1.2
        };
        return massMultipliers[materialType] || 1.0;
    }
    
    // Color manipulation helpers
    desaturateColor(color, amount) {
        const hsl = {};
        color.getHSL(hsl);
        hsl.s *= amount;
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    
    saturateColor(color, amount) {
        const hsl = {};
        color.getHSL(hsl);
        hsl.s = Math.min(1, hsl.s * amount);
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    
    lightenColor(color, amount) {
        const hsl = {};
        color.getHSL(hsl);
        hsl.l = Math.min(1, hsl.l * amount);
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    
    darkenColor(color, amount) {
        const hsl = {};
        color.getHSL(hsl);
        hsl.l *= amount;
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    
    warmifyColor(color) {
        const hsl = {};
        color.getHSL(hsl);
        hsl.h = 0.05 + (hsl.h * 0.1);
        hsl.s = Math.min(0.6, hsl.s);
        hsl.l = Math.max(0.2, Math.min(0.5, hsl.l));
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    
    initParticleSystems() {
        this.dustGeometry = new THREE.SphereGeometry(0.15, 6, 6);
        this.sparkGeometry = new THREE.SphereGeometry(0.08, 4, 4);
        this.glowGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        this.trailGeometry = new THREE.SphereGeometry(0.12, 4, 4);
        this.confettiGeometry = new THREE.PlaneGeometry(0.3, 0.15);
        this.fireworkGeometry = new THREE.SphereGeometry(0.1, 6, 6);
        this.ringGeometry = new THREE.TorusGeometry(0.5, 0.05, 8, 24);
        this.starGeometry = this.createStarGeometry();
        
        this.dustMaterial = new THREE.MeshBasicMaterial({
            color: 0x9b8b7a,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });
        
        this.sparkMaterial = new THREE.MeshBasicMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });
    }
    
    createStarGeometry() {
        const shape = new THREE.Shape();
        const outerRadius = 0.2;
        const innerRadius = 0.08;
        const points = 5;
        
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        shape.closePath();
        
        return new THREE.ShapeGeometry(shape);
    }
    
    spawnDustParticles(position, intensity = 1.0) {
        const count = Math.floor(12 + intensity * 15);
        
        for (let i = 0; i < count; i++) {
            let particle;
            const inactive = this.dustParticles.find(p => !p.active);
            
            if (inactive) {
                particle = inactive;
                particle.mesh.visible = true;
            } else if (this.dustParticles.length < this.maxDustParticles) {
                const material = this.dustMaterial.clone();
                const colorVariation = 0.9 + Math.random() * 0.2;
                material.color.setRGB(
                    0.6 * colorVariation,
                    0.55 * colorVariation,
                    0.48 * colorVariation
                );
                const mesh = new THREE.Mesh(this.dustGeometry, material);
                mesh.castShadow = false;
                this.scene.add(mesh);
                particle = { mesh: mesh, active: false };
                this.dustParticles.push(particle);
            } else {
                continue;
            }
            
            const angle = Math.random() * Math.PI * 2;
            const spread = Math.random() * 0.8 * intensity;
            particle.mesh.position.set(
                position.x + Math.cos(angle) * spread,
                position.y + 0.1 + Math.random() * 0.3,
                position.z + Math.sin(angle) * spread
            );
            
            const speed = (1 + Math.random() * 2) * intensity;
            particle.velocity = new THREE.Vector3(
                Math.cos(angle) * speed * 1.5,
                Math.random() * 3 * intensity + 1,
                Math.sin(angle) * speed * 1.5
            );
            
            particle.life = 1.0 + Math.random() * 0.8;
            particle.maxLife = particle.life;
            particle.active = true;
            particle.mesh.material.opacity = 0.7 + Math.random() * 0.3;
            particle.mesh.scale.setScalar(0.8 + Math.random() * 1.2);
            particle.rotationSpeed = (Math.random() - 0.5) * 2;
        }
    }
    
    spawnSparkParticles(position, color = null) {
        const count = 8 + Math.floor(Math.random() * 10);
        const baseColor = color || new THREE.Color(0xffaa00);
        const sparkColors = [
            baseColor,
            new THREE.Color(0xffff00),
            new THREE.Color(0xff6600),
            new THREE.Color(0xffffff)
        ];
        
        for (let i = 0; i < count; i++) {
            let particle;
            const inactive = this.sparkParticles.find(p => !p.active);
            
            if (inactive) {
                particle = inactive;
                particle.mesh.visible = true;
            } else if (this.sparkParticles.length < this.maxSparkParticles) {
                const material = this.sparkMaterial.clone();
                const mesh = new THREE.Mesh(this.sparkGeometry, material);
                mesh.castShadow = false;
                this.scene.add(mesh);
                particle = { mesh: mesh, active: false };
                this.sparkParticles.push(particle);
            } else {
                continue;
            }
            
            const sparkColor = sparkColors[Math.floor(Math.random() * sparkColors.length)];
            particle.mesh.material.color.copy(sparkColor);
            particle.mesh.position.copy(position);
            
            const speed = 6 + Math.random() * 10;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            particle.velocity = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.cos(phi) * speed * 0.5 + 3,
                Math.sin(phi) * Math.sin(theta) * speed
            );
            
            particle.life = 0.3 + Math.random() * 0.5;
            particle.maxLife = particle.life;
            particle.active = true;
            particle.mesh.material.opacity = 1.0;
            particle.mesh.scale.setScalar(0.5 + Math.random() * 1.0);
            particle.originalColor = sparkColor.clone();
        }
    }
    
    spawnGlowParticle(position, color) {
        const count = 2 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < count; i++) {
            let particle;
            const inactive = this.glowParticles.find(p => !p.active);
            
            if (inactive) {
                particle = inactive;
                particle.mesh.visible = true;
                particle.mesh.material.color.copy(color);
            } else if (this.glowParticles.length < this.maxGlowParticles) {
                const material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.7,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(this.glowGeometry, material);
                mesh.castShadow = false;
                this.scene.add(mesh);
                particle = { mesh: mesh, active: false };
                this.glowParticles.push(particle);
            } else {
                continue;
            }
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 0.5 + Math.random() * 1.0;
            particle.mesh.position.set(
                position.x + Math.cos(angle) * dist,
                position.y + (Math.random() - 0.5) * 1.5,
                position.z + Math.sin(angle) * dist
            );
            
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                0.5 + Math.random() * 1.0,
                (Math.random() - 0.5) * 0.8
            );
            
            particle.life = 2.0 + Math.random() * 1.5;
            particle.maxLife = particle.life;
            particle.active = true;
            particle.mesh.material.opacity = 0.6;
            particle.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
            particle.pulseOffset = Math.random() * Math.PI * 2;
            particle.orbitAngle = angle;
            particle.orbitSpeed = (Math.random() - 0.5) * 2;
            particle.basePosition = position.clone();
        }
    }
    
    spawnTrailParticle(position, color, velocity) {
        let particle;
        const inactive = this.trailParticles.find(p => !p.active);
        
        if (inactive) {
            particle = inactive;
            particle.mesh.visible = true;
        } else if (this.trailParticles.length < this.maxTrailParticles) {
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.6,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(this.trailGeometry, material);
            mesh.castShadow = false;
            this.scene.add(mesh);
            particle = { mesh: mesh, active: false };
            this.trailParticles.push(particle);
        } else {
            return;
        }
        
        particle.mesh.material.color.copy(color);
        particle.mesh.position.copy(position);
        particle.velocity = velocity.clone().multiplyScalar(0.1);
        
        particle.life = 0.3 + Math.random() * 0.2;
        particle.maxLife = particle.life;
        particle.active = true;
        particle.mesh.material.opacity = 0.5;
        particle.mesh.scale.setScalar(0.4 + Math.random() * 0.3);
    }
    
    // Celebration particles
    spawnConfettiBurst(position, count = 50) {
        const colors = [
            0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 
            0xff00ff, 0x00ffff, 0xffffff, 0xffaa00,
            0xff6699, 0x99ff66, 0x6699ff, 0xffcc00
        ];
        
        for (let i = 0; i < count; i++) {
            let particle;
            const inactive = this.confettiParticles.find(p => !p.active);
            
            if (inactive) {
                particle = inactive;
                particle.mesh.visible = true;
            } else if (this.confettiParticles.length < this.maxConfettiParticles) {
                const material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1.0,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(this.confettiGeometry, material);
                mesh.castShadow = false;
                this.scene.add(mesh);
                particle = { mesh: mesh, active: false };
                this.confettiParticles.push(particle);
            } else {
                continue;
            }
            
            particle.mesh.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
            particle.mesh.position.copy(position);
            particle.mesh.position.y += Math.random() * 2;
            
            const angle = Math.random() * Math.PI * 2;
            const upAngle = Math.random() * Math.PI * 0.4;
            const speed = 8 + Math.random() * 15;
            particle.velocity = new THREE.Vector3(
                Math.cos(angle) * Math.cos(upAngle) * speed,
                Math.sin(upAngle) * speed + 5,
                Math.sin(angle) * Math.cos(upAngle) * speed
            );
            
            particle.rotationVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 15
            );
            
            particle.life = 3.0 + Math.random() * 2.0;
            particle.maxLife = particle.life;
            particle.active = true;
            particle.mesh.material.opacity = 1.0;
            particle.mesh.scale.set(
                0.8 + Math.random() * 0.6,
                0.8 + Math.random() * 0.6,
                1
            );
        }
    }
    
    spawnFireworkBurst(position, color = null, count = 80) {
        const burstColor = color || new THREE.Color().setHSL(Math.random(), 1.0, 0.6);
        const colors = [
            burstColor,
            burstColor.clone().offsetHSL(0.1, 0, 0),
            burstColor.clone().offsetHSL(-0.1, 0, 0),
            new THREE.Color(0xffffff)
        ];
        
        for (let i = 0; i < count; i++) {
            let particle;
            const inactive = this.fireworkParticles.find(p => !p.active);
            
            if (inactive) {
                particle = inactive;
                particle.mesh.visible = true;
            } else if (this.fireworkParticles.length < this.maxFireworkParticles) {
                const material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1.0,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(this.fireworkGeometry, material);
                mesh.castShadow = false;
                this.scene.add(mesh);
                particle = { mesh: mesh, active: false };
                this.fireworkParticles.push(particle);
            } else {
                continue;
            }
            
            particle.mesh.material.color.copy(colors[Math.floor(Math.random() * colors.length)]);
            particle.mesh.position.copy(position);
            
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 10 + Math.random() * 20;
            particle.velocity = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed,
                Math.cos(phi) * speed
            );
            
            particle.life = 1.5 + Math.random() * 1.0;
            particle.maxLife = particle.life;
            particle.active = true;
            particle.mesh.material.opacity = 1.0;
            particle.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
            particle.hasTrail = Math.random() < 0.3;
        }
    }
    
    spawnEnergyRing(position, color = null) {
        let particle;
        const inactive = this.ringParticles.find(p => !p.active);
        
        if (inactive) {
            particle = inactive;
            particle.mesh.visible = true;
        } else if (this.ringParticles.length < this.maxRingParticles) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x64ffda,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(this.ringGeometry, material);
            mesh.castShadow = false;
            mesh.rotation.x = Math.PI / 2;
            this.scene.add(mesh);
            particle = { mesh: mesh, active: false };
            this.ringParticles.push(particle);
        } else {
            return;
        }
        
        if (color) {
            particle.mesh.material.color.copy(color);
        } else {
            particle.mesh.material.color.setHex(0x64ffda);
        }
        
        particle.mesh.position.copy(position);
        particle.mesh.scale.setScalar(0.1);
        
        particle.expandSpeed = 15 + Math.random() * 10;
        particle.life = 1.0;
        particle.maxLife = particle.life;
        particle.active = true;
        particle.mesh.material.opacity = 0.9;
    }
    
    spawnStarBurst(position, count = 20) {
        const colors = [0xffd700, 0xffff00, 0xffffff, 0x64ffda];
        
        for (let i = 0; i < count; i++) {
            let particle;
            const inactive = this.starParticles.find(p => !p.active);
            
            if (inactive) {
                particle = inactive;
                particle.mesh.visible = true;
            } else if (this.starParticles.length < this.maxStarParticles) {
                const material = new THREE.MeshBasicMaterial({
                    color: 0xffd700,
                    transparent: true,
                    opacity: 1.0,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(this.starGeometry, material);
                mesh.castShadow = false;
                this.scene.add(mesh);
                particle = { mesh: mesh, active: false };
                this.starParticles.push(particle);
            } else {
                continue;
            }
            
            particle.mesh.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
            particle.mesh.position.copy(position);
            
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const speed = 5 + Math.random() * 10;
            particle.velocity = new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * 8 + 2,
                Math.sin(angle) * speed
            );
            
            particle.spinSpeed = (Math.random() - 0.5) * 20;
            particle.life = 1.5 + Math.random() * 1.0;
            particle.maxLife = particle.life;
            particle.active = true;
            particle.mesh.material.opacity = 1.0;
            particle.mesh.scale.setScalar(1.0 + Math.random() * 1.5);
        }
    }
    
    // Update all particle pools each frame
    updateParticles(deltaTime) {
        const gravity = -8;
        
        // Dust particles
        for (let particle of this.dustParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.velocity.y += gravity * 0.3 * deltaTime;
            particle.velocity.multiplyScalar(0.98);
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            const lifeRatio = particle.life / particle.maxLife;
            particle.mesh.material.opacity = 0.8 * lifeRatio;
            particle.mesh.scale.setScalar(particle.mesh.scale.x * (1 + deltaTime * 0.5));
            
            if (particle.rotationSpeed) {
                particle.mesh.rotation.y += particle.rotationSpeed * deltaTime;
            }
            
            if (particle.mesh.position.y < 0.1) {
                particle.mesh.position.y = 0.1;
                particle.velocity.y = 0;
                particle.velocity.x *= 0.9;
                particle.velocity.z *= 0.9;
            }
        }
        
        // Spark particles
        for (let particle of this.sparkParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.velocity.y += gravity * 0.5 * deltaTime;
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            const lifeRatio = particle.life / particle.maxLife;
            particle.mesh.material.opacity = lifeRatio;
            
            if (particle.originalColor) {
                const coolColor = new THREE.Color(0xff3300);
                particle.mesh.material.color.lerpColors(coolColor, particle.originalColor, lifeRatio);
            }
            
            particle.mesh.scale.setScalar(Math.max(0.1, lifeRatio * 1.5));
        }
        
        // Glow particles
        for (let particle of this.glowParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            if (particle.basePosition && particle.orbitSpeed) {
                particle.orbitAngle += particle.orbitSpeed * deltaTime;
            }
            
            const lifeRatio = particle.life / particle.maxLife;
            const pulse = 0.5 + Math.sin((particle.pulseOffset || 0) + particle.life * 8) * 0.3;
            particle.mesh.material.opacity = pulse * lifeRatio * 0.8;
            
            const scalePulse = 1.0 + Math.sin(particle.life * 6) * 0.2;
            particle.mesh.scale.setScalar(scalePulse * (0.5 + lifeRatio * 0.5));
        }
        
        // Trail particles
        for (let particle of this.trailParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            const lifeRatio = particle.life / particle.maxLife;
            particle.mesh.material.opacity = lifeRatio * 0.6;
            particle.mesh.scale.setScalar(lifeRatio * 0.5);
        }
        
        // Confetti particles
        for (let particle of this.confettiParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.velocity.y += gravity * 0.4 * deltaTime;
            particle.velocity.x *= 0.99;
            particle.velocity.z *= 0.99;
            particle.velocity.x += (Math.random() - 0.5) * 0.5;
            particle.velocity.z += (Math.random() - 0.5) * 0.5;
            
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            if (particle.rotationVelocity) {
                particle.mesh.rotation.x += particle.rotationVelocity.x * deltaTime;
                particle.mesh.rotation.y += particle.rotationVelocity.y * deltaTime;
                particle.mesh.rotation.z += particle.rotationVelocity.z * deltaTime;
            }
            
            const lifeRatio = particle.life / particle.maxLife;
            if (lifeRatio < 0.3) {
                particle.mesh.material.opacity = lifeRatio / 0.3;
            }
            
            if (particle.mesh.position.y < 0.05) {
                particle.mesh.position.y = 0.05;
                particle.velocity.y = -particle.velocity.y * 0.3;
                particle.velocity.x *= 0.8;
                particle.velocity.z *= 0.8;
            }
        }
        
        // Firework particles
        for (let particle of this.fireworkParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.velocity.y += gravity * 0.3 * deltaTime;
            particle.velocity.multiplyScalar(0.98);
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            const lifeRatio = particle.life / particle.maxLife;
            particle.mesh.material.opacity = lifeRatio;
            particle.mesh.scale.setScalar(lifeRatio * 1.2);
            
            if (particle.hasTrail && Math.random() < 0.3) {
                this.spawnTrailParticle(
                    particle.mesh.position,
                    particle.mesh.material.color,
                    particle.velocity
                );
            }
        }
        
        // Energy rings
        for (let particle of this.ringParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            const currentScale = particle.mesh.scale.x;
            particle.mesh.scale.setScalar(currentScale + particle.expandSpeed * deltaTime);
            
            const lifeRatio = particle.life / particle.maxLife;
            particle.mesh.material.opacity = lifeRatio * 0.8;
        }
        
        // Star particles
        for (let particle of this.starParticles) {
            if (!particle.active) continue;
            
            particle.life -= deltaTime;
            if (particle.life <= 0) {
                particle.active = false;
                particle.mesh.visible = false;
                continue;
            }
            
            particle.velocity.y += gravity * 0.2 * deltaTime;
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            if (particle.spinSpeed) {
                particle.mesh.rotation.z += particle.spinSpeed * deltaTime;
            }
            
            const lifeRatio = particle.life / particle.maxLife;
            particle.mesh.material.opacity = lifeRatio;
            
            const twinkle = 0.7 + Math.sin(particle.life * 20) * 0.3;
            particle.mesh.scale.setScalar(twinkle * (0.5 + lifeRatio));
        }
    }
    
    createAbsorptionFlash(position) {
        const geometry = new THREE.SphereGeometry(0.3, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 1,
            depthWrite: false
        });
        const flash = new THREE.Mesh(geometry, material);
        flash.position.copy(position);
        this.scene.add(flash);
        
        this.absorptionFlashes.push({
            mesh: flash,
            startTime: Date.now(),
            duration: 300
        });
    }
    
    updateAbsorptionFlashes(deltaTime) {
        for (let i = this.absorptionFlashes.length - 1; i >= 0; i--) {
            const flash = this.absorptionFlashes[i];
            const elapsed = Date.now() - flash.startTime;
            const progress = elapsed / flash.duration;
            
            if (progress >= 1) {
                this.scene.remove(flash.mesh);
                flash.mesh.geometry.dispose();
                flash.mesh.material.dispose();
                this.absorptionFlashes.splice(i, 1);
            } else {
                const scale = 1 + progress * 3;
                flash.mesh.scale.setScalar(scale);
                flash.mesh.material.opacity = 1 - progress;
            }
        }
    }
    
    clearAllParticles() {
        const allPools = [
            this.dustParticles, this.sparkParticles, this.glowParticles, this.trailParticles,
            this.confettiParticles, this.fireworkParticles, this.ringParticles, this.starParticles
        ];
        
        for (let pool of allPools) {
            if (!pool) continue;
            for (let p of pool) {
                p.active = false;
                p.mesh.visible = false;
            }
        }
        
        this.emissiveBlocks = [];
    }
    
    // Track emissive blocks for ambient glow effects
    trackEmissiveBlock(mesh, color) {
        this.emissiveBlocks.push({
            mesh: mesh,
            color: color,
            lastParticleTime: 0
        });
    }
    
    removeEmissiveTracking(meshes) {
        this.emissiveBlocks = this.emissiveBlocks.filter(eb => !meshes.includes(eb.mesh));
    }
    
    updateEmissiveGlow() {
        const now = Date.now();
        this.emissiveBlocks = this.emissiveBlocks.filter(eb => eb.mesh && eb.mesh.parent);
        
        for (let emissive of this.emissiveBlocks) {
            if (now - emissive.lastParticleTime > 100 + Math.random() * 100) {
                this.spawnGlowParticle(emissive.mesh.position, emissive.color);
                
                if (Math.random() < 0.3) {
                    const offsetPos = emissive.mesh.position.clone().add(
                        new THREE.Vector3(
                            (Math.random() - 0.5) * 2,
                            (Math.random() - 0.5) * 2,
                            (Math.random() - 0.5) * 2
                        )
                    );
                    this.spawnGlowParticle(offsetPos, emissive.color);
                }
                
                emissive.lastParticleTime = now;
            }
        }
    }
}
