const canvas = document.getElementById("challenger");
const socket = io();

const map_width = 8500
const map_height = 4781

let show_coords=false

let playerName = userData.username || 'Guest_' + Math.floor(Math.random() * 1000);

class Vector2D {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}


const otherPlayers = new Map();

// Player class with absolute coordinates - MOVED TO TOP
class Player {
    constructor(absX, absY, absRotation, action, health, id, name, scale=1) {
        this.absX = absX;
        this.absY = absY;
        this.absRotation = absRotation;
        this.action = action;
        this.health = health;
        this.stamina = 100;
        this.id = id;
        this.name = name;
        this.verts = [];
        this.lastCollisionNormal = null;
        this.lastCollisionDepth = 0;
        this.attributes = {
            scale: scale,
            rotate_speed: 0.05,
            max_health: health,
            speed: 3,
            mana_regen: 2,
            regen: 1,
            stamina_regen: 1
        };
        this.effects = {};
    }

    get_verts() {
        const scale = this.attributes["scale"];
        const s = Math.sin(this.absRotation);
        const c = Math.cos(this.absRotation);
        
        // Define vertices relative to center (matching your draw_triangle)
        const localVerts = [
            { x: 0, y: -10 * scale * 2 },      // top
            { x: 10 * scale, y: 10 * scale },   // bottom right
            { x: -10 * scale, y: 10 * scale }   // bottom left
        ];
        
        // Rotate and translate each vertex to world space
        this.verts = localVerts.map(v => ({
            x: this.absX + (v.x * c - v.y * s),
            y: this.absY + (v.x * s + v.y * c)
        }));
        
        return this.verts;
    }

    // Get the edge normals (perpendicular vectors) for SAT
    getAxes() {
        const axes = [];
        const verts = this.verts.length > 0 ? this.verts : this.get_verts();
        
        for (let i = 0; i < verts.length; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];
            
            // Edge vector
            const edge = {
                x: v2.x - v1.x,
                y: v2.y - v1.y
            };
            
            // Normal (perpendicular) - rotate edge 90 degrees
            const normal = {
                x: -edge.y,
                y: edge.x
            };
            
            // Normalize the vector
            const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
            axes.push({
                x: normal.x / length,
                y: normal.y / length
            });
        }
        
