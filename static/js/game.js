const canvas = document.getElementById("challenger");
const socket = io();

const otherPlayers = new Map();

socket.on('connect', () => {
    console.log('Connected to server');
    const playerName = 'Player' + Math.floor(Math.random() * 1000);
    socket.emit('player_join', {
        x: game.player.absX,
        y: game.player.absY,
        rotation: game.player.absRotation,
        name: playerName
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
            
            otherPlayers.set(id, new Player(
                data.x,
                data.y,
                data.rotation,
                'idle',
                100,
                id,
                data.name
            ));
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
        
        this.player = {
            absX: spawnRadius * Math.cos(spawnAngle),     // Absolute X position in world
            absY: spawnRadius * Math.sin(spawnAngle),     // Absolute Y position in world
            absRotation: 0                                 // Absolute rotation relative to world (not screen)
        };
        
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
        
        this.context.translate(x, y);
        this.context.rotate(rotation);
        
        this.context.beginPath();
        this.context.moveTo(0, -(10 * scale * 2));
        this.context.lineTo((10 * scale), (10 * scale));
        this.context.lineTo(-(10 * scale), (10 * scale));
        this.context.closePath();
        this.context.fillStyle = 'blue';
        this.context.fill();

        this.context.lineWidth = 3;
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
        const moveSpeed = 3;
        const rotateSpeed = 0.05;
        
        // Rotate camera with Q/E
        if (pressedKeys['q'] || pressedKeys['Q']) {
            this.camera.rotation += rotateSpeed;
        }
        if (pressedKeys['e'] || pressedKeys['E']) {
            this.camera.rotation -= rotateSpeed;
        }
        
        // Calculate movement direction based on player's absolute rotation
        let dx = 0;
        let dy = 0;
        
        // Forward/Backward (W/S) - movement in world space based on absolute rotation
        if (pressedKeys['w'] || pressedKeys['W'] || pressedKeys['ArrowUp']) {
            dx += Math.sin(this.player.absRotation) * moveSpeed;
            dy -= Math.cos(this.player.absRotation) * moveSpeed;
        }
        if (pressedKeys['s'] || pressedKeys['S'] || pressedKeys['ArrowDown']) {
            dx -= Math.sin(this.player.absRotation) * moveSpeed;
            dy += Math.cos(this.player.absRotation) * moveSpeed;
        }
        
        // Strafe Left/Right (A/D)
        if (pressedKeys['a'] || pressedKeys['A'] || pressedKeys['ArrowLeft']) {
            dx -= Math.cos(this.player.absRotation) * moveSpeed;
            dy -= Math.sin(this.player.absRotation) * moveSpeed;
        }
        if (pressedKeys['d'] || pressedKeys['D'] || pressedKeys['ArrowRight']) {
            dx += Math.cos(this.player.absRotation) * moveSpeed;
            dy += Math.sin(this.player.absRotation) * moveSpeed;
        }
        
        // Apply movement to absolute position
        this.player.absX += dx;
        this.player.absY += dy;
        
        // Keep player rotation aligned with camera (player always faces "up" on screen)
        this.player.absRotation = -this.camera.rotation;
        
        // Send absolute position to server
        socket.emit('player_move', {
            x: this.player.absX,
            y: this.player.absY,
            rotation: this.player.absRotation
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
                0.5,
                screenPos.rotation
            );
        });
    }

    frame = () => {
        this.update();
        
        // Clear canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background with camera rotation
        this.draw_background();
        
        // Draw local player at center (always pointing up on screen)
        this.draw_triangle(this.canvas.width / 2, this.canvas.height / 2, 0.5, 0);

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

// Keyboard
const pressedKeys = {}; 
window.addEventListener("keydown", (event) => {
    pressedKeys[event.key] = true;
    console.log(event.key + " key pressed");
});
window.addEventListener("keyup", (event) => {
    pressedKeys[event.key] = false;
});

// Player class with absolute coordinates
class Player {
    constructor(absX, absY, absRotation, action, health, id, name) {
        this.absX = absX;           // Absolute X in world space
        this.absY = absY;           // Absolute Y in world space
        this.absRotation = absRotation;  // Absolute rotation in world space
        this.action = action;
        this.health = health;
        this.id = id;
        this.name = name;
    }
}