// evolution.js - Evolution system using genetic algorithm
// Implements backtracking when evolutionary dead ends are encountered
// If a generation's champion doesn't outperform the prior generation,
// we backtrack and try the next best creature from the prior generation

/**
 * Fitness Mode descriptions:
 * - 'distance': How far the creature travels from start (default)
 * - 'efficiency': Distance traveled per tile lit (straight-line movers win)
 * - 'jump': Maximum height reached after landing from spawn
 * - 'area': Total tiles lit up (surface area covered)
 * - 'outcast': Most different from the population average (the weirdo wins!)
 * - 'spartan': Best overall metrics combined (the well-rounded athlete wins!)
 * - 'random': Randomly selects one of the above modes each generation
 */

// Available concrete fitness modes (excludes 'random' which is a meta-mode)
const CONCRETE_FITNESS_MODES = ['distance', 'efficiency', 'jump', 'area', 'outcast', 'spartan'];

/**
 * Manages the evolution of creatures across generations
 */
class EvolutionManager {
    constructor() {
        this.generation = 1;
        this.champion = null; // Best creature from previous generation
        this.allTimeChampion = null; // Best creature ever
        this.population = []; // Current generation's population
        this.instancesPerBlockConfig = 4; // How many movement variants per block configuration
        this.numConfigurations = 5; // How many different block configurations per generation
        this.blocksPerGeneration = 1; // How many blocks to add each generation (1-4)
        this.maxBlocks = 0; // Maximum blocks per creature (0 = unlimited)
        this.randomizeBlockCount = false; // If true, randomize block count from 1 to blocksPerGeneration
        this.enableLimbGeneration = false; // If true, new blocks can chain (attach to other new blocks)
        this.savedCreatures = []; // User-saved creatures
        
        // Fitness mode - determines how champions are selected
        // Options: 'distance', 'efficiency', 'jump', 'area', 'random'
        this.fitnessMode = 'random';
        
        // When fitnessMode is 'random', this holds the actual mode for current generation
        this.currentActiveMode = 'distance';
        
        // Track if we're using random mode selection
        this.isRandomMode = true;
        
        // Generation history for backtracking
        // Each entry: { generation, rankedPopulation, triedIndices, championFitness }
        this.generationHistory = [];
        
        // Track DNA segments that have been tried across all generations
        // Key: DNA segment (last block descriptor), Value: generation it was tried in
        // This prevents re-exploring identical evolutionary paths
        this.triedDNASegments = new Map();
        
        // Full evolution tree - tracks ALL evolutionary attempts including dead ends
        // Each node: { id, name, generation, fitness, blocks, distance, height, parentId, status, children }
        // status: 'champion' | 'dead_end' | 'defending' | 'backtrack_source'
        this.evolutionTree = [];
        this.nextNodeId = 1;
        this.currentBranchId = null; // ID of current champion node
        
        // Evolution event log - chronological record of what happened
        // Each event: { type, generation, details, timestamp }
        // Types: 'START', 'CHAMPION', 'DEAD_END', 'BACKTRACK', 'DEFENSE', 'PROGRESS', 'COMPLETE'
        this.evolutionEvents = [];
        
        // Track dead ends and completed lines for UI display
        this.deadEndCount = 0;
        this.backtrackCount = 0;
        this.completedLineCount = 0; // How many lines reached max blocks
        this.championDefenseCount = 0; // How many times defending champion won
        
        // Target metrics tracking for dead end detection
        // These are the metrics that must be beaten to make progress
        // They stay constant during backtracking until someone beats them
        this.targetFitness = 0;
        this.targetFitnessMode = 'distance';  // The mode used to calculate target fitness
        
        // Store all champion metrics so we can compare correctly for any fitness mode
        // These are set when a new champion is crowned
        this.targetDistance = 0;      // maxDistance achieved
        this.targetHeight = 0;        // maxHeight achieved
        this.targetTilesLit = 0;      // number of tiles lit up
        this.targetJumpHeight = 0;    // max jump height after landing
        
        // Load saved creatures from localStorage
        this.loadSavedCreatures();
    }
    
    /**
     * Set the fitness mode for evolution
     * @param {string} mode - 'distance', 'efficiency', 'jump', 'area', 'outcast', 'spartan', or 'random'
     */
    setFitnessMode(mode) {
        const validModes = ['distance', 'efficiency', 'jump', 'area', 'outcast', 'spartan', 'random'];
        if (validModes.includes(mode)) {
            this.fitnessMode = mode;
            this.isRandomMode = (mode === 'random');
            
            // If random, pick an initial mode
            if (this.isRandomMode) {
                this.currentActiveMode = this.pickRandomMode();
                console.log(`[DICE] Random mode enabled. Starting with: ${this.currentActiveMode}`);
            } else {
                this.currentActiveMode = mode;
                console.log(`[STAR] Fitness mode set to: ${mode}`);
            }
        } else {
            console.warn(`Invalid fitness mode: ${mode}. Using 'distance'.`);
            this.fitnessMode = 'distance';
            this.currentActiveMode = 'distance';
            this.isRandomMode = false;
        }
    }
    
    /**
     * Pick a random fitness mode from the concrete modes
     * Avoids picking the same mode twice in a row for variety
     * @returns {string} A randomly selected fitness mode
     */
    pickRandomMode() {
        // Get available modes, excluding the current one to prevent repeats
        let availableModes = CONCRETE_FITNESS_MODES.filter(mode => mode !== this.currentActiveMode);
        
        // Safety check: if somehow no modes available (shouldn't happen), use all modes
        if (availableModes.length === 0) {
            availableModes = CONCRETE_FITNESS_MODES;
        }
        
        const index = Math.floor(Math.random() * availableModes.length);
        return availableModes[index];
    }
    
    /**
     * Select a new random mode for the next generation (if in random mode)
     * Called at the start of each new generation
     */
    selectNextRandomMode() {
        if (this.isRandomMode) {
            const previousMode = this.currentActiveMode;
            this.currentActiveMode = this.pickRandomMode();
            console.log(`[DICE] Generation ${this.generation}: Mode changed from ${previousMode} to ${this.currentActiveMode}`);
        }
    }
    
    /**
     * Get the currently active fitness mode
     * (This is what should be used for fitness calculations)
     */
    getActiveMode() {
        return this.currentActiveMode;
    }
    
    /**
     * Get human-readable description of current fitness mode
     */
    getFitnessModeDescription() {
        const descriptions = {
            'distance': 'Distance - How far creatures travel from start',
            'efficiency': 'Efficiency - Distance per tile (straight-line movers win)',
            'jump': 'Jump Height - Max height after landing from spawn',
            'area': 'Area Coverage - Total tiles lit up',
            'outcast': 'Outcast - Most different from the crowd wins',
            'spartan': 'Spartan - Best overall metrics (well-rounded athletes win)',
            'random': 'Random - Mode changes each generation for variety'
        };
        return descriptions[this.fitnessMode] || descriptions['distance'];
    }
    
    // ========================================================================
    // DNA UNIQUENESS TRACKING
    // ========================================================================
    // Ensures we never re-explore identical evolutionary paths.
    // Each creature's DNA segment (last block descriptor) uniquely identifies
    // its structure. By tracking tried segments, we avoid:
    //   - Duplicate creatures in the same generation
    //   - Re-exploring previously failed genetic lines during backtracking
    //   - Wasting computation on evolutionary feedback loops
    
    /**
     * Check if a DNA segment has already been tried
     * @param {string} dnaSegment - The last DNA segment (block descriptor) to check
     * @returns {boolean} True if this segment was already tried
     */
    isDNASegmentTried(dnaSegment) {
        return this.triedDNASegments.has(dnaSegment);
    }
    
    /**
     * Register a DNA segment as tried
     * @param {string} dnaSegment - The DNA segment to register
     * @param {number} generation - The generation it was tried in
     */
    registerDNASegment(dnaSegment, generation) {
        if (!this.triedDNASegments.has(dnaSegment)) {
            this.triedDNASegments.set(dnaSegment, generation);
        }
    }
    
    /**
     * Check if a creature's behavioral configuration has been tried, and register it if not.
     * Uses behavioral fingerprint which includes everything that affects behavior:
     * blockID, parentID, side, variation, material, special (sensor type)
     * but EXCLUDES color since it's purely cosmetic.
     * 
     * @param {Creature} creature - The creature to check
     * @returns {boolean} True if this is a NEW (untried) creature, false if duplicate
     */
    tryRegisterCreature(creature) {
        // Use behavioral fingerprint - excludes color, includes everything else
        const fingerprint = creature.getBehavioralFingerprint();
        if (this.isDNASegmentTried(fingerprint)) {
            return false; // Already tried this configuration
        }
        this.registerDNASegment(fingerprint, this.generation);
        return true; // New configuration, successfully registered
    }
    
    /**
     * Get statistics about DNA tracking
     * @returns {Object} Stats about tried behavioral fingerprints
     */
    getDNATrackingStats() {
        const byGeneration = {};
        for (const [segment, gen] of this.triedDNASegments) {
            byGeneration[gen] = (byGeneration[gen] || 0) + 1;
        }
        return {
            totalTried: this.triedDNASegments.size,
            byGeneration: byGeneration
        };
    }
    
    /**
     * Get description of the currently active mode (for random mode display)
     */
    getActiveModeDescription() {
        const descriptions = {
            'distance': 'Distance',
            'efficiency': 'Efficiency', 
            'jump': 'Jump Height',
            'area': 'Area Coverage',
            'outcast': 'Outcast',
            'spartan': 'Spartan'
        };
        return descriptions[this.currentActiveMode] || 'Distance';
    }
    
    /**
     * Calculate fitness from raw metrics for a given mode
     * 
     * This is used to recalculate the target fitness when random mode
     * changes the fitness criteria between generations. We store the
     * champion's raw metrics, then recalculate what their fitness would
     * be under the new mode for fair comparison.
     * 
     * @param {number} distance - Max distance traveled
     * @param {number} height - Max height reached
     * @param {number} tilesLit - Number of tiles lit up
     * @param {number} jumpHeight - Max jump height after landing
     * @param {string} mode - The fitness mode to calculate for
     * @returns {number} The calculated fitness value
     */
    calculateFitnessFromMetrics(distance, height, tilesLit, jumpHeight, mode) {
        switch(mode) {
            case 'distance':
                return distance * 2.0 + height * 0.5;
                
            case 'efficiency':
                if (tilesLit > 0) {
                    return (distance / tilesLit) * 100 + height * 0.2;
                }
                return 0;
                
            case 'jump':
                return jumpHeight * 10.0 + distance * 0.1;
                
            case 'area':
                return tilesLit * 1.0 + distance * 0.05;
                
            case 'outcast':
                // For outcast mode, we can't recalculate without the full population
                // Use a composite score as approximation (same as creature.js fallback)
                return distance + height * 2 + tilesLit * 0.5 + jumpHeight * 5;
                
            case 'spartan':
                // Spartan mode: balanced combination of ALL metrics
                // Weights are tuned so each metric contributes roughly equally
                // based on typical good values (distance ~30m, height ~5m, tiles ~50, jump ~3m)
                return distance * 1.0 + height * 2.0 + tilesLit * 0.2 + jumpHeight * 3.0;
                
            default:
                return distance * 2.0 + height * 0.5;
        }
    }
    
    /**
     * Predict whether the best creature will make progress (beat the target fitness).
     * This is used to determine whether to show celebration or death animation.
     * 
     * @param {Creature} bestCreature - The best creature from this generation
     * @param {string} evaluationMode - The fitness mode being used for evaluation
     * @returns {Object} { willProgress: boolean, isFirstGeneration: boolean, isOutcastMode: boolean }
     */
    willMakeProgress(bestCreature, evaluationMode) {
        // Generation 1 always makes progress (establishing first champion)
        if (this.generation === 1) {
            return { willProgress: true, isFirstGeneration: true, isOutcastMode: false };
        }
        
        // Outcast mode always makes progress (no target to beat - strangest creature wins)
        if (evaluationMode === 'outcast') {
            return { willProgress: true, isFirstGeneration: false, isOutcastMode: true };
        }
        
        // Calculate the effective target fitness using current mode
        const effectiveTargetFitness = this.calculateFitnessFromMetrics(
            this.targetDistance,
            this.targetHeight,
            this.targetTilesLit,
            this.targetJumpHeight,
            evaluationMode
        );
        
        // Check if best creature beats the target
        const willProgress = bestCreature.fitness > effectiveTargetFitness;
        
        return { 
            willProgress: willProgress, 
            isFirstGeneration: false, 
            isOutcastMode: false,
            bestFitness: bestCreature.fitness,
            targetFitness: effectiveTargetFitness
        };
    }
    
