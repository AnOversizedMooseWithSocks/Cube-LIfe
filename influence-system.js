// influence-system.js - Modular influence system for creature movement
// 
// This system allows special blocks to influence joint movement patterns.
// It's designed to be extensible - new influence types can be added without
// changing the core architecture.
//
// Key concepts:
// - Influence Channels: Named signals with values from -1 to +1
// - Influence Providers: Blocks that calculate and provide channel values
// - Joint Responses: Weights that determine how joints react to channels

// ============================================================================
// INFLUENCE TYPE REGISTRY
// ============================================================================

/**
 * Registry of available influence types.
 * Each entry defines:
 *   - type: The channel name (string)
 *   - name: Display name for UI
 *   - description: What this influence represents
 *   - color: Visual indicator color (hex)
 *   - weight: Relative probability during mutation (higher = more common)
 *   - calculate: Function(body, context) => number (-1 to +1)
 */
const INFLUENCE_TYPES = {
    
    // Gravity Sensor - detects orientation relative to "up"
    // Good for balance-based behaviors
    'gravity': {
        type: 'gravity',
        name: 'Gravity Sensor',
        description: 'Detects orientation: +1 when upright, -1 when upside-down',
        color: 0xffaa00,      // Orange/amber
        glowColor: 0x442200,
        weight: 1.0,
        
        // Which modulation methods this sensor can influence
        // speed: affects how fast joints rotate
        // direction: can flip rotation direction
        modulationMethods: ['speed', 'direction'],
        
        /**
         * Calculate gravity influence based on block orientation.
         * Returns +1 when block's "up" faces world up, -1 when inverted.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Environmental context (unused for gravity)
         * @returns {number} -1 to +1
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Transform the block's local "up" vector (0,1,0) to world space
            const localUp = new CANNON.Vec3(0, 1, 0);
            const worldUp = body.quaternion.vmult(localUp);
            
            // Dot product with world up gives -1 to +1
            // +1 = block's up matches world up (upright)
            // -1 = block's up is opposite world up (inverted)
            return worldUp.y;
        }
    },
    
    // Light Sensor - detects direction to sun
    // Good for phototaxis (moving toward/away from light)
    'light': {
        type: 'light',
        name: 'Light Sensor',
        description: 'Detects sunlight: +1 facing sun, -1 facing away',
        color: 0x88ccff,      // Light blue
        glowColor: 0x224466,
        weight: 1.0,
        
        // Light can affect both speed (move faster in light) and direction (turn toward/away)
        modulationMethods: ['speed', 'direction'],
        
        /**
         * Calculate light influence based on block facing vs sun direction.
         * Returns +1 when block faces sun, -1 when facing away.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Must contain sunDirection {x, y, z}
         * @returns {number} -1 to +1
         */
        calculate: function(body, context) {
            if (!body || !context.sunDirection) return 0;
            
            // Transform the block's local "up" vector to world space
            // This represents the "sensing" direction of the block
            const localUp = new CANNON.Vec3(0, 1, 0);
            const worldFacing = body.quaternion.vmult(localUp);
            
            // Dot product with sun direction gives -1 to +1
            const sun = context.sunDirection;
            return worldFacing.x * sun.x + worldFacing.y * sun.y + worldFacing.z * sun.z;
        }
    },
    
    // ========================================================================
    // VELOCITY SENSOR - detects movement speed
    // ========================================================================
    'velocity': {
        type: 'velocity',
        name: 'Velocity Sensor',
        description: 'Detects speed: -1 when stopped, +1 at full speed',
        color: 0x44ff88,      // Green (go/speed)
        glowColor: 0x115522,
        weight: 1.0,
        
        // Velocity primarily affects speed - move faster when already moving
        // Creates momentum-like behaviors
        modulationMethods: ['speed'],
        
        /**
         * Calculate velocity influence based on body speed.
         * Uses the magnitude of the body's velocity vector.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Environmental context (unused)
         * @returns {number} -1 to +1 (0 = stopped, 1 = fast)
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Get the velocity magnitude (speed)
            const vel = body.velocity;
            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
            
            // Map speed to -1 to +1 range
            // Typical creature speeds range from 0 to ~10 units/sec
            // We'll use 5 as "full speed" for good sensitivity
            const maxSpeed = 5.0;
            const normalized = Math.min(speed / maxSpeed, 1.0);
            
            // Map from 0..1 to -1..+1 (stopped = -1, fast = +1)
            return (normalized * 2.0) - 1.0;
        }
    },
    
    // ========================================================================
    // GROUND CONTACT SENSOR - detects if grounded or airborne
    // ========================================================================
    'ground': {
        type: 'ground',
        name: 'Ground Sensor',
        description: 'Detects ground: +1 when grounded, -1 when airborne',
        color: 0xcc8844,      // Brown/tan (earth)
        glowColor: 0x442211,
        weight: 1.0,
        
        // Ground affects speed - can move differently on ground vs air
        // Also affects direction - could change behavior when airborne
        modulationMethods: ['speed', 'direction'],
        
        /**
         * Calculate ground contact influence based on height and vertical velocity.
         * Considers both position and whether the creature is rising/falling.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Environmental context (unused)
         * @returns {number} -1 (airborne) to +1 (grounded)
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Ground threshold - below this Y position is considered "on ground"
            // Blocks are 1.0 units, so ~0.7 means bottom of block is near ground
            const groundThreshold = 1.0;
            const airThreshold = 3.0;  // Above this is definitely airborne
            
            const height = body.position.y;
            const verticalVelocity = body.velocity.y;
            
            // Base value from height
            let groundedness;
            if (height <= groundThreshold) {
                groundedness = 1.0;  // Fully grounded
            } else if (height >= airThreshold) {
                groundedness = -1.0;  // Fully airborne
            } else {
                // Linear interpolation between thresholds
                const t = (height - groundThreshold) / (airThreshold - groundThreshold);
                groundedness = 1.0 - (t * 2.0);  // 1 to -1
            }
            
            // Adjust based on vertical velocity (falling = more airborne feel)
            // Rising quickly = -0.3 adjustment, falling quickly = +0.3 adjustment
            const velAdjustment = Math.max(-0.3, Math.min(0.3, -verticalVelocity * 0.1));
            
            return Math.max(-1.0, Math.min(1.0, groundedness + velAdjustment));
        }
    },
    
    // ========================================================================
    // OSCILLATOR - rhythmic signal for coordinated movement
    // ========================================================================
    'rhythm': {
        type: 'rhythm',
        name: 'Oscillator',
        description: 'Rhythmic signal: oscillates smoothly between -1 and +1',
        color: 0xaa44ff,      // Purple (rhythm/pulse)
        glowColor: 0x331155,
        weight: 1.0,
        
        // Rhythm primarily affects direction - creates alternating movement patterns
        // Can also modulate speed for pulsing intensity
        modulationMethods: ['speed', 'direction'],
        
        // Each oscillator block has its own phase, stored on the body
        // This allows different blocks to have different rhythms
        
        /**
         * Calculate oscillator influence using a sine wave.
         * The frequency is based on the block's position for variety.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Must contain simulationTime (seconds)
         * @returns {number} -1 to +1 (smooth oscillation)
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Get or initialize the oscillator phase for this body
            // We use the body's initial position to create unique phases
            if (body.oscillatorPhase === undefined) {
                // Create a unique phase based on body ID or position
                // This makes each oscillator block have a slightly different rhythm
                const px = body.position.x || 0;
                const py = body.position.y || 0;
                const pz = body.position.z || 0;
                body.oscillatorPhase = (px + py * 1.3 + pz * 1.7) % (Math.PI * 2);
            }
            
            // Get simulation time from context, default to 0
            const time = context.simulationTime || 0;
            
            // Base frequency: one full cycle every 2 seconds
            // This gives a nice rhythmic movement speed
            const frequency = Math.PI;  // radians per second (0.5 Hz)
            
            // Calculate the sine wave value
            const angle = (time * frequency) + body.oscillatorPhase;
            return Math.sin(angle);
        }
    },
    
    // ========================================================================
    // TILT SENSOR - detects left/right lean
    // ========================================================================
    'tilt': {
        type: 'tilt',
        name: 'Tilt Sensor',
        description: 'Detects lateral tilt: -1 leaning left, +1 leaning right',
        color: 0x44ffff,      // Cyan (balance/level)
        glowColor: 0x114444,
        weight: 1.0,
        
        // Tilt is great for direction control - steer based on lean
        // Speed modulation can help with balance corrections
        modulationMethods: ['speed', 'direction'],
        
        /**
         * Calculate tilt influence based on block's lateral orientation.
         * Measures how much the block's "up" vector leans left or right.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Environmental context (unused)
         * @returns {number} -1 (left tilt) to +1 (right tilt)
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Transform the block's local "up" vector to world space
            const localUp = new CANNON.Vec3(0, 1, 0);
            const worldUp = body.quaternion.vmult(localUp);
            
            // The X component of the transformed up vector tells us the tilt
            // Positive X = leaning right, Negative X = leaning left
            // When perfectly upright, worldUp.x = 0
            // When tilted 90 deg right, worldUp.x = 1 (local up points world right)
            // When tilted 90 deg left, worldUp.x = -1 (local up points world left)
            return worldUp.x;
        }
    },
    
    // ========================================================================
    // COMPASS SENSOR - detects facing direction in world space
    // ========================================================================
    'compass': {
        type: 'compass',
        name: 'Compass Sensor',
        description: 'Detects facing direction: -1 facing backward (neg X), +1 facing forward (pos X)',
        color: 0xff4488,      // Pink/magenta (direction/navigation)
        glowColor: 0x441122,
        weight: 1.0,
        
        // Compass is perfect for direction control - turn to face a direction
        modulationMethods: ['direction'],
        
        /**
         * Calculate compass influence based on which way the block faces in world XZ plane.
         * Uses the block's local "forward" direction (positive Z axis) projected onto world X.
         * This tells the creature which way it's pointing relative to the typical movement
         * direction for distance-based fitness.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Environmental context (unused)
         * @returns {number} -1 (facing neg X) to +1 (facing pos X)
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Transform the block's local "forward" vector (0,0,1) to world space
            // This represents the direction the block is "facing"
            const localForward = new CANNON.Vec3(0, 0, 1);
            const worldForward = body.quaternion.vmult(localForward);
            
            // Project onto XZ plane and normalize
            const xzLength = Math.sqrt(worldForward.x * worldForward.x + worldForward.z * worldForward.z);
            
            if (xzLength < 0.001) {
                // Block is facing straight up or down, no meaningful XZ direction
                return 0;
            }
            
            // The X component tells us if facing toward positive or negative X
            // Normalize by the XZ length to get a proper -1 to +1 range
            return worldForward.x / xzLength;
        }
    },
    
    // ========================================================================
    // TRACKING SENSOR - detects position relative to starting location
    // ========================================================================
    'tracking': {
        type: 'tracking',
        name: 'Tracking Sensor',
        description: 'Detects position vs start: -1 behind start, +1 ahead of start (X axis)',
        color: 0xffff44,      // Yellow (GPS/location)
        glowColor: 0x444411,
        weight: 1.0,
        
        // Tracking affects speed - move faster/slower based on progress
        // Also affects direction - can reverse if gone too far or not far enough
        modulationMethods: ['speed', 'direction'],
        
        /**
         * Calculate tracking influence based on displacement from starting position.
         * Measures how far the block has moved along the X axis from where it started.
         * This correlates with distance-based fitness modes.
         * 
         * The starting position is stored on the body the first time this is called,
         * ensuring deterministic behavior across simulation runs.
         * 
         * @param {CANNON.Body} body - The physics body for this block
         * @param {Object} context - Environmental context (unused)
         * @returns {number} -1 (far behind start) to +1 (far ahead of start)
         */
        calculate: function(body, context) {
            if (!body) return 0;
            
            // Store starting position on first calculation (like oscillator stores phase)
            if (body.trackingStartPos === undefined) {
                body.trackingStartPos = {
                    x: body.position.x,
                    y: body.position.y,
                    z: body.position.z
                };
            }
            
            // Calculate X displacement from start
            // Positive X is typically the "forward" direction for distance fitness
            const displacement = body.position.x - body.trackingStartPos.x;
            
            // Map displacement to -1 to +1 range
            // Use 10 units as "full scale" - creatures moving more than 10 units
            // from start in either direction will saturate the sensor
            const scale = 10.0;
            const normalized = displacement / scale;
            
            // Clamp to -1 to +1
            return Math.max(-1.0, Math.min(1.0, normalized));
        }
    }
    
    // ========================================================================
    // ADD MORE INFLUENCE TYPES HERE AS NEEDED
    // ========================================================================
    // 
    // Potential future types:
    // - 'proximity': Detects nearby creatures (-1 alone, +1 crowded)
    // - 'heat': Based on sun exposure over time
    // - 'sound': Responds to nearby movement/collisions
};


