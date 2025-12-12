# 3D Block Creature Evolution Simulator

## User Guide

Welcome to the 3D Block Creature Evolution Simulator! This guide will walk you through everything you need to know to run your own evolution experiments and watch unique creatures develop locomotion strategies over generations.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Main Interface](#main-interface)
4. [Evolution Settings](#evolution-settings)
5. [Sensor System](#sensor-system)
6. [Fitness Modes](#fitness-modes)
7. [Camera Controls](#camera-controls)
8. [Information Panels](#information-panels)
9. [Evolution Tree](#evolution-tree)
10. [Special Modes](#special-modes)
11. [Saving and Loading](#saving-and-loading)
12. [Tournament Mode](#tournament-mode)
13. [Tips and Strategies](#tips-and-strategies)
14. [Version History](#version-history)

---

## Overview

The 3D Block Creature Evolution Simulator uses genetic algorithms to evolve creatures composed of connected blocks with rotational joints. Each generation, creatures compete to perform best according to the selected fitness mode. Winners pass their genes to the next generation, gradually developing increasingly effective movement strategies.

### Watch Evolution in Action

Here's what a typical evolution round looks like:

![Gameplay Screenshot](/media/gameplay.png)

*A generation of creatures competing in the arena. The left panel shows evolution controls, while the right panels display champion and focused creature statistics.*



---

## Quick Start

1. Open the simulator in your web browser
2. Adjust settings if desired (or use defaults)
3. Click the **Start** button
4. Watch creatures compete for 60 seconds (default round duration)
5. The champion advances and spawns the next generation
6. Evolution continues automatically

That's it! The simulator will run continuously, with each generation potentially discovering new and better movement strategies.

---

## Main Interface

The interface is organized into several panels:

### Left Panel (Evolution Controls)

This panel contains all your evolution settings and controls:

- **Gen** - Current generation number
- **Pop** - Population size (total creatures competing)
- **Time** - Countdown timer for the current round
- **Best Dist** - Furthest distance traveled this round
- **Height** - Maximum height achieved
- **Champ Fitness** - Current champion's fitness score

### Right Panel (Champion Info)

Displays statistics for the reigning champion from the previous generation:

- Block count and defenses won
- Distance and height achieved
- Jump height and tiles covered
- Efficiency rating (distance per tile)

### Focus Panel

Appears when following or selecting a creature, showing real-time statistics for that specific individual.

---

## Evolution Settings

Before starting evolution, you can configure these parameters:

### Variants/config
How many movement pattern variations to create for each body structure. Higher values mean more diversity but larger populations.

**Default:** 4  
**Range:** 1-10

### Configurations
How many different body configurations (block arrangements) to test each generation.

**Default:** 5  
**Range:** 1-20

### Blocks/gen
How many new blocks to add to creatures each generation. More blocks per generation means faster structural growth.

**Default:** 1  
**Range:** 1-4

### Max blocks
Maximum blocks a creature can have. When reached, that genetic line is marked "complete." Set to 0 for unlimited growth.

**Default:** 0 (unlimited)  
**Range:** 0-50

### Round duration
How long each competition round lasts in seconds. Longer rounds give creatures more time to demonstrate their abilities.

**Default:** 60 seconds  
**Range:** 30-600 seconds

### Gravity
Adjust the simulation's gravity from 10% (moon-like) to 200% (heavy planet). This dramatically affects movement strategies.

**Default:** 100%  
**Range:** 10%-200%

### Random # (checkbox)
When enabled, randomizes the number of blocks added each generation (from 1 to Blocks/gen setting).

### Limbs (checkbox)
When enabled, new blocks can attach to other new blocks, forming limb-like chains. Otherwise, new blocks only attach to existing body blocks.

### Sudden Death Mode
A toggle that eliminates the worst 75% of creatures after the first 10 seconds. This dramatically speeds up rounds and creates intense competition.

---

## Sensor System

Creatures can evolve special sensor blocks that detect environmental conditions and modify joint behavior. Sensors add a layer of reactive "intelligence" to creatures, allowing them to respond to their surroundings rather than just following fixed movement patterns.

### Sensor Types

The simulator includes six sensor types, each detecting different environmental information:

| Sensor | Color | Description |
|--------|-------|-------------|
| **Grv** (Gravity) | Orange | Detects orientation relative to "up". Returns +1 when upright, -1 when inverted. |
| **Lgt** (Light) | Light Blue | Detects sun direction. Returns +1 when facing the sun, -1 when facing away. |
| **Vel** (Velocity) | Green | Detects movement speed. Returns -1 when stopped, +1 at full speed. |
| **Gnd** (Ground) | Brown | Detects ground contact. Returns +1 when touching ground, -1 when airborne. |
| **Rhy** (Rhythm) | Purple | Oscillator that provides a rhythmic signal for coordinated movement patterns. |
| **Tilt** | Cyan | Detects left/right lean. Returns +1 when tilting right, -1 when tilting left. |

### Sensor Modes

Each sensor can be set to one of three modes:

- **Off** - Sensor is disabled. Creatures cannot have this sensor type.
- **Start** - All generation 1 creatures begin with this sensor. Useful for giving creatures an initial advantage.
- **Evolve** - Sensor may be added through random mutation during evolution. This is the default for most sensors.

### How Sensors Work

When a sensor block is added to a creature:
1. The sensor continuously calculates a value from -1 to +1 based on its type
2. This value modifies the movement of connected joints
3. Joint responses can amplify, invert, or ignore sensor signals based on evolved weights
4. The result is creatures that can adapt their movement to environmental conditions

### Using Sensors Effectively

- **Gravity + Ground** sensors help creatures right themselves when tipped over
- **Light** sensors can create sun-tracking behavior
- **Velocity** sensors help creatures modulate effort based on their current speed
- **Rhythm** sensors create coordinated, rhythmic gaits
- **Tilt** sensors help creatures maintain balance

Sensors are displayed in the creature info panels when present, showing which sensor types a creature has evolved.

---

## Fitness Modes

The fitness mode determines what makes a creature "successful." Different modes reward completely different strategies.

### Distance
Rewards creatures that travel the furthest from their starting position. This is the classic mode that encourages forward locomotion.

**Formula:** Distance x 2 + Height x 0.5

### Efficiency
Rewards creatures that cover the most ground per tile lit up. Favors streamlined, direct movers over wanderers.

**Formula:** (Distance / Tiles) x 100 + Height x 0.2

### Jump Height
Rewards creatures that achieve the highest jump after landing from spawn. Encourages bouncy, explosive movement.

**Formula:** Jump x 10 + Distance x 0.1

### Area Coverage
Rewards creatures that light up the most ground tiles. Favors explorers and wanderers over straight-line movers.

**Formula:** Tiles x 1 + Distance x 0.05

### Outcast
A unique mode that rewards the creature most different from the population average. The "weirdo" wins! This encourages diversity and novel solutions.

**Formula:** (Deviation from population average across all metrics)

### Spartan
A balanced mode that rewards well-rounded performance across all metrics. The true all-around athlete.

**Formula:** Distance x 1 + Height x 2 + Tiles x 0.2 + Jump x 3

### Random
Randomly selects a different fitness mode each generation, preventing creatures from over-specializing and encouraging adaptable designs.

---

## Camera Controls

The bottom center of the screen provides camera controls:

### Follow
Automatically follows the current best-performing creature. The camera smoothly tracks their movement.

### Overview
Switches to a top-down view of the entire arena, perfect for watching all creatures at once.

### Reset
Returns the camera to its default position.

### Manual Camera
When not in Follow or Overview mode:
- **Drag** - Rotate the camera around the focus point
- **Right-drag** - Pan the camera
- **Scroll** - Zoom in/out
- **Click** - Select a specific creature

---

## Information Panels

### Target Tracking
Below the main controls, you'll see:

- **Target** - The fitness score to beat (set by the current champion)
- **Completed** - Completed genetic lines (reached max blocks)
- **Dead Ends** - Dead ends encountered
- **Backtracks** - Backtracks performed

### Dead Ends and Backtracking
When a generation fails to beat the target fitness, it's marked as a "dead end." The system then backtracks to try the next-best creature from a previous generation, exploring alternative evolutionary paths.

---

## Evolution Tree

Click the **Tree** button to open the Evolution Tree viewer - a visual representation of your entire evolutionary history.

![Evolution Tree](/media/evolutionTree.png)

*The Evolution Tree showing the branching evolutionary history with champions, dead ends, and completed lines.*

### Tree Legend

- **[C] Champion** - Gold border, the winning creature from each generation
- **[Complete]** - Green border, reached maximum block count
- **[X] Dead End** - Red border, failed to beat target fitness
- **[B] Branch** - Purple border, branching point in evolution

### Tree Controls

- **Reset View** - Return to default zoom and position
- **Fit to View** - Automatically frame all nodes
- **Champions Only / Species View** - Toggle between viewing modes
- **Click** - Select a node to see details and enable special modes
- **Scroll** - Zoom in/out
- **Drag** - Pan around the tree

### Tree Statistics

The bottom bar shows:
- Total Nodes - All creatures in evolutionary history
- Champions - Successful generation winners
- Dead Ends - Failed evolutionary paths
- Branches - Points where evolution split
- Species - Distinct genetic lineages

---

## Special Modes

From the Evolution Tree, you can access three special viewing modes:

### Lineage Playback

Watch a creature's entire evolutionary history unfold, from the very first ancestor to the selected creature. Each "day" shows one generation, with the sun moving across the sky to mark the passage of time.



**Controls:**
- **Previous** - Previous generation
- **Pause/Play** - Pause/Resume playback
- **Next** - Next generation
- **Exit** - Return to normal mode

### Terrarium

Watch a single creature roam freely in the arena, like a pet in a terrarium. Perfect for observing interesting movement patterns up close.

### Spawn (Branch Evolution)

Create a new evolutionary branch starting from the selected creature. This lets you explore "what if" scenarios and compare different evolutionary paths.

---

## Saving and Loading

### Save
Saves your complete simulation state to a JSON file, including:
- All evolution history
- Current generation and population
- Champion data and statistics
- Evolution tree with all nodes
- Current settings

### Load
Loads a previously saved simulation. You'll see a summary before confirming:
- Save date and time
- Generation number
- Champion name and block count
- Fitness mode
- Total tree nodes

After loading, click **Start** to continue evolution from where you left off.

---

## Tournament Mode

Click **Tournament** to pit your top champions against each other in a special competition.

### How Tournaments Work

1. Select how many champions to include (default: 10)
2. The system gathers the top performers from your evolution tree
3. All champions compete simultaneously in a single round
4. A live leaderboard shows real-time rankings
5. The ultimate winner becomes your new evolutionary starting point

Tournaments are great for:
- Finding your actual best creature when fitness modes have varied
- Creating exciting head-to-head competition
- Resetting evolution with a proven winner

---

## Tips and Strategies

### Getting Started
- Start with default settings to understand the basics
- Let evolution run for at least 10-15 generations before judging results
- Watch the Focus panel to understand what makes creatures successful

### Fitness Mode Selection
- Use **Random** mode for the most interesting and diverse creatures
- **Distance** creates fast, directed movers
- **Efficiency** creates elegant, minimal designs
- **Outcast** produces the most unusual creatures
- **Spartan** creates versatile all-rounders

### Optimizing Evolution
- Enable **Limbs** for more complex and capable creatures
- Higher **Variants/config** increases chances of finding good movement patterns
- Lower gravity (50-75%) often produces more interesting jumping strategies
- **Sudden Death** mode dramatically speeds up evolution

### Troubleshooting Stagnation
- If evolution seems stuck, try a Tournament to find a better starting point
- Use the Spawn feature to branch from an earlier successful creature
- Switch fitness modes to pressure creatures in new directions
- Check the Evolution Tree for unexplored branches

### Day/Night Cycle
Each round simulates a full day, from sunrise to sunset. The sun moves across the sky, casting realistic shadows. In Lineage Playback mode, each "day" represents one generation of evolution.

---

## Keyboard Reference

| Action | Description |
|--------|-------------|
| Click creature | Select and view details |
| Click empty space | Deselect creature |
| Scroll wheel | Zoom camera |
| Left drag | Rotate camera |
| Right drag | Pan camera |

---

## Version History

### Latest Updates

#### Bug Fixes

- **Fitness Formula Consistency** - Fixed inconsistency between how creature fitness was calculated in different parts of the code. All fitness formulas now match exactly across creature evaluation, evolution selection, and UI display, ensuring creatures are ranked correctly.

- **Evolution Tree Toggle** - Fixed the tree display mode toggle button to correctly show the current view mode (Champions Only or Species View) rather than displaying incorrect mode names.

- **Sensor Display Labels** - Fixed minor inconsistency where the Tilt sensor was abbreviated differently in different parts of the UI.

- **Night Sky Fallback** - Added a beautiful procedural star texture generator as fallback when the stars.jpg texture file is unavailable. The procedural texture includes thousands of varied stars with realistic colors (white, blue, yellow) and subtle nebula regions.

#### Improvements

- **Null Safety** - Added defensive checks for undefined values in fitness calculations to prevent potential errors during edge cases.

- **Code Documentation** - Added comments marking critical formulas that must stay synchronized across files to prevent future inconsistencies.

---

## Credits

The 3D Block Creature Evolution Simulator uses:
- **Three.js** for 3D graphics rendering
- **Cannon.js** for physics simulation
- Inspired by Keiwan's "Evolution" simulator

---

*Happy evolving! Watch your creatures develop surprising and creative solutions to the challenge of locomotion.*