    /**
     * Start a new evolution with generation 1 having 2 blocks
     * Each creature in generation 1 will have a different 2-block configuration
     * with multiple movement pattern variants per configuration
     * 
     * @param {number} instancesPerBlockConfig - How many movement variants per body structure (default 4)
     * @param {number} numConfigurations - How many different body structures to try (default 5)
     * @param {number} blocksPerGeneration - How many blocks to add each generation (default 1, max 4)
     * @param {boolean} randomizeBlockCount - If true, randomize from 1 to blocksPerGeneration (default false)
     * @param {boolean} enableLimbGeneration - If true, new blocks can chain together (default false)
     * @param {number} maxBlocks - Maximum blocks per creature, 0 = unlimited (default 0)
     */
    startEvolution(instancesPerBlockConfig = 4, numConfigurations = 5, blocksPerGeneration = 1, randomizeBlockCount = false, enableLimbGeneration = false, maxBlocks = 0) {
        this.generation = 1;
        this.instancesPerBlockConfig = instancesPerBlockConfig;
        this.numConfigurations = numConfigurations;  // Store the user's configuration count for use in subsequent generations
        this.blocksPerGeneration = Math.max(1, Math.min(4, blocksPerGeneration)); // Clamp to 1-4
        this.maxBlocks = maxBlocks;  // Store max blocks limit (0 = unlimited)
        this.randomizeBlockCount = randomizeBlockCount;
        this.enableLimbGeneration = enableLimbGeneration;
        this.champion = null;
        this.allTimeChampion = null;
        this.generationHistory = [];
        this.evolutionTree = []; // Reset evolution tree
        this.evolutionEvents = []; // Reset event log
        this.triedDNASegments = new Map(); // Reset DNA tracking
        this.nextNodeId = 1;
        this.currentBranchId = null;
        this.deadEndCount = 0;
        this.backtrackCount = 0;
        this.completedLineCount = 0;  // Reset completed lines counter
        this.championDefenseCount = 0;
        this.targetFitness = 0;  // Reset target fitness - must be beaten to make progress
        this.targetFitnessMode = null;  // Will be set when first champion is crowned
        this.targetDistance = 0;      // Reset all target metrics
        this.targetHeight = 0;
        this.targetTilesLit = 0;
        this.targetJumpHeight = 0;
        
        // If in random mode, pick the mode for generation 1
        if (this.isRandomMode) {
            this.currentActiveMode = this.pickRandomMode();
        }
        
        // Log evolution start with fitness mode
        this.logEvent('START', { 
            message: 'Evolution started with 2-block creatures',
            fitnessMode: this.fitnessMode,
            activeMode: this.currentActiveMode,
            blocksPerGeneration: this.blocksPerGeneration,
            maxBlocks: this.maxBlocks,
            randomizeBlockCount: this.randomizeBlockCount,
            enableLimbGeneration: this.enableLimbGeneration
        });
        
        // Generation 1: Create different 2-block configurations
        // Each configuration gets multiple instances with different movement patterns
        const numBlocks = 2;
        // numConfigurations is now a parameter instead of hardcoded
        
        console.log(`Starting evolution - Generation 1 with ${numBlocks} blocks`);
        console.log(`Blocks added per generation: ${this.blocksPerGeneration}${this.randomizeBlockCount ? ' (randomized 1-' + this.blocksPerGeneration + ')' : ''}`);
        console.log(`Limb generation: ${this.enableLimbGeneration ? 'ENABLED (chains allowed)' : 'DISABLED (original body only)'}`);
        if (this.isRandomMode) {
            console.log(`Fitness mode: RANDOM (this generation: ${this.currentActiveMode})`);
        } else {
            console.log(`Fitness mode: ${this.fitnessMode}`);
        }
        console.log(`Creating ${numConfigurations} configurations x ${this.instancesPerBlockConfig} movement variants = ${numConfigurations * this.instancesPerBlockConfig} total creatures`);
        
        this.population = [];
        
        // Create configurations, each with multiple movement variants
        for (let configIndex = 0; configIndex < numConfigurations; configIndex++) {
            // Use a consistent seed for the body structure
            const structureSeed = Math.floor(Math.random() * 1000000);
            
            // Create multiple instances of this configuration with different movements
            for (let variantIndex = 0; variantIndex < this.instancesPerBlockConfig; variantIndex++) {
                const creature = new Creature(null); // Don't auto-generate
                
                // Generate the body structure from the structure seed
                creature.generateBodyFromSeed(structureSeed, numBlocks);
                
                // Add any sensors set to 'start' mode to the creature
                let addedSensorCount = 0;
                if (typeof SensorConfig !== 'undefined' && SensorConfig.getStartTypes().length > 0) {
                    const sensorRng = new SeededRandom(structureSeed + variantIndex);
                    addedSensorCount = addAllEnabledSensors(creature, sensorRng);
                }
                
                // Generate unique movement patterns for this variant
                const movementSeed = Math.floor(Math.random() * 1000000);
                creature.generateMovementsFromSeed(movementSeed);
                
                // Create a combined seed for identification
                creature.seed = `s${structureSeed}_m${movementSeed}`;
                creature.structureSeed = structureSeed;
                creature.movementSeed = movementSeed;
                creature.configIndex = configIndex;
                creature.variantIndex = variantIndex;
                
                // Use last DNA segment as creature name - unique per evolutionary step,
                // consistent length, and directly represents this creature's latest block
                creature.name = creature.getLastDNASegment();
                creature.parentName = null; // Gen 1 has no parent
                creature.isDefendingChampion = false; // Gen 1 has no defending champion
                
                // VALIDATION: Verify block count (accounting for added sensors)
                const expectedBlocks = numBlocks + addedSensorCount;
                if (creature.blocks.length !== expectedBlocks) {
                    console.error(`[VALIDATION ERROR] ${creature.name} has ${creature.blocks.length} blocks, expected ${expectedBlocks}`);
                }
                
                // Check for DNA uniqueness - ensure we don't have duplicate creatures
                if (this.tryRegisterCreature(creature)) {
                    this.population.push(creature);
                } else {
                    // Extremely rare: regenerate with a different seed
                    console.warn(`[DNA] Duplicate detected in Gen 1, regenerating...`);
                    variantIndex--; // Retry this variant
                }
            }
        }
        
        // VALIDATION: Verify all Gen 1 creatures
        console.log(`\n=== Generation 1 Population Summary ===`);
        
        // Calculate expected block count (base blocks + any sensors in 'start' mode)
        let sensorCount = 0;
        if (typeof SensorConfig !== 'undefined' && SensorConfig.getStartTypes().length > 0) {
            sensorCount = SensorConfig.getStartTypes().length;
            console.log(`Base blocks: ${numBlocks}, Sensor blocks: ${sensorCount}`);
        }
        const expectedTotal = numBlocks + sensorCount;
        console.log(`Expected blocks per creature: ${expectedTotal}${sensorCount > 0 ? ` (${numBlocks} base + ${sensorCount} sensors)` : ''}`);
        
        let invalidCount = 0;
        for (let creature of this.population) {
            // Allow for slight variation if some sensors couldn't attach (no available faces)
            if (creature.blocks.length < numBlocks || creature.blocks.length > expectedTotal) {
                console.error(`[VALIDATION ERROR] ${creature.name} has ${creature.blocks.length} blocks, expected ${expectedTotal}`);
                invalidCount++;
            }
        }
        
        console.log(`Total population: ${this.population.length}`);
        console.log(`Configurations: ${numConfigurations} different body structures`);
        console.log(`Variants per config: ${this.instancesPerBlockConfig} movement patterns`);
        
        if (invalidCount > 0) {
            console.error(`[VALIDATION FAILED] ${invalidCount} creatures have incorrect block counts!`);
        } else {
            console.log(`[VALIDATION PASSED] All creatures have correct block counts`);
        }
        console.log(`========================================\n`);
    }
    
    /**
     * Continue evolution from the current state (used after loading a saved simulation).
     * Unlike startEvolution(), this does NOT reset the generation, champion, or history.
     * It only updates the configuration settings and prepares to evaluate the current population.
     * 
     * @param {number} instancesPerBlockConfig - How many movement variants per config
     * @param {number} numConfigurations - How many block configurations per generation
     * @param {number} blocksPerGeneration - How many blocks to add each generation
     * @param {boolean} randomizeBlockCount - If true, randomize block count
     * @param {boolean} enableLimbGeneration - If true, new blocks can chain
     * @param {number} maxBlocks - Maximum blocks per creature (0 = unlimited)
     */
    continueEvolution(instancesPerBlockConfig = 4, numConfigurations = 5, blocksPerGeneration = 1, randomizeBlockCount = false, enableLimbGeneration = false, maxBlocks = 0) {
        // Update configuration settings (these may have been changed in UI)
        this.instancesPerBlockConfig = instancesPerBlockConfig;
        this.numConfigurations = numConfigurations;
        this.blocksPerGeneration = Math.max(1, Math.min(4, blocksPerGeneration));
        this.maxBlocks = maxBlocks;
        this.randomizeBlockCount = randomizeBlockCount;
        this.enableLimbGeneration = enableLimbGeneration;
        
        console.log('\n' + '='.repeat(60));
        console.log('[CONTINUE] Resuming evolution from saved state');
        console.log('='.repeat(60));
        console.log(`   Generation: ${this.generation}`);
        console.log(`   Population: ${this.population.length} creatures`);
        console.log(`   Champion: ${this.champion ? this.champion.name : 'none'}`);
        console.log(`   Tree nodes: ${this.evolutionTree.length}`);
        console.log(`   Fitness mode: ${this.isRandomMode ? 'RANDOM' : this.fitnessMode} (active: ${this.currentActiveMode})`);
        console.log('='.repeat(60) + '\n');
        
        // Log the continuation event
        this.logEvent('CONTINUE', {
            message: 'Evolution resumed from saved state',
            generation: this.generation,
            populationSize: this.population.length,
            championName: this.champion ? this.champion.name : null,
            fitnessMode: this.fitnessMode,
            activeMode: this.currentActiveMode
        });
    }
    
    /**
     * Check if evolution has already started (has a valid population to continue from)
     * @returns {boolean} True if there's an existing population that can be continued
     */
    hasExistingPopulation() {
        return this.population && this.population.length > 0;
    }
    