// ============================================================================
// INFLUENCE SYSTEM HELPER FUNCTIONS
// ============================================================================

/**
 * Get an array of all registered influence type names.
 * 
 * @returns {string[]} Array of type names like ['gravity', 'light']
 */
function getInfluenceTypeNames() {
    return Object.keys(INFLUENCE_TYPES);
}

/**
 * Get the configuration for an influence type.
 * 
 * @param {string} type - The influence type name
 * @returns {Object|null} The type configuration or null if not found
 */
function getInfluenceType(type) {
    return INFLUENCE_TYPES[type] || null;
}

/**
 * Calculate the influence value for a block.
 * 
 * @param {string} type - The influence type name
 * @param {CANNON.Body} body - The physics body
 * @param {Object} context - Environmental context
 * @returns {number} The influence value (-1 to +1) or 0 if type not found
 */
function calculateInfluence(type, body, context) {
    const config = INFLUENCE_TYPES[type];
    if (!config || !config.calculate) return 0;
    return config.calculate(body, context);
}

/**
 * Pick a random influence type for mutation.
 * Uses the weight values to determine probability.
 * 
 * @param {SeededRandom} rng - Seeded random number generator
 * @returns {string} The selected influence type name
 */
function pickRandomInfluenceType(rng) {
    const types = Object.values(INFLUENCE_TYPES);
    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
    
    let roll = rng.random() * totalWeight;
    for (const entry of types) {
        roll -= entry.weight;
        if (roll <= 0) {
            return entry.type;
        }
    }
    
    // Fallback to first type
    return types[0].type;
}

