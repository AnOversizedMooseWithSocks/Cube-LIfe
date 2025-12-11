// creature.js - Block-based creature with rotational joints
// Supports separate body structure and movement pattern generation

class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }
    
    random() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
    
    randomInt(min, max) {
        return Math.floor(this.random() * (max - min)) + min;
    }
    
    randomFloat(min, max) {
        return this.random() * (max - min) + min;
    }
}

class JointAction {
    constructor(duration, rotationSpeed, direction) {
        this.duration = duration;
        this.rotationSpeed = rotationSpeed;
        this.direction = direction; // 1=clockwise, -1=counter-clockwise, 0=static
    }
    
    clone() {
        return new JointAction(this.duration, this.rotationSpeed, this.direction);
    }
    
    // Convert to plain object for JSON serialization
    toJSON() {
        return {
            duration: this.duration,
            rotationSpeed: this.rotationSpeed,
            direction: this.direction
        };
    }
    
    // Create a JointAction from a plain object
    static fromJSON(data) {
        return new JointAction(data.duration, data.rotationSpeed, data.direction);
    }
    
    mutate(rng, confidenceBoost = false) {
        if (confidenceBoost && rng.random() < 0.4) {
            const speedIncrease = 1.1 + rng.randomFloat(0.1, 0.4);
            this.rotationSpeed = Math.min(0.5, this.rotationSpeed * speedIncrease);
            if (this.direction === 0) {
                this.direction = rng.random() < 0.5 ? 1 : -1;
            }
            return;
        }
        
        const choice = rng.randomInt(0, 4);
        if (choice === 0) {
            const change = rng.randomInt(-12, 8);
            this.duration = Math.max(8, Math.min(50, this.duration + change));
        } else if (choice === 1 || choice === 2) {
            const change = rng.randomFloat(-0.02, 0.08);
            this.rotationSpeed = Math.max(0.08, Math.min(0.5, this.rotationSpeed + change));
        } else {
            const dirRoll = rng.random();
            if (dirRoll < 0.4) {
                this.direction = 1;
            } else if (dirRoll < 0.8) {
                this.direction = -1;
            } else {
                this.direction = 0;
            }
        }
        
        if (this.direction !== 0 && this.rotationSpeed < 0.1) {
            this.rotationSpeed = 0.1 + rng.randomFloat(0, 0.1);
        }
    }
}

class Joint {
    constructor(blockIndexA, blockIndexB, axis, actions, faceA = null, faceB = null) {
        this.blockIndexA = blockIndexA;
        this.blockIndexB = blockIndexB;
        this.axis = axis; // 'x', 'y', or 'z'
        this.actions = actions || [];
        this.faceA = faceA; // Which face of block A is connected (0-5)
        this.faceB = faceB; // Which face of block B is connected (0-5)
        this.currentActionIndex = 0;
        this.actionTimer = 0;
        this.currentAngle = 0;
        this.feedbackMultiplier = 1.0;
        this.constraint = null;
    }
    
    update() {
        if (this.actions.length === 0) return;
        
        const action = this.actions[this.currentActionIndex];
        this.actionTimer++;
        
        const rotationDelta = action.rotationSpeed * action.direction * this.feedbackMultiplier;
        this.currentAngle += rotationDelta;
        
        if (this.actionTimer >= action.duration) {
            this.actionTimer = 0;
            this.currentActionIndex = (this.currentActionIndex + 1) % this.actions.length;
        }
        
        return rotationDelta;
    }
    
    handleFeedback(hasCollision) {
        if (hasCollision) {
            this.feedbackMultiplier *= 0.9;
            if (this.feedbackMultiplier < 0.1) {
                this.feedbackMultiplier = -0.5;
            }
        } else {
            this.feedbackMultiplier += (1.0 - this.feedbackMultiplier) * 0.1;
        }
    }
    
    clone() {
        const clonedActions = this.actions.map(a => a.clone());
        return new Joint(this.blockIndexA, this.blockIndexB, this.axis, clonedActions, this.faceA, this.faceB);
    }
    
