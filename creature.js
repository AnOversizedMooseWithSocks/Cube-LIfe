// creature.js - Block-based creature with rotational joints
// Uses DNA-based system for deterministic creature generation and serialization
//
// DNA Format: [creatureSeed hex]-[block0]-[block1]-[block2]...
// Block Format: [blockID]B[parentID]S[side]V[variation]C[color]M[material]X[special]
//
// All values are hexadecimal (00-FF range = 0-255):
//   creatureSeed: 8 hex digits (00000000-FFFFFFFF)
//   blockID:      2 hex digits (00-FF) - which block this is
//   parentID:     2 hex digits (00-FF) - which block it attaches to
//   side:         1 digit      (0-5)   - which face of parent
//   variation:    2 hex digits (00-FF) - movement variation seed
//   color:        2 hex digits (00-FF) - color seed
//   material:     2 hex digits (00-FF) - material type seed
//   special:      2 hex digits (00-FF) - sensor/special block type
//
// Example DNA: A85F3C01-00B00S0V00C12M34X00-01B00S1V2AC34M56X00
//
// Special block types:
//   00 = Normal block
//   01 = Gravity sensor
//   02 = Light sensor
//   03 = Velocity sensor
//   04 = Ground sensor
//   05 = Rhythm/oscillator
//   06 = Tilt sensor
//   07-FF = Reserved for future types

// ============================================================================
// DNA HELPER FUNCTIONS
// ============================================================================

/**
 * Map of special block type names to their numeric codes
 */
const SPECIAL_TYPE_CODES = {
    null: 0,
    'gravity': 1,
    'light': 2,
    'velocity': 3,
    'ground': 4,
    'rhythm': 5,
    'tilt': 6
};

/**
 * Reverse map: numeric codes to type names
 */
const SPECIAL_TYPE_NAMES = {
    0: null,
    1: 'gravity',
    2: 'light',
    3: 'velocity',
    4: 'ground',
    5: 'rhythm',
    6: 'tilt'
};

/**
 * Convert a number to uppercase hex with specified length
 * @param {number} num - The number to convert (0-255 for 2 digits, larger for more)
 * @param {number} length - Desired string length
 * @returns {string} Hex string, uppercase, zero-padded
 */
function toHex(num, length) {
    return Math.floor(num).toString(16).toUpperCase().padStart(length, '0');
}

/**
 * Parse a hex string to number
 * @param {string} hexStr - Hex string to parse
 * @returns {number} Numeric value
 */
function fromHex(hexStr) {
    return parseInt(hexStr, 16);
}

/**
 * Generate a numeric seed from a DNA string
 * XORs all hex values together for good distribution
 * 
 * @param {string} dnaString - The DNA string to hash
 * @returns {number} A numeric seed value
 */
function dnaToSeed(dnaString) {
    // Extract all hex characters (0-9, A-F, a-f)
    const hexChars = dnaString.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    
    // XOR chunks of 8 hex digits (32 bits) together
    let seed = 0;
    for (let i = 0; i < hexChars.length; i += 8) {
        const chunk = parseInt(hexChars.slice(i, i + 8), 16) || 0;
        seed ^= chunk;
    }
    
    // Ensure positive value
    return seed >>> 0;
}

/**
 * Create a block descriptor string in hex format
 * @param {number} blockId - Block index (0-255)
 * @param {number} parentId - Parent block index (0-255)
 * @param {number} side - Face of parent (0-5)
 * @param {number} variation - Movement variation (0-255)
 * @param {number} colorSeed - Color seed (0-255)
 * @param {number} materialSeed - Material seed (0-255)
 * @param {number} specialCode - Special block type code (0-255)
 * @returns {string} Block descriptor like "01B00S1V2AC34M56X00"
 */
function createBlockDescriptor(blockId, parentId, side, variation, colorSeed, materialSeed, specialCode) {
    return `${toHex(blockId, 2)}B${toHex(parentId, 2)}S${side}V${toHex(variation, 2)}C${toHex(colorSeed, 2)}M${toHex(materialSeed, 2)}X${toHex(specialCode, 2)}`;
}

/**
 * Parse a block descriptor string into its components
 * @param {string} descriptor - Block descriptor string (hex format)
 * @returns {Object} Parsed components {blockId, parentId, side, variation, colorSeed, materialSeed, specialCode}
 */
function parseBlockDescriptor(descriptor) {
    // Format: 01B00S1V2AC34M56X00 (hex values)
    const match = descriptor.match(/([0-9A-Fa-f]{2})B([0-9A-Fa-f]{2})S(\d)V([0-9A-Fa-f]{2})C([0-9A-Fa-f]{2})M([0-9A-Fa-f]{2})X([0-9A-Fa-f]{2})/);
    if (!match) {
        console.error('Invalid block descriptor:', descriptor);
        return null;
    }
    
    return {
        blockId: fromHex(match[1]),
        parentId: fromHex(match[2]),
        side: parseInt(match[3]),
        variation: fromHex(match[4]),
        colorSeed: fromHex(match[5]),
        materialSeed: fromHex(match[6]),
        specialCode: fromHex(match[7])
    };
}