/**
 * Maybe assign an influence type to a new block during mutation.
 * 
 * @param {SeededRandom} rng - Seeded random number generator
 * @param {number} probability - Chance of becoming an influence block (0-1)
 * @returns {string|null} The influence type, or null for normal block
 */
function maybeAssignInfluenceType(rng, probability = 0.05) {
    if (rng.random() > probability) {
        return null;  // Normal block
    }
    return pickRandomInfluenceType(rng);
}


// ============================================================================
// JOINT RESPONSE MUTATION HELPERS
// ============================================================================

/**
 * Mutate a joint's influence responses.
 * Called during creature mutation to evolve how joints react to influences.
 * 
 * Handles both legacy format {channel: weight} and new format {channel: {method: weight}}
 * 
 * @param {Object} responses - The joint's influenceResponses object
 * @param {SeededRandom} rng - Seeded random number generator
 * @param {string[]} availableChannels - Channels the creature has providers for
 * @param {number} mutationChance - Probability of mutation occurring (0-1)
 * @returns {Object} The mutated responses object
 */
function mutateInfluenceResponses(responses, rng, availableChannels, mutationChance = 0.2) {
    // Deep clone the responses to avoid modifying original
    const mutated = {};
    for (const [channel, response] of Object.entries(responses)) {
        if (typeof response === 'object') {
            mutated[channel] = { ...response };
        } else {
            // Convert legacy format to new format
            mutated[channel] = { speed: response };
        }
    }
    
    // Skip mutation most of the time
    if (rng.random() > mutationChance) {
        return mutated;
    }
    
    const action = rng.random();
    
    if (action < 0.4 && availableChannels.length > 0) {
        // Add or modify a response to an available channel
        const channel = availableChannels[rng.randomInt(0, availableChannels.length)];
        const sensorType = INFLUENCE_TYPES[channel];
        const methods = sensorType?.modulationMethods || ['speed'];
        
        // Pick a random method this sensor supports
        const method = methods[rng.randomInt(0, methods.length)];
        
        // Initialize channel response if needed
        if (!mutated[channel]) {
            mutated[channel] = {};
        }
        
        const current = mutated[channel][method] || 0;
        const delta = rng.randomFloat(-0.3, 0.4);  // Slight bias toward strengthening
        const newValue = Math.max(-1, Math.min(1, current + delta));
        
        if (Math.abs(newValue) < 0.1) {
            // Remove very weak method responses
            delete mutated[channel][method];
            // Remove channel if no methods left
            if (Object.keys(mutated[channel]).length === 0) {
                delete mutated[channel];
            }
        } else {
            mutated[channel][method] = newValue;
        }
        
    } else if (action < 0.7 && Object.keys(mutated).length > 0) {
        // Modify an existing response
        const channels = Object.keys(mutated);
        const channel = channels[rng.randomInt(0, channels.length)];
        const methods = Object.keys(mutated[channel]);
        
        if (methods.length > 0) {
            const method = methods[rng.randomInt(0, methods.length)];
            const current = mutated[channel][method];
            const delta = rng.randomFloat(-0.25, 0.25);
            const newValue = Math.max(-1, Math.min(1, current + delta));
            
            if (Math.abs(newValue) < 0.1) {
                delete mutated[channel][method];
                if (Object.keys(mutated[channel]).length === 0) {
                    delete mutated[channel];
                }
            } else {
                mutated[channel][method] = newValue;
            }
        }
        
    } else if (Object.keys(mutated).length > 0 && rng.random() < 0.3) {
        // Occasionally remove a response entirely
        const channels = Object.keys(mutated);
        const channel = channels[rng.randomInt(0, channels.length)];
        delete mutated[channel];
    }
    
    return mutated;
}