    /**
     * Called when a generation's evaluation is complete
     * Handles dead end detection and backtracking
     * 
     * DEAD END DETECTION LOGIC:
     * - We track the champion's raw metrics (distance, height, tiles, jump)
     * - Each generation, we recalculate what the champion's fitness would be
     *   under the CURRENT generation's fitness mode
     * - This ensures fair comparison when random mode changes criteria
     * - If NO creature beats the recalculated target, it's a dead end
     * - On dead end, we backtrack to try alternative creatures from prior generations
     */
    onCreatureEvaluated(bestCreature, distance, height) {
        bestCreature.maxDistance = distance;
        bestCreature.maxHeight = height;
        
        // ALWAYS use the current generation's mode for evaluation
        // This ensures fair comparison - all creatures in this generation
        // are evaluated with the same criteria
        const evaluationMode = this.currentActiveMode;
        
        // Calculate fitness for the best creature and ALL creatures using current mode
        bestCreature.calculateFitness(evaluationMode);
        
        // Calculate fitness for ALL creatures in the population and rank them
        for (let creature of this.population) {
            creature.calculateFitness(evaluationMode);
        }
        const rankedPopulation = this.rankPopulationWithMode(evaluationMode);
        
        // The actual best creature is the top of the ranked list
        const actualBest = rankedPopulation[0].creature;
        const actualBestFitness = rankedPopulation[0].fitness;
        
        // Recalculate what the previous champion's fitness would be under the CURRENT mode
        // This is the effective target to beat - the champion's performance re-evaluated
        // with this generation's fitness criteria
        const effectiveTargetFitness = this.calculateFitnessFromMetrics(
            this.targetDistance,
            this.targetHeight,
            this.targetTilesLit,
            this.targetJumpHeight,
            evaluationMode
        );
        
        const modeDisplay = this.isRandomMode 
            ? `RANDOM (this gen: ${evaluationMode})` 
            : evaluationMode;
        console.log(`\n${'='.repeat(50)}`);
        console.log(`Generation ${this.generation} complete! (Mode: ${modeDisplay})`);
        console.log(`Best fitness this gen: ${actualBestFitness.toFixed(2)} (${actualBest.name})`);
        if (this.isRandomMode && this.targetFitnessMode && this.targetFitnessMode !== evaluationMode) {
            console.log(`Champion's original fitness (${this.targetFitnessMode}): ${this.targetFitness.toFixed(2)}`);
            console.log(`Champion recalculated for ${evaluationMode}: ${effectiveTargetFitness.toFixed(2)}`);
        }
        console.log(`Target fitness to beat: ${effectiveTargetFitness.toFixed(2)}`);
        console.log(`${'='.repeat(50)}`);
        
        // === GENERATION 1 SPECIAL CASE ===
        // No target to beat yet - just pick the best and set initial target
        if (this.generation === 1) {
            console.log(`[GENESIS] First generation - establishing initial champion`);
            
            this.champion = actualBest.clone();
            this.targetFitness = actualBestFitness;
            this.targetFitnessMode = this.currentActiveMode;  // Record which mode was used
            
            // Store all champion metrics for recalculation in any fitness mode
            this.targetDistance = actualBest.maxDistance;
            this.targetHeight = actualBest.maxHeight;
            this.targetTilesLit = actualBest.getTileCount ? actualBest.getTileCount() : 0;
            this.targetJumpHeight = actualBest.maxJumpHeight || 0;
            
            // Save to history
            this.saveGenerationToHistory(rankedPopulation, actualBestFitness);
            
            // Add ALL creatures from this generation to tree (no parent for gen 1)
            this.addGenerationToTree(rankedPopulation, 0, 'genesis', null);
            
            // Update all-time champion
            this.allTimeChampion = actualBest.clone();
            
            // Log event with all metrics
            this.logEvent('PROGRESS', {
                creatureName: actualBest.name,
                fitness: actualBestFitness,
                blocks: actualBest.blocks.length,
                message: 'First champion established',
                // Include all metrics for complete tracking
                distance: actualBest.maxDistance,
                height: actualBest.maxHeight,
                tilesLit: actualBest.getTileCount ? actualBest.getTileCount() : 0,
                jumpHeight: actualBest.maxJumpHeight || 0,
                fitnessMode: this.currentActiveMode
            });
            
            console.log(`   Champion: "${this.champion.name}" with ${this.champion.blocks.length} blocks`);
            console.log(`   Target fitness set to: ${this.targetFitness.toFixed(2)}`);
            console.log(`   Target metrics - Distance: ${this.targetDistance.toFixed(2)}m, Height: ${this.targetHeight.toFixed(2)}m, Tiles: ${this.targetTilesLit}, Jump: ${this.targetJumpHeight.toFixed(2)}m`);
            console.log(`   This champion will be defending in Generation ${this.generation + 1}`);
            
            // Start next generation
            this.generation++;
            if (this.isRandomMode) {
                this.selectNextRandomMode();
                console.log(`   Next generation will use mode: ${this.currentActiveMode}`);
            }
            this.createNextGeneration(this.champion);
            return;
        }
        
        // === CHECK FOR PROGRESS OR DEAD END ===
        // Did ANYONE beat the effective target fitness (champion recalculated with current mode)?
        // 
        // SPECIAL CASE: Outcast mode always makes progress because fitness is relative
        // to the current population. The "most different" creature always wins by definition.
        // There's no meaningful target to beat - whoever is strangest wins that round.
        const isOutcastMode = (evaluationMode === 'outcast');
        const madeProgress = isOutcastMode || (actualBestFitness > effectiveTargetFitness);
        
        if (isOutcastMode) {
            console.log(`[OUTCAST] Outcast mode - strangest creature always wins (no dead ends possible)`);
        }
        
        if (madeProgress) {
            // === PROGRESS! ===
            if (isOutcastMode) {
                console.log(`[STAR] OUTCAST WINNER! Most unique creature: ${actualBest.name} (score: ${actualBestFitness.toFixed(2)})`);
            } else {
                console.log(`[STAR] PROGRESS! Beat target fitness by ${(actualBestFitness - effectiveTargetFitness).toFixed(2)}`);
            }
            
            // Check if it was the defending champion or a new variant
            if (actualBest.isDefendingChampion) {
                // Defending champion itself exceeded its prior record (rare but possible)
                if (isOutcastMode) {
                    console.log(`   Defending champion was the most unique!`);
                } else {
                    console.log(`   Defending champion exceeded its own record!`);
                }
            } else {
                if (isOutcastMode) {
                    console.log(`   New creature was the strangest: ${actualBest.name}`);
                } else {
                    console.log(`   New creature beat the target: ${actualBest.name}`);
                }
            }
            
            // Save this generation's results to history
            this.saveGenerationToHistory(rankedPopulation, actualBestFitness);
            
            // NOTE: Movement reinforcement removed - it bypassed the DNA-based deterministic system
            // Changes made by reinforceMovements were lost on save/load since they weren't encoded in DNA
            
            // Add ALL creatures from this generation to tree
            // Parent is the current branch (the creature they evolved from)
            this.addGenerationToTree(rankedPopulation, 0, 'progress', this.currentBranchId);
            
            // Log progress event with all metrics
            this.logEvent('PROGRESS', {
                creatureName: actualBest.name,
                fitness: actualBestFitness,
                previousTarget: effectiveTargetFitness,
                improvement: isOutcastMode ? null : (actualBestFitness - effectiveTargetFitness),
                blocks: actualBest.blocks.length,
                // Include all metrics for complete tracking
                distance: actualBest.maxDistance,
                height: actualBest.maxHeight,
                tilesLit: actualBest.getTileCount ? actualBest.getTileCount() : 0,
                jumpHeight: actualBest.maxJumpHeight || 0,
                fitnessMode: this.currentActiveMode,
                isOutcastWin: isOutcastMode  // Flag for outcast mode (no target comparison)
            });
            
            // Update champion and target
            this.champion = actualBest.clone();
            this.targetFitness = actualBestFitness;
            this.targetFitnessMode = this.currentActiveMode;  // Record which mode was used
            
            // Store all champion metrics for recalculation in any fitness mode
            this.targetDistance = actualBest.maxDistance;
            this.targetHeight = actualBest.maxHeight;
            this.targetTilesLit = actualBest.getTileCount ? actualBest.getTileCount() : 0;
            this.targetJumpHeight = actualBest.maxJumpHeight || 0;
            
            console.log(`   New champion: "${this.champion.name}" with ${this.champion.blocks.length} blocks`);
            console.log(`   Champion was defending: ${actualBest.isDefendingChampion || false}`);
            console.log(`   New target fitness: ${this.targetFitness.toFixed(2)}`);
            console.log(`   Target metrics - Distance: ${this.targetDistance.toFixed(2)}m, Height: ${this.targetHeight.toFixed(2)}m, Tiles: ${this.targetTilesLit}, Jump: ${this.targetJumpHeight.toFixed(2)}m`);
            console.log(`   This champion will be defending in Generation ${this.generation + 1}`);
            
            // Update all-time champion
            if (!this.allTimeChampion || actualBestFitness > this.allTimeChampion.fitness) {
                this.allTimeChampion = actualBest.clone();
            }
            
            // Reset defense count since we made progress
            this.championDefenseCount = 0;
            
            // === CHECK FOR MAX BLOCKS LIMIT ===
            // If max blocks is set and champion has reached or exceeded the limit,
            // this genetic line is complete - backtrack to explore other paths
            if (this.maxBlocks > 0 && this.champion.blocks.length >= this.maxBlocks) {
                this.completedLineCount++;
                
                console.log(`\n[COMPLETE] Genetic line reached max blocks limit (${this.maxBlocks})!`);
                console.log(`   Champion "${this.champion.name}" has ${this.champion.blocks.length} blocks`);
                console.log(`   This line is marked as COMPLETE - backtracking to explore other paths`);
                
                // Log the completion event
                this.logEvent('COMPLETE', {
                    creatureName: this.champion.name,
                    fitness: actualBestFitness,
                    blocks: this.champion.blocks.length,
                    maxBlocks: this.maxBlocks,
                    message: `Genetic line complete at ${this.champion.blocks.length} blocks`,
                    distance: this.champion.maxDistance,
                    height: this.champion.maxHeight,
                    tilesLit: this.champion.getTileCount ? this.champion.getTileCount() : 0,
                    jumpHeight: this.champion.maxJumpHeight || 0,
                    fitnessMode: this.currentActiveMode,
                    totalCompleted: this.completedLineCount
                });
                
                // Save this generation to history before backtracking
                this.saveGenerationToHistory(rankedPopulation, actualBestFitness);
                
                // Use the same backtracking logic as dead ends
                console.log(`[BACKTRACK] Searching for alternative evolutionary paths...`);
                const backtrackResult = this.handleCompletedLine(rankedPopulation);
                
                if (!backtrackResult.success) {
                    // No more paths to explore - evolution is truly complete
                    console.log(`[EVOLUTION COMPLETE] All genetic lines have been explored!`);
                    console.log(`   Total completed lines: ${this.completedLineCount}`);
                    console.log(`   Total dead ends: ${this.deadEndCount}`);
                    console.log(`   Total backtracks: ${this.backtrackCount}`);
                    
                    this.logEvent('COMPLETE', {
                        message: 'All evolutionary paths explored',
                        totalCompleted: this.completedLineCount,
                        totalDeadEnds: this.deadEndCount,
                        totalBacktracks: this.backtrackCount
                    });
                }
                // If backtrack succeeded, handleCompletedLine already set up the next generation
                return;
            }
            
            // Start next generation
            this.generation++;
            if (this.isRandomMode) {
                this.selectNextRandomMode();
            }
            this.createNextGeneration(this.champion);
            
        } else {
            // === DEAD END ===
            // No creature beat the effective target fitness - this is a dead end
            this.deadEndCount++;
            
            // Check if defending champion won (but didn't beat target)
            const defendingChampionWon = actualBest.isDefendingChampion;
            
            if (defendingChampionWon) {
                this.championDefenseCount++;
                console.log(`[SHIELD] Defending champion held but didn't improve (Defense #${this.championDefenseCount})`);
            }
            
            console.log(`[DEAD END #${this.deadEndCount}] No creature beat target fitness ${effectiveTargetFitness.toFixed(2)}`);
            console.log(`   Best this generation: ${actualBestFitness.toFixed(2)} (${actualBest.name})`);
            console.log(`   Shortfall: ${(effectiveTargetFitness - actualBestFitness).toFixed(2)}`);
            
            // Add ALL creatures from this generation to tree as dead end / eliminated
            // Parent is the current branch (the creature they evolved from)
            this.addGenerationToTree(rankedPopulation, 0, 'dead_end', this.currentBranchId);
            
            // Log dead end event
            this.logEvent('DEAD_END', {
                bestCreatureName: actualBest.name,
                bestFitness: actualBestFitness,
                targetFitness: effectiveTargetFitness,
                shortfall: effectiveTargetFitness - actualBestFitness,
                wasDefendingChampion: defendingChampionWon,
                fitnessMode: evaluationMode
            });
            
            // Save this generation to history before backtracking
            this.saveGenerationToHistory(rankedPopulation, actualBestFitness);
            
            // === ATTEMPT BACKTRACKING ===
            console.log(`[BACKTRACK] Attempting to find alternative evolutionary path...`);
            const backtrackResult = this.handleDeadEnd(rankedPopulation);
            
            if (!backtrackResult.success) {
                // All alternatives exhausted - evolution is stuck
                console.log(`[EXHAUSTED] All evolutionary paths exhausted!`);
                console.log(`   Could not find any creature to beat target fitness ${effectiveTargetFitness.toFixed(2)}`);
                console.log(`   Evolution has reached its limit with current genetic pool.`);
                
                // Log exhaustion event
                this.logEvent('EXHAUSTED', {
                    targetFitness: effectiveTargetFitness,
                    totalDeadEnds: this.deadEndCount,
                    totalBacktracks: this.backtrackCount
                });
                
                // Continue with the best we have (defending champion)
                // but don't update target - we're stuck
                console.log(`   Continuing with current champion: ${this.champion.name}`);
                this.generation++;
                if (this.isRandomMode) {
                    this.selectNextRandomMode();
                }
                this.createNextGeneration(this.champion);
            }
            // If backtrack succeeded, handleDeadEnd already set up the next generation
        }
    }
    
    /**
     * Rank the current population by fitness using a specific mode (best first)
     * Returns array of { creature, index, fitness }
     * 
     * For 'outcast' mode, we calculate how different each creature is from the
     * population average - the most unique creature wins.
     */
    rankPopulationWithMode(mode) {
        // Special handling for 'outcast' mode - requires population-level analysis
        if (mode === 'outcast') {
            return this.rankPopulationByOutcast();
        }
        
        // Standard fitness modes - calculate fitness per creature
        const ranked = this.population.map((creature, index) => {
            creature.calculateFitness(mode);
            return {
                creature: creature.clone(),
                index: index,
                fitness: creature.fitness
            };
        });
        
        // Sort by fitness descending (best first)
        ranked.sort((a, b) => b.fitness - a.fitness);
        
        return ranked;
    }
    