        return axes;
    }   

    // Project the triangle onto an axis and return min/max
    projectOntoAxis(axis) {
        const verts = this.verts.length > 0 ? this.verts : this.get_verts();
        
        let min = verts[0].x * axis.x + verts[0].y * axis.y;
        let max = min;
        
        for (let i = 1; i < verts.length; i++) {
            const projection = verts[i].x * axis.x + verts[i].y * axis.y;
            if (projection < min) min = projection;
            if (projection > max) max = projection;
        }
        
        return { min, max };
    }

    // SAT collision detection with MTV (Minimum Translation Vector)
    SAT(enemy) {
        // Update vertices for both triangles
        this.get_verts();
        enemy.get_verts();
        
        // Get all axes to test (normals from both triangles)
        const axes = [...this.getAxes(), ...enemy.getAxes()];
        
        let minOverlap = Infinity;
        let smallestAxis = null;
        
        // Test each axis
        for (const axis of axes) {
            const proj1 = this.projectOntoAxis(axis);
            const proj2 = enemy.projectOntoAxis(axis);
            
            // Check if projections overlap
            if (proj1.max < proj2.min || proj2.max < proj1.min) {
                // Found a separating axis - no collision
                return false;
            }
            
            // Calculate overlap on this axis
            const overlap = Math.min(proj1.max, proj2.max) - Math.max(proj1.min, proj2.min);
            
            // Track the smallest overlap (this will be our MTV)
            if (overlap < minOverlap) {
                minOverlap = overlap;
                smallestAxis = axis;
            }
        }
        
        // No separating axis found - collision detected!
        // Store the MTV for sliding calculations
        this.lastCollisionNormal = smallestAxis;
        this.lastCollisionDepth = minOverlap;
        
        return true;
    }
    
    // Get collision data (normal and penetration depth) - assumes SAT was already called
    getCollisionData(enemy) {
        if (this.lastCollisionNormal && this.lastCollisionDepth > 0) {
            // Ensure normal points from enemy to this player
            const dx = this.absX - enemy.absX;
            const dy = this.absY - enemy.absY;
            const dot = dx * this.lastCollisionNormal.x + dy * this.lastCollisionNormal.y;
            
            // Flip normal if it points the wrong way
            if (dot < 0) {
                this.lastCollisionNormal = {
                    x: -this.lastCollisionNormal.x,
                    y: -this.lastCollisionNormal.y
                };
            }
            
            return {
                normal: this.lastCollisionNormal,
                depth: this.lastCollisionDepth
            };
        }
        return null;
    }

    check_border_collision() {
        this.get_verts();
        
        for (let vert of this.verts) {
            if (vert.x > map_width || vert.x < 0) {
                return true;
            }
            if (vert.y > map_height || vert.y < 0) {
                return true;
            }
        }
        
        return false;
    }

    clamp_to_borders() {
        this.get_verts();
        
        // Find the bounds of all vertices
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (let vert of this.verts) {
            minX = Math.min(minX, vert.x);
            maxX = Math.max(maxX, vert.x);
            minY = Math.min(minY, vert.y);
            maxY = Math.max(maxY, vert.y);
        }
        
        // Clamp position if any vertex is out of bounds
        if (minX < 0) {
            this.absX += (0 - minX);
        }
        if (maxX > map_width) {
            this.absX -= (maxX - map_width);
        }
        if (minY < 0) {
            this.absY += (0 - minY);
        }
        if (maxY > map_height) {
            this.absY -= (maxY - map_height);
        }
    }

    // Broad-phase check (fast pre-filter before SAT)
    check_player_collision(enemy) {
        const dx = this.absX - enemy.absX;
        const dy = this.absY - enemy.absY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxSize = (this.attributes.scale * 20) + (enemy.attributes.scale * 20);
        
        if (distance > maxSize) {
            return false;
        }
        
        // Circles overlap, do precise SAT check
        return this.SAT(enemy);
    }
}

socket.on('connect', () => {
    console.log('Connected to server');
    const playerName = 'Player' + Math.floor(Math.random() * 1000);
    socket.emit('player_join', {
        x: game.player.absX,
        y: game.player.absY,
        rotation: game.player.absRotation,
        name: playerName,
        player_data: game.player
    });
    console.log(`Joined game as ${playerName}`);
});