/**
 * Apply influence modulation to a base rotation value.
 * This is the core formula that determines how influences affect joint movement.
 * 
 * Supports multiple modulation methods:
 * - speed: scales the rotation magnitude (0 = stopped, 2 = double speed)
 * - direction: can flip the rotation direction when influence is strong enough
 * 
 * Response format can be either:
 * - Legacy: {channelName: weight} - applies to speed only
 * - New: {channelName: {speed: weight, direction: weight}}
 * 
 * @param {number} baseRotation - The unmodulated rotation delta
 * @param {Object} influences - Current influence channel values {channelName: value}
 * @param {Object} responses - Joint's response weights
 * @returns {number} The modulated rotation delta
 */
function applyInfluenceModulation(baseRotation, influences, responses) {
    if (!responses || Object.keys(responses).length === 0) {
        return baseRotation;
    }
    
    let speedModifier = 1.0;
    let directionModifier = 1.0;
    
    // Apply each response this joint has
    for (const [channel, response] of Object.entries(responses)) {
        if (!(channel in influences)) continue;
        
        const influenceValue = influences[channel];
        
        // Handle both legacy format (single weight) and new format (method weights)
        if (typeof response === 'number') {
            // Legacy format: single weight applies to speed
            const effect = influenceValue * response * 0.5;
            speedModifier += effect;
        } else if (typeof response === 'object') {
            // New format: separate weights per method
            
            // Speed modulation: scales rotation magnitude
            if (response.speed !== undefined) {
                const effect = influenceValue * response.speed * 0.5;
                speedModifier += effect;
            }
            
            // Direction modulation: can flip rotation direction
            // When influence * weight exceeds threshold, direction flips
            if (response.direction !== undefined) {
                const effect = influenceValue * response.direction;
                // Accumulate direction effects - strong negative flips direction
                // effect > 0.5: reinforce direction
                // effect < -0.5: flip direction
                directionModifier += effect * 0.5;
            }
        }
    }
    
    // Clamp speed modifier to reasonable range (0 = stopped, 2 = double speed)
    speedModifier = Math.max(0, Math.min(2.0, speedModifier));
    
    // Direction modifier: if it goes negative, flip direction
    // Clamp to -1 to 1 range, then use sign
    directionModifier = Math.max(-1.5, Math.min(1.5, directionModifier));
    const directionSign = directionModifier >= 0 ? 1 : -1;
    
    return baseRotation * speedModifier * directionSign;
}


