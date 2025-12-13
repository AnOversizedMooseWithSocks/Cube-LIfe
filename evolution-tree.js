// evolution-tree.js - Graphical phylogenetic tree visualization
// Renders an interactive tree diagram showing evolutionary lineage
// Similar to a cladogram/phylogenetic tree in biology

/**
 * EvolutionTreeRenderer - Draws a graphical tree showing evolutionary history
 * 
 * Features:
 * - Horizontal tree layout (time flows left to right)
 * - Color-coded nodes: champions (green), dead ends (red), backtrack sources (yellow)
 * - Connecting lines showing parent-child relationships
 * - Labels showing creature name, generation, fitness, and block count
 * - Hover tooltips with detailed stats
 * - Pan and zoom support for large trees
 */
class EvolutionTreeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Tree data (will be set by setTreeData)
        this.nodes = [];
        this.allNodes = [];  // Store all nodes before filtering
        this.currentBranchId = null;
        
        // Display mode: 'champions' shows winning lineage, 'species' shows body plan diversity
        // Lineage mode shows: champions, branch_parents, backtrack_sources, dead_ends
        this.displayMode = 'champions';
        
        // Layout settings
        this.nodeWidth = 160;       // Width of each node box
        this.nodeHeight = 82;       // Height of each node box (room for all content + badges)
        this.horizontalSpacing = 50; // Space between generations (columns)
        this.verticalSpacing = 16;   // Minimum space between nodes in same generation
        this.padding = 40;           // Canvas edge padding
        
        // Visual settings
        this.colors = {
            champion: '#4ade80',        // Green for successful champions
            complete: '#22d3ee',        // Cyan for completed lines (reached max blocks)
            dead_end: '#f87171',        // Red for dead ends (best creature that failed)
            eliminated: '#6b7280',      // Gray for eliminated (non-best in failed gen)
            competitor: '#94a3b8',      // Slate for untried competitors
            branch_parent: '#a78bfa',   // Purple for creatures used as alternative parents
            backtrack_source: '#fbbf24', // Yellow for backtrack points
            defending: '#60a5fa',       // Blue for defending champion
            current: '#64ffda',         // Cyan highlight for current
            line: '#666666',            // Connection lines
            lineHighlight: '#64ffda',   // Highlighted path
            text: '#ffffff',            // Node text
            textSecondary: '#aaaaaa',   // Secondary text (stats)
            background: 'rgba(20, 20, 35, 0.98)',
            nodeBg: 'rgba(40, 40, 60, 0.9)',
            nodeBorder: 'rgba(100, 255, 218, 0.3)'
        };
        
        // Fonts
        this.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        
        // Pan and zoom state
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1.0;
        this.minScale = 0.05;  // Allow zooming way out to see huge trees (5%)
        this.maxScale = 2.0;
        
        // Interaction state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.hoveredNode = null;
        
        // Click detection state (to distinguish clicks from drags)
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.mouseDownTime = 0;
        this.clickThreshold = 5;       // Max pixels moved to count as click
        this.clickTimeThreshold = 300; // Max ms held to count as click
        this._dragStartOffsetX = 0;    // Offset at drag start
        this._dragStartOffsetY = 0;
        
        // Callback for when a node is clicked (set by main.js)
        // Called with (nodeId, nodeData) when user clicks a node
        this.onNodeClick = null;
        
        // Computed layout data
        this.nodePositions = new Map(); // nodeId -> {x, y}
        this.treeWidth = 0;
        this.treeHeight = 0;
        
        // Footprint animation state
        this.footprintAnimationStart = 0;      // Timestamp when animation started
        this.footprintAnimationDuration = 3000; // 3 seconds in milliseconds
        this.footprintAnimatingNode = null;    // Which node's footprint is animating
        this.animationFrameId = null;          // For canceling animation frame
        
        // Bind event handlers
        this.setupEventListeners();
    }
    
    /**
     * Toggle display mode between 'champions' and 'species'
     * - champions: Shows ONLY the winning lineage (cleanest view)
     * - species: Shows one representative per species per generation (body plan diversity)
     */
    toggleDisplayMode() {
        // Cycle between: champions -> species -> champions
        if (this.displayMode === 'champions') {
            this.displayMode = 'species';
        } else {
            this.displayMode = 'champions';
        }
        this.applyDisplayFilter();
        this.calculateLayout();
        this.centerView();
        this.render();
        return this.displayMode;
    }
    
    /**
     * Set display mode directly
     * @param {string} mode - 'champions' or 'species'
     */
    setDisplayMode(mode) {
        if (mode === 'champions' || mode === 'species') {
            this.displayMode = mode;
            this.applyDisplayFilter();
            this.calculateLayout();
            this.centerView();
            this.render();
        }
    }
    
    /**
     * Apply display filter based on current mode
     * - 'champions': Show only the winning path (cleanest, most compact view)
     * - 'species': Show best creature per species per generation (body plan diversity)
     * 
     * After filtering, we include any ancestors needed to maintain tree connectivity.
     * If a filtered node's parent was excluded, but that parent is part of a genetic
     * line that continued, we add the parent back to preserve accurate lineage display.
     */
    applyDisplayFilter() {
        let filteredNodes;
        
        if (this.displayMode === 'species') {
            // Species mode: show all different configurations tried per generation
            // Use configIndex as primary key since it distinguishes different block attachments
            // within the same generation. Fall back to speciesId or node.id if configIndex not set.
            const generationConfigMap = new Map();
            
            // Debug: count nodes per generation
            const genCounts = {};
            const configsPerGen = {};
            
            for (const node of this.allNodes) {
                genCounts[node.generation] = (genCounts[node.generation] || 0) + 1;
                
                // Use configIndex to differentiate configs within a generation
                // Check explicitly for null/undefined since 0 is a valid configIndex
                const configKey = node.configIndex !== null && node.configIndex !== undefined
                    ? `cfg${node.configIndex}`  // Prefix to ensure string comparison
                    : (node.speciesId || `id${node.id}`);
                const key = `${node.generation}_${configKey}`;
                
                // Track unique configs per generation
                if (!configsPerGen[node.generation]) configsPerGen[node.generation] = new Set();
                configsPerGen[node.generation].add(configKey);
                
                const existing = generationConfigMap.get(key);
                if (!existing || (node.fitness || 0) > (existing.fitness || 0)) {
                    generationConfigMap.set(key, node);
                }
            }
            
            filteredNodes = Array.from(generationConfigMap.values());
            
            // Debug output
            console.log(`[SPECIES VIEW] Total nodes: ${this.allNodes.length}`);
            console.log(`[SPECIES VIEW] Nodes per generation:`, genCounts);
            console.log(`[SPECIES VIEW] Unique configs per generation:`, 
                Object.fromEntries(Object.entries(configsPerGen).map(([g, s]) => [g, s.size])));
            console.log(`[SPECIES VIEW] After filtering: ${filteredNodes.length} nodes`);
        } else {
            // Champions mode (default): show just the winning lineage (including completed lines)
            const championsOnly = ['champion', 'backtrack_source', 'complete'];
            filteredNodes = this.allNodes.filter(n => championsOnly.includes(n.status));
        }
        
        // Include any missing ancestors to maintain tree connectivity
        // This preserves accurate lineage - we don't change parent references,
        // we add back the parents that are part of a continuing genetic line
        this.nodes = this.includeAncestors(filteredNodes);
        
        // Sort by generation then by config for consistent ordering
        this.nodes.sort((a, b) => {
            if (a.generation !== b.generation) return a.generation - b.generation;
            // Handle configIndex comparison - null/undefined should sort last
            const aHasConfig = a.configIndex !== null && a.configIndex !== undefined;
            const bHasConfig = b.configIndex !== null && b.configIndex !== undefined;
            if (aHasConfig && bHasConfig) return a.configIndex - b.configIndex;
            if (aHasConfig) return -1;
            if (bHasConfig) return 1;
            return 0;
        });
    }
    
    /**
     * Include any ancestors of filtered nodes that were excluded from the filter.
     * This ensures tree connectivity while preserving accurate parent-child relationships.
     * 
     * If a node made it through the filter but its parent didn't, that parent is
     * part of a genetic line that continued and should be displayed.
     * 
     * @param {Array} filteredNodes - Nodes that passed the display filter
     * @returns {Array} - Nodes with all necessary ancestors included
     */
    includeAncestors(filteredNodes) {
        // Build a map of ALL nodes by ID for ancestor lookup
        const allNodesMap = new Map();
        for (const node of this.allNodes) {
            allNodesMap.set(node.id, node);
        }
        
        // Start with the filtered nodes in a map (by ID to avoid duplicates)
        const resultMap = new Map();
        for (const node of filteredNodes) {
            resultMap.set(node.id, node);
        }
        
        // For each filtered node, trace back and add any missing ancestors
        for (const node of filteredNodes) {
            let currentId = node.parentId;
            const visited = new Set(); // Prevent infinite loops
            
            // Walk up the ancestry chain
            while (currentId !== null) {
                // Already in result set - we're done tracing this branch
                if (resultMap.has(currentId)) {
                    break;
                }
                
                // Cycle detection
                if (visited.has(currentId)) {
                    break;
                }
                visited.add(currentId);
                
                // Find the ancestor node
                const ancestor = allNodesMap.get(currentId);
                if (!ancestor) {
                    // Ancestor not found in data - stop here
                    break;
                }
                
                // Add this ancestor - it's part of a continuing genetic line
                resultMap.set(currentId, ancestor);
                
                // Continue up the tree
                currentId = ancestor.parentId;
            }
        }
        
        return Array.from(resultMap.values());
    }
    
    /**
     * Set up mouse event listeners for pan, zoom, and hover
     */
    setupEventListeners() {
        // Mouse wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Zoom centered on mouse position
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));
            
            if (newScale !== this.scale) {
                // Adjust offset to zoom toward mouse position
                const scaleChange = newScale / this.scale;
                this.offsetX = mouseX - (mouseX - this.offsetX) * scaleChange;
                this.offsetY = mouseY - (mouseY - this.offsetY) * scaleChange;
                this.scale = newScale;
                this.render();
            }
        });
        
        // Mouse down for drag start
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            
            // Track click start for click detection
            this.mouseDownX = e.clientX;
            this.mouseDownY = e.clientY;
            this.mouseDownTime = Date.now();
            
            // Track drag start offset
            this._dragStartOffsetX = this.offsetX;
            this._dragStartOffsetY = this.offsetY;
            
            this.canvas.style.cursor = 'grabbing';
        });
        
        // Mouse move for drag and hover
        this.canvas.addEventListener('mousemove', (e) => {
            // Always track mouse position for tooltip
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = e.clientX - rect.left;
            this.lastMouseY = e.clientY - rect.top;
            
            if (this.isDragging) {
                // Pan the view
                const dx = e.clientX - this.mouseDownX - (this.offsetX - this._dragStartOffsetX);
                const dy = e.clientY - this.mouseDownY - (this.offsetY - this._dragStartOffsetY);
                this.offsetX = this._dragStartOffsetX + (e.clientX - this.mouseDownX);
                this.offsetY = this._dragStartOffsetY + (e.clientY - this.mouseDownY);
                this.render();
            } else {
                // Check for hover
                this.checkHover(this.lastMouseX, this.lastMouseY);
            }
        });
        
        // Mouse up for drag end and click detection
        this.canvas.addEventListener('mouseup', (e) => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
            
            // Check if this was a click (not a drag)
            const dx = Math.abs(e.clientX - this.mouseDownX);
            const dy = Math.abs(e.clientY - this.mouseDownY);
            const elapsed = Date.now() - this.mouseDownTime;
            
            const wasClick = (dx < this.clickThreshold && 
                             dy < this.clickThreshold && 
                             elapsed < this.clickTimeThreshold);
            
            if (wasClick && this.hoveredNode && this.onNodeClick) {
                // User clicked on a node - trigger the callback
                console.log(`[TREE] Node clicked: ${this.hoveredNode.name} (ID: ${this.hoveredNode.id})`);
                this.onNodeClick(this.hoveredNode.id, this.hoveredNode);
            }
        });
        
        // Mouse leave
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.hoveredNode = null;
            this.canvas.style.cursor = 'default';
            this.render();
        });
        
        // Mouse enter
        this.canvas.addEventListener('mouseenter', () => {
            this.canvas.style.cursor = 'grab';
        });
    }
    
    /**
     * Check if mouse is hovering over a node
     */
    checkHover(mouseX, mouseY) {
        // Convert screen coordinates to tree coordinates
        const treeX = (mouseX - this.offsetX) / this.scale;
        const treeY = (mouseY - this.offsetY) / this.scale;
        
        let foundNode = null;
        
        for (let [nodeId, pos] of this.nodePositions) {
            // Check if point is within node bounds
            if (treeX >= pos.x && treeX <= pos.x + this.nodeWidth &&
                treeY >= pos.y && treeY <= pos.y + this.nodeHeight) {
                foundNode = this.nodes.find(n => n.id === nodeId);
                break;
            }
        }
        
        if (foundNode !== this.hoveredNode) {
            this.hoveredNode = foundNode;
            
            // Start footprint animation if this node has tile data
            if (foundNode && foundNode.creatureClone && 
                foundNode.creatureClone.tilesLit && foundNode.creatureClone.tilesLit.length > 0) {
                this.startFootprintAnimation(foundNode);
            } else {
                this.stopFootprintAnimation();
            }
            
            // Update cursor: pointer on clickable nodes, grab otherwise
            if (foundNode && this.onNodeClick) {
                this.canvas.style.cursor = 'pointer';
            } else {
                this.canvas.style.cursor = 'grab';
            }
            
            this.render();
        }
    }
    
    /**
     * Start the footprint animation for a node
     * Animates tiles appearing in order over 3 seconds
     */
    startFootprintAnimation(node) {
        this.footprintAnimatingNode = node;
        this.footprintAnimationStart = performance.now();
        
        // Cancel any existing animation loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Start animation loop
        const animate = () => {
            const elapsed = performance.now() - this.footprintAnimationStart;
            
            // Keep animating while we're still on this node and animation isn't complete
            if (this.hoveredNode === this.footprintAnimatingNode && 
                elapsed < this.footprintAnimationDuration) {
                this.render();
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                // Animation complete - do one final render showing all tiles
                this.render();
                this.animationFrameId = null;
            }
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    /**
     * Stop any running footprint animation
     */
    stopFootprintAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.footprintAnimatingNode = null;
    }
    
    /**
     * Set the tree data to visualize
     * @param {Object} treeData - Data from evolution.getEvolutionTreeData()
     */
    setTreeData(treeData) {
        this.allNodes = treeData.nodes || [];
        this.currentBranchId = treeData.currentBranchId;
        
        // Apply display mode filter
        this.applyDisplayFilter();
        
        // Recalculate layout
        this.calculateLayout();
        
        // Center the view on the tree
        this.centerView();
    }
    
    /**
     * Calculate positions for all nodes in the tree
     * Uses a proper tree layout algorithm that shows branching lineages
     * 
     * The key insight: only certain nodes (champions, branch_parents) actually
     * have children. We trace these lineages to create the tree structure.
     * 
     * After initial layout, we do a collision resolution pass to prevent
     * nodes at the same generation level from overlapping.
     */
    calculateLayout() {
        if (this.nodes.length === 0) {
            this.treeWidth = 0;
            this.treeHeight = 0;
            return;
        }
        
        // Clear previous positions
        this.nodePositions.clear();
        
        // Build a map of node id -> node for quick lookup
        const nodeMap = new Map();
        for (let node of this.nodes) {
            nodeMap.set(node.id, node);
        }
        
        // Build adjacency list: parentId -> [child nodes]
        const childrenMap = new Map();
        for (let node of this.nodes) {
            if (!childrenMap.has(node.parentId)) {
                childrenMap.set(node.parentId, []);
            }
            childrenMap.get(node.parentId).push(node);
        }
        
        // Find root nodes (nodes with no parent, or parent not in our set)
        const roots = this.nodes.filter(n => n.parentId === null || !nodeMap.has(n.parentId));
        
        if (roots.length === 0) {
            console.warn('No root nodes found in tree');
            return;
        }
        
        // Sort roots by generation
        roots.sort((a, b) => a.generation - b.generation);
        
        // For each node, calculate the size of its subtree (for spacing)
        const subtreeSizes = new Map();
        const calculateSubtreeSize = (nodeId) => {
            const children = childrenMap.get(nodeId) || [];
            if (children.length === 0) {
                subtreeSizes.set(nodeId, 1);
                return 1;
            }
            let size = 0;
            for (let child of children) {
                size += calculateSubtreeSize(child.id);
            }
            // Minimum size of 1 for the node itself
            subtreeSizes.set(nodeId, Math.max(1, size));
            return subtreeSizes.get(nodeId);
        };
        
        // Calculate subtree sizes for all roots
        for (let root of roots) {
            calculateSubtreeSize(root.id);
        }
        
        // Layout a subtree, returning the vertical space consumed
        let currentY = this.padding;
        
        const layoutSubtree = (node, yStart) => {
            // X position based on actual generation number
            const x = this.padding + (node.generation - 1) * (this.nodeWidth + this.horizontalSpacing);
            
            // Get children of this node
            const children = childrenMap.get(node.id) || [];
            
            // Sort children for optimal layout
            children.sort((a, b) => {
                // First, group by species
                const aSpecies = a.speciesId || a.configIndex || 0;
                const bSpecies = b.speciesId || b.configIndex || 0;
                if (aSpecies !== bSpecies) return aSpecies - bSpecies;
                
                // Within same species, prioritize lineage-continuing nodes
                const aIsLineage = ['champion', 'branch_parent', 'backtrack_source', 'complete'].includes(a.status);
                const bIsLineage = ['champion', 'branch_parent', 'backtrack_source', 'complete'].includes(b.status);
                if (aIsLineage && !bIsLineage) return -1;
                if (bIsLineage && !aIsLineage) return 1;
                
                // Finally sort by fitness
                return (b.fitness || 0) - (a.fitness || 0);
            });
            
            if (children.length === 0) {
                // Leaf node - just place it
                const y = yStart;
                this.nodePositions.set(node.id, { x, y, node });
                return this.nodeHeight + this.verticalSpacing;
            }
            
            // Has children - layout children first, then center parent
            let childY = yStart;
            let totalChildHeight = 0;
            
            for (let child of children) {
                const childHeight = layoutSubtree(child, childY);
                childY += childHeight;
                totalChildHeight += childHeight;
            }
            
            // Position this node vertically centered among its children
            const firstChildPos = this.nodePositions.get(children[0].id);
            const lastChildPos = this.nodePositions.get(children[children.length - 1].id);
            
            let y;
            if (firstChildPos && lastChildPos) {
                // Center between first and last child
                y = (firstChildPos.y + lastChildPos.y) / 2;
            } else {
                y = yStart;
            }
            
            this.nodePositions.set(node.id, { x, y, node });
            
            return totalChildHeight;
        };
        
        // Layout each root and its subtree
        for (let root of roots) {
            const height = layoutSubtree(root, currentY);
            currentY += height + this.verticalSpacing * 2;
        }
        
        // COLLISION RESOLUTION PASS
        // Check each generation level for overlapping nodes and resolve them
        this.resolveCollisions();
        
        // Calculate total tree dimensions
        let maxX = 0, maxY = 0;
        for (let [nodeId, pos] of this.nodePositions) {
            maxX = Math.max(maxX, pos.x + this.nodeWidth);
            maxY = Math.max(maxY, pos.y + this.nodeHeight);
        }
        
        this.treeWidth = maxX + this.padding;
        this.treeHeight = maxY + this.padding;
    }
    
    /**
     * Resolve collisions between nodes at the same generation level
     * Nodes are shifted down to ensure minimum vertical spacing
     */
    resolveCollisions() {
        // Group nodes by their X position (generation)
        const nodesByX = new Map();
        
        for (let [nodeId, pos] of this.nodePositions) {
            const x = pos.x;
            if (!nodesByX.has(x)) {
                nodesByX.set(x, []);
            }
            nodesByX.get(x).push({ nodeId, pos });
        }
        
        // For each generation level, sort by Y and resolve overlaps
        for (let [x, nodes] of nodesByX) {
            if (nodes.length <= 1) continue;
            
            // Sort by Y position
            nodes.sort((a, b) => a.pos.y - b.pos.y);
            
            // Check each adjacent pair for overlap
            for (let i = 1; i < nodes.length; i++) {
                const prev = nodes[i - 1];
                const curr = nodes[i];
                
                const minY = prev.pos.y + this.nodeHeight + this.verticalSpacing;
                
                if (curr.pos.y < minY) {
                    // Overlap detected - shift current node down
                    const shift = minY - curr.pos.y;
                    curr.pos.y = minY;
                    
                    // Also shift all nodes that were below this one
                    // (they might have been children that now need to move too)
                    for (let j = i + 1; j < nodes.length; j++) {
                        if (nodes[j].pos.y < nodes[j-1].pos.y + this.nodeHeight + this.verticalSpacing) {
                            nodes[j].pos.y = nodes[j-1].pos.y + this.nodeHeight + this.verticalSpacing;
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Center the view on the tree
     */
    centerView() {
        // Fit tree to canvas with some padding
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        if (this.treeWidth === 0 || this.treeHeight === 0) {
            this.offsetX = 0;
            this.offsetY = 0;
            this.scale = 1.0;
            return;
        }
        
        // Calculate scale to fit
        const scaleX = canvasWidth / this.treeWidth;
        const scaleY = canvasHeight / this.treeHeight;
        this.scale = Math.min(scaleX, scaleY, 1.0) * 0.9; // 90% to leave margin
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale));
        
        // Center the tree
        const scaledWidth = this.treeWidth * this.scale;
        const scaledHeight = this.treeHeight * this.scale;
        this.offsetX = (canvasWidth - scaledWidth) / 2;
        this.offsetY = (canvasHeight - scaledHeight) / 2;
    }
    
    /**
     * Reset zoom and pan to default view
     */
    resetView() {
        this.centerView();
        this.render();
    }
    
    /**
     * Main render function - draws the entire tree
     */
    render() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        
        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (this.nodes.length === 0) {
            this.drawEmptyState();
            return;
        }
        
        // Save context state
        ctx.save();
        
        // Apply pan and zoom transform
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        // Draw connections first (behind nodes)
        this.drawConnections();
        
        // Draw nodes
        this.drawNodes();
        
        // Restore context
        ctx.restore();
        
        // Draw legend (not affected by pan/zoom)
        this.drawLegend();
        
        // Draw tooltip if hovering
        if (this.hoveredNode) {
            this.drawTooltip();
        }
        
        // Draw zoom level indicator
        this.drawZoomIndicator();
    }
    
    /**
     * Draw "empty tree" message when no data
     */
    drawEmptyState() {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Draw seedling icon
        ctx.font = '48px serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#666666';
        ctx.fillText('[seed]', centerX, centerY - 20);
        
        // Draw message
        ctx.font = `16px ${this.fontFamily}`;
        ctx.fillStyle = '#888888';
        ctx.fillText('No evolution history yet', centerX, centerY + 30);
        ctx.font = `12px ${this.fontFamily}`;
        ctx.fillText('Start evolution to see the tree grow', centerX, centerY + 55);
    }
    
    /**
     * Draw connection lines between parent and child nodes
     */
    drawConnections() {
        const ctx = this.ctx;
        
        for (let node of this.nodes) {
            if (node.parentId === null) continue;
            
            const childPos = this.nodePositions.get(node.id);
            const parentPos = this.nodePositions.get(node.parentId);
            
            if (!childPos || !parentPos) continue;
            
            // Calculate connection points
            const startX = parentPos.x + this.nodeWidth;  // Right edge of parent
            const startY = parentPos.y + this.nodeHeight / 2;  // Vertical center
            const endX = childPos.x;  // Left edge of child
            const endY = childPos.y + this.nodeHeight / 2;  // Vertical center
            
            // Determine line color based on whether this is part of the current lineage
            const isCurrentLineage = this.isInCurrentLineage(node);
            ctx.strokeStyle = isCurrentLineage ? this.colors.lineHighlight : this.colors.line;
            ctx.lineWidth = isCurrentLineage ? 3 : 2;
            
            // Draw curved connection (like phylogenetic trees)
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            // Calculate control points for a nice S-curve
            const midX = (startX + endX) / 2;
            
            // First segment: horizontal from parent, then curve
            ctx.lineTo(midX, startY);
            
            // Vertical line to child's Y level
            ctx.lineTo(midX, endY);
            
            // Horizontal to child
            ctx.lineTo(endX, endY);
            
            ctx.stroke();
            
            // Draw a small circle at the branch point
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath();
            ctx.arc(midX, startY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    /**
     * Check if a node is part of the current champion lineage
     */
    isInCurrentLineage(node) {
        if (node.id === this.currentBranchId) return true;
        if (node.status === 'champion' || node.status === 'backtrack_source' || node.status === 'branch_parent' || node.status === 'complete') {
            // Check if any of its children are in the current lineage
            for (let childId of node.children || []) {
                const child = this.nodes.find(n => n.id === childId);
                if (child && this.isInCurrentLineage(child)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    /**
     * Draw all nodes
     */
    drawNodes() {
        for (let node of this.nodes) {
            this.drawNode(node);
        }
    }
    
    /**
     * Draw a single node
     */
    drawNode(node) {
        const ctx = this.ctx;
        const pos = this.nodePositions.get(node.id);
        if (!pos) return;
        
        const { x, y } = pos;
        const isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
        const isCurrent = node.id === this.currentBranchId;
        
        // Get node color based on status
        let borderColor = this.colors[node.status] || this.colors.champion;
        if (isCurrent) {
            borderColor = this.colors.current;
        }
        
        // Draw node background
        ctx.fillStyle = isHovered ? 'rgba(60, 60, 80, 0.95)' : this.colors.nodeBg;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isCurrent ? 3 : 2;
        
        // Rounded rectangle
        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + this.nodeWidth - radius, y);
        ctx.quadraticCurveTo(x + this.nodeWidth, y, x + this.nodeWidth, y + radius);
        ctx.lineTo(x + this.nodeWidth, y + this.nodeHeight - radius);
        ctx.quadraticCurveTo(x + this.nodeWidth, y + this.nodeHeight, x + this.nodeWidth - radius, y + this.nodeHeight);
        ctx.lineTo(x + radius, y + this.nodeHeight);
        ctx.quadraticCurveTo(x, y + this.nodeHeight, x, y + this.nodeHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // === ROW 1: Status icon, Generation, Block count ===
        const row1Y = y + 12;
        
        // Status icon (left)
        const icon = this.getStatusIcon(node.status);
        ctx.font = '11px serif';
        ctx.fillStyle = borderColor;
        ctx.textAlign = 'left';
        ctx.fillText(icon, x + 4, row1Y);
        
        // Generation (after icon)
        ctx.font = `bold 9px ${this.fontFamily}`;
        ctx.fillStyle = '#ffd700';  // Gold
        ctx.fillText(`Gen ${node.generation}`, x + 20, row1Y);
        
        // Block count (right aligned)
        ctx.fillStyle = '#64ffda';
        ctx.textAlign = 'right';
        ctx.fillText(`${node.blocks} blk`, x + this.nodeWidth - 4, row1Y);
        
        // === ROW 2: Full DNA segment ===
        const row2Y = y + 24;
        ctx.font = `bold 8px ${this.fontFamily}`;
        ctx.fillStyle = this.colors.text;
        ctx.textAlign = 'left';
        ctx.fillText(node.name || 'Unknown', x + 4, row2Y);
        
        // === ROW 3: Fitness value and mode indicator ===
        const row3Y = y + 36;
        ctx.font = `8px ${this.fontFamily}`;
        ctx.fillStyle = this.colors.textSecondary;
        ctx.textAlign = 'left';
        ctx.fillText(`Fit: ${node.fitness.toFixed(1)}`, x + 4, row3Y);
        
        // Show fitness mode used (abbreviated)
        if (node.fitnessMode) {
            const modeAbbrev = {
                'distance': 'Dist', 'efficiency': 'Eff', 'jump': 'Jump',
                'area': 'Area', 'outcast': 'Out', 'spartan': 'Spar'
            };
            ctx.fillStyle = '#fbbf24';  // Yellow/amber for mode
            ctx.textAlign = 'right';
            ctx.fillText(`[${modeAbbrev[node.fitnessMode] || node.fitnessMode}]`, x + this.nodeWidth - 4, row3Y);
        }
        
        // === ROW 4: Distance and Height ===
        const row4Y = y + 46;
        ctx.fillStyle = this.colors.textSecondary;
        ctx.textAlign = 'left';
        ctx.fillText(`D: ${node.distance.toFixed(1)}m  H: ${node.height.toFixed(1)}m`, x + 4, row4Y);
        
        // === ROW 5: Jump, Tiles, and Efficiency ===
        const row5Y = y + 57;
        const jump = node.jumpHeight || 0;
        const tiles = node.tilesLit || 0;
        ctx.fillText(`J: ${jump.toFixed(1)}m  T: ${tiles}`, x + 4, row5Y);
        
        // Efficiency on the right
        const efficiency = tiles > 0 ? (node.distance / tiles) : 0;
        ctx.fillStyle = '#64ffda';
        ctx.textAlign = 'right';
        ctx.fillText(`Eff: ${efficiency.toFixed(2)}`, x + this.nodeWidth - 4, row5Y);
        
        // === BOTTOM ROW: Badges (organized left/center/right) ===
        const badgeY = y + this.nodeHeight - 4;  // Text baseline for badges
        const badgeBgY = y + this.nodeHeight - 12;  // Background top
        
        // LEFT: Config badge
        if (node.configIndex !== null && node.configIndex !== undefined && node.configIndex >= 0) {
            ctx.fillStyle = 'rgba(167, 139, 250, 0.3)';
            ctx.fillRect(x + 4, badgeBgY, 26, 10);
            ctx.font = `bold 7px ${this.fontFamily}`;
            ctx.fillStyle = '#a78bfa';
            ctx.textAlign = 'center';
            ctx.fillText(`Cfg${node.configIndex + 1}`, x + 17, badgeY);
        }
        
        // CENTER: Status badge (CURRENT, MAX BLOCKS, or dead end mode)
        if (isCurrent) {
            ctx.fillStyle = 'rgba(100, 255, 218, 0.2)';
            ctx.fillRect(x + 55, badgeBgY, 50, 10);
            ctx.font = `bold 7px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.current;
            ctx.textAlign = 'center';
            ctx.fillText('CURRENT', x + 80, badgeY);
        } else if (node.status === 'complete') {
            ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
            ctx.fillRect(x + 55, badgeBgY, 50, 10);
            ctx.font = `bold 7px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.complete;
            ctx.textAlign = 'center';
            ctx.fillText('MAX BLOCKS', x + 80, badgeY);
        } else if (node.status === 'dead_end' && node.fitnessMode) {
            ctx.fillStyle = 'rgba(248, 113, 113, 0.2)';
            ctx.fillRect(x + 55, badgeBgY, 50, 10);
            ctx.font = `bold 7px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.dead_end;
            ctx.textAlign = 'center';
            const modeLabel = this.getModeShortName(node.fitnessMode);
            ctx.fillText(modeLabel, x + 80, badgeY);
        }
        
        // RIGHT: Sensor badge
        if (node.sensors && node.sensors.length > 0) {
            const sensorCount = node.sensors.length;
            ctx.fillStyle = 'rgba(170, 68, 255, 0.4)';
            ctx.fillRect(x + this.nodeWidth - 28, badgeBgY, 24, 10);
            ctx.font = `bold 7px ${this.fontFamily}`;
            ctx.fillStyle = '#aa44ff';
            ctx.textAlign = 'center';
            ctx.fillText(`S:${sensorCount}`, x + this.nodeWidth - 16, badgeY);
        }
    }
    
    /**
     * Get short display name for fitness mode
     */
    getModeShortName(mode) {
        const names = {
            'distance': 'DIST MODE',
            'efficiency': 'EFF MODE',
            'jump': 'JUMP MODE',
            'area': 'AREA MODE',
            'outcast': 'OUTCAST'
        };
        return names[mode] || mode.toUpperCase();
    }
    
    /**
     * Get icon for node status - using text symbols for reliability
     */
    getStatusIcon(status) {
        const icons = {
            'champion': '[C]',
            'complete': '[*]',
            'dead_end': '[X]',
            'eliminated': '[-]',
            'competitor': '[.]',
            'branch_parent': '[B]',
            'backtrack_source': '[>]',
            'defending': '[D]'
        };
        return icons[status] || '[?]';
    }
    
    /**
     * Draw legend in corner
     */
    drawLegend() {
        const ctx = this.ctx;
        const x = 10;
        const y = 10;
        const lineHeight = 16;
        
        // Different legend items based on display mode
        // Champions mode shows fewer items (just the winning path)
        // Species mode shows more items since it includes variety
        const items = this.displayMode === 'champions' ? [
            { icon: '[C]', label: 'Champion', color: this.colors.champion },
            { icon: '[*]', label: 'Complete', color: this.colors.complete },
            { icon: '[<]', label: 'Backtrack', color: this.colors.backtrack_source }
        ] : [
            { icon: '[C]', label: 'Champion', color: this.colors.champion },
            { icon: '[*]', label: 'Complete', color: this.colors.complete },
            { icon: '[X]', label: 'Dead End', color: this.colors.dead_end },
            { icon: '[-]', label: 'Eliminated', color: this.colors.eliminated },
            { icon: '[.]', label: 'Competitor', color: this.colors.competitor },
            { icon: '[B]', label: 'Branch', color: this.colors.branch_parent }
        ];
        
        // Add extra height for click hint if callback is set
        const hasClickHint = this.onNodeClick !== null;
        const boxHeight = 50 + items.length * lineHeight + (hasClickHint ? 22 : 0);
        
        // Background
        ctx.fillStyle = 'rgba(20, 20, 35, 0.9)';
        ctx.fillRect(x, y, 145, boxHeight);
        ctx.strokeStyle = 'rgba(100, 255, 218, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, 145, boxHeight);
        
        // Title with mode indicator
        ctx.font = `bold 10px ${this.fontFamily}`;
        ctx.fillStyle = '#64ffda';
        ctx.textAlign = 'left';
        let modeLabel;
        if (this.displayMode === 'species') {
            modeLabel = 'SPECIES VIEW';
        } else {
            modeLabel = 'CHAMPIONS ONLY';
        }
        ctx.fillText(modeLabel, x + 8, y + 14);
        
        // Mode toggle hint
        ctx.font = `8px ${this.fontFamily}`;
        ctx.fillStyle = '#888888';
        ctx.fillText('(showing ' + this.nodes.length + ' of ' + this.allNodes.length + ')', x + 8, y + 26);
        
        // Legend items
        ctx.font = `11px ${this.fontFamily}`;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemY = y + 42 + i * lineHeight;
            
            // Icon
            ctx.font = '11px monospace';
            ctx.fillStyle = item.color;
            ctx.fillText(item.icon, x + 8, itemY);
            
            // Label
            ctx.font = `10px ${this.fontFamily}`;
            ctx.fillText(item.label, x + 35, itemY);
        }
        
        // Click hint at bottom of legend
        if (hasClickHint) {
            const hintY = y + 48 + items.length * lineHeight;
            ctx.fillStyle = '#64ffda';
            ctx.font = `bold 9px ${this.fontFamily}`;
            ctx.fillText('\u{1F449} Click node to branch', x + 8, hintY);
        }
    }
    
    /**
     * Draw tooltip for hovered node
     */
    drawTooltip() {
        if (!this.hoveredNode) return;
        
        const ctx = this.ctx;
        const node = this.hoveredNode;
        
        // Position tooltip near cursor (but within canvas)
        const tooltipWidth = 220;
        // Dynamic height based on content
        let extraHeight = 0;
        
        if (node.fitnessMode) extraHeight += 15;
        if (node.rank !== undefined) extraHeight += 15;
        // Add space for config info if available
        if (node.configIndex !== null && node.configIndex !== undefined && node.configIndex >= 0) extraHeight += 15;
        // Add space for sensor info if creature has sensors (now more compact)
        if (node.sensors && node.sensors.length > 0) {
            extraHeight += 15;  // One line for sensors
            if (node.lastAddedSensor) extraHeight += 15;  // +New line
        }
        // Add space for tile footprint image if creature has tile data
        if (node.creatureClone && node.creatureClone.tilesLit && node.creatureClone.tilesLit.length > 0) {
            extraHeight += 100;  // Space for footprint image + label
        }
        const tooltipHeight = 260 + extraHeight;
        let x = Math.min(this.canvas.width - tooltipWidth - 10, this.lastMouseX + 15);
        let y = Math.min(this.canvas.height - tooltipHeight - 10, this.lastMouseY + 15);
        
        // Background
        ctx.fillStyle = 'rgba(30, 30, 50, 0.95)';
        ctx.strokeStyle = this.colors[node.status] || '#64ffda';
        ctx.lineWidth = 2;
        
        // Rounded rectangle
        const radius = 8;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + tooltipWidth - radius, y);
        ctx.quadraticCurveTo(x + tooltipWidth, y, x + tooltipWidth, y + radius);
        ctx.lineTo(x + tooltipWidth, y + tooltipHeight - radius);
        ctx.quadraticCurveTo(x + tooltipWidth, y + tooltipHeight, x + tooltipWidth - radius, y + tooltipHeight);
        ctx.lineTo(x + radius, y + tooltipHeight);
        ctx.quadraticCurveTo(x, y + tooltipHeight, x, y + tooltipHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Content
        const padding = 10;
        let lineY = y + padding + 12;
        const lineSpacing = 15;
        
        // Full DNA segment as the creature's identifier
        ctx.font = `bold 11px ${this.fontFamily}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(`${this.getStatusIcon(node.status)} ${node.name || 'Unknown'}`, x + padding, lineY);
        lineY += lineSpacing;
        
        // Status
        ctx.font = `11px ${this.fontFamily}`;
        ctx.fillStyle = this.colors[node.status] || '#64ffda';
        const statusText = this.getStatusText(node.status);
        ctx.fillText(`Status: ${statusText}`, x + padding, lineY);
        lineY += lineSpacing;
        
        // Show rank if available
        if (node.rank !== undefined) {
            ctx.fillStyle = this.colors.textSecondary;
            ctx.fillText(`Rank: #${node.rank + 1} in generation`, x + padding, lineY);
            lineY += lineSpacing;
        }
        
        // Show fitness mode used to judge this creature (for ALL creatures, not just dead ends)
        if (node.fitnessMode) {
            const modeName = this.getModeLongName(node.fitnessMode);
            // Color based on status - red for dead ends, yellow/amber for others
            if (node.status === 'dead_end') {
                ctx.fillStyle = this.colors.dead_end;
                ctx.fillText(`Judged by: ${modeName} (failed)`, x + padding, lineY);
            } else {
                ctx.fillStyle = '#fbbf24';  // Amber for mode indicator
                ctx.fillText(`Judged by: ${modeName}`, x + padding, lineY);
            }
            lineY += lineSpacing;
        }
        
        // Basic stats
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`Generation: ${node.generation}  |  Blocks: ${node.blocks}`, x + padding, lineY);
        lineY += lineSpacing;
        
        // Config info (attachment point used) - clearer label
        if (node.configIndex !== null && node.configIndex !== undefined && node.configIndex >= 0) {
            ctx.fillStyle = '#a78bfa';  // Purple for config
            const variantLabel = node.variantIndex !== null ? `, Variant ${node.variantIndex + 1}` : '';
            ctx.fillText(`Config ${node.configIndex + 1}${variantLabel}`, x + padding, lineY);
            lineY += lineSpacing;
        }
        
        // Sensor/special block info if creature has any (compact display)
        if (node.sensors && node.sensors.length > 0) {
            ctx.fillStyle = '#aa44ff';  // Purple for sensors
            // Get abbreviated names for sensors
            const abbrevMap = {
                'gravity': 'Grv', 'light': 'Lgt', 'velocity': 'Vel',
                'ground': 'Gnd', 'rhythm': 'Rhy', 'tilt': 'Tlt',
                'compass': 'Cmp', 'tracking': 'Trk'
            };
            const sensorAbbrevs = node.sensors.map(type => abbrevMap[type] || type);
            ctx.fillText(`Sensors: ${sensorAbbrevs.join(', ')}`, x + padding, lineY);
            lineY += lineSpacing;
            
            // Show if a sensor was just added
            if (node.lastAddedSensor) {
                ctx.fillStyle = '#4ade80';  // Green for new
                const addedAbbrev = abbrevMap[node.lastAddedSensor] || node.lastAddedSensor;
                ctx.fillText(`+New: ${addedAbbrev}`, x + padding, lineY);
                lineY += lineSpacing;
            }
        }
        
        // Metrics section header
        ctx.fillStyle = '#64ffda';
        ctx.fillText('--- Raw Metrics ---', x + padding, lineY);
        lineY += lineSpacing;
        
        // Raw metrics
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`[D] Distance: ${node.distance.toFixed(2)}m`, x + padding, lineY);
        lineY += lineSpacing;
        ctx.fillText(`Max Height: ${node.height.toFixed(2)}m`, x + padding, lineY);
        lineY += lineSpacing;
        
        const jump = node.jumpHeight || 0;
        const tiles = node.tilesLit || 0;
        ctx.fillText(`Jump Height: ${jump.toFixed(2)}m`, x + padding, lineY);
        lineY += lineSpacing;
        ctx.fillText(`Tiles Lit: ${tiles}`, x + padding, lineY);
        lineY += lineSpacing;
        
        // Efficiency
        const efficiency = tiles > 0 ? (node.distance / tiles) : 0;
        ctx.fillText(`[E] Efficiency: ${efficiency.toFixed(3)} (dist/tile)`, x + padding, lineY);
        lineY += lineSpacing;
        
        // Mode scores section
        ctx.fillStyle = '#ffd700';
        ctx.fillText('--- Mode Scores ---', x + padding, lineY);
        lineY += lineSpacing;
        
        // Calculate all mode scores
        const distanceScore = node.distance * 2.0 + node.height * 0.5;
        const efficiencyScore = tiles > 0 ? (efficiency * 100 + node.height * 0.2) : 0;
        const jumpScore = jump * 10.0 + node.distance * 0.1;
        const areaScore = tiles * 1.0 + node.distance * 0.05;
        const outcastScore = node.distance + node.height * 2 + tiles * 0.5 + jump * 5;
        const spartanScore = node.distance * 1.0 + node.height * 2.0 + tiles * 0.2 + jump * 3.0;
        
        ctx.font = `10px ${this.fontFamily}`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`[D] Distance: ${distanceScore.toFixed(1)}`, x + padding, lineY);
        ctx.fillText(`[E] Efficiency: ${efficiencyScore.toFixed(1)}`, x + padding + 100, lineY);
        lineY += lineSpacing - 2;
        ctx.fillText(`[J] Jump: ${jumpScore.toFixed(1)}`, x + padding, lineY);
        ctx.fillText(`[A] Area: ${areaScore.toFixed(1)}`, x + padding + 100, lineY);
        lineY += lineSpacing - 2;
        ctx.fillText(`[O] Outcast: ${outcastScore.toFixed(1)}`, x + padding, lineY);
        ctx.fillText(`[S] Spartan: ${spartanScore.toFixed(1)}`, x + padding + 100, lineY);
        
        // Parent info if available
        if (node.parentName) {
            lineY += lineSpacing;
            ctx.fillStyle = '#666666';
            ctx.fillText(`Parent: ${node.parentName}`, x + padding, lineY);
        }
        
        // Draw tile footprint visualization if creature has tile data
        if (node.creatureClone && node.creatureClone.tilesLit && node.creatureClone.tilesLit.length > 0) {
            lineY += lineSpacing + 5;
            
            // Separator line
            ctx.strokeStyle = '#64ffda';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + padding, lineY - 8);
            ctx.lineTo(x + tooltipWidth - padding, lineY - 8);
            ctx.stroke();
            
            // Label
            ctx.font = `bold 10px ${this.fontFamily}`;
            ctx.fillStyle = '#64ffda';
            ctx.fillText('Footprint:', x + padding, lineY);
            lineY += 8;
            
            // Draw the footprint image
            this.drawTileFootprint(ctx, node.creatureClone.tilesLit, x + padding, lineY, tooltipWidth - padding * 2);
        }
    }
    
    /**
     * Draw a visual representation of the creature's tile footprint
     * Animates tiles appearing in order over 3 seconds when first displayed
     * 
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} tilesLit - Array of tile coordinate strings like "x,z" in visitation order
     * @param {number} drawX - Left edge of drawing area
     * @param {number} drawY - Top edge of drawing area
     * @param {number} maxWidth - Maximum width available for the image
     */
    drawTileFootprint(ctx, tilesLit, drawX, drawY, maxWidth) {
        if (!tilesLit || tilesLit.length === 0) return;
        
        // Calculate animation progress (0 to 1)
        // If animation is complete or not running, show all tiles
        let animProgress = 1.0;
        if (this.footprintAnimatingNode && this.footprintAnimationStart > 0) {
            const elapsed = performance.now() - this.footprintAnimationStart;
            animProgress = Math.min(1.0, elapsed / this.footprintAnimationDuration);
        }
        
        // How many tiles to show based on animation progress
        const tilesToShow = Math.floor(tilesLit.length * animProgress);
        
        // First pass: find bounding box of ALL tiles (so frame doesn't change during animation)
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let validCount = 0;
        
        for (const key of tilesLit) {
            const [xStr, zStr] = key.split(',');
            const tileX = parseInt(xStr, 10);
            const tileZ = parseInt(zStr, 10);
            
            if (!isNaN(tileX) && !isNaN(tileZ)) {
                validCount++;
                minX = Math.min(minX, tileX);
                maxX = Math.max(maxX, tileX);
                minZ = Math.min(minZ, tileZ);
                maxZ = Math.max(maxZ, tileZ);
            }
        }
        
        if (validCount === 0) return;
        
        // Calculate dimensions of the footprint
        const footprintWidth = maxX - minX + 1;
        const footprintHeight = maxZ - minZ + 1;
        
        // Calculate pixel size to fit within available space
        // Use max height of 70 pixels for the footprint
        const maxHeight = 70;
        const scaleX = maxWidth / footprintWidth;
        const scaleZ = maxHeight / footprintHeight;
        const pixelSize = Math.min(scaleX, scaleZ, 4);  // Cap at 4px per tile for readability
        
        // Calculate actual drawing dimensions
        const imgWidth = footprintWidth * pixelSize;
        const imgHeight = footprintHeight * pixelSize;
        
        // Center the footprint horizontally in the available space
        const offsetX = drawX + (maxWidth - imgWidth) / 2;
        const offsetY = drawY;
        
        // Draw background (dark grid area)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(offsetX - 2, offsetY - 2, imgWidth + 4, imgHeight + 4);
        
        // Draw tiles up to current animation progress
        // Use a gradient from darker cyan (start) to bright cyan (end) based on visitation order
        const totalTiles = tilesLit.length;
        
        for (let i = 0; i < tilesToShow; i++) {
            const key = tilesLit[i];
            const [xStr, zStr] = key.split(',');
            const tileX = parseInt(xStr, 10);
            const tileZ = parseInt(zStr, 10);
            
            if (isNaN(tileX) || isNaN(tileZ)) continue;
            
            // Color based on visitation order (0 = first, 1 = last)
            const progress = totalTiles > 1 ? i / (totalTiles - 1) : 0;
            
            // Interpolate from darker cyan (#3a9988) to bright cyan (#64ffda)
            const r = Math.floor(58 + progress * 42);    // 58 -> 100
            const g = Math.floor(153 + progress * 102);  // 153 -> 255
            const b = Math.floor(136 + progress * 82);   // 136 -> 218
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            
            // Calculate screen position (flip Z so positive goes up visually)
            const screenX = offsetX + (tileX - minX) * pixelSize;
            const screenY = offsetY + (maxZ - tileZ) * pixelSize;  // Flip Z
            
            // Draw the tile with a tiny gap for grid effect
            const gap = pixelSize > 2 ? 0.5 : 0;
            ctx.fillRect(screenX + gap, screenY + gap, pixelSize - gap * 2, pixelSize - gap * 2);
        }
        
        // Draw border around the footprint
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(offsetX - 2, offsetY - 2, imgWidth + 4, imgHeight + 4);
        
        // Draw origin marker (spawn point at 0,0) if visible in the footprint
        if (minX <= 0 && maxX >= 0 && minZ <= 0 && maxZ >= 0) {
            const originScreenX = offsetX + (0 - minX) * pixelSize + pixelSize / 2;
            const originScreenY = offsetY + (maxZ - 0) * pixelSize + pixelSize / 2;
            
            // Small crosshair at origin
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(originScreenX - 3, originScreenY);
            ctx.lineTo(originScreenX + 3, originScreenY);
            ctx.moveTo(originScreenX, originScreenY - 3);
            ctx.lineTo(originScreenX, originScreenY + 3);
            ctx.stroke();
        }
    }
    
    /**
     * Get human-readable status text
     */
    getStatusText(status) {
        const texts = {
            'champion': 'Champion (Selected)',
            'dead_end': 'Dead End (Best but Failed)',
            'eliminated': 'Eliminated (In Failed Gen)',
            'competitor': 'Competitor (Available)',
            'branch_parent': 'Branch Parent (Alt Path)',
            'backtrack_source': 'Branch Point',
            'defending': 'Defending Champion'
        };
        return texts[status] || status;
    }
    
    /**
     * Get human-readable long name for fitness mode
     */
    getModeLongName(mode) {
        const names = {
            'distance': 'Distance',
            'efficiency': 'Efficiency',
            'jump': 'Jump Height',
            'area': 'Area Coverage',
            'outcast': 'Outcast',
            'spartan': 'Spartan'
        };
        return names[mode] || mode;
    }
    
    /**
     * Draw zoom level indicator
     */
    drawZoomIndicator() {
        const ctx = this.ctx;
        const x = this.canvas.width - 80;
        const y = this.canvas.height - 30;
        
        ctx.fillStyle = 'rgba(20, 20, 35, 0.8)';
        ctx.fillRect(x - 5, y - 12, 75, 20);
        
        ctx.font = `10px ${this.fontFamily}`;
        ctx.fillStyle = '#888888';
        ctx.textAlign = 'left';
        ctx.fillText(`Zoom: ${(this.scale * 100).toFixed(0)}%`, x, y);
    }
    
    /**
     * Resize canvas and re-render
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.render();
    }
}


/**
 * Helper function to create and mount the tree renderer in the modal
 * Call this from main.js when showing the evolution tree
 */
function createTreeRenderer(containerElement) {
    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'evolution-tree-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    
    // Clear container and add canvas
    containerElement.innerHTML = '';
    containerElement.appendChild(canvas);
    
    // Set canvas size to match container
    const rect = containerElement.getBoundingClientRect();
    canvas.width = rect.width || 650;
    canvas.height = rect.height || 450;
    
    // Create and return renderer
    return new EvolutionTreeRenderer(canvas);
}