/**
 * Parse a full DNA string into creature seed and block descriptors
 * @param {string} dna - Full DNA string
 * @returns {Object} {creatureSeed, blockDescriptors: [...parsed blocks]}
 */
function parseDNA(dna) {
    const parts = dna.split('-');
    const creatureSeed = fromHex(parts[0]);
    const blockDescriptors = [];
    
    for (let i = 1; i < parts.length; i++) {
        const parsed = parseBlockDescriptor(parts[i]);
        if (parsed) {
            blockDescriptors.push(parsed);
        }
    }
    
    return { creatureSeed, blockDescriptors };
}

/**
 * Get the DNA substring for generating a specific block's movement
 * This includes all blocks up to and including the target block
 * 
 * @param {string} fullDNA - The complete creature DNA
 * @param {number} blockIndex - Which block's movement seed to generate
 * @returns {string} DNA substring for this block's seed
 */
function getDNAForBlock(fullDNA, blockIndex) {
    const parts = fullDNA.split('-');
    // Include creature seed + all blocks up to and including blockIndex
    // blockIndex 0 = parts[0] (seed) + parts[1] (block 0)
    // blockIndex 1 = parts[0] + parts[1] + parts[2]
    return parts.slice(0, blockIndex + 2).join('-');
}


// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

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


// ============================================================================
// JOINT ACTION CLASS
// ============================================================================

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
}


// ============================================================================
// JOINT CLASS
// ============================================================================

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
        // Influence response weights: {channelName: weight} where weight is -1 to +1
        // Determines how much this joint's movement is affected by each influence channel
        this.influenceResponses = {};
    }
    
    /**
     * Update joint state and calculate rotation delta
     * @param {Object} influences - Current influence values {channelName: value}
     * @returns {number} Rotation delta for this frame
     */
    update(influences = null) {
        if (this.actions.length === 0) return 0;
        
        const action = this.actions[this.currentActionIndex];
        this.actionTimer++;
        
        // Calculate base rotation
        let rotationDelta = action.rotationSpeed * action.direction * this.feedbackMultiplier;
        
        // Apply influence modulation if influences provided and joint has responses
        if (influences && Object.keys(this.influenceResponses).length > 0) {
            rotationDelta = applyInfluenceModulation(rotationDelta, influences, this.influenceResponses);
        }
        
        this.currentAngle += rotationDelta;
        
        // Advance to next action when timer expires
        if (this.actionTimer >= action.duration) {
            this.actionTimer = 0;
            this.currentActionIndex = (this.currentActionIndex + 1) % this.actions.length;
        }
        
        return rotationDelta;
    }
    
    /**
     * Handle collision feedback - reduce movement when stuck
     * @param {boolean} hasCollision - Whether this joint's blocks are colliding
     */
    handleFeedback(hasCollision) {
        if (hasCollision) {
            this.feedbackMultiplier *= 0.9;
            if (this.feedbackMultiplier < 0.1) {
                this.feedbackMultiplier = -0.5; // Reverse direction if stuck
            }
        } else {
            // Gradually recover toward normal
            this.feedbackMultiplier += (1.0 - this.feedbackMultiplier) * 0.1;
        }
    }
    
    clone() {
        const clonedActions = this.actions.map(a => a.clone());
        const joint = new Joint(this.blockIndexA, this.blockIndexB, this.axis, clonedActions, this.faceA, this.faceB);
        // Deep copy influence responses
        joint.influenceResponses = { ...this.influenceResponses };
        return joint;
    }
    
    // Convert to plain object for JSON serialization
    toJSON() {
        return {
            blockIndexA: this.blockIndexA,
            blockIndexB: this.blockIndexB,
            axis: this.axis,
            actions: this.actions.map(a => a.toJSON()),
            faceA: this.faceA,
            faceB: this.faceB,
            influenceResponses: { ...this.influenceResponses }
        };
    }
    
    // Create a Joint from a plain object
    static fromJSON(data) {
        const actions = data.actions.map(a => JointAction.fromJSON(a));
        const joint = new Joint(data.blockIndexA, data.blockIndexB, data.axis, actions, data.faceA, data.faceB);
        joint.influenceResponses = { ...data.influenceResponses } || {};
        return joint;
    }
}


// ============================================================================
// BLOCK CLASS
// ============================================================================

// Available material types
const MATERIAL_TYPES = [
    'metal', 'plastic', 'ceramic', 'wood', 'glass', 'emissive', 'rubber', 'crystal'
];

class Block {
    constructor(size, color, materialType = null, influenceType = null) {
        this.size = size;
        this.color = color;
        this.position = [0, 0, 0];
        this.mesh = null;
        this.body = null;
        this.materialType = materialType || 'plastic';
        // Faces: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
        this.usedFaces = [false, false, false, false, false, false];
        // Influence type: null for normal blocks, or a channel name like 'gravity', 'light'
        this.influenceType = influenceType;
        
        // DNA descriptor info (set when block is created/parsed)
        this.dnaDescriptor = null;  // The raw descriptor string
        this.variation = 0;         // Movement variation (0-255)
        this.colorSeed = 0;         // Color seed used to generate this block's color
        this.materialSeed = 0;      // Material seed used to select material type
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
        const block = new Block([...this.size], this.color, this.materialType, this.influenceType);
        block.position = [...this.position];
        block.usedFaces = [...this.usedFaces];
        block.dnaDescriptor = this.dnaDescriptor;
        block.variation = this.variation;
        block.colorSeed = this.colorSeed;
        block.materialSeed = this.materialSeed;
        return block;
    }
    