// ============================================================================
// CREATURE INFLUENCE MANAGEMENT
// ============================================================================

/**
 * Find all influence-providing blocks in a creature.
 * Call this after the creature's blocks are set up.
 * 
 * @param {Creature} creature - The creature to scan
 * @returns {Array} Array of {blockIndex, channelName, block} objects
 */
function findInfluenceProviders(creature) {
    const providers = [];
    
    for (let i = 0; i < creature.blocks.length; i++) {
        const block = creature.blocks[i];
        if (block.influenceType && INFLUENCE_TYPES[block.influenceType]) {
            providers.push({
                blockIndex: i,
                channelName: block.influenceType,
                block: block
            });
        }
    }
    
    return providers;
}

/**
 * Update all influence channel values for a creature.
 * Call this each frame before updating joints.
 * 
 * The influence value is flipped (negated) based on which face the sensor
 * block is attached by. Even faces (0, 2, 4) give normal values, while
 * odd faces (1, 3, 5) flip the sign. This allows sensors on opposite sides
 * of a creature to produce complementary responses.
 * 
 * @param {Creature} creature - The creature to update
 * @param {Object} context - Environmental context {sunDirection, dayProgress, etc.}
 * @returns {Object} The updated influences map {channelName: value}
 */
function updateCreatureInfluences(creature, context) {
    const influences = {};
    
    if (!creature.influenceProviders || creature.influenceProviders.length === 0) {
        return influences;
    }
    
    for (const provider of creature.influenceProviders) {
        const body = creature.bodies[provider.blockIndex];
        if (!body) continue;
        
        // Calculate influence using the registered type's function
        let value = calculateInfluence(provider.channelName, body, context);
        
        // Find the joint that connects this sensor block to its parent
        // to determine which face it's attached by
        const blockIndex = provider.blockIndex;
        if (blockIndex > 0) {  // Block 0 has no parent/joint
            const joint = creature.joints.find(j => j.blockIndexB === blockIndex);
            if (joint) {
                // faceB is the face on this block that connects to the parent
                // Odd faces (1, 3, 5) flip the influence value
                if (joint.faceB % 2 === 1) {
                    value = -value;
                }
            }
        }
        
        // Store the value (if multiple blocks provide same channel, last wins)
        influences[provider.channelName] = value;
    }
    
    return influences;
}

