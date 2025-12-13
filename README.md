# 3D Block Creature Evolution Simulator

## User Guide

Welcome to the 3D Block Creature Evolution Simulator! This guide will walk you through everything you need to know to run your own evolution experiments and watch unique creatures develop locomotion strategies over generations.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Main Interface](#main-interface)
4. [DNA System](#dna-system)
5. [Evolution Settings](#evolution-settings)
6. [Sensor System](#sensor-system)
7. [Fitness Modes](#fitness-modes)
8. [Camera Controls](#camera-controls)
9. [Information Panels](#information-panels)
10. [Evolution Tree](#evolution-tree)
11. [Special Modes](#special-modes)
12. [Saving and Loading](#saving-and-loading)
13. [Tournament Mode](#tournament-mode)
14. [Visual Features](#visual-features)
15. [Tips and Strategies](#tips-and-strategies)
16. [Version History](#version-history)

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

## DNA System

Every creature in the simulator is defined by a unique DNA string - a compact hexadecimal encoding that completely describes the creature's physical structure, joint configurations, movement patterns, and sensor responses.

### Deterministic Generation

The DNA system ensures **complete determinism**: given the same DNA string, the simulator will always generate an identical creature with exactly the same:

- Block positions, sizes, and materials
- Joint configurations and movement patterns
- Sensor placements and response weights
- Color schemes and visual appearance

This determinism is crucial for scientific validity - you can save a creature's DNA, share it, and reproduce the exact same creature later. It also enables features like lineage playback, where ancestral creatures are recreated from their stored DNA.

### DNA Structure

A creature's DNA encodes:

- **Block descriptors** - Position, size, material type, and color for each block
- **Joint parameters** - Axis of rotation, movement speed, phase offset, and amplitude
- **Sensor configurations** - Which sensors are present and how they influence joint movement
- **Influence weights** - How strongly each sensor affects each joint

### Inheritance and Mutation

When creatures reproduce:

1. The champion's DNA is copied as the base for offspring
2. Mutations modify specific genes (block positions, joint parameters, sensor weights)
3. New blocks may be added with randomly generated genes
4. All changes are encoded back into the DNA string

This ensures that evolutionary history is fully traceable - every creature's genetics can be traced back through its lineage to the original ancestor.

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

The simulator includes eight sensor types, each detecting different environmental information:

| Sensor | Color | Description |
|--------|-------|-------------|
| **Grv** (Gravity) | Orange | Detects orientation relative to "up". Returns +1 when upright, -1 when inverted. |
| **Lgt** (Light) | Light Blue | Detects sun direction. Returns +1 when facing the sun, -1 when facing away. |
| **Vel** (Velocity) | Green | Detects movement speed. Returns -1 when stopped, +1 at full speed. |
| **Gnd** (Ground) | Brown | Detects ground contact. Returns +1 when touching ground, -1 when airborne. |
| **Rhy** (Rhythm) | Purple | Oscillator that provides a rhythmic signal for coordinated movement patterns. |
| **Tilt** | Cyan | Detects left/right lean. Returns +1 when tilting right, -1 when tilting left. |
| **Cmp** (Compass) | Pink | Detects which direction the creature is facing along the X-axis. Returns +1 when facing positive X, -1 when facing negative X. |
| **Trk** (Tracking) | Yellow | Detects position relative to starting location. Returns values based on displacement from origin. |

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
- **Compass** sensors enable directional awareness and heading control
- **Tracking** sensors allow creatures to develop homing or range-limiting behaviors

Sensors are displayed in the creature info panels when present, showing which sensor types a creature has evolved.

### Sensor Visual Feedback

Active sensor blocks display a real-time glow effect that pulses based on their current output value. This "thinking" visualization lets you watch creatures respond to their environment. The glow color matches the sensor's type color and intensity reflects the strength of the signal being sent to connected joints.

### Advanced Sensor Behavior

Sensors can influence joint movement in multiple ways beyond simple speed modulation:

- **Speed modulation** - Adjusts how fast a joint rotates
- **Direction modulation** - Can reverse or modify rotation direction
- **Action generation** - Influences overall movement pattern selection

Additionally, sensors attached to odd-numbered block faces have their influence values negated compared to even faces, creating behavioral variety from the same sensor types.

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
Automatically follows the current best-performing creature. The camera smoothly tracks their movement with an ease-in transition. Auto-zoom adjusts to keep the creature visible, but only activates when first entering Follow mode - switching targets preserves your zoom level.

### Overview
Switches to a top-down view of the entire arena. Can be combined with Follow mode for a top-down view that tracks the leader.

### Camera Mode Combinations

Follow and Overview work independently, creating four viewing options:

- **Free Camera** - Both off. Full manual control.
- **3D Follow** - Follow on, Overview off. Track the leader from behind.
- **Top-Down Overview** - Follow off, Overview on. See the whole arena from above.
- **Top-Down Follow** - Both on. Top-down view that tracks the leader.

### Reset
Returns the camera to its default position and clears any manual zoom overrides.

### Manual Camera
When not in Follow or Overview mode:

- **Drag** - Rotate the camera around the focus point
- **Right-drag** - Pan along the ground plane relative to camera facing
- **Scroll** - Zoom in/out (your zoom level is preserved when switching targets)
- **Click** - Select a specific creature

The camera cannot go below ground level in any mode.

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

Click the **Tree** button to open the Evolution Tree viewer - a visual representation of your entire evolutionary history. The simulation automatically pauses while viewing the tree.

![Evolution Tree](/media/evolutionTree.png)

*The Evolution Tree showing the branching evolutionary history with champions, dead ends, and completed lines.*

### Tree Legend

- **[C] Champion** - Gold border, the winning creature from each generation
- **[Complete]** - Green border, reached maximum block count
- **[X] Dead End** - Red border, failed to beat target fitness
- **[B] Branch** - Purple border, branching point in evolution

### Node Details Panel

Click any node to view comprehensive creature information:

![Creature Footprint](/media/creatureFootprint.png)

*Selecting a node reveals detailed metrics, sensor configuration, and an animated footprint showing how the creature's path unfolded.*

The detail panel shows:

- **Status and Rank** - The creature's role in evolution and ranking within its generation
- **Species and Seed** - Genetic lineage identifier and the DNA seed for deterministic recreation
- **Fitness Mode** - Which fitness mode was used to judge this creature (shown in tooltip)
- **Sensors** - Which sensor types the creature has evolved, with newly added sensors highlighted
- **Raw Metrics** - Distance traveled, max height, jump height, and tiles covered
- **Efficiency** - Distance per tile ratio showing movement efficiency
- **Mode Scores** - How the creature would score under each fitness mode
- **Animated Footprint** - A 3-second animation showing tiles appearing in the order they were visited

The footprint visualization helps you understand a creature's movement strategy at a glance - watch the path unfold to see whether it moves in straight lines, circles, or explores widely.

### Tree Controls

- **Reset View** - Return to default zoom and position
- **Fit to View** - Automatically frame all nodes
- **Champions Only / Species View** - Toggle between viewing only champion nodes or seeing the best creature per species per generation
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

Watch a creature's entire evolutionary history unfold, from the very first ancestor to the selected creature. Each "day" shows one generation, with the sun rising and setting to mark the passage of time.

**Day Length Control:**
Adjust how long each evolutionary day lasts using the duration slider (5-300 seconds, default 60). Shorter days give a quick overview; longer days let you study each generation's movement.

**Controls:**
- **Day Length** - Slider to adjust seconds per generation
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

## Visual Features

The simulator includes several visual systems that enhance the experience and provide useful feedback.

### Dynamic Sky System

![Sky System](/media/skyUpdate.png)

*The dynamic sky with procedural star field, sun tracking, and atmospheric effects.*

The simulation features a full day/night cycle with:

- **Moving Sun** - The sun arcs across the sky during each round, rising in the east and setting in the west
- **Dynamic Lighting** - Shadows and ambient light change realistically throughout the day
- **Moonlight** - A blue ambient light illuminates the scene at night, turning off when the sun rises
- **Procedural Stars** - A beautiful night sky with thousands of procedurally generated stars in varying colors (white, blue, yellow) and brightness levels
- **Dual Star Layers** - Two star spheres at different distances move at different speeds for parallax depth
- **Nebula Regions** - Subtle cosmic cloud formations add depth to the night sky

The sky system works with the Light sensor, allowing creatures to evolve sun-tracking behaviors.

### Circular Arena

The ground plane is a circle (radius approximately 425 units) that matches the boundary of the inner star sphere, creating a natural arena edge.

### Ground Trail System

As creatures move across the arena, they light up ground tiles that track their path:

- **Cyan Glow** - Tiles light up as creatures pass over them
- **Persistent Trails** - Trails remain visible throughout the round
- **Fitness Tracking** - The number of tiles lit contributes to Area and Spartan fitness scores
- **Footprint Visualization** - The Evolution Tree shows an animated replay of each creature's ground coverage
- **High Capacity** - Up to 300,000 tile instances supported per round

### Particle Effects

The simulator uses various particle effects to enhance visual feedback:

- **Dust Particles** - Kicked up when creatures land or move vigorously
- **Spark Effects** - Flash when blocks collide or during celebrations
- **Celebration Effects** - Confetti, fireworks, and energy rings when a new champion is crowned
- **Sensor Glow** - Active sensor blocks pulse and glow based on their output value, letting you watch creatures "think"

### Death Memorial Sequence

When evolution hits a dead end (no creature beats the target), a memorial sequence plays instead of a celebration:

- The fallen creature's blocks rise into the sky with gentle rotation
- Light tiles rise in the order they were visited, tracing the creature's path one last time
- Both become twinkling stars in the night sky
- The camera follows the ascending memorial before returning to normal

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

#### New Features

- **Compass Sensor** - New sensor type (pink/magenta) that detects which direction a creature is facing along the X-axis. Useful for creatures that need directional awareness.

- **Tracking Sensor** - New sensor type (yellow) that detects position relative to the creature's starting location. Enables creatures to develop homing behaviors or range awareness.

- **Enhanced Sensor Influence System** - Sensors now affect multiple aspects of movement beyond just speed: rotation speed, rotation direction, and action generation. Each sensor type declares which modulation methods it supports. For example, gravity sensors affect both speed and direction for balance behaviors.

- **Face-Based Influence Flipping** - Sensors attached to odd-numbered block faces have their influence values negated compared to even faces. This creates behavioral variety where the same sensor type produces different responses based on attachment position.

- **Sensor Activity Glow** - Sensor blocks now display a real-time glow effect showing their current output value. Watch creatures "think" as sensors pulse and glow in response to environmental conditions. Uses smooth interpolation and time-based throttling for performance.

- **Death Memorial Sequence** - When evolution hits a dead end, instead of a celebration, a somber memorial plays. The fallen creature's blocks and the light tiles it visited rise into the sky to become twinkling stars. Tiles rise in the order they were visited (tracing the creature's path in life), with gentle rotation during ascent.

- **Independent Camera Modes** - Overview and Follow modes now work independently, creating four possible combinations: free camera, 3D follow only, top-down overview only, and top-down overview with creature following.

- **Smart Auto-Zoom** - Camera auto-zoom now only activates when Follow mode is first enabled. Switching between followed creatures preserves your manual zoom level. Scroll wheel adjustments are respected until you change modes.

- **Ground Plane Panning** - In 3D mode, camera panning now moves along the ground plane (X-Z) based on your view direction. Horizontal drag moves left/right relative to camera facing, vertical drag moves forward/back.

- **Circular Arena** - The ground plane is now circular (radius ~425 units) instead of infinite, matching the boundary of the star sphere.

- **Moonlight** - A blue ambient light now illuminates the scene during nighttime hours, toggling on when the sun sets and off when it rises.

- **Adjustable Lineage Day Length** - In Lineage Playback mode, you can now set how long each evolutionary "day" lasts (5-300 seconds, default 60). The sun properly rises and sets with each generation.

- **Animated Footprint Playback** - When viewing a creature's footprint in the Evolution Tree, tiles now animate in the order they were visited over 3 seconds, showing how the creature's path unfolded.

- **DNA-Based Creature Naming** - Creatures are now identified by their last DNA segment (a 19-character hexadecimal string representing the most recently added block). This eliminates duplicate naming issues after backtracking.

- **Behavioral Fingerprinting** - The uniqueness system now excludes cosmetic properties (like color) when determining if two creatures are identical. Only behavioral properties affect uniqueness.

#### Improvements

- **Variation Field Effect** - The DNA variation field now has direct influence on joint movement pattern generation, not just contributing to a hash. This provides more nuanced genetic variation.

- **Creature Info Display** - The creature information panel now shows actual DNA segment values (side attachment and variation) parsed from the DNA string.

- **Compact Sensor UI** - Sensor controls changed from 3 columns to 2 columns for better spacing and readability.

- **Streamlined Tree Views** - Evolution Tree now offers only "Champions Only" and "Species View" modes, removing the less useful "Full" and "Lineage" views.

- **Tree Pause Behavior** - Opening the Evolution Tree now automatically pauses the simulation, restoring the previous pause state when closed.

- **Tooltips Show Fitness Mode** - Evolution Tree tooltips now display which fitness mode was used to judge each creature.

- **Light Tile Capacity** - Tile instance limit increased from 100,000 to 300,000 to accommodate complex creature paths. Console warning appears when limit is reached.

- **Ground Clearance** - Creatures with blocks extending below their origin point are now spawned with automatic ground clearance to prevent intersection.

- **Camera Floor Limit** - Camera is prevented from going below ground level in any mode.

- **Sensor Glow Intensity** - Sensor block glow effect capped at 1.0 intensity (was 1.5) for less visually distracting feedback.

- **Realistic Sun Path** - Sun now rises in the east and sets in the west, rotating in the same direction as the star spheres with timing aligned to the day/night lighting cycle.

#### Bug Fixes

- **Outcast Mode Leader** - Fixed issue where Outcast fitness mode would incorrectly identify the leader in sudden death, often showing the next creature to be eliminated rather than the actual best performer.

- **Sensor Start Mode** - Fixed bug where creatures set to start with specific sensors would receive different sensor types. The code was checking a non-existent property instead of using the proper method.

- **Determinism Fix** - Removed non-deterministic code paths including the reinforceMovements() function that modified creature actions without updating DNA, causing changes to be lost on save/load.

- **Dead Code Removal** - Cleaned up unused code including JointAction.mutate() and old color/material generation methods that were replaced by the DNA system.

- **Block Count Validation** - Fixed validation errors where block counts weren't accounting for sensor blocks added at creature generation.

- **Sensor Z-Fighting** - Fixed visual artifacts where sensor block indicators would flicker or disappear at certain angles by repositioning them further from block surfaces and adding polygon offset.

- **Character Encoding** - Fixed numerous encoding issues throughout the codebase where special characters had become garbled.

#### Previous Updates

##### Bug Fixes

- **Fitness Formula Consistency** - Fixed inconsistency between how creature fitness was calculated in different parts of the code. All fitness formulas now match exactly across creature evaluation, evolution selection, and UI display, ensuring creatures are ranked correctly.

- **Evolution Tree Toggle** - Fixed the tree display mode toggle button to correctly show the current view mode (Champions Only or Species View) rather than displaying incorrect mode names.

- **Sensor Display Labels** - Fixed minor inconsistency where the Tilt sensor was abbreviated differently in different parts of the UI.

- **Night Sky Fallback** - Added a beautiful procedural star texture generator as fallback when the stars.jpg texture file is unavailable. The procedural texture includes thousands of varied stars with realistic colors (white, blue, yellow) and subtle nebula regions.

##### Improvements

- **Null Safety** - Added defensive checks for undefined values in fitness calculations to prevent potential errors during edge cases.

- **Code Documentation** - Added comments marking critical formulas that must stay synchronized across files to prevent future inconsistencies.

##### Documentation

- **DNA System** - Added comprehensive documentation explaining the deterministic DNA-based creature generation system that ensures reproducibility across saves, loads, and lineage playback.

- **Sensor System** - Added detailed documentation for all six sensor types (Gravity, Light, Velocity, Ground, Rhythm, Tilt) including their behaviors, colors, and configuration modes.

- **Visual Features** - Added documentation for the dynamic sky system, ground trail visualization, and particle effects.

- **Evolution Tree Details** - Added documentation for the node detail panel including the footprint visualization that shows creature movement patterns.

---

## Credits

The 3D Block Creature Evolution Simulator uses:
- **Three.js** for 3D graphics rendering
- **Cannon.js** for physics simulation
- Inspired by Keiwan's "Evolution" simulator

---

*Happy evolving! Watch your creatures develop surprising and creative solutions to the challenge of locomotion.*