    // Convert to plain object for JSON serialization
    toJSON() {
        return {
            size: [...this.size],
            color: this.color,
            position: [...this.position],
            materialType: this.materialType,
            influenceType: this.influenceType,
            usedFaces: [...this.usedFaces],
            dnaDescriptor: this.dnaDescriptor,
            variation: this.variation,
            colorSeed: this.colorSeed,
            materialSeed: this.materialSeed
        };
    }
    
    // Create a Block from a plain object
    static fromJSON(data) {
        const block = new Block([...data.size], data.color, data.materialType, data.influenceType || null);
        block.position = [...data.position];
        block.usedFaces = [...data.usedFaces];
        block.dnaDescriptor = data.dnaDescriptor || null;
        block.variation = data.variation || 0;
        block.colorSeed = data.colorSeed || 0;
        block.materialSeed = data.materialSeed || 0;
        return block;
    }
    
    /**
     * Generate color from a seed value (0-255)
     * @param {number} seed - Color seed
     * @returns {number} RGB color as integer
     */
    static colorFromSeed(seed) {
        const rng = new SeededRandom(seed);
        const r = rng.randomInt(100, 255);
        const g = rng.randomInt(100, 255);
        const b = rng.randomInt(100, 255);
        return (r << 16) | (g << 8) | b;
    }
    
    /**
     * Generate material type from a seed value (0-255)
     * @param {number} seed - Material seed
     * @returns {string} Material type name
     */
    static materialFromSeed(seed) {
        const rng = new SeededRandom(seed);
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
}


// ============================================================================
// CREATURE CLASS
// ============================================================================

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
        
        // DNA system - the authoritative representation of this creature
        this.dna = null;              // Full DNA string
        this.creatureSeed = null;     // Base seed for this creature lineage
        
        // Fitness tracking - tilesLit is an array to preserve order of visitation
        this.tilesLit = [];
        this.maxJumpHeight = 0;
        this.hasLandedAfterSpawn = false;
        this.groundedY = 0;
        
        // Influence system - for special blocks that affect movement
        this.influences = {};           // Current channel values {channelName: value}
        this.influenceProviders = [];   // Blocks that provide influences
        
        // Special block tracking - records when sensor blocks are added
        this.lastAddedSensor = null;
        