/**
 * Get the list of influence channels a creature provides.
 * Useful for mutation to know which channels joints could respond to.
 * 
 * @param {Creature} creature - The creature to check
 * @returns {string[]} Array of channel names this creature provides
 */
function getCreatureInfluenceChannels(creature) {
    if (!creature.influenceProviders) return [];
    return [...new Set(creature.influenceProviders.map(p => p.channelName))];
}


// ============================================================================
// VISUAL HELPERS
// ============================================================================

/**
 * Get the visual configuration for an influence type.
 * Used when creating block meshes to add visual indicators.
 * 
 * @param {string} type - The influence type name
 * @returns {Object|null} {color, glowColor, name} or null
 */
function getInfluenceVisualConfig(type) {
    const config = INFLUENCE_TYPES[type];
    if (!config) return null;
    
    return {
        color: config.color,
        glowColor: config.glowColor,
        name: config.name
    };
}


// ============================================================================
// GLOBAL SENSOR CONFIGURATION
// ============================================================================

/**
 * Global configuration for how sensors are handled during evolution.
 * Each sensor type can be configured independently:
 * - 'off': Sensor is not used
 * - 'start': Sensor is added when creature is first created
 * - 'evolve': Sensor can be added through mutation during evolution
 * 
 * This allows mixing strategies, e.g., start with gravity but evolve light sensors.
 */