    // Convert to plain object for JSON serialization
    toJSON() {
        return {
            blockIndexA: this.blockIndexA,
            blockIndexB: this.blockIndexB,
            axis: this.axis,
            actions: this.actions.map(a => a.toJSON()),
            faceA: this.faceA,
            faceB: this.faceB
        };
    }
    
    // Create a Joint from a plain object
    static fromJSON(data) {
        const actions = data.actions.map(a => JointAction.fromJSON(a));
        return new Joint(data.blockIndexA, data.blockIndexB, data.axis, actions, data.faceA, data.faceB);
    }
}

// Material types - each has different weight and visual appearance
// Weight: metal(1.8x), ceramic(1.4x), crystal(1.2x), plastic(1.0x), glass(0.9x), 
//         rubber(0.8x), wood(0.7x), emissive(0.6x)
const MATERIAL_TYPES = [
    'metal', 'plastic', 'ceramic', 'wood', 'glass', 'emissive', 'rubber', 'crystal'
];

class Block {
    constructor(size, color, materialType = null) {
        this.size = size;
        this.color = color;
        this.position = [0, 0, 0];
        this.mesh = null;
        this.body = null;
        this.materialType = materialType || 'plastic';
        // Faces: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
        this.usedFaces = [false, false, false, false, false, false];
    }
    
    getAvailableFaces() {
        const available = [];
        for (let i = 0; i < 6; i++) {
            if (!this.usedFaces[i]) {
                available.push(i);
            }
        }
        return available;
    }
    
    markFaceUsed(faceIndex) {
        this.usedFaces[faceIndex] = true;
    }
    
    clone() {
        const block = new Block([...this.size], this.color, this.materialType);
        block.position = [...this.position];
        block.usedFaces = [...this.usedFaces];
        return block;
    }
    
    // Convert to plain object for JSON serialization
    toJSON() {
        return {
            size: [...this.size],
            color: this.color,
            position: [...this.position],
            materialType: this.materialType,
            usedFaces: [...this.usedFaces]
        };
    }
    
    // Create a Block from a plain object
    static fromJSON(data) {
        const block = new Block([...data.size], data.color, data.materialType);
        block.position = [...data.position];
        block.usedFaces = [...data.usedFaces];
        return block;
    }
}

class Creature {
    constructor(seed, numBlocks = null) {
        this.seed = seed;
        this.structureSeed = null;
        this.movementSeed = null;
        this.configIndex = 0;
        this.variantIndex = 0;
        this.blocks = [];
        this.joints = [];
        this.fitness = 0;
        this.maxDistance = 0;
        this.maxHeight = 0;
        this.startPosition = [0, 0, 0];
        this.meshes = [];
        this.bodies = [];
        this.constraints = [];
        
        // Fitness tracking
        this.tilesLit = new Set();
        this.maxJumpHeight = 0;
        this.hasLandedAfterSpawn = false;
        this.groundedY = 0;
        
        if (seed) {
            this.generateFromSeed(seed, numBlocks);
        }
    }
    