        // If seed and numBlocks provided, generate a random creature
        if (seed !== null && numBlocks !== null) {
            this.generateFromSeed(seed, numBlocks);
        }
    }
    
    /**
     * Build the full DNA string from the current blocks
     * @returns {string} Complete DNA string
     */
    buildDNA() {
        if (!this.creatureSeed) {
            this.creatureSeed = Math.floor(Math.random() * 0xFFFFFFFF);
        }
        
        // Output creature seed as 8-digit hex
        let dna = toHex(this.creatureSeed, 8);
        
        for (let i = 0; i < this.blocks.length; i++) {
            const block = this.blocks[i];
            if (block.dnaDescriptor) {
                // Block already has DNA descriptor
                dna += '-' + block.dnaDescriptor;
            } else {
                // Legacy block without DNA - generate a descriptor based on current state
                // For block 0, use default values
                // For other blocks, we need to find the parent and face from joints
                let parentId = 0;
                let side = 0;
                
                if (i > 0) {
                    // Find the joint that connects this block to its parent
                    const joint = this.joints.find(j => j.blockIndexB === i);
                    if (joint) {
                        parentId = joint.blockIndexA;
                        side = joint.faceA;
                    }
                }
                
                // Use stored values if available, otherwise defaults (clamped to 0-255)
                const variation = Math.min(255, block.variation || 0);
                const colorSeed = Math.min(255, block.colorSeed || (i * 37) % 256);  // Deterministic fallback
                const materialSeed = Math.min(255, block.materialSeed || (i * 73) % 256);
                const specialCode = SPECIAL_TYPE_CODES[block.influenceType] || 0;
                
                // Create and store the descriptor
                block.dnaDescriptor = createBlockDescriptor(i, parentId, side, variation, colorSeed, materialSeed, specialCode);
                block.variation = variation;
                block.colorSeed = colorSeed;
                block.materialSeed = materialSeed;
                
                dna += '-' + block.dnaDescriptor;
            }
        }
        
        this.dna = dna;
        return dna;
    }
    
    /**
     * Generate movement actions for a joint based on DNA
     * @param {number} blockIndex - The block index (joint connects parent to this block)
     * @returns {JointAction[]} Array of actions for this joint
     */
    generateActionsFromDNA(blockIndex) {
        if (!this.dna) {
            // Fallback: use creatureSeed + blockIndex if available, otherwise use a fixed seed
            // This is more deterministic than Date.now() for legacy creatures
            const fallbackSeed = (this.creatureSeed || 12345) + blockIndex * 1000;
            console.warn(`[DNA] No DNA found for block ${blockIndex}, using fallback seed ${fallbackSeed}`);
            return this.generateRandomActions(new SeededRandom(fallbackSeed));
        }
        
        // Get DNA substring up to and including this block
        const dnaForBlock = getDNAForBlock(this.dna, blockIndex);
        const seed = dnaToSeed(dnaForBlock);
        const rng = new SeededRandom(seed);
        
        return this.generateRandomActions(rng);
    }
    
    /**
     * Generate random actions using provided RNG
     * @param {SeededRandom} rng - Random number generator
     * @returns {JointAction[]} Array of actions
     */
    generateRandomActions(rng) {
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
        
        return actions;
    }
    
    /**
     * Generate influence responses for a joint based on DNA
     * This determines how the joint reacts to sensor inputs
     * 
     * @param {number} blockIndex - The block index for this joint
     * @param {string[]} availableChannels - Sensor channels available on this creature
     * @returns {Object} influenceResponses object {channelName: weight}
     */
    generateInfluenceResponsesFromDNA(blockIndex, availableChannels) {
        if (!this.dna || availableChannels.length === 0) {
            return {};
        }
        
        // Get DNA for this block and create a seed
        const dnaForBlock = getDNAForBlock(this.dna, blockIndex);
        // Use a different seed offset for influence responses vs actions
        const seed = dnaToSeed(dnaForBlock + 'influence');
        const rng = new SeededRandom(seed);
        
        const responses = {};
        
        // For each available channel, deterministically decide if this joint responds
        for (const channel of availableChannels) {
            // 40% chance to respond to any given channel
            if (rng.random() < 0.4) {
                // Generate weight from -1 to +1, biased toward stronger responses
                const weight = rng.randomFloat(-1, 1);
                // Only include if weight is significant (> 0.1 magnitude)
                if (Math.abs(weight) > 0.1) {
                    responses[channel] = weight;
                }
            }
        }
        
        return responses;
    }
    
    /**
     * Get list of influence channels available on this creature
     * @returns {string[]} Array of channel names
     */
    getAvailableInfluenceChannels() {
        const channels = [];
        for (const block of this.blocks) {
            if (block.influenceType && !channels.includes(block.influenceType)) {
                channels.push(block.influenceType);
            }
        }
        return channels;
    }
    
    /**
     * Regenerate all joint movements and influence responses from DNA
     * Call this after loading or when DNA changes
     */
    regenerateMovementsFromDNA() {
        if (!this.dna) {
            return;
        }
        
        // Get available influence channels for this creature
        const availableChannels = this.getAvailableInfluenceChannels();
        
        // Joint index corresponds to block index - 1 (no joint for block 0)
        for (let i = 0; i < this.joints.length; i++) {
            const blockIndex = i + 1; // Joint 0 connects to block 1, etc.
            
            // Generate actions from DNA
            this.joints[i].actions = this.generateActionsFromDNA(blockIndex);
            
            // Generate influence responses from DNA
            this.joints[i].influenceResponses = this.generateInfluenceResponsesFromDNA(blockIndex, availableChannels);
            
            // Reset joint state
            this.joints[i].currentActionIndex = 0;
            this.joints[i].actionTimer = 0;
            this.joints[i].currentAngle = 0;
            this.joints[i].feedbackMultiplier = 1.0;
        }
    }
    
    /**
     * Create a block descriptor and add it to a block
     * @param {Block} block - The block to update
     * @param {number} blockId - Block index
     * @param {number} parentId - Parent block index
     * @param {number} side - Face of parent
     * @param {number} variation - Movement variation (0-255)
     * @param {number} colorSeed - Color seed (0-255)
     * @param {number} materialSeed - Material seed (0-255)
     * @param {string|null} influenceType - Special block type or null
     */
    setBlockDNA(block, blockId, parentId, side, variation, colorSeed, materialSeed, influenceType) {
        const specialCode = SPECIAL_TYPE_CODES[influenceType] || 0;
        block.dnaDescriptor = createBlockDescriptor(blockId, parentId, side, variation, colorSeed, materialSeed, specialCode);
        block.variation = variation;
        block.colorSeed = colorSeed;
        block.materialSeed = materialSeed;
    }
    
    /**
     * Generate creature from a seed (initial generation)
     * @param {number} seed - Random seed
     * @param {number} numBlocks - Number of blocks to generate
     */
    generateFromSeed(seed, numBlocks) {
        this.generateBodyFromSeed(seed, numBlocks);
    }
    
    /**
     * Generate creature body structure from seed
     * This is the main method called by evolution.js for Gen 1 creatures
     */
    generateBodyFromSeed(seed, numBlocks = 3) {
        this.structureSeed = seed;
        this.creatureSeed = seed;
        const rng = new SeededRandom(seed);
        
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        // Generate first block (block 0)
        const colorSeed0 = rng.randomInt(0, 256);
        const materialSeed0 = rng.randomInt(0, 256);
        const color0 = Block.colorFromSeed(colorSeed0);
        const material0 = Block.materialFromSeed(materialSeed0);
        
        const firstBlock = new Block(standardSize, color0, material0);
        firstBlock.position = [0, BLOCK_SIZE / 2, 0];
        this.setBlockDNA(firstBlock, 0, 0, 0, 0, colorSeed0, materialSeed0, null);
        this.blocks.push(firstBlock);
        
        for (let i = 1; i < numBlocks; i++) {
            let blockPlaced = false;
            let globalAttempts = 0;
            const maxGlobalAttempts = 100;
            
            while (!blockPlaced && globalAttempts < maxGlobalAttempts) {
                const colorSeed = rng.randomInt(0, 256);
                const materialSeed = rng.randomInt(0, 256);
                const variation = rng.randomInt(0, 256);
                const newColor = Block.colorFromSeed(colorSeed);
                const newMaterialType = Block.materialFromSeed(materialSeed);
                
                // Determine influence type using the global sensor configuration
                let influenceType = null;
                if (typeof determineBlockInfluenceType === 'function') {
                    influenceType = determineBlockInfluenceType(this, rng);
                }
                
                const block = new Block([...standardSize], newColor, newMaterialType, influenceType);
                
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
                    this.buildDNA();
                    this.regenerateMovementsFromDNA();
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
                    
                    this.setBlockDNA(block, i, parentIndex, availableFace, variation, colorSeed, materialSeed, influenceType);
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
                break;
            }
        }
        
        // Build DNA and generate movements
        this.buildDNA();
        this.regenerateMovementsFromDNA();
    }
    
    /**
     * Generate movements from seed by updating DNA variation values
     * This ensures movements are deterministic from DNA
     * @param {number} seed - Movement seed
     */
    generateMovementsFromSeed(seed) {
        this.movementSeed = seed;
        const rng = new SeededRandom(seed);
        
        // Update each block's variation value based on this seed
        // This makes the movement seed influence the DNA, not bypass it
        for (let i = 1; i < this.blocks.length; i++) {
            const block = this.blocks[i];
            
            // Generate a variation value from the movement seed
            const variation = rng.randomInt(0, 256);
            block.variation = variation;
            
            // Rebuild this block's DNA descriptor with the new variation
            if (block.dnaDescriptor) {
                const parsed = parseBlockDescriptor(block.dnaDescriptor);
                if (parsed) {
                    block.dnaDescriptor = createBlockDescriptor(
                        parsed.blockId,
                        parsed.parentId,
                        parsed.side,
                        variation,
                        parsed.colorSeed,
                        parsed.materialSeed,
                        parsed.specialCode
                    );
                }
            }
        }
        
        // Rebuild the full DNA string
        this.buildDNA();
        
        // Now regenerate all movements from the updated DNA
        this.regenerateMovementsFromDNA();
    }
    
    /**
     * Get all available attachment points on this creature
     * @returns {Array} Array of {parentIndex, face} objects
     */
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
    
    /**
     * Add a block at a specific face with DNA support
     * @param {number} parentIndex - Index of parent block
     * @param {number} face - Face index (0-5)
     * @param {SeededRandom} rng - Random number generator
     * @param {number} influenceProbability - Chance to add a sensor block
     * @returns {boolean} True if block was added
     */
    addBlockAtFace(parentIndex, face, rng, influenceProbability = 0.05) {
        // Determine influence type using the global sensor configuration
        let influenceType = null;
        if (typeof determineBlockInfluenceType === 'function') {
            influenceType = determineBlockInfluenceType(this, rng);
        }
        
        return this.addBlockAtFaceWithType(parentIndex, face, rng, influenceType);
    }
    
    /**
     * Add a block at a specific face with a specific influence type
     * @param {number} parentIndex - Index of parent block
     * @param {number} face - Face index (0-5)
     * @param {SeededRandom} rng - Random number generator
     * @param {string|null} influenceType - Sensor type or null
     * @returns {boolean} True if block was added
     */
    addBlockAtFaceWithType(parentIndex, face, rng, influenceType = null) {
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
        
        // Generate DNA components
        const colorSeed = rng.randomInt(0, 256);
        const materialSeed = rng.randomInt(0, 256);
        const variation = rng.randomInt(0, 256);
        const color = Block.colorFromSeed(colorSeed);
        const materialType = Block.materialFromSeed(materialSeed);
        
        const block = new Block([...standardSize], color, materialType, influenceType);
        
        // Position block
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
        
        // Set DNA info on block
        const newBlockIndex = this.blocks.length;
        this.setBlockDNA(block, newBlockIndex, parentIndex, face, variation, colorSeed, materialSeed, influenceType);
        this.blocks.push(block);
        
        // Track sensor additions
        if (influenceType) {
            this.lastAddedSensor = influenceType;
        }
        
        // Determine joint axis
        let axis;
        if (face === 0 || face === 1) {
            axis = 'x';
        } else if (face === 2 || face === 3) {
            axis = 'y';
        } else {
            axis = 'z';
        }
        
        // Create joint - actions will be generated from DNA
        const joint = new Joint(parentIndex, newBlockIndex, axis, [], face, oppositeFace);
        this.joints.push(joint);
        
        // Rebuild DNA and regenerate ALL movements
        // This is important because adding a sensor block means all joints
        // need to recalculate their influence responses
        this.buildDNA();
        this.regenerateMovementsFromDNA();
        
        return true;
    }
    
    /**
     * Mutate this creature's movement patterns
     * Only modifies DNA variation values, then regenerates everything from DNA
     * This ensures full determinism - the same DNA always produces the same creature
     * 
     * @returns {Creature} A mutated copy of this creature
     */
    mutate() {
        const rng = new SeededRandom(Date.now() + Math.random() * 100000);
        const mutated = new Creature(null);
        
        // Clone structure (blocks and joints)
        mutated.blocks = this.blocks.map(b => b.clone());
        mutated.joints = this.joints.map(j => j.clone());
        mutated.creatureSeed = this.creatureSeed;
        mutated.seed = this.seed + '_m' + Math.floor(Math.random() * 10000);
        
        // Mutate variation values in DNA
        // Each block (except block 0) has a 50% chance of mutation
        for (let i = 1; i < mutated.blocks.length; i++) {
            const block = mutated.blocks[i];
            
            if (rng.random() < 0.5) {
                // Change variation (0-255) - this changes the block's movement pattern
                const variationDelta = rng.randomInt(-25, 26);
                block.variation = Math.max(0, Math.min(255, block.variation + variationDelta));
                
                // Rebuild the block's DNA descriptor with new variation
                const parsed = parseBlockDescriptor(block.dnaDescriptor);
                if (parsed) {
                    block.dnaDescriptor = createBlockDescriptor(
                        parsed.blockId,
                        parsed.parentId,
                        parsed.side,
                        block.variation,
                        parsed.colorSeed,
                        parsed.materialSeed,
                        parsed.specialCode
                    );
                }
            }
        }
        
        // Rebuild DNA string from blocks
        mutated.buildDNA();
        
        // Regenerate ALL movements and influence responses from DNA
        // This ensures everything is deterministic based on DNA alone
        mutated.regenerateMovementsFromDNA();
        
        return mutated;
    }
    
    /**
     * Evolve this creature by adding a new block
     * @returns {Creature} An evolved copy with one additional block
     */
    evolve() {
        const rng = new SeededRandom(Date.now() + Math.random() * 100000);
        const evolved = new Creature(null);
        
        // Clone current structure
        evolved.blocks = this.blocks.map(b => b.clone());
        evolved.joints = this.joints.map(j => j.clone());
        evolved.creatureSeed = this.creatureSeed;
        evolved.seed = this.seed + '_e' + Math.floor(Math.random() * 10000);
        
        if (this.blocks.length >= 12) {
            evolved.buildDNA();
            return evolved;
        }
        
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        let blockPlaced = false;
        let globalAttempts = 0;
        const maxGlobalAttempts = 200;
        
        while (!blockPlaced && globalAttempts < maxGlobalAttempts) {
            // Generate DNA components for new block
            const colorSeed = rng.randomInt(0, 256);
            const materialSeed = rng.randomInt(0, 256);
            const variation = rng.randomInt(0, 256);
            const color = Block.colorFromSeed(colorSeed);
            const materialType = Block.materialFromSeed(materialSeed);
            
            // Determine influence type
            let influenceType = null;
            if (typeof determineBlockInfluenceType === 'function') {
                influenceType = determineBlockInfluenceType(evolved, rng);
            }
            
            const block = new Block([...standardSize], color, materialType, influenceType);
            
            // Find parent block
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
                evolved.buildDNA();
                return evolved;
            }
            
            const parent = evolved.blocks[parentIndex];
            
            // Position block
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
                
                // Set DNA on new block
                const newBlockIndex = evolved.blocks.length;
                evolved.setBlockDNA(block, newBlockIndex, parentIndex, availableFace, variation, colorSeed, materialSeed, influenceType);
                evolved.blocks.push(block);
                
                if (influenceType) {
                    evolved.lastAddedSensor = influenceType;
                }
                
                // Determine axis
                let axis;
                if (availableFace === 0 || availableFace === 1) {
                    axis = 'x';
                } else if (availableFace === 2 || availableFace === 3) {
                    axis = 'y';
                } else {
                    axis = 'z';
                }
                
                // Create joint (actions will be generated from DNA)
                const joint = new Joint(parentIndex, newBlockIndex, axis, [], availableFace, oppositeFace);
                evolved.joints.push(joint);
                
                blockPlaced = true;
            } else {
                globalAttempts++;
            }
        }
        
        // Build DNA and generate movements
        evolved.buildDNA();
        evolved.regenerateMovementsFromDNA();
        
        return evolved;
    }
    
    wouldIntersect(newBlock) {
        const BLOCK_SIZE = 1.0;
        const tolerance = BLOCK_SIZE * 0.1;
        
        for (let existing of this.blocks) {
            const dx = Math.abs(newBlock.position[0] - existing.position[0]);
            const dy = Math.abs(newBlock.position[1] - existing.position[1]);
            const dz = Math.abs(newBlock.position[2] - existing.position[2]);
            
            if (dx < BLOCK_SIZE - tolerance && dy < BLOCK_SIZE - tolerance && dz < BLOCK_SIZE - tolerance) {
                return true;
            }
        }
        return false;
    }
    
    clone() {
        const cloned = new Creature(null);
        cloned.seed = this.seed;
        cloned.structureSeed = this.structureSeed;
        cloned.movementSeed = this.movementSeed;
        cloned.configIndex = this.configIndex;
        cloned.variantIndex = this.variantIndex;
        cloned.name = this.name;
        cloned.parentName = this.parentName;
        cloned.isDefendingChampion = this.isDefendingChampion;
        cloned.creatureSeed = this.creatureSeed;
        cloned.dna = this.dna;
        cloned.blocks = this.blocks.map(b => b.clone());
        cloned.joints = this.joints.map(j => j.clone());
        cloned.lastAddedSensor = this.lastAddedSensor;
        
        // Copy fitness tracking fields
        cloned.fitness = this.fitness;
        cloned.maxDistance = this.maxDistance;
        cloned.maxHeight = this.maxHeight;
        cloned.maxJumpHeight = this.maxJumpHeight;
        cloned.tilesLit = [...this.tilesLit];
        cloned.hasLandedAfterSpawn = this.hasLandedAfterSpawn;
        cloned.groundedY = this.groundedY;
        
        // Note: influences and influenceProviders are rebuilt when spawned
        return cloned;
    }
    
    resetFitnessTracking() {
        this.fitness = 0;
        this.maxDistance = 0;
        this.maxHeight = 0;
        this.maxJumpHeight = 0;
        this.tilesLit = [];
        this.hasLandedAfterSpawn = false;
        this.groundedY = 0;
    }
    
    /**
     * Calculate fitness based on mode
     * NOTE: These formulas MUST match evolution.js calculateFitnessFromMetrics()
     *       and main.js updateModeScoreDisplay() to ensure consistent scoring.
     */
    calculateFitness(mode = 'distance') {
        const dist = this.maxDistance || 0;
        const height = this.maxHeight || 0;
        const jump = this.maxJumpHeight || 0;
        const tiles = this.tilesLit ? this.tilesLit.length : 0;
        
        switch(mode) {
            case 'distance':
                // Formula: distance * 2 + height * 0.5
                this.fitness = dist * 2.0 + height * 0.5;
                break;
            case 'efficiency':
                // Formula: (distance/tiles) * 100 + height * 0.2
                const efficiency = tiles > 0 ? (dist / tiles) : 0;
                this.fitness = efficiency * 100 + height * 0.2;
                break;
            case 'jump':
                // Formula: jump * 10 + distance * 0.1
                this.fitness = jump * 10.0 + dist * 0.1;
                break;
            case 'area':
                // Formula: tiles * 1 + distance * 0.05
                this.fitness = tiles * 1.0 + dist * 0.05;
                break;
            case 'outcast':
                // Outcast requires population context - calculated in evolution.js
                // Use composite approximation for single-creature cases
                this.fitness = dist + height * 2 + tiles * 0.5 + jump * 5;
                break;
            case 'spartan':
                // Formula: distance * 1 + height * 2 + tiles * 0.2 + jump * 3
                this.fitness = dist * 1.0 + height * 2.0 + tiles * 0.2 + jump * 3.0;
                break;
            default:
                this.fitness = dist * 2.0 + height * 0.5;
        }
        
        return this.fitness;
    }
    
    /**
     * Get special blocks info for display
     */
    getSpecialBlocks() {
        const specialBlocks = [];
        for (let i = 0; i < this.blocks.length; i++) {
            const block = this.blocks[i];
            if (block.influenceType) {
                specialBlocks.push({
                    index: i,
                    type: block.influenceType
                });
            }
        }
        return specialBlocks;
    }
    
    /**
     * Get tile count (for efficiency calculation)
     */
    getTileCount() {
        return this.tilesLit ? this.tilesLit.length : 0;
    }
    
    /**
     * Get a summary of special blocks (sensors) for display
     * @returns {string} Comma-separated list of sensor types or 'None'
     */
    getSpecialBlocksSummary() {
        const blocks = this.getSpecialBlocks();
        if (blocks.length === 0) return 'None';
        return blocks.map(b => b.type).join(', ');
    }
    
    /**
     * Get a summary of movement patterns for debugging/display
     * @returns {string[]} Array of joint movement descriptions
     */
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
    
    /**
     * Check if two blocks intersect using sphere-based collision
     * @param {Block} block1 - First block
     * @param {Block} block2 - Second block
     * @returns {boolean} True if blocks intersect
     */
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
    
    /**
     * Convert to plain JSON object for serialization
     * The DNA is the authoritative representation - other data is for convenience
     */
    toJSON() {
        return {
            // DNA is the authoritative representation
            dna: this.dna,
            creatureSeed: this.creatureSeed,
            
            // Legacy seeds (for backward compatibility)
            seed: this.seed,
            structureSeed: this.structureSeed,
            movementSeed: this.movementSeed,
            
            // Identity
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
            tilesLit: [...(this.tilesLit || [])],
            
            // Special block tracking
            lastAddedSensor: this.lastAddedSensor,
            
            // Structure data (for verification and backward compatibility)
            blocks: this.blocks.map(b => b.toJSON()),
            joints: this.joints.map(j => j.toJSON())
        };
    }
    
    /**
     * Create a Creature from a plain JSON object
     * Reconstructs creature from DNA if available, falls back to legacy data
     */
    static fromJSON(data) {
        const creature = new Creature(null);
        
        // Identity and seeds
        creature.seed = data.seed;
        creature.structureSeed = data.structureSeed;
        creature.movementSeed = data.movementSeed;
        creature.configIndex = data.configIndex;
        creature.variantIndex = data.variantIndex;
        creature.name = data.name;
        creature.parentName = data.parentName;
        creature.isDefendingChampion = data.isDefendingChampion;
        creature.creatureSeed = data.creatureSeed;
        creature.dna = data.dna;
        
        // Fitness metrics
        creature.fitness = data.fitness || 0;
        creature.maxDistance = data.maxDistance || 0;
        creature.maxHeight = data.maxHeight || 0;
        creature.maxJumpHeight = data.maxJumpHeight || 0;
        creature.hasLandedAfterSpawn = data.hasLandedAfterSpawn || false;
        creature.groundedY = data.groundedY || 0;
        creature.tilesLit = [...(data.tilesLit || [])];
        
        // Special block tracking
        creature.lastAddedSensor = data.lastAddedSensor || null;
        
        // Reconstruct blocks from saved data
        creature.blocks = data.blocks.map(b => Block.fromJSON(b));
        
        // For joints, we reconstruct the structure but regenerate actions from DNA
        // This ensures full determinism - same DNA always produces same movements
        creature.joints = data.joints.map(j => {
            // Create joint with structure but empty actions
            const joint = new Joint(j.blockIndexA, j.blockIndexB, j.axis, [], j.faceA, j.faceB);
            // Note: influenceResponses will be regenerated from DNA
            return joint;
        });
        
        // Regenerate all movements and influence responses from DNA
        // This is the authoritative source - ensures determinism
        if (creature.dna) {
            creature.regenerateMovementsFromDNA();
        } else {
            // Legacy fallback: use saved joint data if no DNA
            creature.joints = data.joints.map(j => Joint.fromJSON(j));
        }
        
        return creature;
    }
    
    /**
     * Create a creature entirely from a DNA string
     * This is the canonical way to recreate a creature deterministically
     * @param {string} dnaString - Complete DNA string
     * @returns {Creature} Reconstructed creature
     */
    static fromDNA(dnaString) {
        const creature = new Creature(null);
        const { creatureSeed, blockDescriptors } = parseDNA(dnaString);
        
        creature.dna = dnaString;
        creature.creatureSeed = creatureSeed;
        
        const BLOCK_SIZE = 1.0;
        const standardSize = [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE];
        
        // Create each block from its descriptor
        for (let i = 0; i < blockDescriptors.length; i++) {
            const desc = blockDescriptors[i];
            
            // Generate color and material from seeds
            const color = Block.colorFromSeed(desc.colorSeed);
            const materialType = Block.materialFromSeed(desc.materialSeed);
            const influenceType = SPECIAL_TYPE_NAMES[desc.specialCode] || null;
            
            const block = new Block([...standardSize], color, materialType, influenceType);
            block.dnaDescriptor = createBlockDescriptor(
                desc.blockId, desc.parentId, desc.side,
                desc.variation, desc.colorSeed, desc.materialSeed, desc.specialCode
            );
            block.variation = desc.variation;
            block.colorSeed = desc.colorSeed;
            block.materialSeed = desc.materialSeed;
            
            if (i === 0) {
                // First block at origin
                block.position = [0, BLOCK_SIZE / 2, 0];
            } else {
                // Position relative to parent
                const parent = creature.blocks[desc.parentId];
                const face = desc.side;
                
                switch(face) {
                    case 0: block.position = [parent.position[0] + BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                    case 1: block.position = [parent.position[0] - BLOCK_SIZE, parent.position[1], parent.position[2]]; break;
                    case 2: block.position = [parent.position[0], parent.position[1] + BLOCK_SIZE, parent.position[2]]; break;
                    case 3: block.position = [parent.position[0], parent.position[1] - BLOCK_SIZE, parent.position[2]]; break;
                    case 4: block.position = [parent.position[0], parent.position[1], parent.position[2] + BLOCK_SIZE]; break;
                    case 5: block.position = [parent.position[0], parent.position[1], parent.position[2] - BLOCK_SIZE]; break;
                }
                
                // Mark faces as used
                parent.markFaceUsed(face);
                const oppositeFace = face % 2 === 0 ? face + 1 : face - 1;
                block.markFaceUsed(oppositeFace);
                
                // Create joint
                let axis;
                if (face === 0 || face === 1) {
                    axis = 'x';
                } else if (face === 2 || face === 3) {
                    axis = 'y';
                } else {
                    axis = 'z';
                }
                
                const joint = new Joint(desc.parentId, i, axis, [], face, oppositeFace);
                creature.joints.push(joint);
            }
            
            creature.blocks.push(block);
        }
        
        // Generate all movements from DNA
        creature.regenerateMovementsFromDNA();
        
        return creature;
    }
}