    /**
     * Rank population by "outcast" fitness - most different from average wins
     * 
     * Calculates deviation from population average across all metrics:
     * - distance, height, tiles lit, jump height
     * 
     * Each metric is normalized (0-1) before calculating deviation so that
     * different scales don't dominate. The creature furthest from "normal" wins.
     */
    rankPopulationByOutcast() {
        if (this.population.length === 0) return [];
        
        // First pass: gather all metrics and find ranges for normalization
        const metrics = this.population.map((creature, index) => {
            const tilesCount = creature.tilesLit ? creature.tilesLit.length : 0;
            return {
                index: index,
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
        
        console.log(`[OUTCAST] Population averages (normalized): dist=${avgDistance.toFixed(3)}, height=${avgHeight.toFixed(3)}, tiles=${avgTiles.toFixed(3)}, jump=${avgJump.toFixed(3)}`);
        
        // Second pass: calculate "outcast score" (deviation from average)
        const ranked = metrics.map(m => {
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
            
            return {
                creature: m.creature.clone(),
                index: m.index,
                fitness: outcastScore
            };
        });
        
        // Sort by outcast score descending (most different first)
        ranked.sort((a, b) => b.fitness - a.fitness);
        
        // Log the most outcast creature
        if (ranked.length > 0) {
            const winner = ranked[0];
            console.log(`[OUTCAST] Most unique: ${winner.creature.name} with outcast score ${winner.fitness.toFixed(2)}`);
        }
        
        return ranked;
    }
    
    /**
     * Rank the current population by fitness using the current active mode
     * (Legacy method for backward compatibility)
     */
    rankPopulation() {
        return this.rankPopulationWithMode(this.currentActiveMode);
    }
    
    /**
     * Log an evolution event
     */
    logEvent(type, details) {
        this.evolutionEvents.push({
            type: type,
            generation: this.generation,
            details: details,
            timestamp: Date.now()
        });
    }
    

    /**
     * Add ALL creatures from a generation to the evolution tree
     * This gives us a complete picture of evolution, not just the winners
     * 
     * @param {Array} rankedPopulation - Array of {creature, index, fitness} sorted by fitness
     * @param {number} championIndex - Index of the creature that won (usually 0)
     * @param {string} generationOutcome - 'progress' (champion selected), 'dead_end' (no progress), 'genesis' (first gen)
     * @param {number|null} parentNodeId - The tree node ID of the parent creature (null for gen 1)
     */
    addGenerationToTree(rankedPopulation, championIndex, generationOutcome, parentNodeId = null) {
        console.log(`[TREE] Adding generation ${this.generation} to tree (${rankedPopulation.length} creatures, outcome: ${generationOutcome})`);
        
        const nodeIds = [];
        
        for (let rank = 0; rank < rankedPopulation.length; rank++) {
            const entry = rankedPopulation[rank];
            const creature = entry.creature;
            
            // Determine status based on rank and outcome
            let status;
            if (generationOutcome === 'genesis') {
                // First generation - winner becomes champion, others are competitors
                status = (rank === championIndex) ? 'champion' : 'competitor';
            } else if (generationOutcome === 'progress') {
                // Made progress - winner becomes champion, others are competitors
                status = (rank === championIndex) ? 'champion' : 'competitor';
            } else if (generationOutcome === 'dead_end') {
                // Dead end - best creature is the dead_end, others are eliminated
                status = (rank === 0) ? 'dead_end' : 'eliminated';
            } else {
                status = 'competitor';
            }
            
            const nodeId = this.nextNodeId++;
            
            const node = {
                id: nodeId,
                name: creature.name || `G${this.generation}_Unknown`,
                generation: this.generation,
                fitness: creature.fitness,
                blocks: creature.blocks.length,
                rank: rank,  // Their rank in this generation (0 = best)
                // All metrics for complete tracking
                distance: creature.maxDistance || 0,
                height: creature.maxHeight || 0,
                tilesLit: creature.getTileCount ? creature.getTileCount() : 0,
                jumpHeight: creature.maxJumpHeight || 0,
                // Parent relationship - all creatures in a gen share the same parent
                parentId: parentNodeId,
                parentName: creature.parentName || null,
                status: status,
                children: [],
                // Track which fitness mode was being used when this creature was evaluated
                fitnessMode: this.currentActiveMode,
                // Was this the defending champion (unchanged from previous gen)?
                isDefendingChampion: creature.isDefendingChampion || false,
                // Store a clone for tournaments (only for champions and potential backtracks)
                creatureClone: (status === 'champion' || status === 'competitor' || status === 'dead_end') 
                    ? creature.clone() : null,
                // Species tracking - creatures with same structural fingerprint have identical body plans
                // Use getStructuralFingerprint() which captures the block connections (not movement)
                speciesId: creature.getStructuralFingerprint ? creature.getStructuralFingerprint() : 
                           (creature.structureSeed || null),
                configIndex: creature.configIndex !== undefined ? creature.configIndex : null,
                variantIndex: creature.variantIndex !== undefined ? creature.variantIndex : null,
                // Sensor/special block tracking
                sensors: creature.getSpecialBlocks ? creature.getSpecialBlocks().map(s => s.type) : [],
                lastAddedSensor: creature.lastAddedSensor || null
            };
            
            // Add child reference to parent
            if (parentNodeId !== null) {
                const parent = this.evolutionTree.find(n => n.id === parentNodeId);
                if (parent) {
                    parent.children.push(nodeId);
                }
            }
            
            this.evolutionTree.push(node);
            nodeIds.push(nodeId);
            
            // Update current branch if this is the champion
            if (status === 'champion') {
                this.currentBranchId = nodeId;
                console.log(`   Champion: ${node.name} (node #${nodeId})`);
            }
        }
        
        console.log(`   Added ${nodeIds.length} nodes to tree (IDs: ${nodeIds[0]}...${nodeIds[nodeIds.length-1]})`);
        return nodeIds;
    }

    /**
     * Add a node to the evolution tree
     * @param {Creature} creature - The creature to add
     * @param {string} status - 'champion', 'dead_end', 'defending', 'backtrack_source'
     */
    addTreeNode(creature, status) {
        const nodeId = this.nextNodeId++;
        
        // Get species fingerprint - creatures with same structure are same species
        // This is based on block connections, not movement variation
        const speciesFingerprint = creature.getStructuralFingerprint ? 
            creature.getStructuralFingerprint() : (creature.structureSeed || null);
        
        const node = {
            id: nodeId,
            // Full DNA segment as the creature's name/identifier
            // This is the last block descriptor, showing exactly what was added
            name: creature.name || `Gen${this.generation}_Unknown`,
            generation: this.generation,
            fitness: creature.fitness,
            blocks: creature.blocks.length,
            // All metrics for complete tracking
            distance: creature.maxDistance,
            height: creature.maxHeight,
            tilesLit: creature.getTileCount ? creature.getTileCount() : 0,
            jumpHeight: creature.maxJumpHeight || 0,
            parentId: this.currentBranchId,
            parentName: creature.parentName || null,
            status: status,
            children: [],
            // Track which fitness mode was being used when this node was evaluated
            // Especially useful for dead ends to show what mode they failed in
            fitnessMode: this.currentActiveMode,
            // Store a clone of the creature so we can recreate it for tournaments
            // This ensures we can always access the champion regardless of generation history
            creatureClone: creature.clone(),
            // Species tracking - structural fingerprint groups creatures by body plan
            // Two creatures are same species if they have identical block connections
            // but may differ in movement variation (V values in DNA)
            speciesId: speciesFingerprint,
            configIndex: creature.configIndex !== undefined ? creature.configIndex : null,
            variantIndex: creature.variantIndex !== undefined ? creature.variantIndex : null,
            // Sensor/special block tracking
            sensors: creature.getSpecialBlocks ? creature.getSpecialBlocks().map(s => s.type) : [],
            lastAddedSensor: creature.lastAddedSensor || null
        };
        
        // Add child reference to parent
        if (this.currentBranchId !== null) {
            const parent = this.evolutionTree.find(n => n.id === this.currentBranchId);
            if (parent) {
                parent.children.push(nodeId);
            }
        }
        
        this.evolutionTree.push(node);
        
        // Update current branch if this is a champion (not dead end)
        if (status === 'champion') {
            this.currentBranchId = nodeId;
        }
        
        console.log(`[TREE] Added ${node.name} (Gen ${node.generation}) as ${status} (node #${nodeId})`);
        return nodeId;
    }
    
    /**
     * Mark a node as backtrack source (we're branching from here)
     */
    markBacktrackSource(nodeId) {
        const node = this.evolutionTree.find(n => n.id === nodeId);
        if (node && node.status === 'champion') {
            node.status = 'backtrack_source';
        }
    }
    
    /**
     * Mark a competitor node as being tried as an alternative parent
     * Called when backtracking selects this creature for evolution
     */
    markCompetitorAsTried(generation, rank) {
        // Find the node for this creature
        const node = this.evolutionTree.find(n => 
            n.generation === generation && 
            n.rank === rank && 
            n.status === 'competitor'
        );
        if (node) {
            node.status = 'branch_parent';
            this.currentBranchId = node.id;
            console.log(`[TREE] Marked ${node.name} as branch_parent (node #${node.id})`);
            return node.id;
        }
        return null;
    }
    
    /**
     * Get the full evolution tree data for UI display
     */
    getEvolutionTreeData() {
        // Count unique species (by structureSeed/speciesId)
        const uniqueSpecies = new Set();
        for (const node of this.evolutionTree) {
            if (node.speciesId !== null && node.speciesId !== undefined) {
                uniqueSpecies.add(node.speciesId);
            }
        }
        
        return {
            nodes: this.evolutionTree,
            events: this.evolutionEvents,
            currentBranchId: this.currentBranchId,
            stats: {
                totalNodes: this.evolutionTree.length,
                champions: this.evolutionTree.filter(n => n.status === 'champion').length,
                deadEnds: this.evolutionTree.filter(n => n.status === 'dead_end').length,
                eliminated: this.evolutionTree.filter(n => n.status === 'eliminated').length,
                competitors: this.evolutionTree.filter(n => n.status === 'competitor').length,
                branchParents: this.evolutionTree.filter(n => n.status === 'branch_parent').length,
                backtrackSources: this.evolutionTree.filter(n => n.status === 'backtrack_source').length,
                species: uniqueSpecies.size  // Count of unique body configurations
            }
        };
    }
    
    /**
     * Get evolution lineage (successful path only) for backward compatibility
     */
    getEvolutionLineage() {
        // Return only champion nodes in order
        return this.evolutionTree
            .filter(n => n.status === 'champion' || n.status === 'backtrack_source')
            .sort((a, b) => a.generation - b.generation);
    }
    
    /**
     * Get historical champions for Tournament of Champions
     * 
     * Returns an array of champion data objects, each containing:
     * - All the metrics from the evolution tree node
     * - A recreated Creature object ready for simulation
     * 
     * Champions include both 'champion' and 'backtrack_source' status nodes,
     * since backtrack sources were also champions at their time.
     * 
     * Champions are sorted by:
     * 1. Generation (highest/most recent first)
     * 2. Fitness (best first) for creatures of the same generation
     * 
     * @param {number} maxChampions - Maximum number of champions to return (default 10)
     * @returns {Array} Array of { nodeData, creature } objects
     */
    getAllChampions(maxChampions = 10) {
        // Get all nodes that were champions (including those we branched from)
        let championNodes = this.evolutionTree.filter(n => 
            n.status === 'champion' || n.status === 'backtrack_source'
        );
        
        console.log(`[TOURNAMENT] Found ${championNodes.length} total historical champions`);
        
        // Sort champions:
        // 1. By generation DESCENDING (highest/most recent first)
        // 2. By fitness DESCENDING (best first) for same generation
        championNodes.sort((a, b) => {
            // First compare by generation (descending - higher gen first)
            if (b.generation !== a.generation) {
                return b.generation - a.generation;
            }
            // Same generation - compare by fitness (descending - higher fitness first)
            return b.fitness - a.fitness;
        });
        
        // Limit to the top N champions
        if (maxChampions > 0 && championNodes.length > maxChampions) {
            console.log(`[TOURNAMENT] Selecting top ${maxChampions} champions from ${championNodes.length} available`);
            championNodes = championNodes.slice(0, maxChampions);
        }
        
        // For each champion node, recreate the creature from stored clone
        // or fall back to generation history lookup for older nodes
        const champions = [];
        
        for (let node of championNodes) {
            let creature = null;
            
            // First, try to use the stored creature clone (new method - most reliable)
            if (node.creatureClone) {
                creature = node.creatureClone.clone();
                console.log(`   - Gen ${node.generation}: ${node.name} - Using stored clone`);
            }
            
            // Fall back to generation history lookup (for older nodes without stored clone)
            if (!creature) {
                const historyEntry = this.generationHistory.find(h => h.generation === node.generation);
                
                if (historyEntry && historyEntry.rankedPopulation && historyEntry.rankedPopulation.length > 0) {
                    // Look for a creature matching this node's name
                    for (let ranked of historyEntry.rankedPopulation) {
                        if (ranked.creature.name === node.name) {
                            creature = ranked.creature.clone();
                            console.log(`   - Gen ${node.generation}: ${node.name} - Found in history by name`);
                            break;
                        }
                    }
                    
                    // If not found by name, use the first (champion) creature
                    if (!creature) {
                        creature = historyEntry.rankedPopulation[0].creature.clone();
                        console.log(`   - Gen ${node.generation}: ${node.name} - Using history fallback (first creature)`);
                    }
                }
            }
            
            // Last resort: check if it's the current champion
            if (!creature && this.champion && this.champion.name === node.name) {
                creature = this.champion.clone();
                console.log(`   - Gen ${node.generation}: ${node.name} - Using current champion`);
            }
            
            if (creature) {
                // Reset fitness tracking - tournament will re-evaluate
                creature.resetFitnessTracking();
                
                // Mark this as a tournament contestant with generation info
                creature.tournamentGeneration = node.generation;
                creature.tournamentOriginalFitness = node.fitness;
                
                champions.push({
                    nodeData: node,
                    creature: creature
                });
                
                console.log(`   - Gen ${node.generation}: ${node.name} (${node.blocks} blocks, original fitness: ${node.fitness.toFixed(2)})`);
            } else {
                console.warn(`   - Gen ${node.generation}: ${node.name} - Could not recreate creature!`);
            }
        }
        
        return champions;
    }
    
    /**
     * Get the count of available champions for tournament
     * @returns {number} Number of champions that can compete
     */
    getChampionCount() {
        return this.evolutionTree.filter(n => 
            n.status === 'champion' || n.status === 'backtrack_source'
        ).length;
    }
    
    /**
     * Get the evolution tree as a formatted string for display (legacy)
     */
    getEvolutionTree() {
        if (this.evolutionTree.length === 0) {
            return "No evolution history yet. Complete at least one generation.";
        }
        
        let tree = "[TREE] EVOLUTION TREE\n";
        tree += "=".repeat(40) + "\n\n";
        
        const champions = this.getEvolutionLineage();
        for (let i = 0; i < champions.length; i++) {
            const entry = champions[i];
            const isLast = i === champions.length - 1;
            const prefix = isLast ? "`-- " : "+-- ";
            const connector = isLast ? "    " : "|   ";
            
            tree += prefix + `[CROWN] ${entry.name}\n`;
            tree += connector + `   Blocks: ${entry.blocks} | Fitness: ${entry.fitness.toFixed(2)}\n`;
            tree += connector + `   Distance: ${entry.distance.toFixed(2)}m | Height: ${entry.height.toFixed(2)}m\n`;
            
            if (!isLast) {
                tree += "|\n";
            }
        }
        
        tree += "\n" + "=".repeat(40) + "\n";
        tree += `Total Champions: ${champions.length}\n`;
        
        return tree;
    }
    
    /**
     * Save current generation to history for potential backtracking
     * 
     * We save the champion's RAW METRICS (distance, height, tiles, jump) so that
     * when we backtrack to this generation, we can restore the correct target.
     * 
     * When backtracking to generation N:
     * - We try an alternative creature from Gen N (not the original champion)
     * - That alternative gets evolved to create Gen N+1
     * - Gen N+1 must beat Gen N's CHAMPION (stored here as championDistance, etc.)
     * 
     * This ensures the target is always the best creature from the generation
     * we're backtracking to.
     */
    saveGenerationToHistory(rankedPopulation, championFitness) {
        // Get the champion creature (top ranked) to save its raw metrics
        const championCreature = rankedPopulation[0].creature;
        
        const historyEntry = {
            generation: this.generation,
            rankedPopulation: rankedPopulation, // All creatures ranked by fitness
            triedIndices: [0], // Rank 0 (the champion) has been tried
            championFitness: championFitness,
            // Save champion's raw metrics for proper backtrack target restoration
            // These metrics allow us to recalculate fitness for any mode
            championDistance: championCreature.maxDistance || 0,
            championHeight: championCreature.maxHeight || 0,
            championTilesLit: championCreature.getTileCount ? championCreature.getTileCount() : 0,
            championJumpHeight: championCreature.maxJumpHeight || 0,
            fitnessMode: this.currentActiveMode  // Mode used to calculate this fitness
        };
        
        // If we're overwriting due to backtracking, replace the entry
        const existingIndex = this.generationHistory.findIndex(h => h.generation === this.generation);
        if (existingIndex >= 0) {
            this.generationHistory[existingIndex] = historyEntry;
        } else {
            this.generationHistory.push(historyEntry);
        }
        
        console.log(`[SAVE] Saved generation ${this.generation} to history (${rankedPopulation.length} creatures ranked)`);
        console.log(`   Champion: "${championCreature.name}" - fitness=${championFitness.toFixed(2)}`);
        console.log(`   Champion metrics: dist=${historyEntry.championDistance.toFixed(2)}, height=${historyEntry.championHeight.toFixed(2)}, tiles=${historyEntry.championTilesLit}, jump=${historyEntry.championJumpHeight.toFixed(2)}`);
        
        // Log full ranking for debugging
        console.log(`   FULL RANKING (top 5):`);
        for (let i = 0; i < Math.min(5, rankedPopulation.length); i++) {
            const entry = rankedPopulation[i];
            const isDefending = entry.creature.isDefendingChampion ? ' [DEFENDING]' : '';
            console.log(`      Rank ${i}: "${entry.creature.name}" fitness=${entry.fitness.toFixed(2)}${isDefending}`);
        }
    }
    
    /**
     * Handle a dead end by backtracking to try alternative creatures
     * 
     * BACKTRACKING LOGIC:
     * When the current generation fails to beat its target, we backtrack to try
     * alternative creatures from prior generations. The process works as follows:
     * 
     * 1. Look at the previous generation (N-1) for untried creatures
     * 2. If found, use that creature as the evolutionary base for a new Gen N
     * 3. The new Gen N must beat Gen N-1's CHAMPION (not some older target)
     * 4. If no untried creatures in Gen N-1, go back to Gen N-2, and so on
     * 
     * Example: Gen 4 (from Gen 3 V1) fails to beat Gen 3's champion
     * - Try Gen 3 V2 as the new base
     * - Create new Gen 4 from V2
     * - New Gen 4 must beat Gen 3's champion (V1's metrics)
     * - If that fails, try Gen 3 V3, V4, etc.
     * - If all Gen 3 alternatives exhausted, backtrack to Gen 2
     * - Try Gen 2 V2 as base for new Gen 3
     * - New Gen 3 must beat Gen 2's champion
     * 
     * This ensures each evolutionary branch has a fair target:
     * the champion of the generation it's being created from.
     * 
     * Returns { success: boolean, rankTried: number }
     */
    handleDeadEnd(currentRankedPopulation) {
        this.backtrackCount++;
        
        // Calculate effective target for current mode
        const effectiveTarget = this.calculateFitnessFromMetrics(
            this.targetDistance,
            this.targetHeight,
            this.targetTilesLit,
            this.targetJumpHeight,
            this.currentActiveMode
        );
        
        console.log(`\n--- BACKTRACK ATTEMPT #${this.backtrackCount} ---`);
        console.log(`Current mode: ${this.currentActiveMode}`);
        console.log(`Effective target to beat: ${effectiveTarget.toFixed(2)}`);
        if (this.targetFitnessMode !== this.currentActiveMode) {
            console.log(`(Champion's original ${this.targetFitnessMode} fitness was: ${this.targetFitness.toFixed(2)})`);
        }
        
        // Look for an untried creature in the prior generation(s)
        let backtrackDepth = 1;
        
        while (backtrackDepth <= this.generationHistory.length) {
            const targetGeneration = this.generation - backtrackDepth;
            const historyEntry = this.generationHistory.find(h => h.generation === targetGeneration);
            
            if (!historyEntry) {
                console.log(`   No history for generation ${targetGeneration}`);
                backtrackDepth++;
                continue;
            }
            
            // Find the next untried creature in this generation
            const nextRank = this.findNextUntriedCreature(historyEntry);
            
            // Log what we're looking at for debugging
            console.log(`   Gen ${targetGeneration} history: triedIndices=[${historyEntry.triedIndices.join(', ')}], looking for nextRank...`);
            console.log(`   Gen ${targetGeneration} rankedPopulation (top 5):`);
            for (let i = 0; i < Math.min(5, historyEntry.rankedPopulation.length); i++) {
                const entry = historyEntry.rankedPopulation[i];
                const tried = historyEntry.triedIndices.includes(i) ? ' [TRIED]' : '';
                const isDefending = entry.creature.isDefendingChampion ? ' [DEFENDING]' : '';
                console.log(`      Rank ${i}: "${entry.creature.name}" fitness=${entry.fitness.toFixed(2)}${isDefending}${tried}`);
            }
            
            if (nextRank !== -1) {
                // Found an untried creature! Use it as the new base for evolution
                const alternativeCreature = historyEntry.rankedPopulation[nextRank].creature;
                
                // === VALIDATION: Ensure alternative has correct block count ===
                // Non-defending creatures in generation N should have more blocks than
                // the champion from generation N-1. Skip if this invariant is violated.
                if (alternativeCreature.isDefendingChampion) {
                    console.error(`[BUG] Defending champion should have been skipped by findNextUntriedCreature!`);
                    historyEntry.triedIndices.push(nextRank);
                    continue; // Try next generation in backtrack search
                }
                
                console.log(`[REWIND] Backtracking ${backtrackDepth} generation(s) to gen ${targetGeneration}`);
                console.log(`   Selected rank #${nextRank} (fitness=${historyEntry.rankedPopulation[nextRank].fitness.toFixed(2)}): "${alternativeCreature.name}"`);
                console.log(`   Alternative has ${alternativeCreature.blocks.length} blocks, isDefendingChampion=${alternativeCreature.isDefendingChampion || false}`);
                console.log(`   Note: Rank 0 was "${historyEntry.rankedPopulation[0].creature.name}" (the champion of gen ${targetGeneration})`);
                
                // Mark the competitor we're trying as a branch parent
                // This creature becomes the new evolutionary base
                const newBranchId = this.markCompetitorAsTried(targetGeneration, nextRank);
                
                // If we couldn't find the node (older tree structure), fall back to old behavior
                if (!newBranchId) {
                    // Mark current branch node as backtrack source (we're branching from here)
                    if (this.currentBranchId !== null) {
                        this.markBacktrackSource(this.currentBranchId);
                    }
                    
                    // Find the node we're backtracking TO and make it the current branch
                    const backtrackTargetNode = this.evolutionTree.find(n => 
                        n.generation === targetGeneration && 
                        (n.status === 'champion' || n.status === 'backtrack_source')
                    );
                    if (backtrackTargetNode) {
                        this.currentBranchId = backtrackTargetNode.id;
                    }
                }
                
                // Mark this creature as tried
                historyEntry.triedIndices.push(nextRank);
                
                // Reset to that generation + 1 (we're building from this alternative)
                this.generation = targetGeneration + 1;
                this.champion = alternativeCreature.clone();
                
                // === CORRECT TARGET RESTORATION ===
                // When backtracking to generation N to try an alternative creature:
                // - We evolve that alternative to create Gen N+1
                // - Gen N+1 must beat Gen N's CHAMPION (the best creature from Gen N)
                // - This ensures we're always trying to beat the best at each level
                //
                // Example: If we backtrack from Gen 4 to Gen 3 to try V2:
                // - Gen 4 (from V2) must beat Gen 3's champion (V1)
                // - NOT Gen 2's champion (that would be too easy)
                //
                // The historyEntry IS the generation we're backtracking to,
                // so we use ITS champion metrics as the target.
                
                // Track what target we restore to for logging
                let restoredFromGen = null;
                let newEffectiveTarget = 0;
                
                if (historyEntry.championDistance !== undefined) {
                    // Restore target from the champion of the generation we're backtracking to
                    this.targetFitness = historyEntry.championFitness;
                    this.targetFitnessMode = historyEntry.fitnessMode || 'distance';
                    this.targetDistance = historyEntry.championDistance;
                    this.targetHeight = historyEntry.championHeight;
                    this.targetTilesLit = historyEntry.championTilesLit;
                    this.targetJumpHeight = historyEntry.championJumpHeight;
                    restoredFromGen = targetGeneration;
                    
                    console.log(`   [TARGET RESTORED] From generation ${targetGeneration} champion:`);
                    console.log(`      Original fitness (${this.targetFitnessMode}): ${this.targetFitness.toFixed(2)}`);
                    console.log(`      Metrics: dist=${this.targetDistance.toFixed(2)}, height=${this.targetHeight.toFixed(2)}, tiles=${this.targetTilesLit}, jump=${this.targetJumpHeight.toFixed(2)}`);
                    
                    // Recalculate effective target for current mode
                    newEffectiveTarget = this.calculateFitnessFromMetrics(
                        this.targetDistance,
                        this.targetHeight,
                        this.targetTilesLit,
                        this.targetJumpHeight,
                        this.currentActiveMode
                    );
                    console.log(`      Effective target for ${this.currentActiveMode} mode: ${newEffectiveTarget.toFixed(2)}`);
                    
                } else if (targetGeneration === 1) {
                    // Backtracking to generation 1 - use Gen 1's champion as target
                    // (Gen 2 must beat Gen 1's champion)
                    // If Gen 1 history doesn't have metrics, any progress counts
                    this.targetFitness = historyEntry.championFitness || 0;
                    this.targetFitnessMode = this.currentActiveMode;
                    this.targetDistance = 0;
                    this.targetHeight = 0;
                    this.targetTilesLit = 0;
                    this.targetJumpHeight = 0;
                    restoredFromGen = 1;
                    newEffectiveTarget = this.targetFitness;
                    
                    console.log(`   [TARGET SET] From generation 1 champion: ${this.targetFitness.toFixed(2)}`);
                } else {
                    // Fallback: older history without metrics - keep current target
                    console.log(`   [WARNING] No metrics in history for gen ${targetGeneration}, keeping current target`);
                    newEffectiveTarget = effectiveTarget;
                }
                
                // Log backtrack event with restored target info
                this.logEvent('BACKTRACK', {
                    fromGeneration: this.generation,
                    toGeneration: targetGeneration,
                    depth: backtrackDepth,
                    alternativeName: alternativeCreature.name,
                    alternativeRank: nextRank + 1,
                    alternativeBlocks: alternativeCreature.blocks.length,
                    previousTargetFitness: effectiveTarget,       // What we were trying to beat before
                    restoredTargetFitness: newEffectiveTarget,    // What we need to beat now
                    restoredFromGeneration: restoredFromGen,
                    currentMode: this.currentActiveMode
                });
                
                console.log(`   New evolutionary base: ${this.champion.name} with ${this.champion.blocks.length} blocks`);
                
                // Remove history entries after this point (we're branching to a new path)
                this.generationHistory = this.generationHistory.filter(h => h.generation <= targetGeneration);
                
                // Create new population from this alternative champion
                // If it fails (e.g., champion already at max blocks), continue backtracking
                if (!this.createNextGeneration(this.champion)) {
                    console.log(`   [MAX BLOCKS] Alternative already at max blocks, continuing backtrack...`);
                    this.completedLineCount++;
                    backtrackDepth++;
                    continue;  // Try the next generation in backtrack search
                }
                
                return { success: true, rankTried: nextRank };
            }
            
            // All creatures in this generation have been tried, go back further
            console.log(`   All ${historyEntry.rankedPopulation.length} creatures in generation ${targetGeneration} exhausted`);
            backtrackDepth++;
        }
        
        // Could not find any untried alternatives
        console.log(`[X] Exhausted all backtracking options across ${backtrackDepth - 1} generations`);
        return { success: false, rankTried: -1 };
    }
    
    /**
     * Find the next untried creature in a generation's history
     * Returns the rank index, or -1 if all have been tried
     * 
     * IMPORTANT: Skips:
     * - Defending champions (they have fewer blocks and would cause regression)
     * - Creatures already at maxBlocks (can't add more blocks to them)
     */
    findNextUntriedCreature(historyEntry) {
        for (let rank = 0; rank < historyEntry.rankedPopulation.length; rank++) {
            if (!historyEntry.triedIndices.includes(rank)) {
                const creature = historyEntry.rankedPopulation[rank].creature;
                
                // Skip defending champions - they have fewer blocks and would cause regression
                if (creature && creature.isDefendingChampion) {
                    console.log(`   Skipping rank ${rank} (${creature.name}) - defending champion has fewer blocks`);
                    continue;
                }
                
                // Skip creatures already at max blocks - can't evolve them further
                if (this.maxBlocks > 0 && creature && creature.blocks.length >= this.maxBlocks) {
                    console.log(`   Skipping rank ${rank} (${creature.name}) - already at max blocks (${creature.blocks.length}/${this.maxBlocks})`);
                    continue;
                }
                
                return rank;
            }
        }
        return -1;
    }
    
    /**
     * Handle a completed genetic line by backtracking to explore other paths
     * 
     * This is called when a champion reaches the max blocks limit.
     * Unlike handleDeadEnd (fitness failure), this is a successful completion.
     * We look for untried creatures to start new evolutionary branches.
     * 
     * Returns { success: boolean, rankTried: number }
     */
    handleCompletedLine(currentRankedPopulation) {
        this.backtrackCount++;
        
        console.log(`\n--- BACKTRACK FROM COMPLETE LINE #${this.backtrackCount} ---`);
        console.log(`Current mode: ${this.currentActiveMode}`);
        console.log(`Looking for untried creatures to start new evolutionary branches...`);
        
        // Mark current branch node as complete (not dead_end)
        if (this.currentBranchId !== null) {
            const currentNode = this.evolutionTree.find(n => n.id === this.currentBranchId);
            if (currentNode) {
                currentNode.status = 'complete';
            }
        }
        
        // Look for an untried creature in the prior generation(s)
        let backtrackDepth = 1;
        
        while (backtrackDepth <= this.generationHistory.length) {
            const targetGeneration = this.generation - backtrackDepth;
            const historyEntry = this.generationHistory.find(h => h.generation === targetGeneration);
            
            if (!historyEntry) {
                console.log(`   No history for generation ${targetGeneration}`);
                backtrackDepth++;
                continue;
            }
            
            // Find the next untried creature in this generation
            const nextRank = this.findNextUntriedCreature(historyEntry);
            
            // Log what we're looking at for debugging
            console.log(`   Gen ${targetGeneration} history: triedIndices=[${historyEntry.triedIndices.join(', ')}]`);
            
            if (nextRank !== -1) {
                // Found an untried creature! Use it as the new base for evolution
                const alternativeCreature = historyEntry.rankedPopulation[nextRank].creature;
                
                // === VALIDATION: Ensure alternative has correct block count ===
                if (alternativeCreature.isDefendingChampion) {
                    console.error(`[BUG] Defending champion should have been skipped by findNextUntriedCreature!`);
                    historyEntry.triedIndices.push(nextRank);
                    continue; // Try next generation in backtrack search
                }
                
                console.log(`[REWIND] Backtracking ${backtrackDepth} generation(s) to gen ${targetGeneration}`);
                console.log(`   Selected rank #${nextRank}: "${alternativeCreature.name}" (${alternativeCreature.blocks.length} blocks)`);
                
                // Mark the competitor we're trying as a branch parent
                const newBranchId = this.markCompetitorAsTried(targetGeneration, nextRank);
                
                if (!newBranchId) {
                    // Fallback: find the node we're backtracking TO
                    const backtrackTargetNode = this.evolutionTree.find(n => 
                        n.generation === targetGeneration && 
                        (n.status === 'champion' || n.status === 'backtrack_source' || n.status === 'complete')
                    );
                    if (backtrackTargetNode) {
                        this.currentBranchId = backtrackTargetNode.id;
                    }
                }
                
                // Mark this creature as tried
                historyEntry.triedIndices.push(nextRank);
                
                // Reset to that generation + 1 (we're building from this alternative)
                this.generation = targetGeneration + 1;
                this.champion = alternativeCreature.clone();
                
                // Restore target metrics from the generation we're backtracking to
                if (historyEntry.championDistance !== undefined) {
                    this.targetFitness = historyEntry.championFitness;
                    this.targetFitnessMode = historyEntry.fitnessMode || 'distance';
                    this.targetDistance = historyEntry.championDistance;
                    this.targetHeight = historyEntry.championHeight;
                    this.targetTilesLit = historyEntry.championTilesLit;
                    this.targetJumpHeight = historyEntry.championJumpHeight;
                    
                    console.log(`   [TARGET RESTORED] From generation ${targetGeneration} champion`);
                }
                
                // Log backtrack event
                this.logEvent('BACKTRACK', {
                    fromGeneration: this.generation,
                    toGeneration: targetGeneration,
                    depth: backtrackDepth,
                    alternativeName: alternativeCreature.name,
                    alternativeRank: nextRank + 1,
                    alternativeBlocks: alternativeCreature.blocks.length,
                    reason: 'completed_line',
                    currentMode: this.currentActiveMode
                });
                
                console.log(`   New evolutionary base: ${this.champion.name} with ${this.champion.blocks.length} blocks`);
                
                // Remove history entries after this point (we're branching to a new path)
                this.generationHistory = this.generationHistory.filter(h => h.generation <= targetGeneration);
                
                // Create new population from this alternative champion
                // If it fails (e.g., champion already at max blocks), continue backtracking
                if (!this.createNextGeneration(this.champion)) {
                    console.log(`   [MAX BLOCKS] Alternative already at max blocks, continuing backtrack...`);
                    this.completedLineCount++;
                    backtrackDepth++;
                    continue;  // Try the next generation in backtrack search
                }
                
                return { success: true, rankTried: nextRank };
            }
            
            // All creatures in this generation have been tried, go back further
            console.log(`   All ${historyEntry.rankedPopulation.length} creatures in generation ${targetGeneration} exhausted`);
            backtrackDepth++;
        }
        
        // Could not find any untried alternatives
        console.log(`[X] All evolutionary paths have been explored`);
        return { success: false, rankTried: -1 };
    }
    
    /**
     * Create next generation population by adding a block to the champion
     * 
     * EVOLUTION APPROACH:
     * - The previous champion is included UNCHANGED (no new block) as a baseline
     * - Champion's existing movement patterns are PRESERVED exactly (reinforced learning)
     * - Only the NEW block's joint gets different movement patterns across variants
     * - This builds upon successful movement strategies rather than disrupting them
     * - Total population: 1 (champion) + 5 x 4 variants = 21 creatures
     * 
     * @returns {boolean} True if generation was created, false if champion is already at max blocks
     */
    createNextGeneration(championCreature) {
        this.population = [];
        
        // Get the parent name for all creatures in this generation
        // (Champion should always have a DNA-based name, fallback is just safety)
        const parentName = championCreature.name || `Gen${this.generation - 1}_Champion`;
        
        // Maximum blocks to add this generation (user configurable, 1-4)
        const maxBlocksToAdd = this.blocksPerGeneration || 1;
        
        // === EARLY EXIT: Check if champion is already at max blocks ===
        // If the champion already has maxBlocks, we can't add more blocks.
        // This line should be marked as complete and we should backtrack.
        if (this.maxBlocks > 0 && championCreature.blocks.length >= this.maxBlocks) {
            console.log(`\n=== Cannot Create Generation ${this.generation} ===`);
            console.log(`Champion "${parentName}" already has ${championCreature.blocks.length} blocks (max: ${this.maxBlocks})`);
            console.log(`This genetic line is COMPLETE - returning false to trigger backtracking`);
            return false;  // Signal that we couldn't create a generation
        }
        
        // Log champion details for debugging
        console.log(`\n=== Creating Generation ${this.generation} ===`);
        console.log(`Champion: ${parentName}`);
        console.log(`Champion blocks: ${championCreature.blocks.length}`);
        console.log(`Champion joints: ${championCreature.joints.length}`);
        console.log(`Max blocks to add: ${maxBlocksToAdd}${this.randomizeBlockCount ? ' (randomized 1-' + maxBlocksToAdd + ')' : ''}`);
        console.log(`Limb generation: ${this.enableLimbGeneration ? 'ENABLED' : 'DISABLED'}`);
        
        // FIRST: Include the previous champion unchanged (no new block added)
        // This serves as a baseline - if new block additions don't help, champion can still win
        const championClone = championCreature.clone();
        
        // Reset ALL fitness tracking for the clone (will be re-evaluated fresh)
        championClone.fitness = 0;
        championClone.maxDistance = 0;
        championClone.maxHeight = 0;
        championClone.tilesLit = [];
        championClone.maxJumpHeight = 0;
        championClone.hasLandedAfterSpawn = false;
        championClone.groundedY = 0;
        
        championClone.seed = championCreature.seed + '_champ';
        championClone.configIndex = -1;  // Special index to identify as the unchanged champion
        championClone.variantIndex = 0;
        championClone.isDefendingChampion = true;  // Flag to identify in UI
        // Defending champion keeps its DNA-based name (same as parent since no new blocks)
        championClone.name = championClone.getLastDNASegment();
        championClone.parentName = parentName;
        this.population.push(championClone);
        
        console.log(`Including previous champion "${championCreature.name}" (${championCreature.blocks.length} blocks) as defending baseline`);
        console.log(`   -> Defending champion: ${championClone.name}`);
        
        // Get all available attachment points from the champion
        let attachmentPoints = championCreature.getAvailableAttachmentPoints();
        
        // Limit configurations to user's setting (stored from startEvolution)
        // This ensures subsequent generations respect the original configuration count
        const maxConfigurations = this.numConfigurations || 5;  // Fall back to 5 if not set
        if (attachmentPoints.length > maxConfigurations) {
            // Shuffle and take the configured number to get variety
            attachmentPoints = this.shuffleArray([...attachmentPoints]).slice(0, maxConfigurations);
        }
        
        // Remember how many blocks the original champion has (for non-limb mode)
        const originalBlockCount = championCreature.blocks.length;
        
        console.log(`Champion has ${originalBlockCount} blocks`);
        console.log(`Max configurations setting: ${this.numConfigurations || 5}`);
        console.log(`Using ${attachmentPoints.length} initial attachment points (of ${championCreature.getAvailableAttachmentPoints().length} available)`);
        console.log(`Creating ${this.instancesPerBlockConfig} movement variants per configuration`);
        console.log(`Expected total: 1 (champion) + ${attachmentPoints.length} configs x ${this.instancesPerBlockConfig} variants = ${1 + attachmentPoints.length * this.instancesPerBlockConfig} creatures`);
        console.log(`Champion's ${championCreature.joints.length} existing joint movements are PRESERVED`);
        
        if (attachmentPoints.length === 0) {
            console.error('No available attachment points! Champion structure:');
            console.error(`Blocks: ${championCreature.blocks.length}, Joints: ${championCreature.joints.length}`);
            for (let i = 0; i < championCreature.blocks.length; i++) {
                const availableFaces = championCreature.blocks[i].getAvailableFaces();
                console.error(`Block ${i}: ${availableFaces.length} available faces - ${availableFaces}`);
            }
            return;
        }
        
        // For each attachment point (block position), create multiple movement variants
        for (let pointIndex = 0; pointIndex < attachmentPoints.length; pointIndex++) {
            const point = attachmentPoints[pointIndex];
            
            // Create multiple variants - each gets different movement patterns for the NEW blocks
            for (let variantIndex = 0; variantIndex < this.instancesPerBlockConfig; variantIndex++) {
                // Each variant gets a unique RNG seed so the new blocks' movements differ
                const rng = new SeededRandom(Date.now() + Math.random() * 100000 + pointIndex * 1000 + variantIndex);
                
                // Clone the champion - this preserves ALL existing blocks and movements exactly
                const newCreature = championCreature.clone();
                
                // Reset ALL fitness tracking for new creature (will be evaluated fresh)
                newCreature.fitness = 0;
                newCreature.maxDistance = 0;
                newCreature.maxHeight = 0;
                newCreature.tilesLit = [];
                newCreature.maxJumpHeight = 0;
                newCreature.hasLandedAfterSpawn = false;
                newCreature.groundedY = 0;
                
                // NO mutations to existing joints - champion's movements are reinforced/preserved
                // The only variation comes from the new blocks' movement patterns (via addBlockAtFace)
                
                // Determine how many blocks to add for this creature
                // If randomize is enabled, pick a random number from 1 to maxBlocksToAdd
                let blocksToAdd = maxBlocksToAdd;
                if (this.randomizeBlockCount && maxBlocksToAdd > 1) {
                    blocksToAdd = rng.randomInt(1, maxBlocksToAdd + 1); // randomInt is exclusive on upper bound
                }
                
                // === MAX BLOCKS ENFORCEMENT ===
                // If maxBlocks is set, limit how many blocks we can add
                // This prevents creating creatures that exceed the configured maximum
                if (this.maxBlocks > 0) {
                    const currentBlocks = championCreature.blocks.length;
                    const maxCanAdd = this.maxBlocks - currentBlocks;
                    
                    if (maxCanAdd <= 0) {
                        // Champion is already at or above max - don't add any blocks
                        // This shouldn't normally happen (should be caught earlier) but guard against it
                        console.warn(`[MAX BLOCKS] Champion already has ${currentBlocks} blocks (max: ${this.maxBlocks}), skipping new creature creation`);
                        continue;
                    }
                    
                    // Cap blocksToAdd to not exceed maxBlocks
                    if (blocksToAdd > maxCanAdd) {
                        blocksToAdd = maxCanAdd;
                        if (variantIndex === 0 && pointIndex === 0) {
                            console.log(`[MAX BLOCKS] Capping blocks to add from ${maxBlocksToAdd} to ${blocksToAdd} (max: ${this.maxBlocks})`);
                        }
                    }
                }
                
                // Add blocks based on settings
                let blocksAdded = 0;
                let lastAddedBlockIndex = -1;
                
                // First block goes to the specified attachment point
                let success = newCreature.addBlockAtFace(point.parentIndex, point.face, rng);
                if (success) {
                    blocksAdded++;
                    lastAddedBlockIndex = newCreature.blocks.length - 1;
                }
                
                // Additional blocks - behavior depends on limb generation setting
                while (blocksAdded < blocksToAdd) {
                    // Get available attachment points on the current creature
                    let currentPoints = newCreature.getAvailableAttachmentPoints();
                    
                    // If limb generation is DISABLED, only allow attaching to original body blocks
                    // (not to blocks that were added this round)
                    if (!this.enableLimbGeneration) {
                        currentPoints = currentPoints.filter(p => p.parentIndex < originalBlockCount);
                    }
                    
                    if (currentPoints.length === 0) {
                        // No more valid places to attach - stop adding blocks
                        if (variantIndex === 0) {
                            console.log(`  Config ${pointIndex + 1}: Ran out of attachment points after ${blocksAdded} blocks`);
                        }
                        break;
                    }
                    
                    let attachPoint = null;
                    
                    // If limb generation is ENABLED, prefer attaching to the last added block (creates chains)
                    if (this.enableLimbGeneration && lastAddedBlockIndex >= 0) {
                        const lastBlockPoints = currentPoints.filter(p => p.parentIndex === lastAddedBlockIndex);
                        if (lastBlockPoints.length > 0) {
                            attachPoint = lastBlockPoints[rng.randomInt(0, lastBlockPoints.length)];
                        }
                    }
                    
                    // If we couldn't attach to the last block (or limb gen is off), pick a random valid point
                    if (!attachPoint) {
                        attachPoint = currentPoints[rng.randomInt(0, currentPoints.length)];
                    }
                    
                    // Try to add the block
                    success = newCreature.addBlockAtFace(attachPoint.parentIndex, attachPoint.face, rng);
                    if (success) {
                        blocksAdded++;
                        lastAddedBlockIndex = newCreature.blocks.length - 1;
                    } else {
                        // Try a few more random points before giving up
                        let retrySuccess = false;
                        for (let retry = 0; retry < 5 && !retrySuccess; retry++) {
                            const retryPoint = currentPoints[rng.randomInt(0, currentPoints.length)];
                            if (newCreature.addBlockAtFace(retryPoint.parentIndex, retryPoint.face, rng)) {
                                blocksAdded++;
                                lastAddedBlockIndex = newCreature.blocks.length - 1;
                                retrySuccess = true;
                            }
                        }
                        if (!retrySuccess) {
                            break; // Give up on adding more blocks
                        }
                    }
                }
                
                // Only add creature to population if we added at least one block
                if (blocksAdded > 0) {
                    // Update identification
                    newCreature.seed = championCreature.seed + '_gen' + this.generation + '_p' + pointIndex + '_v' + variantIndex;
                    newCreature.configIndex = pointIndex;
                    newCreature.variantIndex = variantIndex;
                    // Use last DNA segment as name - unique per evolutionary step
                    newCreature.name = newCreature.getLastDNASegment();
                    newCreature.parentName = parentName;
                    newCreature.isDefendingChampion = false;  // Explicitly mark as NOT defending champion
                    
                    // Check DNA uniqueness - only add if this is a new configuration
                    if (this.tryRegisterCreature(newCreature)) {
                        this.population.push(newCreature);
                        
                        // Log first variant of each config for debugging
                        if (variantIndex === 0) {
                            console.log(`  Config ${pointIndex + 1}: Added ${blocksAdded} block(s), starting at parent block ${point.parentIndex}, face ${point.face} -> ${newCreature.blocks.length} blocks total`);
                        }
                    } else {
                        // This DNA segment was already tried - skip to avoid wasting computation
                        console.log(`  [DNA] Skipping duplicate: ${newCreature.name} (config ${pointIndex + 1}, variant ${variantIndex + 1})`);
                    }
                } else {
                    console.warn(`Failed to add any blocks at point ${pointIndex}, variant ${variantIndex}`);
                    
                    // Try a completely different starting point as fallback
                    for (let retry = 0; retry < 5; retry++) {
                        const randomPointIndex = Math.floor(Math.random() * attachmentPoints.length);
                        const randomPoint = attachmentPoints[randomPointIndex];
                        const retryCreature = championCreature.clone();
                        
                        // Reset ALL fitness tracking for retry creature
                        retryCreature.fitness = 0;
                        retryCreature.maxDistance = 0;
                        retryCreature.maxHeight = 0;
                        retryCreature.tilesLit = [];
                        retryCreature.maxJumpHeight = 0;
                        retryCreature.hasLandedAfterSpawn = false;
                        retryCreature.groundedY = 0;
                        
                        const retryRng = new SeededRandom(Date.now() + Math.random() * 100000 + retry * 500);
                        
                        // Try to add at least one block
                        if (retryCreature.addBlockAtFace(randomPoint.parentIndex, randomPoint.face, retryRng)) {
                            retryCreature.seed = championCreature.seed + '_gen' + this.generation + '_p' + randomPointIndex + '_v' + variantIndex + '_r';
                            retryCreature.configIndex = randomPointIndex;
                            retryCreature.variantIndex = variantIndex;
                            // Use last DNA segment as name - unique per evolutionary step
                            retryCreature.name = retryCreature.getLastDNASegment();
                            retryCreature.parentName = parentName;
                            
                            // Check DNA uniqueness before adding
                            if (this.tryRegisterCreature(retryCreature)) {
                                this.population.push(retryCreature);
                                break;
                            }
                            // If duplicate, continue trying
                        }
                    }
                }
            }
        }
        
        // VALIDATION: Check block counts for entire population
        const championBlocks = championCreature.blocks.length;
        // With randomization, creatures may have different block counts
        // Without randomization, all should have championBlocks + maxBlocksToAdd
        const expectedMaxBlocks = championBlocks + maxBlocksToAdd;
        
        let defendingChampCount = 0;
        let newVariantCount = 0;
        let invalidCount = 0;
        
        for (let creature of this.population) {
            if (creature.isDefendingChampion) {
                defendingChampCount++;
                if (creature.blocks.length !== championBlocks) {
                    console.error(`[VALIDATION ERROR] Defending champion has ${creature.blocks.length} blocks, expected ${championBlocks}`);
                    invalidCount++;
                }
            } else {
                newVariantCount++;
                // Allow creatures that couldn't add all blocks (ran out of attachment points)
                // or got fewer due to randomization - but they should have more than champion
                if (creature.blocks.length <= championBlocks) {
                    console.error(`[VALIDATION ERROR] ${creature.name} has ${creature.blocks.length} blocks, expected more than ${championBlocks}`);
                    invalidCount++;
                } else if (creature.blocks.length < expectedMaxBlocks && !this.randomizeBlockCount) {
                    // This is just a warning - creature may have run out of attachment points
                    console.log(`[VALIDATION NOTE] ${creature.name} has ${creature.blocks.length} blocks, target was ${expectedMaxBlocks} (may have run out of attachment points)`);
                }
            }
        }
        
        console.log(`\n=== Generation ${this.generation} Population Summary ===`);
        console.log(`Champion base: ${championBlocks} blocks`);
        console.log(`Defending champion variants: ${defendingChampCount} (${championBlocks} blocks each)`);
        if (this.randomizeBlockCount) {
            console.log(`New block variants: ${newVariantCount} (${championBlocks + 1} to ${expectedMaxBlocks} blocks, randomized)`);
        } else {
            console.log(`New block variants: ${newVariantCount} (target: ${expectedMaxBlocks} blocks each)`);
        }
        console.log(`Total population: ${this.population.length}`);
        
        if (invalidCount > 0) {
            console.error(`[VALIDATION FAILED] ${invalidCount} creatures have incorrect block counts!`);
        } else {
            console.log(`[VALIDATION PASSED] All creatures have acceptable block counts`);
        }
        console.log(`========================================\n`);
        
        if (this.population.length === 0) {
            console.error('CRITICAL: No creatures created for next generation!');
            return false;  // Signal failure
        }
        
        return true;  // Signal success
    }
    
    /**
     * Get champion creature
     */
    getChampion() {
        return this.champion;
    }
    
    /**
     * Get all-time champion
     */
    getAllTimeChampion() {
        return this.allTimeChampion;
    }
    
    /**
     * Get current population
     */
    getPopulation() {
        return this.population;
    }
    
    /**
     * Get backtracking stats for UI display
     * Includes all target metrics so UI can show what needs to be beaten
     * 
     * effectiveTargetFitness is the champion's performance recalculated
     * using the CURRENT generation's fitness mode - this is what actually
     * needs to be beaten when random mode changes criteria.
     */
    getBacktrackStats() {
        // Recalculate target fitness using current mode for fair comparison
        const effectiveTargetFitness = this.calculateFitnessFromMetrics(
            this.targetDistance,
            this.targetHeight,
            this.targetTilesLit,
            this.targetJumpHeight,
            this.currentActiveMode
        );
        
        return {
            deadEndCount: this.deadEndCount,
            backtrackCount: this.backtrackCount,
            completedLineCount: this.completedLineCount,
            championDefenseCount: this.championDefenseCount,
            historyDepth: this.generationHistory.length,
            targetFitness: this.targetFitness,              // Original fitness when champion was crowned
            effectiveTargetFitness: effectiveTargetFitness, // Recalculated for current mode
            targetFitnessMode: this.targetFitnessMode,      // Mode used when target was set
            currentMode: this.currentActiveMode,            // Current generation's mode
            // All champion metrics that need to be beaten
            targetDistance: this.targetDistance,
            targetHeight: this.targetHeight,
            targetTilesLit: this.targetTilesLit,
            targetJumpHeight: this.targetJumpHeight,
            maxBlocks: this.maxBlocks                       // Max blocks limit (0 = unlimited)
        };
    }
    
    /**
     * Save current champion to saved creatures list
     */
    saveChampion() {
        if (!this.champion) {
            console.log('No champion to save yet');
            return false;
        }
        
        const savedCreature = {
            seed: this.champion.seed,
            generation: this.generation - 1,
            fitness: this.champion.fitness,
            distance: this.champion.maxDistance,
            height: this.champion.maxHeight,
            timestamp: Date.now()
        };
        
        this.savedCreatures.push(savedCreature);
        this.persistSavedCreatures();
        console.log('Champion saved!', savedCreature);
        return true;
    }
    
    /**
     * Load a creature from seed
     */
    loadCreatureFromSeed(seed) {
        const creature = new Creature(seed);
        return creature;
    }
    
    /**
     * Shuffle an array using Fisher-Yates algorithm
     * Used to randomize which attachment points are selected
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    /**
     * Get list of saved creatures
     */
    getSavedCreatures() {
        return this.savedCreatures;
    }
    
    /**
     * Save creatures to localStorage
     */
    persistSavedCreatures() {
        try {
            localStorage.setItem('evolutionCreatures', JSON.stringify(this.savedCreatures));
        } catch (e) {
            console.error('Failed to save creatures:', e);
        }
    }
    
    /**
     * Load creatures from localStorage
     */
    loadSavedCreatures() {
        try {
            const saved = localStorage.getItem('evolutionCreatures');
            if (saved) {
                this.savedCreatures = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load saved creatures:', e);
            this.savedCreatures = [];
        }
    }
    
    /**
     * Delete a saved creature
     */
    deleteSavedCreature(index) {
        if (index >= 0 && index < this.savedCreatures.length) {
            this.savedCreatures.splice(index, 1);
            this.persistSavedCreatures();
            return true;
        }
        return false;
    }
    
    /**
     * Get statistics about current generation
     */
    getGenerationStats() {
        if (this.population.length === 0) {
            return {
                avgFitness: 0,
                maxFitness: 0,
                minFitness: 0
            };
        }
        
        const fitnesses = this.population.map(c => c.fitness || 0);
        const sum = fitnesses.reduce((a, b) => a + b, 0);
        
        return {
            avgFitness: sum / fitnesses.length,
            maxFitness: Math.max(...fitnesses),
            minFitness: Math.min(...fitnesses)
        };
    }
    
    /**
     * Export champion data
     */
    exportChampion() {
        if (!this.champion) return null;
        
        return {
            seed: this.champion.seed,
            blocks: this.champion.blocks.length,
            fitness: this.champion.fitness,
            distance: this.champion.maxDistance,
            height: this.champion.maxHeight,
            generation: this.generation - 1
        };
    }
    
    /**
     * Spawn a new generation from a specific tree node
     * 
     * This allows the user to "branch" evolution from any historical champion,
     * as if that creature had just won its round and we're spawning the next
     * generation from it. The generation number continues from the selected
     * creature's generation + 1.
     * 
     * @param {number} nodeId - The ID of the tree node to spawn from
     * @returns {Object} Result object with success flag and details
     */
    spawnFromTreeNode(nodeId) {
        // Find the tree node
        const node = this.evolutionTree.find(n => n.id === nodeId);
        
        if (!node) {
            console.error(`[SPAWN] Node #${nodeId} not found in evolution tree`);
            return { success: false, error: 'Node not found' };
        }
        
        // Only allow spawning from champions, backtrack_sources, dead_ends, and branch_parents
        // (these are creatures that were meaningful in the evolutionary process)
        const spawnableStatuses = ['champion', 'backtrack_source', 'dead_end', 'branch_parent', 'competitor'];
        if (!spawnableStatuses.includes(node.status)) {
            console.error(`[SPAWN] Cannot spawn from node status: ${node.status}`);
            return { success: false, error: `Cannot spawn from ${node.status} nodes` };
        }
        
        // Get the creature from the node
        let creature = null;
        
        // Try to use stored clone first (most reliable)
        if (node.creatureClone) {
            creature = node.creatureClone.clone();
            console.log(`[SPAWN] Using stored clone for ${node.name}`);
        }
        
        // Fall back to generation history lookup
        if (!creature) {
            const historyEntry = this.generationHistory.find(h => h.generation === node.generation);
            if (historyEntry && historyEntry.rankedPopulation) {
                // Look for creature by name
                for (let ranked of historyEntry.rankedPopulation) {
                    if (ranked.creature.name === node.name) {
                        creature = ranked.creature.clone();
                        console.log(`[SPAWN] Found ${node.name} in generation history`);
                        break;
                    }
                }
            }
        }
        
        // Check if this is the current champion
        if (!creature && this.champion && this.champion.name === node.name) {
            creature = this.champion.clone();
            console.log(`[SPAWN] Using current champion for ${node.name}`);
        }
        
        if (!creature) {
            console.error(`[SPAWN] Could not retrieve creature for node #${nodeId} (${node.name})`);
            return { success: false, error: 'Could not retrieve creature data' };
        }
        
        // Reset creature's fitness tracking for fresh evaluation
        creature.resetFitnessTracking();
        
        console.log('\n' + '='.repeat(60));
        console.log(`[SPAWN] BRANCHING FROM TREE NODE`);
        console.log('='.repeat(60));
        console.log(`   Selected: ${node.name} (Generation ${node.generation})`);
        console.log(`   Status: ${node.status}`);
        console.log(`   Blocks: ${node.blocks}`);
        console.log(`   Original Fitness: ${node.fitness.toFixed(2)} (${node.fitnessMode} mode)`);
        
        // Mark original status for logging
        const previousGeneration = this.generation;
        
        // Set this creature as the new champion
        this.champion = creature;
        this.targetFitness = node.fitness;
        this.targetFitnessMode = node.fitnessMode || this.currentActiveMode;
        
        // Set target metrics from node data
        this.targetDistance = node.distance || 0;
        this.targetHeight = node.height || 0;
        this.targetTilesLit = node.tilesLit || 0;
        this.targetJumpHeight = node.jumpHeight || 0;
        
        // Update current branch ID to this node
        this.currentBranchId = nodeId;
        
        // Set generation to continue from this creature's line
        this.generation = node.generation + 1;
        
        console.log(`   Previous generation: ${previousGeneration}`);
        console.log(`   New generation: ${this.generation}`);
        console.log(`   Continuing genetic line from Gen ${node.generation}`);
        
        // Log this branching event
        this.logEvent('TREE_BRANCH', {
            sourceNodeId: nodeId,
            sourceName: node.name,
            sourceGeneration: node.generation,
            sourceStatus: node.status,
            newGeneration: this.generation,
            previousGeneration: previousGeneration
        });
        
        // If in random mode, pick a new mode for this generation
        if (this.isRandomMode) {
            this.selectNextRandomMode();
            console.log(`   Fitness mode for Gen ${this.generation}: ${this.currentActiveMode}`);
        }
        
        // Create the next generation from this creature
        this.createNextGeneration(creature);
        
        console.log(`[SPAWN] Created generation ${this.generation} with ${this.population.length} creatures`);
        console.log('='.repeat(60) + '\n');
        
        return {
            success: true,
            sourceNode: node,
            creature: creature,
            newGeneration: this.generation,
            populationSize: this.population.length
        };
    }
    
    /**
     * Get information about a tree node by ID
     * Used by UI to display node details before spawning
     * 
     * @param {number} nodeId - The tree node ID
     * @returns {Object|null} Node data or null if not found
     */
    getTreeNodeInfo(nodeId) {
        const node = this.evolutionTree.find(n => n.id === nodeId);
        if (!node) return null;
        
        // Check if we can spawn from this node
        const spawnableStatuses = ['champion', 'backtrack_source', 'dead_end', 'branch_parent', 'competitor'];
        const canSpawn = spawnableStatuses.includes(node.status) && node.creatureClone !== null;
        
        return {
            ...node,
            canSpawn: canSpawn,
            hasCreatureData: node.creatureClone !== null
        };
    }
    
    /**
     * Get the complete lineage from a node back to the root (generation 1)
     * Returns an array of nodes from oldest ancestor to the selected node.
     * This traces the evolutionary path that led to this creature.
     * 
     * @param {number} nodeId - The tree node ID to trace from
     * @returns {Array} Array of node objects from root to target, with creatures
     */
    getLineageToRoot(nodeId) {
        const lineage = [];
        let currentNode = this.evolutionTree.find(n => n.id === nodeId);
        
        if (!currentNode) {
            console.error(`[LINEAGE] Node #${nodeId} not found`);
            return [];
        }
        
        // Walk back through parents to build lineage
        while (currentNode) {
            // Get the creature for this node
            let creature = null;
            if (currentNode.creatureClone) {
                creature = currentNode.creatureClone.clone();
            }
            
            lineage.unshift({
                node: currentNode,
                creature: creature
            });
            
            // Move to parent
            if (currentNode.parentId) {
                currentNode = this.evolutionTree.find(n => n.id === currentNode.parentId);
            } else {
                currentNode = null; // Reached root
            }
        }
        
        console.log(`[LINEAGE] Traced ${lineage.length} generations for node #${nodeId}`);
        return lineage;
    }
    
    /**
     * Get a single creature from a tree node for terrarium mode
     * 
     * @param {number} nodeId - The tree node ID
     * @returns {Object|null} Object with node and creature, or null if not found
     */
    getCreatureFromNode(nodeId) {
        const node = this.evolutionTree.find(n => n.id === nodeId);
        if (!node) {
            console.error(`[TERRARIUM] Node #${nodeId} not found`);
            return null;
        }
        
        let creature = null;
        if (node.creatureClone) {
            creature = node.creatureClone.clone();
            creature.resetFitnessTracking();
        }
        
        if (!creature) {
            console.error(`[TERRARIUM] No creature data for node #${nodeId}`);
            return null;
        }
        
        return {
            node: node,
            creature: creature
        };
    }
    
    // =========================================================================
    // SAVE / LOAD FULL SIMULATION STATE
    // =========================================================================
    
    /**
     * Export the complete evolution state to a JSON-serializable object.
     * This allows users to save their progress and resume later.
     * 
     * @returns {Object} Complete state that can be saved to a file
     */
    exportFullState() {
        console.log('[SAVE] Exporting full evolution state...');
        
        // Helper function to serialize a creature (or null)
        const serializeCreature = (creature) => {
            if (!creature) return null;
            return creature.toJSON();
        };
        
        // Serialize the evolution tree nodes
        // Each node may have a creatureClone that needs to be serialized
        const serializedTree = this.evolutionTree.map(node => {
            return {
                id: node.id,
                name: node.name,  // Full DNA segment
                generation: node.generation,
                fitness: node.fitness,
                fitnessMode: node.fitnessMode,
                blocks: node.blocks,
                distance: node.distance,
                height: node.height,
                tilesLit: node.tilesLit,
                jumpHeight: node.jumpHeight,
                parentId: node.parentId,
                parentName: node.parentName || null,
                status: node.status,
                children: node.children ? [...node.children] : [],
                // Species tracking
                speciesId: node.speciesId || null,
                configIndex: node.configIndex,
                variantIndex: node.variantIndex,
                // Sensor/special block tracking
                sensors: node.sensors ? [...node.sensors] : [],
                lastAddedSensor: node.lastAddedSensor || null,
                // Serialize the creature clone if present
                creatureClone: node.creatureClone ? node.creatureClone.toJSON() : null
            };
        });
        
        // Serialize generation history
        // Each entry has rankedPopulation with creature references
        const serializedHistory = this.generationHistory.map(entry => {
            return {
                generation: entry.generation,
                triedIndices: [...entry.triedIndices],
                championFitness: entry.championFitness,
                // Serialize ranked population (creatures with their ranking data)
                rankedPopulation: entry.rankedPopulation ? entry.rankedPopulation.map(ranked => ({
                    fitness: ranked.fitness,
                    creature: ranked.creature ? ranked.creature.toJSON() : null
                })) : []
            };
        });
        
        // Build the complete state object
        const state = {
            // Version for future compatibility
            version: 1,
            savedAt: new Date().toISOString(),
            
            // Core evolution state
            generation: this.generation,
            champion: serializeCreature(this.champion),
            allTimeChampion: serializeCreature(this.allTimeChampion),
            
            // Current population (living creatures)
            population: this.population.map(c => c.toJSON()),
            
            // Evolution settings
            instancesPerBlockConfig: this.instancesPerBlockConfig,
            numConfigurations: this.numConfigurations,
            blocksPerGeneration: this.blocksPerGeneration,
            maxBlocks: this.maxBlocks,
            randomizeBlockCount: this.randomizeBlockCount,
            enableLimbGeneration: this.enableLimbGeneration,
            
            // Fitness mode settings
            fitnessMode: this.fitnessMode,
            currentActiveMode: this.currentActiveMode,
            isRandomMode: this.isRandomMode,
            
            // Evolution history and tree
            generationHistory: serializedHistory,
            evolutionTree: serializedTree,
            nextNodeId: this.nextNodeId,
            currentBranchId: this.currentBranchId,
            evolutionEvents: [...this.evolutionEvents],
            
            // Statistics
            deadEndCount: this.deadEndCount,
            backtrackCount: this.backtrackCount,
            completedLineCount: this.completedLineCount,
            championDefenseCount: this.championDefenseCount,
            
            // Target metrics (what needs to be beaten)
            targetFitness: this.targetFitness,
            targetFitnessMode: this.targetFitnessMode,
            targetDistance: this.targetDistance,
            targetHeight: this.targetHeight,
            targetTilesLit: this.targetTilesLit,
            targetJumpHeight: this.targetJumpHeight,
            
            // DNA tracking (prevents re-exploring identical paths)
            triedDNASegments: Array.from(this.triedDNASegments.entries())
        };
        
        console.log(`[SAVE] State exported: Gen ${this.generation}, ${this.population.length} creatures, ${this.evolutionTree.length} tree nodes`);
        return state;
    }
    
    /**
     * Import a previously saved evolution state.
     * This restores all evolution data so the user can continue where they left off.
     * 
     * @param {Object} state - The saved state object from exportFullState()
     * @returns {boolean} True if import was successful
     */
    importFullState(state) {
        console.log('[LOAD] Importing evolution state...');
        
        // Validate state version
        if (!state || state.version !== 1) {
            console.error('[LOAD] Invalid or incompatible save file');
            return false;
        }
        
        try {
            // Helper function to deserialize a creature (or null)
            const deserializeCreature = (data) => {
                if (!data) return null;
                return Creature.fromJSON(data);
            };
            
            // Restore core evolution state
            this.generation = state.generation;
            this.champion = deserializeCreature(state.champion);
            this.allTimeChampion = deserializeCreature(state.allTimeChampion);
            
            // Restore population
            this.population = state.population.map(data => Creature.fromJSON(data));
            
            // Restore evolution settings
            this.instancesPerBlockConfig = state.instancesPerBlockConfig;
            this.numConfigurations = state.numConfigurations;
            this.blocksPerGeneration = state.blocksPerGeneration;
            this.maxBlocks = state.maxBlocks;
            this.randomizeBlockCount = state.randomizeBlockCount;
            this.enableLimbGeneration = state.enableLimbGeneration;
            
            // Restore fitness mode settings
            this.fitnessMode = state.fitnessMode;
            this.currentActiveMode = state.currentActiveMode;
            this.isRandomMode = state.isRandomMode;
            
            // Restore generation history
            this.generationHistory = state.generationHistory.map(entry => ({
                generation: entry.generation,
                triedIndices: [...entry.triedIndices],  // Keep as array (uses .includes, .push, .join)
                championFitness: entry.championFitness,
                rankedPopulation: entry.rankedPopulation ? entry.rankedPopulation.map(ranked => ({
                    fitness: ranked.fitness,
                    creature: ranked.creature ? Creature.fromJSON(ranked.creature) : null
                })) : []
            }));
            
            // Restore evolution tree (with creature clones)
            this.evolutionTree = state.evolutionTree.map(node => ({
                id: node.id,
                name: node.name,  // Full DNA segment
                generation: node.generation,
                fitness: node.fitness,
                fitnessMode: node.fitnessMode,
                blocks: node.blocks,
                distance: node.distance,
                height: node.height,
                tilesLit: node.tilesLit,
                jumpHeight: node.jumpHeight,
                parentId: node.parentId,
                parentName: node.parentName || null,
                status: node.status,
                children: node.children ? [...node.children] : [],
                // Species tracking
                speciesId: node.speciesId || null,
                configIndex: node.configIndex,
                variantIndex: node.variantIndex,
                // Sensor/special block tracking
                sensors: node.sensors ? [...node.sensors] : [],
                lastAddedSensor: node.lastAddedSensor || null,
                creatureClone: node.creatureClone ? Creature.fromJSON(node.creatureClone) : null
            }));
            
            this.nextNodeId = state.nextNodeId;
            this.currentBranchId = state.currentBranchId;
            this.evolutionEvents = [...state.evolutionEvents];
            
            // Restore statistics
            this.deadEndCount = state.deadEndCount;
            this.backtrackCount = state.backtrackCount;
            this.completedLineCount = state.completedLineCount;
            this.championDefenseCount = state.championDefenseCount;
            
            // Restore target metrics
            this.targetFitness = state.targetFitness;
            this.targetFitnessMode = state.targetFitnessMode;
            this.targetDistance = state.targetDistance;
            this.targetHeight = state.targetHeight;
            this.targetTilesLit = state.targetTilesLit;
            this.targetJumpHeight = state.targetJumpHeight;
            
            // Restore DNA tracking (prevents re-exploring identical paths)
            if (state.triedDNASegments && Array.isArray(state.triedDNASegments)) {
                this.triedDNASegments = new Map(state.triedDNASegments);
            } else {
                // Rebuild from evolution tree if not saved (backward compatibility)
                this.triedDNASegments = new Map();
                for (const node of this.evolutionTree) {
                    if (node.name) {
                        this.triedDNASegments.set(node.name, node.generation);
                    }
                }
            }
            
            console.log(`[LOAD] State imported successfully!`);
            console.log(`       Generation: ${this.generation}`);
            console.log(`       Population: ${this.population.length} creatures`);
            console.log(`       Tree nodes: ${this.evolutionTree.length}`);
            console.log(`       DNA segments tracked: ${this.triedDNASegments.size}`);
            console.log(`       Champion: ${this.champion ? this.champion.name : 'none'}`);
            console.log(`       Saved at: ${state.savedAt}`);
            
            return true;
            
        } catch (error) {
            console.error('[LOAD] Error importing state:', error);
            return false;
        }
    }
    
    /**
     * Get a summary of the current state for display
     * Useful for showing save file info before loading
     * 
     * @param {Object} state - A saved state object
     * @returns {Object} Summary information
     */
    static getStateSummary(state) {
        if (!state || state.version !== 1) {
            return { valid: false, error: 'Invalid save file' };
        }
        
        return {
            valid: true,
            savedAt: state.savedAt,
            generation: state.generation,
            populationSize: state.population ? state.population.length : 0,
            treeNodes: state.evolutionTree ? state.evolutionTree.length : 0,
            championName: state.champion ? state.champion.name : 'None',
            championBlocks: state.champion ? state.champion.blocks.length : 0,
            fitnessMode: state.fitnessMode,
            deadEnds: state.deadEndCount,
            backtracks: state.backtrackCount
        };
    }
}