    // Block intersection using sphere-based collision detection
    // Each block contains an inscribed sphere (radius = blockSize/2)
    blocksIntersect(block1, block2) {
        const dx = block1.position[0] - block2.position[0];
        const dy = block1.position[1] - block2.position[1];
        const dz = block1.position[2] - block2.position[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        const radius1 = block1.size[0] / 2;
        const radius2 = block2.size[0] / 2;
        const sumOfRadii = radius1 + radius2;
        
        return distance < sumOfRadii;
    }
    
    wouldIntersect(newBlock) {
        for (let existingBlock of this.blocks) {
            if (this.blocksIntersect(newBlock, existingBlock)) {
                return true;
            }
        }
        return false;
    }
    
    generateBodyFromSeed(seed, numBlocks = 3) {
        this.structureSeed = seed;
        const rng = new SeededRandom(seed);
        
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        const rootColor = this.randomColor(rng);
        const rootMaterial = this.randomMaterialType(rng);
        const rootBlock = new Block([...standardSize], rootColor, rootMaterial);
        this.blocks.push(rootBlock);
        
        for (let i = 1; i < numBlocks; i++) {
            const color = this.randomColor(rng);
            const materialType = this.randomMaterialType(rng);
            
            let blockPlaced = false;
            let globalAttempts = 0;
            const maxGlobalAttempts = 200;
            
            while (!blockPlaced && globalAttempts < maxGlobalAttempts) {
                const block = new Block([...standardSize], color, materialType);
                
                let parentIndex = -1;
                let availableFace = -1;
                let attempts = 0;
                const maxAttempts = 50;
                
                while (attempts < maxAttempts) {
                    const candidateIndex = rng.randomInt(0, this.blocks.length);
                    const candidate = this.blocks[candidateIndex];
                    const availableFaces = candidate.getAvailableFaces();
                    
                    if (availableFaces.length > 0) {
                        parentIndex = candidateIndex;
                        availableFace = availableFaces[rng.randomInt(0, availableFaces.length)];
                        break;
                    }
                    attempts++;
                }
                
                if (parentIndex === -1) {
                    console.log('No available faces for new block, stopping at', this.blocks.length, 'blocks');
                    return;
                }
                
                const parent = this.blocks[parentIndex];
                
                switch(availableFace) {
                    case 0: block.position = [parent.position[0] + BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                    case 1: block.position = [parent.position[0] - BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                    case 2: block.position = [parent.position[0], parent.position[1] + BLOCK_SIZE, parent.position[2]]; break;
                    case 3: block.position = [parent.position[0], parent.position[1] - BLOCK_SIZE, parent.position[2]]; break;
                    case 4: block.position = [parent.position[0], parent.position[1], parent.position[2] + BLOCK_SIZE]; break;
                    case 5: block.position = [parent.position[0], parent.position[1], parent.position[2] - BLOCK_SIZE]; break;
                }
                
                if (!this.wouldIntersect(block)) {
                    parent.markFaceUsed(availableFace);
                    const oppositeFace = availableFace % 2 === 0 ? availableFace + 1 : availableFace - 1;
                    block.markFaceUsed(oppositeFace);
                    
                    this.blocks.push(block);
                    
                    let axis;
                    if (availableFace === 0 || availableFace === 1) {
                        axis = 'x';
                    } else if (availableFace === 2 || availableFace === 3) {
                        axis = 'y';
                    } else {
                        axis = 'z';
                    }
                    
                    const joint = new Joint(parentIndex, this.blocks.length - 1, axis, [], availableFace, oppositeFace);
                    this.joints.push(joint);
                    
                    blockPlaced = true;
                } else {
                    globalAttempts++;
                }
            }
            
            if (!blockPlaced) {
                console.log('Could not place block without intersection, stopping at', this.blocks.length, 'blocks');
                return;
            }
        }
    }
    
    generateMovementsFromSeed(seed) {
        this.movementSeed = seed;
        const rng = new SeededRandom(seed);
        
        for (let joint of this.joints) {
            const numActions = rng.randomInt(2, 5);
            joint.actions = [];
            
            for (let j = 0; j < numActions; j++) {
                const duration = rng.randomInt(10, 45);
                const rotationSpeed = rng.randomFloat(0.12, 0.35);
                let direction;
                const dirRoll = rng.random();
                if (dirRoll < 0.425) {
                    direction = 1;
                } else if (dirRoll < 0.85) {
                    direction = -1;
                } else {
                    direction = 0;
                }
                joint.actions.push(new JointAction(duration, rotationSpeed, direction));
            }
        }
    }
    
    generateFromSeed(seed, numBlocks = null) {
        const rng = new SeededRandom(seed);
        
        if (numBlocks === null) {
            numBlocks = rng.randomInt(3, 13);
        }
        
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        const rootColor = this.randomColor(rng);
        const rootMaterial = this.randomMaterialType(rng);
        const rootBlock = new Block([...standardSize], rootColor, rootMaterial);
        this.blocks.push(rootBlock);
        
        for (let i = 1; i < numBlocks; i++) {
            const color = this.randomColor(rng);
            const materialType = this.randomMaterialType(rng);
            
            let blockPlaced = false;
            let globalAttempts = 0;
            const maxGlobalAttempts = 200;
            
            while (!blockPlaced && globalAttempts < maxGlobalAttempts) {
                const block = new Block([...standardSize], color, materialType);
                
                let parentIndex = -1;
                let availableFace = -1;
                let attempts = 0;
                const maxAttempts = 50;
                
                while (attempts < maxAttempts) {
                    const candidateIndex = rng.randomInt(0, this.blocks.length);
                    const candidate = this.blocks[candidateIndex];
                    const availableFaces = candidate.getAvailableFaces();
                    
                    if (availableFaces.length > 0) {
                        parentIndex = candidateIndex;
                        availableFace = availableFaces[rng.randomInt(0, availableFaces.length)];
                        break;
                    }
                    attempts++;
                }
                
                if (parentIndex === -1) {
                    console.log('No available faces for new block, stopping at', this.blocks.length, 'blocks');
                    return;
                }
                
                const parent = this.blocks[parentIndex];
                
                switch(availableFace) {
                    case 0: block.position = [parent.position[0] + BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                    case 1: block.position = [parent.position[0] - BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                    case 2: block.position = [parent.position[0], parent.position[1] + BLOCK_SIZE, parent.position[2]]; break;
                    case 3: block.position = [parent.position[0], parent.position[1] - BLOCK_SIZE, parent.position[2]]; break;
                    case 4: block.position = [parent.position[0], parent.position[1], parent.position[2] + BLOCK_SIZE]; break;
                    case 5: block.position = [parent.position[0], parent.position[1], parent.position[2] - BLOCK_SIZE]; break;
                }
                
                if (!this.wouldIntersect(block)) {
                    parent.markFaceUsed(availableFace);
                    const oppositeFace = availableFace % 2 === 0 ? availableFace + 1 : availableFace - 1;
                    block.markFaceUsed(oppositeFace);
                    
                    this.blocks.push(block);
                    
                    let axis;
                    if (availableFace === 0 || availableFace === 1) {
                        axis = 'x';
                    } else if (availableFace === 2 || availableFace === 3) {
                        axis = 'y';
                    } else {
                        axis = 'z';
                    }
                    
                    const numActions = rng.randomInt(2, 5);
                    const actions = [];
                    
                    for (let j = 0; j < numActions; j++) {
                        const duration = rng.randomInt(10, 45);
                        const rotationSpeed = rng.randomFloat(0.12, 0.35);
                        let direction;
                        const dirRoll = rng.random();
                        if (dirRoll < 0.425) {
                            direction = 1;
                        } else if (dirRoll < 0.85) {
                            direction = -1;
                        } else {
                            direction = 0;
                        }
                        actions.push(new JointAction(duration, rotationSpeed, direction));
                    }
                    
                    const joint = new Joint(parentIndex, this.blocks.length - 1, axis, actions, availableFace, oppositeFace);
                    this.joints.push(joint);
                    
                    blockPlaced = true;
                } else {
                    globalAttempts++;
                }
            }
            
            if (!blockPlaced) {
                console.log('Could not place block without intersection, stopping at', this.blocks.length, 'blocks');
                return;
            }
        }
    }
    
    getAvailableAttachmentPoints() {
        const points = [];
        
        for (let i = 0; i < this.blocks.length; i++) {
            const block = this.blocks[i];
            const availableFaces = block.getAvailableFaces();
            
            for (let face of availableFaces) {
                points.push({ parentIndex: i, face: face });
            }
        }
        
        return points;
    }
    
    addBlockAtFace(parentIndex, face, rng) {
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        if (parentIndex < 0 || parentIndex >= this.blocks.length) {
            return false;
        }
        
        const parent = this.blocks[parentIndex];
        const availableFaces = parent.getAvailableFaces();
        
        if (!availableFaces.includes(face)) {
            return false;
        }
        
        const color = this.randomColor(rng);
        const materialType = this.randomMaterialType(rng);
        const block = new Block([...standardSize], color, materialType);
        
        switch(face) {
            case 0: block.position = [parent.position[0] + BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
            case 1: block.position = [parent.position[0] - BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
            case 2: block.position = [parent.position[0], parent.position[1] + BLOCK_SIZE, parent.position[2]]; break;
            case 3: block.position = [parent.position[0], parent.position[1] - BLOCK_SIZE, parent.position[2]]; break;
            case 4: block.position = [parent.position[0], parent.position[1], parent.position[2] + BLOCK_SIZE]; break;
            case 5: block.position = [parent.position[0], parent.position[1], parent.position[2] - BLOCK_SIZE]; break;
        }
        
        if (this.wouldIntersect(block)) {
            return false;
        }
        
        parent.markFaceUsed(face);
        const oppositeFace = face % 2 === 0 ? face + 1 : face - 1;
        block.markFaceUsed(oppositeFace);
        
        this.blocks.push(block);
        
        let axis;
        if (face === 0 || face === 1) {
            axis = 'x';
        } else if (face === 2 || face === 3) {
            axis = 'y';
        } else {
            axis = 'z';
        }
        
        const numActions = rng.randomInt(2, 5);
        const actions = [];
        
        for (let j = 0; j < numActions; j++) {
            const duration = rng.randomInt(10, 45);
            const rotationSpeed = rng.randomFloat(0.12, 0.35);
            let direction;
            const dirRoll = rng.random();
            if (dirRoll < 0.425) {
                direction = 1;
            } else if (dirRoll < 0.85) {
                direction = -1;
            } else {
                direction = 0;
            }
            actions.push(new JointAction(duration, rotationSpeed, direction));
        }
        
        const joint = new Joint(parentIndex, this.blocks.length - 1, axis, actions, face, oppositeFace);
        this.joints.push(joint);
        
        return true;
    }
    
    randomColor(rng) {
        const r = rng.randomInt(100, 255);
        const g = rng.randomInt(100, 255);
        const b = rng.randomInt(100, 255);
        return (r << 16) | (g << 8) | b;
    }
    
    randomMaterialType(rng) {
        const roll = rng.random();
        if (roll < 0.25) return 'plastic';
        if (roll < 0.45) return 'metal';
        if (roll < 0.60) return 'ceramic';
        if (roll < 0.72) return 'rubber';
        if (roll < 0.82) return 'wood';
        if (roll < 0.90) return 'crystal';
        if (roll < 0.96) return 'glass';
        return 'emissive';
    }
    
    mutate() {
        const rng = new SeededRandom(Date.now() + Math.random() * 100000);
        const mutated = new Creature(null);
        
        mutated.blocks = this.blocks.map(b => b.clone());
        mutated.joints = this.joints.map(j => j.clone());
        mutated.seed = this.seed + '_m' + Math.floor(Math.random() * 10000);
        
        for (let joint of mutated.joints) {
            if (rng.random() < 0.7) {
                for (let action of joint.actions) {
                    if (rng.random() < 0.5) {
                        action.mutate(rng);
                    }
                }
                
                if (rng.random() < 0.2 && joint.actions.length > 1) {
                    joint.actions.splice(rng.randomInt(0, joint.actions.length), 1);
                } else if (rng.random() < 0.2 && joint.actions.length < 8) {
                    const duration = rng.randomInt(10, 45);
                    const rotationSpeed = rng.randomFloat(0.12, 0.35);
                    let direction;
                    const dirRoll = rng.random();
                    if (dirRoll < 0.425) {
                        direction = 1;
                    } else if (dirRoll < 0.85) {
                        direction = -1;
                    } else {
                        direction = 0;
                    }
                    joint.actions.push(new JointAction(duration, rotationSpeed, direction));
                }
            }
        }
        
        return mutated;
    }
    
    evolve() {
        const rng = new SeededRandom(Date.now() + Math.random() * 100000);
        const evolved = new Creature(null);
        
        evolved.blocks = this.blocks.map(b => b.clone());
        evolved.joints = this.joints.map(j => j.clone());
        evolved.seed = this.seed + '_e' + Math.floor(Math.random() * 10000);
        
        if (this.blocks.length >= 12) {
            return evolved;
        }
        
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        let blockPlaced = false;
        let globalAttempts = 0;
        const maxGlobalAttempts = 200;
        
        while (!blockPlaced && globalAttempts < maxGlobalAttempts) {
            const color = evolved.randomColor(rng);
            const materialType = evolved.randomMaterialType(rng);
            const block = new Block([...standardSize], color, materialType);
            
            let parentIndex = -1;
            let availableFace = -1;
            let attempts = 0;
            const maxAttempts = 50;
            
            while (attempts < maxAttempts) {
                const candidateIndex = rng.randomInt(0, evolved.blocks.length);
                const candidate = evolved.blocks[candidateIndex];
                const availableFaces = candidate.getAvailableFaces();
                
                if (availableFaces.length > 0) {
                    parentIndex = candidateIndex;
                    availableFace = availableFaces[rng.randomInt(0, availableFaces.length)];
                    break;
                }
                attempts++;
            }
            
            if (parentIndex === -1) {
                console.log('No available faces for evolution, creature stays the same');
                return evolved;
            }
            
            const parent = evolved.blocks[parentIndex];
            
            switch(availableFace) {
                case 0: block.position = [parent.position[0] + BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                case 1: block.position = [parent.position[0] - BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                case 2: block.position = [parent.position[0], parent.position[1] + BLOCK_SIZE, parent.position[2]]; break;
                case 3: block.position = [parent.position[0], parent.position[1] - BLOCK_SIZE, parent.position[2]]; break;
                case 4: block.position = [parent.position[0], parent.position[1], parent.position[2] + BLOCK_SIZE]; break;
                case 5: block.position = [parent.position[0], parent.position[1], parent.position[2] - BLOCK_SIZE]; break;
            }
            
            if (!evolved.wouldIntersect(block)) {
                parent.markFaceUsed(availableFace);
                const oppositeFace = availableFace % 2 === 0 ? availableFace + 1 : availableFace - 1;
                block.markFaceUsed(oppositeFace);
                
                evolved.blocks.push(block);
                
                let axis;
                if (availableFace === 0 || availableFace === 1) {
                    axis = 'x';
                } else if (availableFace === 2 || availableFace === 3) {
                    axis = 'y';
                } else {
                    axis = 'z';
                }
                
                const numActions = rng.randomInt(2, 5);
                const actions = [];
                
                for (let j = 0; j < numActions; j++) {
                    const duration = rng.randomInt(10, 45);
                    const rotationSpeed = rng.randomFloat(0.12, 0.35);
                    let direction;
                    const dirRoll = rng.random();
                    if (dirRoll < 0.425) {
                        direction = 1;
                    } else if (dirRoll < 0.85) {
                        direction = -1;
                    } else {
                        direction = 0;
                    }
                    actions.push(new JointAction(duration, rotationSpeed, direction));
                }
                
                const joint = new Joint(parentIndex, evolved.blocks.length - 1, axis, actions, availableFace, oppositeFace);
                evolved.joints.push(joint);
                
                blockPlaced = true;
            } else {
                globalAttempts++;
            }
        }
        
        if (!blockPlaced) {
            console.log('Could not evolve without causing intersection, keeping same structure');
        }
        
        return evolved;
    }
    
    // Calculate fitness based on mode: distance, efficiency, jump, area, outcast, spartan
    calculateFitness(mode = 'distance') {
        const tilesCount = this.tilesLit ? this.tilesLit.size : 0;
        
        switch(mode) {
            case 'distance':
                this.fitness = this.maxDistance * 2.0 + this.maxHeight * 0.5;
                break;
                
            case 'efficiency':
                if (tilesCount > 0) {
                    this.fitness = (this.maxDistance / tilesCount) * 100 + this.maxHeight * 0.2;
                } else {
                    this.fitness = 0;
                }
                break;
                
            case 'jump':
                this.fitness = this.maxJumpHeight * 10.0 + this.maxDistance * 0.1;
                break;
                
            case 'area':
                this.fitness = tilesCount * 1.0 + this.maxDistance * 0.05;
                break;
                
            case 'outcast':
                // Real outcast calculation happens in EvolutionManager
                // Fallback to composite score for UI display
                this.fitness = this.maxDistance + this.maxHeight * 2 + tilesCount * 0.5 + (this.maxJumpHeight || 0) * 5;
                break;
                
            case 'spartan':
                // Spartan mode: balanced combination of ALL metrics
                // Well-rounded creatures that perform decently in all areas win
                this.fitness = this.maxDistance * 1.0 + this.maxHeight * 2.0 + tilesCount * 0.2 + (this.maxJumpHeight || 0) * 3.0;
                break;
                
            default:
                this.fitness = this.maxDistance * 2.0 + this.maxHeight * 0.5;
        }
        
        return this.fitness;
    }
    
    getTileCount() {
        return this.tilesLit ? this.tilesLit.size : 0;
    }
    
    resetFitnessTracking() {
        this.tilesLit = new Set();
        this.maxJumpHeight = 0;
        this.hasLandedAfterSpawn = false;
        this.groundedY = 0;
        this.maxDistance = 0;
        this.maxHeight = 0;
    }
    
    getMovementSummary() {
        const summary = [];
        for (let i = 0; i < this.joints.length; i++) {
            const joint = this.joints[i];
            const actionSummary = joint.actions.map(a => {
                const dir = a.direction === 1 ? 'CW' : (a.direction === -1 ? 'CCW' : 'Static');
                return `${dir}@${a.rotationSpeed.toFixed(2)}(${a.duration}steps)`;
            }).join(' -> ');
            summary.push(`Joint ${i} (${joint.axis}-axis): ${actionSummary}`);
        }
        return summary;
    }
    
    clone() {
        const cloned = new Creature(null);
        cloned.blocks = this.blocks.map(b => b.clone());
        cloned.joints = this.joints.map(j => j.clone());
        cloned.seed = this.seed;
        cloned.structureSeed = this.structureSeed;
        cloned.movementSeed = this.movementSeed;
        cloned.configIndex = this.configIndex;
        cloned.variantIndex = this.variantIndex;
        cloned.fitness = this.fitness;
        cloned.maxDistance = this.maxDistance;
        cloned.maxHeight = this.maxHeight;
        cloned.name = this.name;
        cloned.parentName = this.parentName;
        cloned.isDefendingChampion = this.isDefendingChampion;
        cloned.tilesLit = new Set(this.tilesLit);
        cloned.maxJumpHeight = this.maxJumpHeight;
        cloned.hasLandedAfterSpawn = this.hasLandedAfterSpawn;
        cloned.groundedY = this.groundedY;
        
        return cloned;
    }
    
    /**
     * Convert creature to a plain object for JSON serialization
     * This saves all the data needed to fully reconstruct the creature
     */
    toJSON() {
        return {
            seed: this.seed,
            structureSeed: this.structureSeed,
            movementSeed: this.movementSeed,
            configIndex: this.configIndex,
            variantIndex: this.variantIndex,
            name: this.name,
            parentName: this.parentName,
            isDefendingChampion: this.isDefendingChampion,
            // Fitness metrics
            fitness: this.fitness,
            maxDistance: this.maxDistance,
            maxHeight: this.maxHeight,
            maxJumpHeight: this.maxJumpHeight,
            hasLandedAfterSpawn: this.hasLandedAfterSpawn,
            groundedY: this.groundedY,
            tilesLit: Array.from(this.tilesLit || []),  // Convert Set to Array
            // Structure data - blocks and joints
            blocks: this.blocks.map(b => b.toJSON()),
            joints: this.joints.map(j => j.toJSON())
        };
    }
    
    /**
     * Create a Creature from a plain JSON object
     * Reconstructs all blocks, joints, and fitness tracking
     */
    static fromJSON(data) {
        const creature = new Creature(null);
        
        // Basic identification
        creature.seed = data.seed;
        creature.structureSeed = data.structureSeed;
        creature.movementSeed = data.movementSeed;
        creature.configIndex = data.configIndex;
        creature.variantIndex = data.variantIndex;
        creature.name = data.name;
        creature.parentName = data.parentName;
        creature.isDefendingChampion = data.isDefendingChampion;
        
        // Fitness metrics
        creature.fitness = data.fitness || 0;
        creature.maxDistance = data.maxDistance || 0;
        creature.maxHeight = data.maxHeight || 0;
        creature.maxJumpHeight = data.maxJumpHeight || 0;
        creature.hasLandedAfterSpawn = data.hasLandedAfterSpawn || false;
        creature.groundedY = data.groundedY || 0;
        creature.tilesLit = new Set(data.tilesLit || []);  // Convert Array back to Set
        
        // Reconstruct blocks
        creature.blocks = data.blocks.map(b => Block.fromJSON(b));
        
        // Reconstruct joints
        creature.joints = data.joints.map(j => Joint.fromJSON(j));
        
        return creature;
    }
}