const SensorConfig = {
    // Per-sensor mode configuration
    // Keys are influence type names, values are 'off', 'start', or 'evolve'
    sensorModes: {
        'gravity': 'off',
        'light': 'off',
        'velocity': 'off',
        'ground': 'off',
        'rhythm': 'off',
        'tilt': 'off',
        'compass': 'off',
        'tracking': 'off'
    },
    
    /**
     * Set the mode for a specific sensor type.
     * @param {string} type - The influence type name
     * @param {string} mode - 'off', 'start', or 'evolve'
     */
    setSensorMode: function(type, mode) {
        if (INFLUENCE_TYPES[type] && ['off', 'start', 'evolve'].includes(mode)) {
            this.sensorModes[type] = mode;
        }
    },
    
    /**
     * Get the mode for a specific sensor type.
     * @param {string} type - The influence type name
     * @returns {string} 'off', 'start', or 'evolve'
     */
    getSensorMode: function(type) {
        return this.sensorModes[type] || 'off';
    },
    
    /**
     * Check if any sensors are active (not all off).
     * @returns {boolean}
     */
    isActive: function() {
        return Object.values(this.sensorModes).some(mode => mode !== 'off');
    },
    
    /**
     * Get list of sensor types that should be added at creature creation.
     * @returns {string[]} Array of type names with 'start' mode
     */
    getStartTypes: function() {
        return Object.entries(this.sensorModes)
            .filter(([type, mode]) => mode === 'start' && INFLUENCE_TYPES[type])
            .map(([type]) => type);
    },
    
    /**
     * Get list of sensor types that can be evolved/mutated.
     * @returns {string[]} Array of type names with 'evolve' mode
     */
    getEvolveTypes: function() {
        return Object.entries(this.sensorModes)
            .filter(([type, mode]) => mode === 'evolve' && INFLUENCE_TYPES[type])
            .map(([type]) => type);
    },
    
    /**
     * Get list of all enabled sensor types (start or evolve).
     * @returns {string[]} Array of enabled type names
     */
    getEnabledTypes: function() {
        return Object.entries(this.sensorModes)
            .filter(([type, mode]) => mode !== 'off' && INFLUENCE_TYPES[type])
            .map(([type]) => type);
    },
    
    /**
     * Check if a specific type is enabled (start or evolve).
     * @param {string} type - The influence type name
     * @returns {boolean}
     */
    isTypeEnabled: function(type) {
        const mode = this.sensorModes[type];
        return mode === 'start' || mode === 'evolve';
    },
    
    /**
     * Check if a specific type should start with creatures.
     * @param {string} type - The influence type name
     * @returns {boolean}
     */
    isStartType: function(type) {
        return this.sensorModes[type] === 'start';
    },
    
    /**
     * Check if a specific type can be evolved.
     * @param {string} type - The influence type name
     * @returns {boolean}
     */
    isEvolveType: function(type) {
        return this.sensorModes[type] === 'evolve';
    },
    
    // Legacy compatibility - these methods map to the new system
    // Kept for any code that might still use the old API
    
    /** @deprecated Use setSensorMode instead */
    setMode: function(mode) {
        // Legacy: set all sensors to the same mode
        console.log('[SENSOR] Legacy setMode called with:', mode);
    },
    
    /** @deprecated Use setSensorMode instead */
    setTypeEnabled: function(type, enabled) {
        // Legacy: map enabled to 'start', disabled to 'off'
        if (INFLUENCE_TYPES[type]) {
            this.sensorModes[type] = enabled ? 'start' : 'off';
        }
    }
};


// ============================================================================
// CREATURE SENSOR HELPERS
// ============================================================================

/**
 * Get which influence types a creature already has.
 * Used to enforce the "one of each type" rule.
 * 
 * @param {Creature} creature - The creature to check
 * @returns {string[]} Array of influence types the creature has
 */
function getCreatureInfluenceTypes(creature) {
    if (!creature || !creature.blocks) return [];
    
    const types = [];
    for (const block of creature.blocks) {
        if (block.influenceType && !types.includes(block.influenceType)) {
            types.push(block.influenceType);
        }
    }
    return types;
}

