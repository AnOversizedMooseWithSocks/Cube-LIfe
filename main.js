// main.js - Main application logic and UI controller
// Manages evolution simulation and user interface

class Application {
    constructor() {
        this.simulation = null;
        this.evolution = null;
        this.isEvaluating = false;
        this.isTransitioning = false;
        this.lastTime = performance.now();
        
        // Tournament of Champions state
        this.isTournamentMode = false;       // Are we running a tournament?
        this.tournamentChampions = [];       // Array of { nodeData, creature } for tournament
        this.savedEvolutionState = null;     // Saved state to resume after tournament
        
        // Lineage Playback state
        this.isLineageMode = false;          // Are we in lineage playback mode?
        this.lineageData = [];               // Array of { node, creature } from root to selected
        this.lineageIndex = 0;               // Current position in lineage
        this.lineageDayTimer = 0;            // Timer for day progression
        this.lineageDayDuration = 60;        // Seconds per "day" before advancing (default 60)
        this.lineagePaused = false;          // Is playback paused?
        this.selectedTreeNodeId = null;      // Currently selected node in tree
        
        // Terrarium (Pet) mode state
        this.isTerrariumMode = false;        // Are we in terrarium mode?
        this.terrariumCreature = null;       // The creature in the terrarium
        this.terrariumNode = null;           // The node data for the terrarium creature
        this.terrariumStartTime = 0;         // When terrarium mode started
        
        // Evolution tree modal state
        this.pausedBeforeTreeOpen = false;   // Was simulation paused before opening tree?
        
        // Graphical evolution tree renderer
        this.treeRenderer = null;
        
        this.init();
    }
    
    init() {
        // Create simulation
        const container = document.getElementById('canvas-container');
        this.simulation = new Simulation(container);
        
        // Selection callback
        this.simulation.onSelectionChanged = (creature) => {
            this.onCreatureSelectionChanged(creature);
        };
        
        // Create evolution manager
        this.evolution = new EvolutionManager();
        
        // Setup UI
        this.setupUI();
        
        // Start render loop
        this.animate();
    }
    
    onCreatureSelectionChanged(creature) {
        const panel = document.getElementById('selected-creature-panel');
        if (creature) {
            // Explicitly selected creature
            this.updateSelectedCreatureUI(creature, false);
            panel.style.display = 'block';
        } else {
            // No explicit selection - panel visibility will be handled by updateUI
            // based on follow mode state
            panel.style.display = 'none';
        }
    }
    
    updateSelectedCreatureUI(creature, isFollowed = false) {
        if (!creature) return;
        
        // Get the current active mode
        const activeMode = this.evolution.getActiveMode();
        
        // Calculate fitness using the current active mode
        // For outcast mode, fitness should already be set by updateCrownPosition
        // which calculates outcast scores for all creatures together.
        // We can't recalculate for a single creature since outcast needs population context.
        if (activeMode !== 'outcast') {
            creature.calculateFitness(activeMode);
        }
        // Note: For outcast mode, we use the existing creature.fitness value
        
        // Basic stats
        document.getElementById('sel-blocks').textContent = creature.blocks.length;
        document.getElementById('sel-distance').textContent = creature.maxDistance.toFixed(2) + 'm';
        document.getElementById('sel-height').textContent = creature.maxHeight.toFixed(2) + 'm';
        document.getElementById('sel-jump').textContent = (creature.maxJumpHeight || 0).toFixed(2) + 'm';
        const tileCount = creature.getTileCount ? creature.getTileCount() : 0;
        document.getElementById('sel-tiles').textContent = tileCount;
        document.getElementById('sel-fitness').textContent = creature.fitness.toFixed(2);
        document.getElementById('sel-name').textContent = creature.name || 'Unknown';
        
        // Calculate and display efficiency (distance per tile)
        const efficiency = tileCount > 0 ? (creature.maxDistance / tileCount) : 0;
        document.getElementById('sel-efficiency').textContent = efficiency.toFixed(3);
        
        // Show mode-specific score breakdown
        this.updateModeScoreDisplay(creature, activeMode);
        
        // Config type
        let configInfo = '-';
        if (creature.configIndex === -1 || creature.isDefendingChampion) {
            configInfo = '\u{1F451} Defending Champion';  // Crown emoji
        } else if (creature.configIndex !== undefined) {
            configInfo = `Position ${creature.configIndex + 1}, Variant ${(creature.variantIndex || 0) + 1}`;
        }
        document.getElementById('sel-config').textContent = configInfo;
        
        // Update special blocks (sensors) display
        this.updateSelectedCreatureSensors(creature);
        
        // Update hint text based on whether this is a followed or selected creature
        const hintElements = document.querySelectorAll('#selected-creature-panel .hint-text');
        const lastHint = hintElements[hintElements.length - 1];
        if (lastHint) {
            if (isFollowed) {
                lastHint.textContent = 'Following best creature - Click to select specific one';
            } else {
                lastHint.textContent = 'Click empty space to deselect';
            }
        }
    }
    
    /**
     * Update the special blocks (sensors) display for the selected creature
     * @param {Creature} creature - The creature to display sensors for
     */
    updateSelectedCreatureSensors(creature) {
        const sensorsSection = document.getElementById('sel-sensors-section');
        const sensorsList = document.getElementById('sel-sensors-list');
        const sensorAdded = document.getElementById('sel-sensor-added');
        const sensorAddedType = document.getElementById('sel-sensor-added-type');
        
        if (!sensorsSection || !sensorsList) return;
        
        // Get special blocks info
        const specialBlocks = creature.getSpecialBlocks ? creature.getSpecialBlocks() : [];
        
        if (specialBlocks.length === 0) {
            // No sensors - hide the section
            sensorsSection.style.display = 'none';
            return;
        }
        
        // Show the section
        sensorsSection.style.display = 'block';
        
        // Build compact sensor list (just abbreviations)
        const sensorAbbrevs = specialBlocks.map(sensor => {
            // Short abbreviations matching HTML labels
            const abbrevMap = {
                'gravity': 'Grv',
                'light': 'Lgt', 
                'velocity': 'Vel',
                'ground': 'Gnd',
                'rhythm': 'Rhy',
                'tilt': 'Tilt'
            };
            return abbrevMap[sensor.type] || sensor.type.substring(0, 3);
        });
        sensorsList.textContent = sensorAbbrevs.join(' ');
        
        // Show "+" indicator if a sensor was just added
        if (creature.lastAddedSensor) {
            sensorAdded.style.display = 'inline';
            // Get the short name for the sensor type
            const abbrevMap = {
                'gravity': 'Grv',
                'light': 'Lgt', 
                'velocity': 'Vel',
                'ground': 'Gnd',
                'rhythm': 'Rhy',
                'tilt': 'Tilt'
            };
            sensorAddedType.textContent = abbrevMap[creature.lastAddedSensor] || creature.lastAddedSensor;
        } else {
            sensorAdded.style.display = 'none';
        }
    }
    
    /**
     * Update the mode-specific score display showing how fitness is calculated
     * Also updates the "all modes" comparison display
     * @param {Creature} creature - The creature to calculate for
     * @param {string} mode - The current fitness mode
     */
    updateModeScoreDisplay(creature, mode) {
        const labelEl = document.getElementById('sel-mode-label');
        const scoreEl = document.getElementById('sel-mode-score');
        const formulaEl = document.getElementById('sel-mode-formula');
        
        if (!labelEl || !scoreEl || !formulaEl) return;
        
        const dist = creature.maxDistance;
        const height = creature.maxHeight;
        const tiles = creature.getTileCount ? creature.getTileCount() : 0;
        const jump = creature.maxJumpHeight || 0;
        const efficiency = tiles > 0 ? (dist / tiles) : 0;
        
        let modeName = '';
        let formula = '';
        let score = 0;
        
        // Calculate scores for ALL modes (for the comparison display)
        const distanceScore = dist * 2.0 + height * 0.5;
        const efficiencyScore = tiles > 0 ? (efficiency * 100 + height * 0.2) : 0;
        const jumpScore = jump * 10.0 + dist * 0.1;
        const areaScore = tiles * 1.0 + dist * 0.05;
        // Outcast uses composite approximation (real outcast needs population context)
        const outcastScore = dist + height * 2 + tiles * 0.5 + jump * 5;
        // Spartan: balanced combination of all metrics
        const spartanScore = dist * 1.0 + height * 2.0 + tiles * 0.2 + jump * 3.0;
        
        // Update all-modes display
        const distEl = document.getElementById('sel-score-distance');
        const effEl = document.getElementById('sel-score-efficiency');
        const jumpEl = document.getElementById('sel-score-jump');
        const areaEl = document.getElementById('sel-score-area');
        const outcastEl = document.getElementById('sel-score-outcast');
        const spartanEl = document.getElementById('sel-score-spartan');
        
        if (distEl) distEl.textContent = distanceScore.toFixed(1);
        if (effEl) effEl.textContent = efficiencyScore.toFixed(1);
        if (jumpEl) jumpEl.textContent = jumpScore.toFixed(1);
        if (areaEl) areaEl.textContent = areaScore.toFixed(1);
        if (outcastEl) outcastEl.textContent = outcastScore.toFixed(1);
        if (spartanEl) spartanEl.textContent = spartanScore.toFixed(1);
        
        // Highlight the current mode's score
        const modeToElement = {
            'distance': distEl,
            'efficiency': effEl,
            'jump': jumpEl,
            'area': areaEl,
            'outcast': outcastEl,
            'spartan': spartanEl
        };
        
        // Reset all to normal color, then highlight current mode
        [distEl, effEl, jumpEl, areaEl, outcastEl, spartanEl].forEach(el => {
            if (el) el.style.color = '#64ffda';
        });
        if (modeToElement[mode]) {
            modeToElement[mode].style.color = '#ffd700';  // Gold for current mode
        }
        
        // Set current mode display
        switch(mode) {
            case 'distance':
                modeName = '\u{1F3C3} Distance';  // Running emoji
                score = distanceScore;
                formula = `${dist.toFixed(1)}x2 + ${height.toFixed(1)}x0.5 = ${score.toFixed(1)}`;
                break;
                
            case 'efficiency':
                modeName = '\u26A1 Efficiency';  // Lightning emoji
                score = efficiencyScore;
                formula = `${efficiency.toFixed(2)}x100 + ${height.toFixed(1)}x0.2 = ${score.toFixed(1)}`;
                break;
                
            case 'jump':
                modeName = '\u{1F680} Jump';  // Rocket emoji
                score = jumpScore;
                formula = `${jump.toFixed(1)}x10 + ${dist.toFixed(1)}x0.1 = ${score.toFixed(1)}`;
                break;
                
            case 'area':
                modeName = '\u{1F5FA} Area';  // Map emoji
                score = areaScore;
                formula = `${tiles}x1 + ${dist.toFixed(1)}x0.05 = ${score.toFixed(1)}`;
                break;
                
            case 'outcast':
                modeName = '\u{1F47D} Outcast';  // Alien emoji
                // Outcast is relative to population, show composite approximation
                score = creature.fitness;  // Use actual calculated fitness from rankPopulationByOutcast
                formula = `(deviation from population average)`;
                break;
                
            case 'spartan':
                modeName = '\u{1F3C5} Spartan';  // Medal emoji
                score = spartanScore;
                formula = `D*1 + H*2 + T*0.2 + J*3 = ${score.toFixed(1)}`;
                break;
                
            default:
                modeName = 'Fitness';
                score = creature.fitness;
                formula = '';
        }
        
        labelEl.textContent = modeName;
        scoreEl.textContent = score.toFixed(2);
        formulaEl.textContent = formula;
    }
    