socket.on('players_update', (players) => {
    const oldPlayersData = new Map(otherPlayers);
    otherPlayers.clear();
    const currentPlayerIds = new Set();
    
    Object.entries(players).forEach(([id, data]) => {
        if (id !== socket.id) {
            currentPlayerIds.add(id);
            
            if (!oldPlayersData.has(id)) {
                console.log(`Player ${data.name} joined the game`);
            }
            
            otherPlayers.set(id, data.player_data);
        }
    });

    oldPlayersData.forEach((playerData, id) => {
        if (!currentPlayerIds.has(id)) {
            console.log(`Player ${playerData.name} left the game`);
        }
    });
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

class artist {
    constructor(context, canvas, image) {
        this.context = context;
        this.canvas = canvas;
        this.backgroundImg = image;
        this.loaded = false;
        
        // Player absolute coordinates in world space
        // World space: (0,0) is top-left of the background image
        // Spawn in top-left quarter circle with radius 750
        const spawnRadius = Math.random() * 750;
        const spawnAngle = Math.random() * (Math.PI / 2); // 0 to 90 degrees (quarter circle)
        
        // Create player as a Player instance, not a plain object
        this.player = new Player(
            spawnRadius * Math.cos(spawnAngle),  // absX
            spawnRadius * Math.sin(spawnAngle),  // absY
            0,                                    // absRotation
            'idle',                               // action
            100,                                  // health
            'local',                              // id
            'LocalPlayer',                        // name
            1                                     // scale
        );
        
        // Camera properties
        this.camera = {
            rotation: 0  // How much the camera/view is rotated
        };
        
        this.backgroundImg.onload = () => {
            this.loaded = true;
            this.frame();
        };
    }

    draw_background() {
        if (!this.loaded) return;
        
        this.context.save();
        
        // Translate to center of canvas
        this.context.translate(this.canvas.width / 2, this.canvas.height / 2);
        
        // Apply camera rotation
        this.context.rotate(this.camera.rotation);
        
        // Calculate diagonal for coverage when rotated
        const diagonal = Math.sqrt(
            this.canvas.width * this.canvas.width + 
            this.canvas.height * this.canvas.height
        );
        
        const drawSize = diagonal;
        
        // Center view on player's absolute position
        const sourceX = this.player.absX - drawSize / 2;
        const sourceY = this.player.absY - drawSize / 2;
        const sourceWidth = drawSize;
        const sourceHeight = drawSize;
        
        // Clamp to image boundaries
        const actualSourceX = Math.max(0, sourceX);
        const actualSourceY = Math.max(0, sourceY);
        const actualSourceWidth = Math.min(sourceWidth, this.backgroundImg.width - actualSourceX);
        const actualSourceHeight = Math.min(sourceHeight, this.backgroundImg.height - actualSourceY);
        
        // Calculate destination offset if near edges
        const destOffsetX = actualSourceX - sourceX;
        const destOffsetY = actualSourceY - sourceY;
        
        this.context.drawImage(
            this.backgroundImg,
            actualSourceX, actualSourceY,
            actualSourceWidth, actualSourceHeight,
            -drawSize / 2 + destOffsetX,
            -drawSize / 2 + destOffsetY,
            actualSourceWidth,
            actualSourceHeight
        );
        
        this.context.restore();
    }

    draw_triangle(x, y, scale, rotation) {
        this.context.save();
        this.scale = scale;
        this.context.translate(x, y);
        this.context.rotate(rotation);
        
        this.context.beginPath();
        this.context.moveTo(0, -(10 * scale * 2));
        this.context.lineTo((10 * scale), (10 * scale));
        this.context.lineTo(-(10 * scale), (10 * scale));
        this.context.closePath();
        this.context.fillStyle = 'blue';
        this.context.fill();

        this.context.lineWidth = 2;
        this.context.strokeStyle = 'black';
        this.context.stroke();
        
        this.context.restore();
    }

    // Convert absolute world coordinates to screen coordinates
    worldToScreen(worldX, worldY, worldRotation) {
        // Calculate position relative to player
        const relX = worldX - this.player.absX;
        const relY = worldY - this.player.absY;
        
        // Rotate relative position by camera rotation (same as background)
        const cosRot = Math.cos(this.camera.rotation);
        const sinRot = Math.sin(this.camera.rotation);
        const rotatedX = relX * cosRot - relY * sinRot;
        const rotatedY = relX * sinRot + relY * cosRot;
        
        // Convert to screen coordinates
        const screenX = this.canvas.width / 2 + rotatedX;
        const screenY = this.canvas.height / 2 + rotatedY;
        
        // Calculate screen rotation (world rotation + camera rotation)
        const screenRotation = worldRotation + this.camera.rotation;
        
        return { x: screenX, y: screenY, rotation: screenRotation };
    }

    update() {
        const moveSpeed = this.player.attributes["speed"];
        const rotateSpeed = this.player.attributes["rotate_speed"];

        // Rotate camera with Q/E
        if (pressedKeys['q'] || pressedKeys['Q']) {
            this.camera.rotation += rotateSpeed;
        }
        if (pressedKeys['e'] || pressedKeys['E']) {
            this.camera.rotation -= rotateSpeed;
        }
        
        // Calculate movement direction
        let dx = 0;
        let dy = 0;
        
        if (pressedKeys['w'] || pressedKeys['W'] || pressedKeys['ArrowUp']) {
            dx += Math.sin(this.player.absRotation) * moveSpeed;
            dy -= Math.cos(this.player.absRotation) * moveSpeed;
        }
        if (pressedKeys['s'] || pressedKeys['S'] || pressedKeys['ArrowDown']) {
            dx -= Math.sin(this.player.absRotation) * moveSpeed;
            dy += Math.cos(this.player.absRotation) * moveSpeed;
        }
        if (pressedKeys['a'] || pressedKeys['A'] || pressedKeys['ArrowLeft']) {
            dx -= Math.cos(this.player.absRotation) * moveSpeed;
            dy -= Math.sin(this.player.absRotation) * moveSpeed;
        }
        if (pressedKeys['d'] || pressedKeys['D'] || pressedKeys['ArrowRight']) {
            dx += Math.cos(this.player.absRotation) * moveSpeed;
            dy += Math.sin(this.player.absRotation) * moveSpeed;
        }
        
        // Store original position
        const originalX = this.player.absX;
        const originalY = this.player.absY;
        
        // Apply movement
        this.player.absX += dx;
        this.player.absY += dy;
        this.player.absRotation = -this.camera.rotation;
        
        // Clamp to borders IMMEDIATELY after movement
        this.player.clamp_to_borders();
        
        // Update dx/dy based on actual movement after clamping
        dx = this.player.absX - originalX;
        dy = this.player.absY - originalY;
        
        // Player collisions
        otherPlayers.forEach(player => {
            if(this.player.check_player_collision(player)) {
                const collisionData = this.player.getCollisionData(player);
                if (collisionData) {
                    const normal = collisionData.normal;
                    const depth = collisionData.depth;
                    
                    const separationBuffer = 2.0;
                    const totalSeparation = depth + separationBuffer;
                    
                    this.player.absX += normal.x * totalSeparation;
                    this.player.absY += normal.y * totalSeparation;
                    
                    const dotProduct = dx * normal.x + dy * normal.y;
                    
                    if (dotProduct < 0) {
                        const slideDx = dx - dotProduct * normal.x;
                        const slideDy = dy - dotProduct * normal.y;
                        
                        this.player.absX += slideDx;
                        this.player.absY += slideDy;
                    }
                    
                    dx = this.player.absX - originalX;
                    dy = this.player.absY - originalY;
                }
            }
        });

        // Final border clamp after all collisions
        this.player.clamp_to_borders();

        // Send position to server
        socket.emit('player_move', {
            x: this.player.absX,
            y: this.player.absY,
            rotation: this.player.absRotation,
            player_data: game.player
        });
    }

    drawOtherPlayers() {
        otherPlayers.forEach(player => {
            // Convert player's absolute world position to screen position
            const screenPos = this.worldToScreen(
                player.absX,
                player.absY,
                player.absRotation
            );
            
            this.draw_triangle(
                screenPos.x,
                screenPos.y,
                1,
                screenPos.rotation
            );
        });
    }

    tick = () => {
        // Placeholder for effects processing
        if (this.player.effects) {
            // Process effects here
        }
    };

    frame = () => {
        this.update();
        
        // Clear canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background with camera rotation
        this.draw_background();
        
        // Draw local player at center (always pointing up on screen)
        this.draw_triangle(this.canvas.width / 2, this.canvas.height / 2, 1, 0);

        // Draw other players
        this.drawOtherPlayers();
        
        // Draw border
        this.context.strokeStyle = "black";
        this.context.lineWidth = 2;
        this.context.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        
        requestAnimationFrame(this.frame);
    }
}


var background = new Image();
background.src = '/static/img/map1.png';
var game = new artist(canvas.getContext('2d'), canvas, background);

function tp(x, y) {
    game.player.absX = x;
    game.player.absY = y;
}

// Keyboard
const pressedKeys = {}; 
window.addEventListener("keydown", (event) => {
    pressedKeys[event.key] = true;
    console.log(event.key + " key pressed");
});
window.addEventListener("keyup", (event) => {
    pressedKeys[event.key] = false;
});