/**
 * Get which influence types can still be added to a creature through evolution.
 * Only considers types set to 'evolve' mode that the creature doesn't already have.
 * 
 * @param {Creature} creature - The creature to check
 * @returns {string[]} Array of influence types that can be evolved
 */
function getAvailableInfluenceTypes(creature) {
    // Get types that are set to 'evolve' mode
    const evolveTypes = SensorConfig.getEvolveTypes();
    const existingTypes = getCreatureInfluenceTypes(creature);
    
    // Return evolve types that the creature doesn't already have
    return evolveTypes.filter(type => !existingTypes.includes(type));
}

/**
 * Check if a creature needs more sensor blocks through evolution.
 * Only considers sensors set to 'evolve' mode.
 * 
 * @param {Creature} creature - The creature to check
 * @returns {boolean} True if creature is missing evolvable sensor types
 */
function creatureNeedsSensors(creature) {
    return getAvailableInfluenceTypes(creature).length > 0;
}

/**
 * Pick the next sensor type to add to a creature.
 * Returns null if all enabled types are already present.
 * 
 * @param {Creature} creature - The creature to add a sensor to
 * @param {SeededRandom} rng - Random number generator
 * @returns {string|null} The influence type to add, or null
 */
function pickNextSensorType(creature, rng) {
    const available = getAvailableInfluenceTypes(creature);
    if (available.length === 0) return null;
    
    // Pick randomly from available types
    return available[rng.randomInt(0, available.length)];
}

/**
 * Determine what influence type (if any) a new block should have.
 * This is the main function called during block creation/evolution.
 * 
 * Only considers sensors set to 'evolve' mode. Sensors set to 'start' mode
 * are added at creature creation, not during evolution.
 * 
 * @param {Creature} creature - The creature the block is being added to
 * @param {SeededRandom} rng - Random number generator
 * @returns {string|null} The influence type for the new block, or null
 */
function determineBlockInfluenceType(creature, rng) {
    // Get sensors that can be evolved (not 'off' or 'start')
    const available = getAvailableInfluenceTypes(creature);
    
    if (available.length > 0) {
        // Prioritize adding a missing evolvable sensor
        return available[rng.randomInt(0, available.length)];
    }
    
    // No sensor needed
    return null;
}

/**
 * Add all "start" mode sensor blocks to a creature.
 * Used at creature creation to give creatures their starting sensors.
 * 
 * @param {Creature} creature - The creature to add sensors to
 * @param {SeededRandom} rng - Random number generator
 * @returns {number} Number of sensor blocks added
 */
function addAllEnabledSensors(creature, rng) {
    // Get only sensors set to 'start' mode
    const typesToAdd = SensorConfig.getStartTypes();
    if (typesToAdd.length === 0) return 0;
    
    let added = 0;
    
    for (const influenceType of typesToAdd) {
        // Find an available attachment point
        let attached = false;
        let attempts = 0;
        const maxAttempts = 50;
        
        while (!attached && attempts < maxAttempts) {
            // Pick a random existing block
            const parentIndex = rng.randomInt(0, creature.blocks.length);
            const parent = creature.blocks[parentIndex];
            const availableFaces = parent.getAvailableFaces();
            
            if (availableFaces.length > 0) {
                const face = availableFaces[rng.randomInt(0, availableFaces.length)];
                
                // Use addBlockAtFace but force the influence type
                attached = creature.addBlockAtFaceWithType(parentIndex, face, rng, influenceType);
            }
            attempts++;
        }
        
        if (attached) {
            added++;
            console.log(`[SENSOR] Added ${influenceType} sensor (start mode) to creature`);
        } else {
            console.warn(`[SENSOR] Could not attach ${influenceType} sensor - no available faces`);
        }
    }
    
    return added;
}


// ============================================================================
// EXPORTS (for potential module use, though we're using global scope)
// ============================================================================

// All functions and constants are available globally since this is loaded
// as a regular script. If converting to ES modules in the future, export here.

console.log('[INFLUENCE] Influence system loaded with types:', getInfluenceTypeNames().join(', '));