    setupUI() {
        // Evolution controls
        document.getElementById('start-btn').addEventListener('click', () => this.startEvolution());
        
        document.getElementById('pause-btn').addEventListener('click', () => {
            if (this.simulation.isPaused) {
                this.simulation.resume();
                document.getElementById('pause-btn').textContent = '\u23F8 Pause';  // Pause symbol
            } else {
                this.simulation.pause();
                document.getElementById('pause-btn').textContent = '\u25B6 Resume';  // Play symbol
            }
        });
        
        document.getElementById('skip-btn').addEventListener('click', () => {
            if (this.isEvaluating) this.completeGeneration();
        });
        
        // Camera controls
        document.getElementById('cam-follow').addEventListener('click', () => {
            // Toggle follow leader on/off (independent of overview mode)
            if (this.simulation.followLeader) {
                // Turn off follow leader
                this.simulation.followLeader = false;
                // If in overview mode, zoom out to show all creatures
                if (this.simulation.overviewMode) {
                    this.simulation.overviewHeight = this.simulation.calculateOverviewHeightForAllCreatures();
                }
            } else {
                // Turn on follow leader
                this.simulation.followLeader = true;
                this.simulation.lastFollowedCreature = null;
                this.simulation.camera.up.set(0, 1, 0);
                // If in overview mode, zoom in based on creature size
                if (this.simulation.overviewMode) {
                    const toFollow = this.simulation.selectedCreature || this.simulation.currentBestCreature;
                    if (toFollow) {
                        this.simulation.overviewHeight = this.simulation.calculateCameraDistanceForCreature(toFollow);
                    } else {
                        this.simulation.overviewHeight = 15;
                    }
                    this.simulation.overviewPanOffset.set(0, 0, 0);
                }
            }
            this.updateCameraButtonStates();
        });
        
        document.getElementById('cam-overview').addEventListener('click', () => {
            // Toggle overview mode on/off (independent of follow mode)
            if (this.simulation.overviewMode) {
                // Turn off overview, return to normal perspective
                this.simulation.overviewMode = false;
                this.simulation.returnFromOverview();
            } else {
                // Turn on overview
                this.simulation.setCameraMode('overview');
            }
            this.updateCameraButtonStates();
        });
        
        document.getElementById('cam-reset').addEventListener('click', () => {
            this.simulation.resetCamera();
            this.updateCameraButtonStates();
        });
        
        // Evolution tree modal
        document.getElementById('evolution-tree-btn').addEventListener('click', () => {
            this.showEvolutionTree();
        });
        
        document.getElementById('close-tree-modal').addEventListener('click', () => {
            this.closeEvolutionTree();
        });
        
        document.getElementById('evolution-tree-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('evolution-tree-modal')) {
                this.closeEvolutionTree();
            }
        });
        
        // Tree view controls
        document.getElementById('tree-reset-view').addEventListener('click', () => {
            if (this.treeRenderer) {
                this.treeRenderer.resetView();
            }
        });
        
        document.getElementById('tree-fit-view').addEventListener('click', () => {
            if (this.treeRenderer) {
                this.treeRenderer.centerView();
                this.treeRenderer.render();
            }
        });
        
        // Tree display mode toggle (cycles: champions -> species -> champions)
        document.getElementById('tree-toggle-mode').addEventListener('click', () => {
            if (this.treeRenderer) {
                const newMode = this.treeRenderer.toggleDisplayMode();
                // Update button text to show CURRENT mode (what you're viewing now)
                const btn = document.getElementById('tree-toggle-mode');
                if (newMode === 'champions') {
                    btn.textContent = '\u{1F451} Champions Only';
                    btn.title = 'Click to switch to Species View';
                } else {
                    // species mode
                    btn.textContent = '\u{1F9EC} Species View';
                    btn.title = 'Click to switch to Champions Only';
                }
            }
        });
        
        // Lineage Playback button - start lineage playback for selected node
        document.getElementById('tree-lineage-btn').addEventListener('click', () => {
            this.startLineagePlayback();
        });
        
        // Terrarium button - start terrarium mode for selected node
        document.getElementById('tree-terrarium-btn').addEventListener('click', () => {
            this.startTerrariumMode();
        });
        
        // Spawn button - branch evolution from selected node
        document.getElementById('tree-spawn-btn').addEventListener('click', () => {
            this.spawnFromSelectedNode();
        });
        
        // Lineage Playback controls
        document.getElementById('lineage-prev-btn').addEventListener('click', () => {
            this.lineagePrevious();
        });
        document.getElementById('lineage-next-btn').addEventListener('click', () => {
            this.lineageNext();
        });
        document.getElementById('lineage-pause-btn').addEventListener('click', () => {
            this.toggleLineagePause();
        });
        document.getElementById('lineage-exit-btn').addEventListener('click', () => {
            this.exitLineageMode();
        });
        
        // Lineage day length control
        document.getElementById('lineage-day-length').addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (value >= 5 && value <= 300) {
                this.lineageDayDuration = value;
                document.getElementById('lineage-day-max').textContent = value;
                console.log(`[LINEAGE] Day length set to ${value} seconds`);
            }
        });
        
        // Terrarium controls
        document.getElementById('terrarium-reset-btn').addEventListener('click', () => {
            this.resetTerrariumCreature();
        });
        document.getElementById('terrarium-exit-btn').addEventListener('click', () => {
            this.exitTerrariumMode();
        });
        
        // Fitness mode selector
        const fitnessModeSelect = document.getElementById('fitness-mode');
        const modeDescriptions = {
            'distance': 'How far creatures travel from start',
            'efficiency': 'Distance per tile (straight-line movers win)',
            'jump': 'Max height after landing from spawn',
            'area': 'Total tiles lit up (coverage)',
            'outcast': 'Most different from the crowd wins',
            'random': 'Randomly changes each generation'
        };
        
        fitnessModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            this.evolution.setFitnessMode(mode);
            // Simulation uses the active mode (actual mode being used)
            this.simulation.fitnessMode = this.evolution.getActiveMode();
            document.getElementById('mode-description').textContent = modeDescriptions[mode] || '';
        });
        
        // Sudden Death Mode toggle - can be changed at any time
        const suddenDeathToggle = document.getElementById('sudden-death-toggle');
        suddenDeathToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            this.simulation.setSuddenDeathMode(enabled);
            // Update description to show status
            const desc = document.getElementById('sudden-death-desc');
            if (enabled) {
                desc.textContent = 'ACTIVE - Worst 75% eliminated!';
                desc.style.color = '#ff6666';
            } else {
                desc.textContent = 'Worst 75% eliminated after 10s';
                desc.style.color = '';
            }
        });
        
        // Tournament of Champions button
        document.getElementById('tournament-btn').addEventListener('click', () => {
            // Get the tournament size from the input (default to 10)
            const tournamentSizeInput = document.getElementById('tournament-size');
            const maxChampions = parseInt(tournamentSizeInput.value) || 10;
            this.startTournament(maxChampions);
        });
        
        // Tournament modal close button
        document.getElementById('close-tournament-modal').addEventListener('click', () => {
            document.getElementById('tournament-modal').classList.remove('active');
        });
        
        // Tournament modal click-outside-to-close
        document.getElementById('tournament-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('tournament-modal')) {
                document.getElementById('tournament-modal').classList.remove('active');
            }
        });
        
        // Resume evolution button (shown after tournament completes)
        document.getElementById('tournament-resume-btn').addEventListener('click', () => {
            this.resumeEvolutionAfterTournament();
        });
        
        // =====================================================================
        // SAVE / LOAD SIMULATION STATE
        // =====================================================================
        
        // Save button - exports full state to a JSON file for download
        document.getElementById('save-btn').addEventListener('click', () => {
            this.saveSimulation();
        });
        
        // Load button - triggers file picker for loading a saved state
        document.getElementById('load-btn').addEventListener('click', () => {
            document.getElementById('load-file-input').click();
        });
        
        // File input change handler - processes the selected save file
        document.getElementById('load-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadSimulation(file);
            }
            // Reset the input so the same file can be loaded again if needed
            e.target.value = '';
        });
        
        // Gravity slider - updates in real-time as user drags
        document.getElementById('gravity-slider').addEventListener('input', (e) => {
            const percent = parseInt(e.target.value);
            document.getElementById('gravity-display').textContent = percent + '%';
            // Update simulation gravity in real-time (works even during evolution)
            this.simulation.setGravity(percent / 100);
        });
        
        // Per-sensor mode dropdowns - each sensor can be Off/Start/Evolve
        const sensorTypes = ['gravity', 'light', 'velocity', 'ground', 'rhythm', 'tilt'];
        for (const type of sensorTypes) {
            const selectEl = document.getElementById(`sensor-${type}`);
            if (selectEl) {
                selectEl.addEventListener('change', (e) => {
                    if (typeof SensorConfig !== 'undefined') {
                        SensorConfig.setSensorMode(type, e.target.value);
                    }
                    this.updateSensorDescription();
                });
            }
        }
        
        // Initialize sensor UI state
        this.updateSensorDescription();
        
        // Initialize sensor modes from HTML dropdown defaults
        // This ensures SensorConfig matches the HTML even before Start is clicked
        if (typeof SensorConfig !== 'undefined') {
            const sensorTypes = ['gravity', 'light', 'velocity', 'ground', 'rhythm', 'tilt'];
            for (const type of sensorTypes) {
                const selectEl = document.getElementById(`sensor-${type}`);
                if (selectEl) {
                    SensorConfig.setSensorMode(type, selectEl.value);
                }
            }
        }
        
        // Initialize sudden death mode from checkbox state
        // (checkbox may be checked by default in HTML)
        const initialSuddenDeath = document.getElementById('sudden-death-toggle').checked;
        if (initialSuddenDeath) {
            this.simulation.setSuddenDeathMode(true);
            const desc = document.getElementById('sudden-death-desc');
            desc.textContent = 'ACTIVE - Worst 75% eliminated!';
            desc.style.color = '#ff6666';
        }
        
        // Set up callback so simulation can notify us when camera mode changes (e.g., from panning)
        this.simulation.onFollowLeaderChanged = () => {
            this.updateCameraButtonStates();
        };
    }
    
    /**
     * Update the sensor description text based on current per-sensor settings.
     * Shows counts of sensors in each mode (Start/Evolve).
     */
    updateSensorDescription() {
        const descEl = document.getElementById('sensor-description');
        if (!descEl) return;
        
        // Read mode from each sensor dropdown
        const sensorTypes = ['gravity', 'light', 'velocity', 'ground', 'rhythm', 'tilt'];
        let startCount = 0;
        let evolveCount = 0;
        
        for (const type of sensorTypes) {
            const selectEl = document.getElementById(`sensor-${type}`);
            if (selectEl) {
                const mode = selectEl.value;
                if (mode === 'start') startCount++;
                else if (mode === 'evolve') evolveCount++;
            }
        }
        
        // Build description string
        if (startCount === 0 && evolveCount === 0) {
            descEl.textContent = 'All off';
            descEl.style.color = '#888';
        } else {
            const parts = [];
            if (startCount > 0) parts.push(`${startCount} start`);
            if (evolveCount > 0) parts.push(`${evolveCount} evolve`);
            descEl.textContent = parts.join(', ');
            descEl.style.color = '#64ffda';
        }
    }
    
    /**
     * Update the camera control buttons to reflect current state
     */
    updateCameraButtonStates() {
        const followBtn = document.getElementById('cam-follow');
        const overviewBtn = document.getElementById('cam-overview');
        const helpText = document.getElementById('camera-help-text');
        
        // Update Follow Leader button
        if (this.simulation.followLeader) {
            followBtn.classList.add('active');
            followBtn.classList.remove('secondary');
        } else {
            followBtn.classList.remove('active');
            followBtn.classList.add('secondary');
        }
        
        // Update Overview button
        if (this.simulation.overviewMode) {
            overviewBtn.classList.add('active');
            overviewBtn.classList.remove('secondary');
        } else {
            overviewBtn.classList.remove('active');
            overviewBtn.classList.add('secondary');
        }
        
        // Update help text based on mode combination
        if (this.simulation.overviewMode && this.simulation.followLeader) {
            // Both modes active: Top-down tracking view, zoom only
            helpText.innerHTML = '<kbd>Scroll</kbd> zoom &middot; Top-down view tracking creature';
        } else if (this.simulation.overviewMode && !this.simulation.followLeader) {
            // Overview only: Top-down view with user control
            helpText.innerHTML = '<kbd>Drag</kbd> rotate &middot; <kbd>Right-drag</kbd> pan &middot; <kbd>Scroll</kbd> zoom &middot; Top-down view';
        } else if (!this.simulation.overviewMode && this.simulation.followLeader) {
            // Follow only: Normal 3D following camera
            helpText.innerHTML = '<kbd>Drag</kbd> rotate &middot; <kbd>Right-drag</kbd> pan &middot; <kbd>Scroll</kbd> zoom &middot; Following best creature';
        } else {
            // Neither mode: Free camera
            helpText.innerHTML = '<kbd>Drag</kbd> rotate &middot; <kbd>Right-drag</kbd> pan &middot; <kbd>Scroll</kbd> zoom &middot; <kbd>Click</kbd> select &middot; Free camera';
        }
    }
    
    startEvolution() {
        const instancesPerConfig = parseInt(document.getElementById('instances-input').value) || 4;
        const numConfigurations = parseInt(document.getElementById('configs-input').value) || 5;
        const blocksPerGeneration = parseInt(document.getElementById('blocks-per-gen-input').value) || 1;
        const maxBlocks = parseInt(document.getElementById('max-blocks-input').value) || 0;
        const randomizeBlockCount = document.getElementById('random-blocks-checkbox').checked;
        const enableLimbGeneration = document.getElementById('limb-gen-checkbox').checked;
        const roundDuration = parseInt(document.getElementById('round-duration-input').value) || 60;
        const gravityPercent = parseInt(document.getElementById('gravity-slider').value) || 100;
        
        // Configure sensor settings from per-sensor dropdowns
        if (typeof SensorConfig !== 'undefined') {
            const sensorTypes = ['gravity', 'light', 'velocity', 'ground', 'rhythm', 'tilt'];
            for (const type of sensorTypes) {
                const selectEl = document.getElementById(`sensor-${type}`);
                if (selectEl) {
                    SensorConfig.setSensorMode(type, selectEl.value);
                }
            }
            console.log('[START] Sensor config - Start:', SensorConfig.getStartTypes().join(', ') || 'none',
                        '| Evolve:', SensorConfig.getEvolveTypes().join(', ') || 'none');
        }
        
        // Set round duration in simulation
        this.simulation.setMaxTime(roundDuration);
        
        // Set gravity (convert percentage to multiplier: 100% -> 1.0)
        this.simulation.setGravity(gravityPercent / 100);
        
        // Get the selected fitness mode
        const fitnessMode = document.getElementById('fitness-mode').value;
        this.evolution.setFitnessMode(fitnessMode);
        // Simulation uses the active mode (actual mode being used)
        this.simulation.fitnessMode = this.evolution.getActiveMode();
        
        // Check if we have an existing population (e.g., from a loaded save file)
        // If so, continue from where we left off instead of starting fresh
        if (this.evolution.hasExistingPopulation()) {
            console.log('[START] Continuing from existing population...');
            this.evolution.continueEvolution(instancesPerConfig, numConfigurations, blocksPerGeneration, randomizeBlockCount, enableLimbGeneration, maxBlocks);
        } else {
            console.log('[START] Starting fresh evolution...');
            this.evolution.startEvolution(instancesPerConfig, numConfigurations, blocksPerGeneration, randomizeBlockCount, enableLimbGeneration, maxBlocks);
        }
        
        this.isEvaluating = true;
        this.isTransitioning = false;
        
        this.evaluateGeneration();
        
        document.getElementById('start-btn').disabled = true;
        document.getElementById('pause-btn').disabled = false;
        document.getElementById('skip-btn').disabled = false;
        
        // Disable settings that can't be changed during evolution
        document.getElementById('fitness-mode').disabled = true;
        document.getElementById('instances-input').disabled = true;
        document.getElementById('configs-input').disabled = true;
        document.getElementById('blocks-per-gen-input').disabled = true;
        document.getElementById('max-blocks-input').disabled = true;
        document.getElementById('random-blocks-checkbox').disabled = true;
        document.getElementById('limb-gen-checkbox').disabled = true;
        document.getElementById('round-duration-input').disabled = true;
        
        // Disable sensor dropdowns during evolution
        const sensorTypes = ['gravity', 'light', 'velocity', 'ground', 'rhythm', 'tilt'];
        for (const type of sensorTypes) {
            const selectEl = document.getElementById(`sensor-${type}`);
            if (selectEl) selectEl.disabled = true;
        }
    }
    
    evaluateGeneration() {
        const population = this.evolution.population;
        
        if (!population || population.length === 0) {
            console.error('No population to evaluate');
            this.isEvaluating = false;
            return;
        }
        
        this.simulation.removeAllCreatures();
        this.simulation.timeElapsed = 0;
        this.simulation.spawnMultipleCreatures(population);
        this.simulation.start();
        
        this.updateUI();
    }
    
    completeGeneration() {
        if (!this.isEvaluating || this.isTransitioning) return;
        
        this.isTransitioning = true;
        this.simulation.stop();
        
        if (!this.evolution.population || this.evolution.population.length === 0) {
            this.isEvaluating = false;
            this.isTransitioning = false;
            return;
        }
        
        // Get current active mode for fitness calculations
        const activeMode = this.evolution.getActiveMode();
        
        console.log(`\n=== Completing Generation ${this.evolution.generation} ===`);
        console.log(`Fitness mode: ${activeMode}`);
        console.log(`Population size: ${this.evolution.population.length}`);
        
        // Calculate fitness for all creatures (handles outcast mode properly)
        this.calculateFitnessForCreatures(this.evolution.population, activeMode);
        
        // Find best creature
        let bestCreature = this.evolution.population[0];
        
        // Log all creatures for debugging
        console.log(`Evaluating all creatures:`);
        for (let creature of this.evolution.population) {
            const marker = creature.isDefendingChampion ? ' [DEFENDING]' : '';
            console.log(`  ${creature.name}: ${creature.blocks.length} blocks, fitness=${creature.fitness.toFixed(2)}${marker}`);
            if (creature.fitness > bestCreature.fitness) {
                bestCreature = creature;
            }
        }
        
        console.log(`WINNER: ${bestCreature.name} with ${bestCreature.blocks.length} blocks, fitness=${bestCreature.fitness.toFixed(2)}`);
        if (bestCreature.isDefendingChampion) {
            console.log(`   (This is the defending champion - no new block added)`);
        }
        
        // Start celebration! Losers explode, winner gets spotlight
        this.simulation.startCelebration(bestCreature, () => {
            // This callback fires after 5 second celebration
            
            // Report to evolution manager
            this.evolution.onCreatureEvaluated(bestCreature, bestCreature.maxDistance, bestCreature.maxHeight);
            
            if (!this.evolution.population || this.evolution.population.length === 0) {
                this.isEvaluating = false;
                this.isTransitioning = false;
                return;
            }
            
            // Start next generation
            this.evaluateGeneration();
            this.isTransitioning = false;
        });
    }
    
    // =========================================================================
    // TOURNAMENT OF CHAMPIONS
    // All historical champions compete against each other to find the best
    // =========================================================================
    
    /**
     * Start a Tournament of Champions
     * 
     * This stops the current evolution, gathers the top historical champions,
     * and has them compete in a single elimination-style tournament round.
     * The tournament uses the current fitness mode for fair comparison.
     * 
     * Champions are selected from most recent generations first, sorted by
     * fitness within each generation.
     * 
     * @param {number} maxChampions - Maximum number of champions to include (default 10)
     */
    startTournament(maxChampions = 10) {
        // Check if we have enough champions
        const championCount = this.evolution.getChampionCount();
        if (championCount < 2) {
            alert('Need at least 2 champions to hold a tournament!\nKeep evolving to crown more champions.');
            return;
        }
        
        // Cap maxChampions at available count
        const actualMax = Math.min(maxChampions, championCount);
        
        console.log('\n' + '='.repeat(60));
        console.log('TOURNAMENT OF CHAMPIONS BEGINS!');
        console.log('='.repeat(60));
        console.log(`Selecting top ${actualMax} champions from ${championCount} available`);
        
        // Save current evolution state so we can resume later
        this.savedEvolutionState = {
            generation: this.evolution.generation,
            wasEvaluating: this.isEvaluating,
            wasTransitioning: this.isTransitioning
        };
        
        // Stop current evolution
        this.isEvaluating = false;
        this.isTransitioning = false;
        this.simulation.stop();
        
        // Enter tournament mode
        this.isTournamentMode = true;
        
        // Gather the top historical champions (sorted by generation desc, then fitness desc)
        this.tournamentChampions = this.evolution.getAllChampions(actualMax);
        
        console.log(`Tournament contestants: ${this.tournamentChampions.length} champions`);
        
        // Show the tournament leaderboard panel (not the modal)
        this.showTournamentLeaderboard();
        
        // Create the tournament population (just the creatures)
        const tournamentPopulation = this.tournamentChampions.map(c => c.creature);
        
        // Use the current active mode for consistency
        const tournamentMode = this.evolution.getActiveMode();
        this.simulation.fitnessMode = tournamentMode;
        
        console.log(`Tournament fitness mode: ${tournamentMode}`);
        
        // Clear the simulation and spawn all champions
        this.simulation.removeAllCreatures();
        this.simulation.timeElapsed = 0;
        this.simulation.spawnMultipleCreatures(tournamentPopulation);
        this.simulation.start();
        
        // Update UI for tournament mode
        document.getElementById('generation').textContent = 'TOURNAMENT';
        document.getElementById('creature-id').textContent = this.tournamentChampions.length;
        
        // Update tournament leaderboard header
        document.getElementById('tournament-mode').textContent = tournamentMode;
        
        // Disable evolution controls during tournament
        document.getElementById('start-btn').disabled = true;
        document.getElementById('tournament-btn').disabled = true;
    }
    
    /**
     * Calculate fitness for a set of creatures.
     * For outcast mode, this requires population-level analysis.
     * For other modes, fitness is calculated individually.
     * 
     * @param {Array} creatures - Array of creatures to calculate fitness for
     * @param {string} mode - The fitness mode to use
     */
    calculateFitnessForCreatures(creatures, mode) {
        if (!creatures || creatures.length === 0) return;
        
        if (mode === 'outcast') {
            // Outcast mode requires population-level analysis
            // We need to find the average across all creatures, then score by deviation
            
            // First pass: gather metrics and find ranges for normalization
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
            
            // Second pass: calculate outcast score (deviation from average)
            for (let m of metrics) {
                const normDist = m.distance / maxDistance;
                const normHeight = m.height / maxHeight;
                const normTiles = m.tiles / maxTiles;
                const normJump = m.jump / maxJump;
                
                const devDist = Math.abs(normDist - avgDistance);
                const devHeight = Math.abs(normHeight - avgHeight);
                const devTiles = Math.abs(normTiles - avgTiles);
                const devJump = Math.abs(normJump - avgJump);
                
                // Total deviation = outcast score
                m.creature.fitness = (devDist + devHeight + devTiles + devJump) * 100;
            }
        } else {
            // Standard fitness modes - calculate individually
            for (let creature of creatures) {
                creature.calculateFitness(mode);
            }
        }
    }
    
    /**
     * Show the tournament leaderboard panel on the right side
     */
    showTournamentLeaderboard() {
        // Hide selected creature panel, show tournament leaderboard
        document.getElementById('selected-creature-panel').style.display = 'none';
        document.getElementById('tournament-leaderboard').classList.add('active');
    }
    
    /**
     * Hide the tournament leaderboard panel
     */
    hideTournamentLeaderboard() {
        document.getElementById('tournament-leaderboard').classList.remove('active');
    }
    
    /**
     * Update the tournament leaderboard with current rankings
     */
    updateTournamentLeaderboard() {
        if (!this.isTournamentMode || !this.tournamentChampions) return;
        
        const activeMode = this.simulation.fitnessMode;
        
        // Get all tournament creatures and calculate their fitness
        const creatures = this.tournamentChampions.map(entry => entry.creature);
        this.calculateFitnessForCreatures(creatures, activeMode);
        
        // Build rankings from the calculated fitness values
        const rankings = [];
        for (let entry of this.tournamentChampions) {
            rankings.push({
                name: entry.creature.name,
                generation: entry.nodeData.generation,
                fitness: entry.creature.fitness,
                creature: entry.creature
            });
        }
        
        // Sort by fitness descending
        rankings.sort((a, b) => b.fitness - a.fitness);
        
        // Build the rankings HTML
        const container = document.getElementById('tournament-rankings');
        let html = '';
        
        for (let i = 0; i < rankings.length; i++) {
            const r = rankings[i];
            const isLeader = i === 0;
            const rankDisplay = i < 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] : `#${i + 1}`;
            
            html += `<div class="leaderboard-entry${isLeader ? ' leader' : ''}">`;
            html += `<span class="leaderboard-rank">${rankDisplay}</span>`;
            html += `<span class="leaderboard-gen">G${r.generation}</span>`;
            html += `<span class="leaderboard-name">${r.name}</span>`;
            html += `<span class="leaderboard-fitness">${r.fitness.toFixed(1)}</span>`;
            html += `</div>`;
        }
        
        container.innerHTML = html;
        
        // Update time remaining
        const timeRemaining = this.simulation.getRemainingTime();
        document.getElementById('tournament-time').textContent = timeRemaining.toFixed(0) + 's';
    }

    
    /**
     * Complete the Tournament of Champions
     * 
     * Called when tournament time is up. Finds the ultimate champion
     * and displays the results.
     */
    completeTournament() {
        if (!this.isTournamentMode) return;
        
        // IMPORTANT: Set this to false immediately to prevent re-entry
        // The animation loop keeps checking isTimeUp() and would call this repeatedly
        this.isTournamentMode = false;
        
        console.log('\n' + '='.repeat(60));
        console.log('TOURNAMENT COMPLETE!');
        console.log('='.repeat(60));
        
        this.simulation.stop();
        
        // Get the tournament fitness mode
        const tournamentMode = this.simulation.fitnessMode;
        
        // Calculate fitness for all tournament creatures (handles outcast mode properly)
        const creatures = this.tournamentChampions.map(entry => entry.creature);
        this.calculateFitnessForCreatures(creatures, tournamentMode);
        
        // Find the winner from calculated fitness values
        let winner = null;
        let winnerFitness = -Infinity;
        let results = [];
        
        for (let championEntry of this.tournamentChampions) {
            const creature = championEntry.creature;
            
            results.push({
                name: creature.name,
                generation: championEntry.nodeData.generation,
                blocks: creature.blocks.length,
                originalFitness: championEntry.nodeData.fitness,
                tournamentFitness: creature.fitness,
                distance: creature.maxDistance,
                height: creature.maxHeight
            });
            
            console.log(`  Gen ${championEntry.nodeData.generation} (${creature.name}): ` +
                        `${creature.blocks.length} blocks, fitness=${creature.fitness.toFixed(2)}`);
            
            if (creature.fitness > winnerFitness) {
                winnerFitness = creature.fitness;
                winner = championEntry;
            }
        }
        
        // Sort results by tournament fitness (best first)
        results.sort((a, b) => b.tournamentFitness - a.tournamentFitness);
        
        console.log('TOURNAMENT WINNER: ' + winner.creature.name);
        console.log(`   From Generation ${winner.nodeData.generation}`);
        console.log(`   Blocks: ${winner.creature.blocks.length}`);
        console.log(`   Tournament Fitness: ${winnerFitness.toFixed(2)}`);
        
        // Store winner info for after celebration
        this.tournamentWinner = winner;
        this.tournamentResults = results;
        this.tournamentFitnessMode = tournamentMode;
        
        // Start celebration for the tournament winner
        this.simulation.startCelebration(winner.creature, () => {
            // After celebration, continue evolution with the winner as new champion
            this.finishTournamentAndContinueEvolution();
        });
    }
    
    /**
     * Called after tournament celebration ends
     * Sets the tournament winner as the new champion and continues evolution
     */
    finishTournamentAndContinueEvolution() {
        const winner = this.tournamentWinner;
        const results = this.tournamentResults;
        const tournamentMode = this.tournamentFitnessMode;
        
        console.log('\n[TOURNAMENT] Setting winner as new evolution champion...');
        
        // Close the tournament modal if it's open (legacy)
        document.getElementById('tournament-modal').classList.remove('active');
        
        // Hide the tournament leaderboard panel
        this.hideTournamentLeaderboard();
        
        // Exit tournament mode
        this.isTournamentMode = false;
        this.tournamentChampions = [];
        
        // Re-enable controls
        document.getElementById('tournament-btn').disabled = false;
        
        // The tournament winner becomes the new evolution champion
        // Clone the creature so we have a fresh copy
        const newChampion = winner.creature.clone();
        
        // Update the evolution manager with the new champion
        // This is similar to what happens in onCreatureEvaluated when progress is made
        this.evolution.champion = newChampion;
        this.evolution.targetFitness = winner.creature.fitness;
        this.evolution.targetFitnessMode = tournamentMode;
        
        // Store all champion metrics
        this.evolution.targetDistance = winner.creature.maxDistance;
        this.evolution.targetHeight = winner.creature.maxHeight;
        this.evolution.targetTilesLit = winner.creature.getTileCount ? winner.creature.getTileCount() : 0;
        this.evolution.targetJumpHeight = winner.creature.maxJumpHeight || 0;
        
        // Update all-time champion if this is better
        if (!this.evolution.allTimeChampion || winner.creature.fitness > this.evolution.allTimeChampion.fitness) {
            this.evolution.allTimeChampion = newChampion.clone();
        }
        
        // Log the tournament result as an evolution event
        this.evolution.logEvent('TOURNAMENT_WINNER', {
            creatureName: winner.creature.name,
            originalGeneration: winner.nodeData.generation,
            fitness: winner.creature.fitness,
            blocks: winner.creature.blocks.length,
            contestants: results.length,
            fitnessMode: tournamentMode
        });
        
        // GENETIC LINE CONTINUATION: Continue from the winner's generation
        // Set generation BEFORE updating tree to ensure consistency
        const previousGeneration = this.evolution.generation;
        this.evolution.generation = winner.nodeData.generation + 1;
        
        // Point the current branch to the winner's original tree node
        // This maintains correct parent-child relationships in the tree
        // The winner's node already exists - we don't need to add a duplicate
        if (winner.nodeData && winner.nodeData.id) {
            this.evolution.currentBranchId = winner.nodeData.id;
            console.log(`   Linking to original tree node #${winner.nodeData.id}`);
        }
        
        console.log(`   New champion: "${newChampion.name}" with ${newChampion.blocks.length} blocks`);
        console.log(`   New target fitness: ${this.evolution.targetFitness.toFixed(2)}`);
        console.log(`   Genetic line continuation: Gen ${previousGeneration} -> Gen ${this.evolution.generation} (from winner's Gen ${winner.nodeData.generation})`);
        console.log(`   Winner "${winner.creature.name}" spawns new genetic line`);
        
        // If in random mode, pick a new mode for the next generation
        if (this.evolution.isRandomMode) {
            this.evolution.selectNextRandomMode();
        }
        
        // Create next generation from the tournament winner
        this.evolution.createNextGeneration(newChampion);
        
        // Continue evolution
        this.isEvaluating = true;
        this.isTransitioning = false;
        this.evaluateGeneration();
        
        console.log(`[TOURNAMENT] Evolution continues at Generation ${this.evolution.generation}`);
        
        // Clear tournament state
        this.tournamentWinner = null;
        this.tournamentResults = null;
        this.tournamentFitnessMode = null;
        this.savedEvolutionState = null;
    }
    
    /**
     * Show the tournament modal with current status
     * @param {string} status - 'running' or 'complete'
     */
    showTournamentModal(status) {
        const modal = document.getElementById('tournament-modal');
        const statusDiv = document.getElementById('tournament-status');
        const contentDiv = document.getElementById('tournament-content');
        const resumeBtn = document.getElementById('tournament-resume-btn');
        
        if (status === 'running') {
            statusDiv.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 15px;">&#x23F1;</div>
                <div style="font-size: 18px; font-weight: bold;">Tournament in Progress!</div>
                <div style="margin-top: 10px; color: #888;">
                    ${this.tournamentChampions.length} champions competing...
                </div>
            `;
            contentDiv.innerHTML = this.buildTournamentContestantList();
            resumeBtn.style.display = 'none';
        }
        
        modal.classList.add('active');
    }
    
    /**
     * Build HTML list of tournament contestants
     */
    buildTournamentContestantList() {
        let html = '<div style="margin-top: 15px;">';
        html += '<h3 style="color: #64ffda; margin-bottom: 10px;">Contestants</h3>';
        html += '<div style="color: #888; font-size: 11px; margin-bottom: 10px;">Sorted by generation (newest first), then by fitness</div>';
        
        for (let entry of this.tournamentChampions) {
            const node = entry.nodeData;
            html += `<div style="padding: 8px; margin: 4px 0; background: rgba(100,255,218,0.1); border-radius: 4px;">`;
            html += `<span style="color: #ffd700;">\u{1F451}</span> `;  // Crown emoji
            html += `<span style="color: #64ffda; font-weight: bold;">Gen ${node.generation}</span> `;
            html += `<span style="color: #888;">- ${node.name}</span> `;
            html += `<span style="color: #666;">(${node.blocks} blocks, fitness: ${node.fitness.toFixed(1)})</span>`;
            html += `</div>`;
        }
        
        html += '</div>';
        return html;
    }
    
    /**
     * Show tournament results in the modal
     */
    showTournamentResults(winner, results, mode) {
        const statusDiv = document.getElementById('tournament-status');
        const contentDiv = document.getElementById('tournament-content');
        const resumeBtn = document.getElementById('tournament-resume-btn');
        
        // Winner announcement
        statusDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 10px;">&#x1F3C6;</div>
            <div style="font-size: 20px; font-weight: bold; color: #ffd700;">
                CHAMPION OF CHAMPIONS!
            </div>
            <div style="font-size: 24px; margin-top: 10px; color: #64ffda;">
                Generation ${winner.nodeData.generation}
            </div>
            <div style="color: #888; margin-top: 5px;">
                ${winner.creature.name} - ${winner.creature.blocks.length} blocks
            </div>
            <div style="color: #4ade80; margin-top: 5px; font-size: 18px;">
                Fitness: ${winner.creature.fitness.toFixed(2)}
            </div>
        `;
        
        // Results table
        let html = '<div style="margin-top: 20px;">';
        html += '<h3 style="color: #64ffda; margin-bottom: 10px;">Final Standings (Mode: ' + mode + ')</h3>';
        
        // Medal emojis for top 3
        const medals = ['[1st]', '[2nd]', '[3rd]'];
        
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const medal = i < 3 ? medals[i] : '  ';
            const isWinner = i === 0;
            
            const bgColor = isWinner ? 'rgba(255,215,0,0.2)' : 'rgba(100,255,218,0.05)';
            const borderColor = isWinner ? '#ffd700' : 'transparent';
            
            html += `<div style="padding: 10px; margin: 4px 0; background: ${bgColor}; 
                     border-radius: 4px; border-left: 3px solid ${borderColor};">`;
            html += `<span style="font-size: 16px;">${medal}</span> `;
            html += `<span style="color: #64ffda; font-weight: bold;">#${i + 1}</span> `;
            html += `<span style="color: #ffd700;">Gen ${r.generation}</span> `;
            html += `<span style="color: #888;">${r.name}</span><br>`;
            html += `<span style="color: #666; font-size: 12px; margin-left: 28px;">`;
            html += `${r.blocks} blocks - `;
            html += `Fitness: <span style="color: #4ade80;">${r.tournamentFitness.toFixed(2)}</span> - `;
            html += `Distance: ${r.distance.toFixed(1)}m`;
            html += `</span>`;
            html += `</div>`;
        }
        
        html += '</div>';
        contentDiv.innerHTML = html;
        
        // Show resume button
        resumeBtn.style.display = 'inline-block';
        resumeBtn.textContent = '> Resume Evolution';
    }
    
    /**
     * Resume normal evolution after a tournament
     */
    resumeEvolutionAfterTournament() {
        console.log('\n[RESUME] Resuming evolution after tournament...');
        
        // Close the modal
        document.getElementById('tournament-modal').classList.remove('active');
        
        // Exit tournament mode
        this.isTournamentMode = false;
        this.tournamentChampions = [];
        
        // Re-enable controls
        document.getElementById('tournament-btn').disabled = false;
        
        // If we were evaluating before, restart the current generation
        if (this.savedEvolutionState && this.savedEvolutionState.wasEvaluating) {
            this.isEvaluating = true;
            this.isTransitioning = false;
            this.evaluateGeneration();
        } else {
            // Just update UI to show current state
            document.getElementById('start-btn').disabled = false;
        }
        
        this.savedEvolutionState = null;
    }
    
    // =========================================================================
    // LINEAGE PLAYBACK MODE
    // Watch a creature's evolutionary history unfold day by day
    // =========================================================================
    
    /**
     * Update the tree mode buttons based on selected node
     */
    updateTreeModeButtons(nodeData) {
        const lineageBtn = document.getElementById('tree-lineage-btn');
        const terrariumBtn = document.getElementById('tree-terrarium-btn');
        const spawnBtn = document.getElementById('tree-spawn-btn');
        
        if (nodeData && nodeData.creatureClone) {
            lineageBtn.disabled = false;
            terrariumBtn.disabled = false;
            spawnBtn.disabled = false;
            lineageBtn.title = `Watch ${nodeData.name}'s lineage evolve`;
            terrariumBtn.title = `Watch ${nodeData.name} roam freely`;
            spawnBtn.title = `Branch evolution from ${nodeData.name}`;
        } else {
            lineageBtn.disabled = true;
            terrariumBtn.disabled = true;
            spawnBtn.disabled = true;
            lineageBtn.title = 'Select a creature first';
            terrariumBtn.title = 'Select a creature first';
            spawnBtn.title = 'Select a creature first';
        }
    }
    
    /**
     * Start lineage playback mode for the selected tree node
     * Traces back to the root and plays each ancestor in sequence
     */
    startLineagePlayback() {
        if (!this.selectedTreeNodeId) {
            alert('Please click on a creature in the tree first to select it.');
            return;
        }
        
        // Get the lineage from root to selected creature
        this.lineageData = this.evolution.getLineageToRoot(this.selectedTreeNodeId);
        
        if (this.lineageData.length === 0) {
            alert('Could not trace lineage for this creature.');
            return;
        }
        
        // Check that all creatures in lineage have data
        const missingData = this.lineageData.filter(l => !l.creature);
        if (missingData.length > 0) {
            const confirm = window.confirm(
                `Warning: ${missingData.length} of ${this.lineageData.length} ancestors are missing creature data.\n\n` +
                `Playback will skip these generations.\n\nContinue anyway?`
            );
            if (!confirm) return;
            
            // Filter to only creatures with data
            this.lineageData = this.lineageData.filter(l => l.creature);
        }
        
        if (this.lineageData.length === 0) {
            alert('No valid creatures found in lineage.');
            return;
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`LINEAGE PLAYBACK: ${this.lineageData.length} generations`);
        console.log(`From: Generation ${this.lineageData[0].node.generation}`);
        console.log(`To: ${this.lineageData[this.lineageData.length - 1].node.name}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // Save current state
        this.savedEvolutionState = {
            generation: this.evolution.generation,
            wasEvaluating: this.isEvaluating,
            wasTransitioning: this.isTransitioning
        };
        
        // Stop current simulation
        this.isEvaluating = false;
        this.isTransitioning = false;
        this.simulation.stop();
        
        // Enter lineage mode
        this.isLineageMode = true;
        this.lineageIndex = 0;
        this.lineageDayTimer = 0;
        this.lineagePaused = false;
        
        // Close tree modal
        document.getElementById('evolution-tree-modal').classList.remove('active');
        
        // Show lineage panel, hide others
        document.getElementById('selected-creature-panel').style.display = 'none';
        document.getElementById('tournament-leaderboard').classList.remove('active');
        document.getElementById('lineage-playback-panel').style.display = 'block';
        
        // Disable evolution controls
        document.getElementById('start-btn').disabled = true;
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('skip-btn').disabled = true;
        document.getElementById('tournament-btn').disabled = true;
        
        // Start with the first creature in lineage
        this.spawnLineageCreature(0);
        this.updateLineageUI();
    }
    
    /**
     * Spawn a creature from the lineage at the given index
     */
    spawnLineageCreature(index) {
        if (index < 0 || index >= this.lineageData.length) return;
        
        const entry = this.lineageData[index];
        const creature = entry.creature.clone();
        creature.resetFitnessTracking();
        
        // Clear simulation and spawn just this creature
        this.simulation.removeAllCreatures();
        this.simulation.clearTracks();
        this.simulation.spawnMultipleCreatures([creature]);
        this.simulation.timeElapsed = 0;
        this.simulation.maxTime = 999999; // No time limit in lineage mode
        this.simulation.start();
        
        // Follow this creature
        this.simulation.followLeader = true;
        this.simulation.overviewMode = false;
        
        console.log(`[LINEAGE] Day ${index + 1}: ${entry.node.name} (Gen ${entry.node.generation}, ${entry.node.blocks} blocks)`);
    }
    
    /**
     * Update the lineage playback UI
     */
    updateLineageUI() {
        if (!this.isLineageMode || this.lineageData.length === 0) return;
        
        const entry = this.lineageData[this.lineageIndex];
        
        document.getElementById('lineage-current-name').textContent = entry.node.name;
        document.getElementById('lineage-step').textContent = this.lineageIndex + 1;
        document.getElementById('lineage-total').textContent = this.lineageData.length;
        document.getElementById('lineage-generation').textContent = entry.node.generation;
        document.getElementById('lineage-blocks').textContent = entry.node.blocks;
        
        // Show current seconds into this day (1-based for display)
        document.getElementById('lineage-day').textContent = Math.floor(this.lineageDayTimer) + 1;
        document.getElementById('lineage-day-max').textContent = this.lineageDayDuration;
        
        // Progress within current creature's day
        const dayProgress = (this.lineageDayTimer / this.lineageDayDuration) * 100;
        document.getElementById('lineage-progress-fill').style.width = dayProgress + '%';
        
        // Update pause button
        const pauseBtn = document.getElementById('lineage-pause-btn');
        pauseBtn.textContent = this.lineagePaused ? '\u25B6' : '\u23F8';
        
        // Update generation display
        document.getElementById('generation').textContent = `LIN ${this.lineageIndex + 1}/${this.lineageData.length}`;
    }
    
    /**
     * Advance to the previous creature in lineage
     */
    lineagePrevious() {
        if (this.lineageIndex > 0) {
            this.lineageIndex--;
            this.lineageDayTimer = 0;
            this.spawnLineageCreature(this.lineageIndex);
            this.updateLineageUI();
        }
    }
    
    /**
     * Advance to the next creature in lineage
     */
    lineageNext() {
        if (this.lineageIndex < this.lineageData.length - 1) {
            this.lineageIndex++;
            this.lineageDayTimer = 0;
            this.spawnLineageCreature(this.lineageIndex);
            this.updateLineageUI();
        }
    }
    
    /**
     * Toggle pause state for lineage playback
     */
    toggleLineagePause() {
        this.lineagePaused = !this.lineagePaused;
        if (this.lineagePaused) {
            this.simulation.pause();
        } else {
            this.simulation.resume();
        }
        this.updateLineageUI();
    }
    
    /**
     * Exit lineage playback mode and return to normal
     */
    exitLineageMode() {
        console.log('[LINEAGE] Exiting lineage playback mode');
        
        this.isLineageMode = false;
        this.lineageData = [];
        this.lineageIndex = 0;
        
        // Reset day/night cycle override
        this.simulation.overrideDayProgress = -1;
        
        // Hide lineage panel
        document.getElementById('lineage-playback-panel').style.display = 'none';
        
        // Stop simulation
        this.simulation.stop();
        this.simulation.removeAllCreatures();
        this.simulation.clearTracks();
        
        // Re-enable controls
        document.getElementById('start-btn').disabled = false;
        document.getElementById('tournament-btn').disabled = this.evolution.getChampionCount() < 2;
        
        // Restore normal time limit
        const roundDuration = parseInt(document.getElementById('round-duration-input').value) || 60;
        this.simulation.maxTime = roundDuration;
        
        // Update UI
        document.getElementById('generation').textContent = this.evolution.generation;
        this.updateUI();
        
        this.savedEvolutionState = null;
    }
    
    /**
     * Update lineage playback - called from animation loop
     */
    updateLineagePlayback(deltaTime) {
        if (!this.isLineageMode) return;
        
        // Always update day/night cycle in lineage mode (even when paused)
        // This keeps the sun at the correct position
        const dayProgress = this.lineageDayTimer / this.lineageDayDuration;
        this.simulation.overrideDayProgress = Math.min(dayProgress, 1.0);
        this.simulation.updateDayNightCycle();
        
        // If paused, don't advance the timer
        if (this.lineagePaused) return;
        
        // Increment day timer
        this.lineageDayTimer += deltaTime;
        
        // Check if it's time to advance to next creature
        if (this.lineageDayTimer >= this.lineageDayDuration) {
            if (this.lineageIndex < this.lineageData.length - 1) {
                // Advance to next creature
                this.lineageIndex++;
                this.lineageDayTimer = 0;
                this.spawnLineageCreature(this.lineageIndex);
                console.log(`[LINEAGE] Advanced to generation ${this.lineageData[this.lineageIndex].node.generation}`);
            } else {
                // Reached the end - pause at final creature
                this.lineagePaused = true;
                console.log('[LINEAGE] Reached final creature in lineage');
            }
        }
        
        this.updateLineageUI();
    }
    
    // =========================================================================
    // TERRARIUM MODE
    // Watch a single creature roam freely like a pet
    // =========================================================================
    
    /**
     * Start terrarium mode for the selected tree node
     */
    startTerrariumMode() {
        if (!this.selectedTreeNodeId) {
            alert('Please click on a creature in the tree first to select it.');
            return;
        }
        
        // Get the creature from the node
        const result = this.evolution.getCreatureFromNode(this.selectedTreeNodeId);
        
        if (!result) {
            alert('Could not load creature data for this node.');
            return;
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TERRARIUM MODE: ${result.node.name}`);
        console.log(`Generation ${result.node.generation}, ${result.node.blocks} blocks`);
        console.log(`${'='.repeat(60)}\n`);
        
        // Save current state
        this.savedEvolutionState = {
            generation: this.evolution.generation,
            wasEvaluating: this.isEvaluating,
            wasTransitioning: this.isTransitioning
        };
        
        // Stop current simulation
        this.isEvaluating = false;
        this.isTransitioning = false;
        this.simulation.stop();
        
        // Enter terrarium mode
        this.isTerrariumMode = true;
        this.terrariumNode = result.node;
        this.terrariumCreature = result.creature;
        this.terrariumStartTime = Date.now();
        
        // Close tree modal
        document.getElementById('evolution-tree-modal').classList.remove('active');
        
        // Show terrarium panel, hide others
        document.getElementById('selected-creature-panel').style.display = 'none';
        document.getElementById('tournament-leaderboard').classList.remove('active');
        document.getElementById('terrarium-panel').style.display = 'block';
        
        // Disable evolution controls
        document.getElementById('start-btn').disabled = true;
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('skip-btn').disabled = true;
        document.getElementById('tournament-btn').disabled = true;
        
        // Spawn the terrarium creature
        this.spawnTerrariumCreature();
        this.updateTerrariumUI();
    }
    
    /**
     * Spawn (or respawn) the terrarium creature
     */
    spawnTerrariumCreature() {
        const creature = this.terrariumCreature.clone();
        creature.resetFitnessTracking();
        
        // Clear simulation and spawn just this creature
        this.simulation.removeAllCreatures();
        this.simulation.clearTracks();
        this.simulation.spawnMultipleCreatures([creature]);
        this.simulation.timeElapsed = 0;
        this.simulation.maxTime = 999999; // No time limit in terrarium mode
        this.simulation.start();
        
        // Follow this creature
        this.simulation.followLeader = true;
        this.simulation.overviewMode = false;
    }
    
    /**
     * Reset the terrarium creature to starting position
     */
    resetTerrariumCreature() {
        console.log('[TERRARIUM] Resetting creature position');
        this.spawnTerrariumCreature();
    }
    
    /**
     * Update the terrarium UI
     */
    updateTerrariumUI() {
        if (!this.isTerrariumMode) return;
        
        document.getElementById('terrarium-name').textContent = this.terrariumNode.name;
        document.getElementById('terrarium-generation').textContent = this.terrariumNode.generation;
        document.getElementById('terrarium-blocks').textContent = this.terrariumNode.blocks;
        
        // Get current creature stats from simulation
        if (this.simulation.activeCreatures && this.simulation.activeCreatures.length > 0) {
            const creature = this.simulation.activeCreatures[0];
            document.getElementById('terrarium-distance').textContent = creature.maxDistance.toFixed(2) + 'm';
            document.getElementById('terrarium-height').textContent = creature.maxHeight.toFixed(2) + 'm';
        }
        
        // Time alive
        const elapsedMs = Date.now() - this.terrariumStartTime;
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);
        document.getElementById('terrarium-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Update generation display
        document.getElementById('generation').textContent = `PET`;
    }
    
    /**
     * Exit terrarium mode and return to normal
     */
    exitTerrariumMode() {
        console.log('[TERRARIUM] Exiting terrarium mode');
        
        this.isTerrariumMode = false;
        this.terrariumCreature = null;
        this.terrariumNode = null;
        
        // Hide terrarium panel
        document.getElementById('terrarium-panel').style.display = 'none';
        
        // Stop simulation
        this.simulation.stop();
        this.simulation.removeAllCreatures();
        this.simulation.clearTracks();
        
        // Re-enable controls
        document.getElementById('start-btn').disabled = false;
        document.getElementById('tournament-btn').disabled = this.evolution.getChampionCount() < 2;
        
        // Restore normal time limit
        const roundDuration = parseInt(document.getElementById('round-duration-input').value) || 60;
        this.simulation.maxTime = roundDuration;
        
        // Update UI
        document.getElementById('generation').textContent = this.evolution.generation;
        this.updateUI();
        
        this.savedEvolutionState = null;
    }
    
    updateUI() {
        // Generation info
        document.getElementById('generation').textContent = this.evolution.generation;
        
        // Keep simulation's fitness mode in sync with evolution's active mode
        // (Important for random mode where it changes each generation)
        this.simulation.fitnessMode = this.evolution.getActiveMode();
        
        // Update mode description to show current active mode (for random mode)
        if (this.evolution.isRandomMode) {
            const activeDesc = this.evolution.getActiveModeDescription();
            document.getElementById('mode-description').textContent = 
                `This gen: ${activeDesc}`;
        }
        
        // Check if celebrating
        if (this.simulation.isCelebrating) {
            document.getElementById('creature-id').textContent = '\u{1F389} CHAMPION!';  // Party emoji
            document.getElementById('time-remaining').textContent = 'Celebrating!';
            document.getElementById('progress-fill').style.width = '100%';
            return; // Skip other updates during celebration
        }
        
        // Population - show alive count if sudden death mode is active
        const popCount = this.simulation.activeCreatures ? this.simulation.activeCreatures.length : 0;
        if (this.simulation.suddenDeathMode && this.simulation.eliminatedCreatures.size > 0) {
            // Show alive/total when creatures have been eliminated
            const aliveCount = this.simulation.getAliveCreatureCount();
            document.getElementById('creature-id').textContent = `${aliveCount}/${popCount} \u{1F480}`;  // Skull emoji
        } else {
            document.getElementById('creature-id').textContent = popCount;
        }
        
        // Get the current active mode for fitness calculations
        const activeMode = this.evolution.getActiveMode();
        
        // Find best in current population using current fitness mode
        let bestCreature = null;
        let bestFitness = -Infinity;
        
        if (this.simulation.activeCreatures && this.simulation.activeCreatures.length > 0) {
            // Calculate fitness for all creatures (handles outcast mode properly)
            this.calculateFitnessForCreatures(this.simulation.activeCreatures, activeMode);
            
            for (let creature of this.simulation.activeCreatures) {
                if (creature.fitness > bestFitness) {
                    bestFitness = creature.fitness;
                    bestCreature = creature;
                }
            }
        }
        
        if (bestCreature) {
            document.getElementById('block-count').textContent = bestCreature.blocks.length;
            document.getElementById('current-distance').textContent = bestCreature.maxDistance.toFixed(2) + 'm';
            document.getElementById('current-height').textContent = bestCreature.maxHeight.toFixed(2) + 'm';
        }
        
        // Time
        const timeRemaining = this.simulation.getRemainingTime();
        document.getElementById('time-remaining').textContent = timeRemaining.toFixed(0) + 's';
        
        // Progress bar
        const progress = ((this.simulation.maxTime - timeRemaining) / this.simulation.maxTime) * 100;
        document.getElementById('progress-fill').style.width = progress + '%';
        
        // Backtrack stats
        const stats = this.evolution.getBacktrackStats();
        document.getElementById('completed-lines').textContent = stats.completedLineCount;
        document.getElementById('dead-ends').textContent = stats.deadEndCount;
        document.getElementById('backtracks').textContent = stats.backtrackCount;
        document.getElementById('champ-defenses').textContent = stats.championDefenseCount;
        
        // Target fitness (what must be beaten to make progress)
        // Use effectiveTargetFitness which is recalculated for current mode
        const targetFitnessEl = document.getElementById('target-fitness');
        if (stats.effectiveTargetFitness > 0 || stats.targetFitness > 0) {
            // Show the effective target (recalculated for current mode)
            const displayFitness = stats.effectiveTargetFitness || stats.targetFitness;
            targetFitnessEl.textContent = displayFitness.toFixed(2);
            
            // Show tooltip explaining the recalculation if modes differ
            if (this.evolution.isRandomMode && stats.targetFitnessMode && stats.currentMode !== stats.targetFitnessMode) {
                targetFitnessEl.title = `Champion recalculated from ${stats.targetFitnessMode} to ${stats.currentMode} mode`;
            } else if (stats.currentMode) {
                targetFitnessEl.title = `Mode: ${stats.currentMode}`;
            }
        } else {
            targetFitnessEl.textContent = '-';
        }
        
        // Update sudden death description during simulation
        if (this.simulation.suddenDeathMode) {
            const desc = document.getElementById('sudden-death-desc');
            const timeElapsed = this.simulation.timeElapsed;
            const startTime = this.simulation.suddenDeathStartTime;
            const eliminated = this.simulation.eliminatedCreatures.size;
            
            if (timeElapsed < startTime) {
                // Countdown to eliminations starting
                const countdown = Math.ceil(startTime - timeElapsed);
                desc.textContent = `Eliminations start in ${countdown}s`;
                desc.style.color = '#ffaa00';  // Orange warning
            } else if (eliminated > 0) {
                // Show elimination count
                desc.textContent = `${eliminated} eliminated! \u{1F480}`;
                desc.style.color = '#ff6666';  // Red
            } else {
                desc.textContent = 'ACTIVE - Worst 75% eliminated!';
                desc.style.color = '#ff6666';
            }
        }
        
        // Champion info
        const champion = this.evolution.getChampion();
        if (champion) {
            document.getElementById('champ-distance').textContent = champion.maxDistance.toFixed(2) + 'm';
            document.getElementById('champ-height').textContent = champion.maxHeight.toFixed(2) + 'm';
            document.getElementById('champ-jump').textContent = (champion.maxJumpHeight || 0).toFixed(2) + 'm';
            const champTiles = champion.getTileCount ? champion.getTileCount() : 0;
            document.getElementById('champ-tiles').textContent = champTiles;
            document.getElementById('champ-fitness').textContent = champion.fitness.toFixed(2);
            
            // Calculate and display champion efficiency (distance per tile)
            const champEfficiency = champTiles > 0 ? (champion.maxDistance / champTiles) : 0;
            document.getElementById('champ-efficiency').textContent = champEfficiency.toFixed(3);
        }
        
        // Selected creature or followed creature stats
        const selected = this.simulation.getSelectedCreature();
        const panel = document.getElementById('selected-creature-panel');
        
        if (selected) {
            // Show stats for explicitly selected creature
            this.updateSelectedCreatureUI(selected);
            panel.style.display = 'block';
        } else if (this.simulation.followLeader && bestCreature) {
            // Show stats for creature being followed (the best one)
            this.updateSelectedCreatureUI(bestCreature, true);
            panel.style.display = 'block';
        } else {
            // Hide panel if no selection and not following
            panel.style.display = 'none';
        }
        
        // Enable tournament button when we have at least 2 champions
        const championCount = this.evolution.getChampionCount();
        const tournamentBtn = document.getElementById('tournament-btn');
        const tournamentSizeInput = document.getElementById('tournament-size');
        const tournamentSize = parseInt(tournamentSizeInput.value) || 10;
        
        if (championCount >= 2 && !this.isTournamentMode) {
            tournamentBtn.disabled = false;
            // Show how many will actually compete (min of available and requested)
            const willCompete = Math.min(championCount, tournamentSize);
            tournamentBtn.title = `${willCompete} of ${championCount} champions will compete (top ${tournamentSize} by generation)`;
        } else if (championCount < 2) {
            tournamentBtn.disabled = true;
            tournamentBtn.title = `Need at least 2 champions (have ${championCount})`;
        }
    }
    
    showEvolutionTree() {
        // Pause the simulation while viewing the tree so we don't miss anything
        this.pausedBeforeTreeOpen = this.simulation.isPaused;
        if (!this.simulation.isPaused) {
            this.simulation.pause();
            document.getElementById('pause-btn').textContent = '\u25B6 Resume';
        }
        
        const treeData = this.evolution.getEvolutionTreeData();
        const container = document.getElementById('tree-canvas-container');
        
        // Create or reuse the tree renderer
        if (!this.treeRenderer) {
            this.treeRenderer = createTreeRenderer(container);
            
            // Set up callback for when user clicks a tree node
            // This allows spawning a new generation from any historical champion
            // OR selecting for lineage playback / terrarium modes
            this.treeRenderer.onNodeClick = (nodeId, nodeData) => {
                // Store the selected node ID for lineage/terrarium modes
                this.selectedTreeNodeId = nodeId;
                
                // Update button states based on selection
                this.updateTreeModeButtons(nodeData);
                
                // Also handle the original spawn behavior
                this.onTreeNodeClicked(nodeId, nodeData);
            };
        } else {
            // Resize canvas to match container (in case it changed)
            const rect = container.getBoundingClientRect();
            this.treeRenderer.resize(rect.width || 650, rect.height || 450);
        }
        
        // Update statistics display
        document.getElementById('tree-stat-total').textContent = treeData.stats.totalNodes;
        document.getElementById('tree-stat-champions').textContent = treeData.stats.champions;
        document.getElementById('tree-stat-deadends').textContent = treeData.stats.deadEnds;
        document.getElementById('tree-stat-branches').textContent = treeData.stats.backtrackSources;
        document.getElementById('tree-stat-species').textContent = treeData.stats.species || 0;
        
        // Set the tree data and render
        this.treeRenderer.setTreeData(treeData);
        this.treeRenderer.render();
        
        // Reset selected node when opening tree
        this.selectedTreeNodeId = null;
        this.updateTreeModeButtons(null);
        
        // Reset the help text
        const helpText = document.querySelector('.tree-help');
        if (helpText) {
            helpText.innerHTML = '<kbd>Click</kbd> select &middot; <kbd>Scroll</kbd> zoom &middot; <kbd>Drag</kbd> pan';
        }
        
        // Show the modal
        document.getElementById('evolution-tree-modal').classList.add('active');
        
        // Initialize the toggle button text to match current mode
        const toggleBtn = document.getElementById('tree-toggle-mode');
        const currentMode = this.treeRenderer.displayMode;
        if (currentMode === 'full') {
            toggleBtn.textContent = '\u{1F500} Lineage Only';
        } else if (currentMode === 'lineage') {
            toggleBtn.textContent = '\u{1F451} Champions Only';
        } else if (currentMode === 'champions') {
            toggleBtn.textContent = '\u{1F9EC} Species View';
        } else {
            // species mode - next is full
            toggleBtn.textContent = '\u{1F4CB} Full View';
        }
        
        // Re-render after modal is visible (to ensure correct sizing)
        setTimeout(() => {
            if (this.treeRenderer) {
                const rect = container.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    this.treeRenderer.resize(rect.width, rect.height);
                    this.treeRenderer.centerView();
                    this.treeRenderer.render();
                }
            }
        }, 50);
    }
    
    /**
     * Close the evolution tree modal and restore pause state
     */
    closeEvolutionTree() {
        document.getElementById('evolution-tree-modal').classList.remove('active');
        
        // Restore the pause state from before opening the tree
        if (!this.pausedBeforeTreeOpen && this.simulation.isPaused) {
            this.simulation.resume();
            document.getElementById('pause-btn').textContent = '\u23F8 Pause';
        }
    }
    
    /**
     * Handle click on an evolution tree node
     * Shows a confirmation dialog and spawns a new generation from the selected creature
     * 
     * @param {number} nodeId - The ID of the clicked node
     * @param {Object} nodeData - The node data from the tree
     */
    onTreeNodeClicked(nodeId, nodeData) {
        // Get detailed info about this node
        const nodeInfo = this.evolution.getTreeNodeInfo(nodeId);
        
        if (!nodeInfo) {
            console.error(`[TREE CLICK] Could not find node #${nodeId}`);
            return;
        }
        
        console.log(`[TREE SELECT] Node selected: ${nodeInfo.name} (Gen ${nodeInfo.generation}, ${nodeInfo.status})`);
        
        // Selection only - just update UI to show what's selected
        // Actions are triggered by the buttons (Spawn, Playback, Terrarium)
        const helpText = document.querySelector('.tree-help');
        if (helpText && nodeInfo.hasCreatureData) {
            helpText.innerHTML = `<strong style="color: #64ffda;">Selected: ${nodeInfo.name}</strong> - Use buttons above`;
        } else if (helpText) {
            helpText.innerHTML = `<strong style="color: #f87171;">${nodeInfo.name}</strong> - No creature data`;
        }
    }
    
    /**
     * Spawn a new generation from the selected tree node
     * Branches evolution from the selected creature
     */
    spawnFromSelectedNode() {
        if (!this.selectedTreeNodeId) {
            alert('Please click on a creature in the tree first to select it.');
            return;
        }
        
        const nodeInfo = this.evolution.getTreeNodeInfo(this.selectedTreeNodeId);
        
        if (!nodeInfo) {
            alert('Could not find the selected node.');
            return;
        }
        
        if (!nodeInfo.canSpawn) {
            alert(`Cannot spawn from this creature.\n\n` +
                  `"${nodeInfo.name}" (Generation ${nodeInfo.generation})\n` +
                  `Status: ${nodeInfo.status}\n\n` +
                  `Note: Only champions, dead ends, and branch points can be used for spawning.`);
            return;
        }
        
        // Build confirmation message
        const currentGen = this.evolution.generation;
        const targetGen = nodeInfo.generation + 1;
        
        let message = `SPAWN FROM TREE NODE\n\n`;
        message += `Selected: "${nodeInfo.name}"\n`;
        message += `Generation: ${nodeInfo.generation}\n`;
        message += `Status: ${nodeInfo.status}\n`;
        message += `Blocks: ${nodeInfo.blocks}\n`;
        message += `Original Fitness: ${nodeInfo.fitness.toFixed(2)} (${nodeInfo.fitnessMode || 'N/A'} mode)\n\n`;
        message += `This will:\n`;
        message += `- Stop the current evolution round\n`;
        message += `- Set this creature as the new champion\n`;
        message += `- Continue evolution from Generation ${targetGen}\n`;
        message += `  (currently at Generation ${currentGen})\n\n`;
        message += `Continue?`;
        
        if (!confirm(message)) {
            console.log(`[SPAWN] User cancelled spawn from ${nodeInfo.name}`);
            return;
        }
        
        // User confirmed - spawn from this node
        console.log(`[SPAWN] User confirmed spawn from ${nodeInfo.name}`);
        
        // Stop current simulation
        this.simulation.stop();
        this.isEvaluating = false;
        this.isTransitioning = false;
        
        // Close the tree modal
        document.getElementById('evolution-tree-modal').classList.remove('active');
        
        // Spawn from the selected node
        const result = this.evolution.spawnFromTreeNode(this.selectedTreeNodeId);
        
        if (result.success) {
            console.log(`[SPAWN] Successfully spawned generation ${result.newGeneration} from ${nodeInfo.name}`);
            
            // Start the new generation
            this.isEvaluating = true;
            this.evaluateGeneration();
            
            // Update UI
            this.updateUI();
            
            // Show feedback
            const statusMsg = `Branched from "${nodeInfo.name}" (Gen ${nodeInfo.generation})\n` +
                             `Now evolving Generation ${result.newGeneration} with ${result.populationSize} creatures`;
            console.log(`[SPAWN] ${statusMsg}`);
        } else {
            alert(`Failed to spawn from selected node.\n\n` +
                  `Error: ${result.error}\n\n` +
                  `The creature data may have been lost. Try selecting a different champion.`);
            console.error(`[SPAWN] Spawn failed: ${result.error}`);
        }
    }
    
    // Old ASCII tree methods removed - now using canvas-based EvolutionTreeRenderer
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        this.simulation.update(deltaTime);
        this.simulation.render();
        
        // Handle lineage playback mode
        if (this.isLineageMode) {
            this.updateLineagePlayback(deltaTime);
            return; // Skip other updates during lineage playback
        }
        
        // Handle terrarium (pet) mode
        if (this.isTerrariumMode) {
            this.updateTerrariumUI();
            return; // Skip other updates during terrarium mode
        }
        
        // Handle tournament mode
        if (this.isTournamentMode) {
            this.updateTournamentUI();
            if (this.simulation.isTimeUp()) {
                this.completeTournament();
            }
            return; // Skip normal evolution updates during tournament
        }
        
        // Normal evolution mode
        if (this.isEvaluating) {
            this.updateUI();
            if (this.simulation.isTimeUp()) {
                this.completeGeneration();
            }
        }
    }
    
    /**
     * Update UI during tournament mode
     */
    updateTournamentUI() {
        // Time remaining
        const timeRemaining = this.simulation.getRemainingTime();
        document.getElementById('time-remaining').textContent = timeRemaining.toFixed(0) + 's';
        
        // Progress bar
        const progress = ((this.simulation.maxTime - timeRemaining) / this.simulation.maxTime) * 100;
        document.getElementById('progress-fill').style.width = progress + '%';
        
        // Population count
        const popCount = this.simulation.activeCreatures ? this.simulation.activeCreatures.length : 0;
        document.getElementById('creature-id').textContent = popCount;
        
        // Find current leader using tournament fitness mode
        const activeMode = this.simulation.fitnessMode;
        let bestCreature = null;
        let bestFitness = -Infinity;
        
        if (this.simulation.activeCreatures && this.simulation.activeCreatures.length > 0) {
            // Calculate fitness for all creatures (handles outcast mode properly)
            this.calculateFitnessForCreatures(this.simulation.activeCreatures, activeMode);
            
            for (let creature of this.simulation.activeCreatures) {
                if (creature.fitness > bestFitness) {
                    bestFitness = creature.fitness;
                    bestCreature = creature;
                }
            }
        }
        
        // Update best distance/height display
        if (bestCreature) {
            document.getElementById('current-distance').textContent = bestCreature.maxDistance.toFixed(2) + 'm';
            document.getElementById('current-height').textContent = bestCreature.maxHeight.toFixed(2) + 'm';
            document.getElementById('block-count').textContent = bestCreature.blocks.length;
            
            // Show which generation is leading
            const leaderGen = bestCreature.tournamentGeneration || '?';
            document.getElementById('champ-fitness').textContent = bestFitness.toFixed(2) + ' (Gen ' + leaderGen + ')';
        }
        
        // Update the tournament leaderboard with live rankings
        this.updateTournamentLeaderboard();
    }
    
    // =========================================================================
    // SAVE / LOAD SIMULATION STATE
    // =========================================================================
    
    /**
     * Save the current simulation state to a downloadable JSON file.
     * Includes all evolution data, creatures, tree, and settings.
     */
    saveSimulation() {
        console.log('[SAVE] Saving simulation state...');
        
        try {
            // Get the full evolution state
            const evolutionState = this.evolution.exportFullState();
            
            // Add simulation-level settings that aren't part of evolution
            const fullState = {
                evolution: evolutionState,
                simulation: {
                    // Round duration setting
                    roundDuration: this.simulation.maxTime,
                    // Gravity setting (as percentage)
                    gravityPercent: Math.round(this.simulation.gravity / 9.82 * 100),
                    // Sudden death mode
                    suddenDeathEnabled: this.simulation.suddenDeathMode
                },
                // UI settings (so they restore correctly)
                ui: {
                    fitnessMode: document.getElementById('fitness-mode').value,
                    instancesPerConfig: parseInt(document.getElementById('instances-input').value) || 4,
                    configurations: parseInt(document.getElementById('configs-input').value) || 5,
                    blocksPerGen: parseInt(document.getElementById('blocks-per-gen-input').value) || 1,
                    maxBlocks: parseInt(document.getElementById('max-blocks-input').value) || 0,
                    roundDuration: parseInt(document.getElementById('round-duration-input').value) || 60,
                    randomBlocks: document.getElementById('random-blocks-checkbox').checked,
                    limbGen: document.getElementById('limb-gen-checkbox').checked
                }
            };
            
            // Convert to JSON string with nice formatting
            const jsonString = JSON.stringify(fullState, null, 2);
            
            // Create a blob and download link
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Generate a filename with generation number and timestamp
            const timestamp = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
            const filename = `evolution_gen${this.evolution.generation}_${timestamp}.json`;
            
            // Create and click a download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up the blob URL
            URL.revokeObjectURL(url);
            
            console.log(`[SAVE] Saved to ${filename}`);
            
            // Brief visual feedback - flash the save button green
            const saveBtn = document.getElementById('save-btn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '\u2714 Saved!';
            saveBtn.style.background = '#4ade80';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '';
            }, 1500);
            
        } catch (error) {
            console.error('[SAVE] Error saving simulation:', error);
            alert('Error saving simulation: ' + error.message);
        }
    }
    
    /**
     * Load a simulation state from a JSON file.
     * Restores all evolution data and recreates the creatures in the simulation.
     * 
     * @param {File} file - The JSON file to load
     */
    loadSimulation(file) {
        console.log('[LOAD] Loading simulation from file:', file.name);
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                // Parse the JSON
                const fullState = JSON.parse(e.target.result);
                
                // Validate the file has the expected structure
                if (!fullState.evolution || !fullState.evolution.version) {
                    throw new Error('Invalid save file format');
                }
                
                // Show a summary and confirm before loading
                const summary = EvolutionManager.getStateSummary(fullState.evolution);
                if (!summary.valid) {
                    throw new Error(summary.error);
                }
                
                const confirmMsg = `Load saved simulation?\n\n` +
                    `Saved: ${new Date(summary.savedAt).toLocaleString()}\n` +
                    `Generation: ${summary.generation}\n` +
                    `Champion: ${summary.championName} (${summary.championBlocks} blocks)\n` +
                    `Fitness Mode: ${summary.fitnessMode}\n` +
                    `Tree Nodes: ${summary.treeNodes}\n\n` +
                    `This will replace the current simulation.`;
                
                if (!confirm(confirmMsg)) {
                    console.log('[LOAD] Load cancelled by user');
                    return;
                }
                
                // Stop any current evolution
                this.isEvaluating = false;
                this.isTournamentMode = false;
                
                // Clear the current simulation (remove all creatures and reset)
                this.simulation.removeAllCreatures();
                this.simulation.clearTracks();
                
                // Import the evolution state
                if (!this.evolution.importFullState(fullState.evolution)) {
                    throw new Error('Failed to import evolution state');
                }
                
                // Restore simulation settings
                if (fullState.simulation) {
                    if (fullState.simulation.roundDuration) {
                        this.simulation.maxTime = fullState.simulation.roundDuration;
                    }
                    if (fullState.simulation.gravityPercent) {
                        this.simulation.setGravity(fullState.simulation.gravityPercent / 100);
                        document.getElementById('gravity-slider').value = fullState.simulation.gravityPercent;
                        document.getElementById('gravity-display').textContent = fullState.simulation.gravityPercent + '%';
                    }
                    if (fullState.simulation.suddenDeathEnabled !== undefined) {
                        this.simulation.setSuddenDeathMode(fullState.simulation.suddenDeathEnabled);
                        document.getElementById('sudden-death-toggle').checked = fullState.simulation.suddenDeathEnabled;
                    }
                }
                
                // Restore UI settings
                if (fullState.ui) {
                    document.getElementById('fitness-mode').value = fullState.ui.fitnessMode || 'random';
                    document.getElementById('instances-input').value = fullState.ui.instancesPerConfig || 4;
                    document.getElementById('configs-input').value = fullState.ui.configurations || 5;
                    document.getElementById('blocks-per-gen-input').value = fullState.ui.blocksPerGen || 1;
                    document.getElementById('max-blocks-input').value = fullState.ui.maxBlocks || 0;
                    document.getElementById('round-duration-input').value = fullState.ui.roundDuration || 60;
                    document.getElementById('random-blocks-checkbox').checked = fullState.ui.randomBlocks || false;
                    document.getElementById('limb-gen-checkbox').checked = fullState.ui.limbGen || false;
                }
                
                // Spawn the loaded population into the simulation
                if (this.evolution.population.length > 0) {
                    // Add creatures to the simulation
                    for (let creature of this.evolution.population) {
                        // Reset creature's runtime state (physics bodies will be created fresh)
                        creature.meshes = [];
                        creature.bodies = [];
                        creature.constraints = [];
                    }
                    
                    // Spawn all creatures in the simulation
                    this.simulation.spawnMultipleCreatures(this.evolution.population);
                    this.simulation.fitnessMode = this.evolution.getActiveMode();
                }
                
                // Update all UI elements
                this.updateUI();
                
                // Update button states
                document.getElementById('start-btn').disabled = false;
                document.getElementById('pause-btn').disabled = true;
                document.getElementById('skip-btn').disabled = true;
                document.getElementById('tournament-btn').disabled = this.evolution.evolutionTree.length < 2;
                
                // Visual feedback
                const loadBtn = document.getElementById('load-btn');
                const originalText = loadBtn.textContent;
                loadBtn.textContent = '\u2714 Loaded!';
                loadBtn.style.background = '#4ade80';
                setTimeout(() => {
                    loadBtn.textContent = originalText;
                    loadBtn.style.background = '';
                }, 1500);
                
                console.log('[LOAD] Simulation loaded successfully!');
                console.log(`       Generation ${this.evolution.generation} with ${this.evolution.population.length} creatures ready.`);
                console.log('       Click Start to continue evolution.');
                
            } catch (error) {
                console.error('[LOAD] Error loading simulation:', error);
                alert('Error loading simulation: ' + error.message);
            }
        };
        
        reader.onerror = () => {
            console.error('[LOAD] Error reading file');
            alert('Error reading file');
        };
        
        // Read the file as text
        reader.readAsText(file);
    }
}

// Start when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new Application();
    console.log('\u{1F9EC} Evolution Simulator Ready');  // DNA emoji
    console.log('Click Start to begin. Click creatures to select them.');
});
