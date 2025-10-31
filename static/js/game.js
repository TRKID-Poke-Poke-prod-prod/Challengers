const canvas = document.getElementById("challenger");
const socket = io();

const map_width = 8500
const map_height = 4781

let display_projectile = false
let show_coords = false
let angle = 0

let playerName = userData.username || 'Guest_' + Math.floor(Math.random() * 1000);

// Add projectiles array
const projectiles = [];

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

// Projectile class for straight-line projectiles
class Projectile {
    constructor(absX, absY, rotation, speed = 10, damage = 10, ownerId = null) {
        this.absX = absX;
        this.absY = absY;
        this.rotation = rotation; // in radians
        this.speed = speed;
        this.damage = damage;
        this.ownerId = ownerId;
        this.radius = 5; // collision radius
    }

    update() {
        // Move projectile in straight line
        this.absX += Math.cos(this.rotation) * this.speed;
        this.absY += Math.sin(this.rotation) * this.speed;
    }

    isExpired() {
        // Remove if out of bounds
        return this.absX < 0 || this.absX > map_width ||
            this.absY < 0 || this.absY > map_height;
    }

    // Check collision with a player (circle vs triangle)
    checkPlayerCollision(player) {
        // Don't collide with owner
        if (this.ownerId === player.id) {
            return false;
        }

        player.get_verts();

        // Simple circle-triangle collision
        // Check if projectile center is inside triangle or close to any edge
        const verts = player.verts;

        // Point in triangle test
        function sign(p1, p2, p3) {
            return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
        }

        const d1 = sign({ x: this.absX, y: this.absY }, verts[0], verts[1]);
        const d2 = sign({ x: this.absX, y: this.absY }, verts[1], verts[2]);
        const d3 = sign({ x: this.absX, y: this.absY }, verts[2], verts[0]);

        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

        const isInside = !(hasNeg && hasPos);

        if (isInside) return true;

        // Check distance to edges
        for (let i = 0; i < verts.length; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];

            // Distance from point to line segment
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const lengthSquared = dx * dx + dy * dy;

            let t = ((this.absX - v1.x) * dx + (this.absY - v1.y) * dy) / lengthSquared;
            t = Math.max(0, Math.min(1, t));

            const closestX = v1.x + t * dx;
            const closestY = v1.y + t * dy;

            const distX = this.absX - closestX;
            const distY = this.absY - closestY;
            const distance = Math.sqrt(distX * distX + distY * distY);

            if (distance <= this.radius) {
                return true;
            }
        }

        return false;
    }
}

// Player class with absolute coordinates
class Player {
    constructor(absX, absY, absRotation, action, health, id, name, scale = 1) {
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
            stamina_regen: 1,
            shoot_strength: 10 // Projectile damage
        };
        this.effects = {};
    }

    get_verts() {
        const scale = this.attributes["scale"];
        const s = Math.sin(this.absRotation);
        const c = Math.cos(this.absRotation);

        const localVerts = [
            { x: 0, y: -10 * scale * 2 },
            { x: 10 * scale, y: 10 * scale },
            { x: -10 * scale, y: 10 * scale }
        ];

        this.verts = localVerts.map(v => ({
            x: this.absX + (v.x * c - v.y * s),
            y: this.absY + (v.x * s + v.y * c)
        }));

        return this.verts;
    }

    getAxes() {
        const axes = [];
        const verts = this.verts.length > 0 ? this.verts : this.get_verts();

        for (let i = 0; i < verts.length; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];

            const edge = {
                x: v2.x - v1.x,
                y: v2.y - v1.y
            };

            const normal = {
                x: -edge.y,
                y: edge.x
            };

            const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
            axes.push({
                x: normal.x / length,
                y: normal.y / length
            });
        }

        return axes;
    }

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

    SAT(enemy) {
        this.get_verts();
        enemy.get_verts();

        const axes = [...this.getAxes(), ...enemy.getAxes()];

        let minOverlap = Infinity;
        let smallestAxis = null;

        for (const axis of axes) {
            const proj1 = this.projectOntoAxis(axis);
            const proj2 = enemy.projectOntoAxis(axis);

            if (proj1.max < proj2.min || proj2.max < proj1.min) {
                return false;
            }

            const overlap = Math.min(proj1.max, proj2.max) - Math.max(proj1.min, proj2.min);

            if (overlap < minOverlap) {
                minOverlap = overlap;
                smallestAxis = axis;
            }
        }

        this.lastCollisionNormal = smallestAxis;
        this.lastCollisionDepth = minOverlap;

        return true;
    }

    getCollisionData(enemy) {
        if (this.lastCollisionNormal && this.lastCollisionDepth > 0) {
            const dx = this.absX - enemy.absX;
            const dy = this.absY - enemy.absY;
            const dot = dx * this.lastCollisionNormal.x + dy * this.lastCollisionNormal.y;

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

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;

        for (let vert of this.verts) {
            minX = Math.min(minX, vert.x);
            maxX = Math.max(maxX, vert.x);
            minY = Math.min(minY, vert.y);
            maxY = Math.max(maxY, vert.y);
        }

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

    check_player_collision(enemy) {
        const dx = this.absX - enemy.absX;
        const dy = this.absY - enemy.absY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxSize = (this.attributes.scale * 20) + (enemy.attributes.scale * 20);

        if (distance > maxSize) {
            return false;
        }

        return this.SAT(enemy);
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health < 0) this.health = 0;
        console.log(`${this.name} took ${damage} damage. Health: ${this.health}`);
    }
}

socket.on('connect', () => {
    console.log('Connected to server');
    const playerName = userData.username || 'Guest_' + Math.floor(Math.random() * 1000);

    socket.emit('player_join', {
        x: game.player.absX,
        y: game.player.absY,
        rotation: game.player.absRotation,
        name: playerName,
        health: game.player.health,
        action: game.player.action,
        scale: game.player.attributes.scale
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

            const playerInstance = new Player(
                data.x,
                data.y,
                data.rotation,
                data.action || 'idle',
                data.health || 100,
                id,
                data.name,
                data.scale || 1
            );

            otherPlayers.set(id, playerInstance);
        }
    });

    oldPlayersData.forEach((playerData, id) => {
        if (!currentPlayerIds.has(id)) {
            console.log(`Player ${playerData.name} left the game`);
        }
    });
});

socket.on('projectile_fired', (data) => {
    const projectile = new Projectile(
        data.x,
        data.y,
        data.rotation,
        data.speed,
        data.damage,
        data.ownerId
    );
    projectiles.push(projectile);
});

socket.on('player_hit', (data) => {
    if (data.playerId === socket.id) {
        game.player.takeDamage(data.damage);
    }
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
        this.lastSpacePress = false;

        const spawnRadius = Math.random() * 750;
        const spawnAngle = Math.random() * (Math.PI / 2);

        this.player = new Player(
            spawnRadius * Math.cos(spawnAngle),
            spawnRadius * Math.sin(spawnAngle),
            0,
            'idle',
            100,
            'local',
            playerName,
            1
        );

        this.camera = {
            rotation: 0
        };

        this.backgroundImg.onload = () => {
            this.loaded = true;
            this.frame();
        };
    }

    draw_background() {
        if (!this.loaded) return;

        this.context.save();

        this.context.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.context.rotate(this.camera.rotation);

        const diagonal = Math.sqrt(
            this.canvas.width * this.canvas.width +
            this.canvas.height * this.canvas.height
        );

        const drawSize = diagonal;

        const sourceX = this.player.absX - drawSize / 2;
        const sourceY = this.player.absY - drawSize / 2;
        const sourceWidth = drawSize;
        const sourceHeight = drawSize;

        const actualSourceX = Math.max(0, sourceX);
        const actualSourceY = Math.max(0, sourceY);
        const actualSourceWidth = Math.min(sourceWidth, this.backgroundImg.width - actualSourceX);
        const actualSourceHeight = Math.min(sourceHeight, this.backgroundImg.height - actualSourceY);

        const destOffsetX = actualSourceX - sourceX;
        const destOffsetY = actualSourceY - sourceY;

        this.context.drawImage(
            this.backgroundImg,
            actualSourceX, actualSourceY,
            actualSourceWidth, actualSourceHeight, -drawSize / 2 + destOffsetX, -drawSize / 2 + destOffsetY,
            actualSourceWidth,
            actualSourceHeight
        );

        this.context.restore();
    }

    draw_triangle(x, y, rotation, color = 'blue', scale = 0) {
        this.context.save();
        if (scale == 0) {
            scale = this.player.attributes.scale;
        }
        this.context.translate(x, y);
        this.context.rotate(rotation);

        this.context.beginPath();
        this.context.moveTo(0, -(10 * scale * 2));
        this.context.lineTo((10 * scale), (10 * scale));
        this.context.lineTo(-(10 * scale), (10 * scale));
        this.context.closePath();
        this.context.fillStyle = color;
        this.context.fill();

        this.context.lineWidth = 2;
        this.context.strokeStyle = 'black';
        this.context.stroke();

        this.context.restore();
    }

    draw_projectile(projectile) {
        const screenPos = this.worldToScreen(projectile.absX, projectile.absY, projectile.rotation);

        this.context.save();

        const projectileLength = 20;
        const deltaX = projectileLength * Math.cos(screenPos.rotation);
        const deltaY = projectileLength * Math.sin(screenPos.rotation);

        this.context.beginPath();
        this.context.moveTo(screenPos.x, screenPos.y);
        this.context.lineTo(screenPos.x + deltaX, screenPos.y + deltaY);

        this.context.lineWidth = 4;
        this.context.strokeStyle = 'red';
        this.context.stroke();

        this.context.restore();
    }

    worldToScreen(worldX, worldY, worldRotation) {
        const relX = worldX - this.player.absX;
        const relY = worldY - this.player.absY;

        const cosRot = Math.cos(this.camera.rotation);
        const sinRot = Math.sin(this.camera.rotation);
        const rotatedX = relX * cosRot - relY * sinRot;
        const rotatedY = relX * sinRot + relY * cosRot;

        const screenX = this.canvas.width / 2 + rotatedX;
        const screenY = this.canvas.height / 2 + rotatedY;

        const screenRotation = worldRotation + this.camera.rotation;

        return { x: screenX, y: screenY, rotation: screenRotation };
    }

    shootProjectile() {
        // Calculate projectile spawn position at the tip of the triangle
        const scale = this.player.attributes.scale;
        const tipDistance = 10 * scale * 2; // Distance to tip

        // Spawn projectile at the tip of the triangle
        const projectileX = this.player.absX + Math.sin(this.player.absRotation) * tipDistance;
        const projectileY = this.player.absY - Math.cos(this.player.absRotation) * tipDistance;
        console.log(angle);

        const projectile = new Projectile(
            projectileX,
            projectileY,
            this.player.absRotation + angle,
            10,
            this.player.attributes.shoot_strength,
            socket.id
        );
        projectiles.push(projectile);

        socket.emit('projectile_fired', {
            x: projectile.absX,
            y: projectile.absY,
            rotation: projectile.rotation,
            speed: 10,
            damage: this.player.attributes.shoot_strength,
            ownerId: socket.id
        });
    }

    update() {
        const moveSpeed = this.player.attributes["speed"];
        const rotateSpeed = this.player.attributes["rotate_speed"];

        if (pressedKeys['q'] || pressedKeys['Q']) {
            this.camera.rotation += rotateSpeed;
        }
        if (pressedKeys['e'] || pressedKeys['E']) {
            this.camera.rotation -= rotateSpeed;
        }

        // Shoot projectile with spacebar
        if (pressedKeys[' '] && !this.lastSpacePress) {
            this.shootProjectile();
            this.lastSpacePress = true;
        }
        if (!pressedKeys[' ']) {
            this.lastSpacePress = false;
        }

        // Update all projectiles and check collisions
        for (let i = projectiles.length - 1; i >= 0; i--) {
            projectiles[i].update();

            let projectileHit = false;

            // Check collision with local player
            if (projectiles[i].checkPlayerCollision(this.player)) {
                this.player.takeDamage(projectiles[i].damage);
                // Emit hit to server
                socket.emit('player_hit', {
                    playerId: socket.id,
                    damage: projectiles[i].damage,
                    shooterId: projectiles[i].ownerId
                });
                projectileHit = true;
            }

            // Check collision with other players
            if (!projectileHit) {
                otherPlayers.forEach(player => {
                    if (projectiles[i].checkPlayerCollision(player)) {
                        // Emit hit to server
                        socket.emit('player_hit', {
                            playerId: player.id,
                            damage: projectiles[i].damage,
                            shooterId: projectiles[i].ownerId
                        });
                        projectileHit = true;
                    }
                });
            }

            // Remove projectile if it hit something or expired
            if (projectileHit || projectiles[i].isExpired()) {
                projectiles.splice(i, 1);
            }
        }

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

        const originalX = this.player.absX;
        const originalY = this.player.absY;

        this.player.absX += dx;
        this.player.absY += dy;
        this.player.absRotation = -this.camera.rotation;

        this.player.clamp_to_borders();

        dx = this.player.absX - originalX;
        dy = this.player.absY - originalY;

        otherPlayers.forEach(player => {
            if (this.player.check_player_collision(player)) {
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

        this.player.clamp_to_borders();

        socket.emit('player_move', {
            x: this.player.absX,
            y: this.player.absY,
            rotation: this.player.absRotation,
            health: this.player.health,
            action: this.player.action,
            scale: this.player.attributes.scale
        });
    }

    drawHealthBar(x, y, rotation, health, maxHealth, scale) {
        this.context.save();

        const barWidth = 40 * scale;
        const barHeight = 5;
        const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
        const filledWidth = (barWidth * healthPercent) / 100;

        // Position below triangle base
        const offsetY = 25 * scale;

        this.context.translate(x, y + offsetY);
        this.context.rotate(rotation);

        // Draw gray background (empty health)
        this.context.fillStyle = 'gray';
        this.context.fillRect(-barWidth / 2, 0, barWidth, barHeight);

        // Draw red health
        this.context.fillStyle = 'red';
        this.context.fillRect(-barWidth / 2, 0, filledWidth, barHeight);

        // Draw percentage text below bar
        this.context.rotate(-rotation); // Unrotate for text
        this.context.fillStyle = 'white';
        this.context.strokeStyle = 'black';
        this.context.lineWidth = 2;
        this.context.font = '12px Arial';
        this.context.textAlign = 'center';
        const percentText = Math.round(healthPercent) + '%';
        this.context.strokeText(percentText, 0, barHeight + 12);
        this.context.fillText(percentText, 0, barHeight + 12);

        this.context.restore();
    }

    drawOtherPlayers() {
        otherPlayers.forEach(player => {
            const screenPos = this.worldToScreen(
                player.absX,
                player.absY,
                player.absRotation
            );

            this.draw_triangle(
                screenPos.x,
                screenPos.y,
                screenPos.rotation,
                'red',
                player.attributes.scale
            );

            // Draw player name
            this.context.save();
            this.context.fillStyle = 'white';
            this.context.strokeStyle = 'black';
            this.context.lineWidth = 3;
            this.context.font = '14px Arial';
            this.context.textAlign = 'center';
            this.context.strokeText(player.name, screenPos.x, screenPos.y - 30);
            this.context.fillText(player.name, screenPos.x, screenPos.y - 30);
            this.context.restore();

            // Draw health bar
            this.drawHealthBar(
                screenPos.x,
                screenPos.y,
                screenPos.rotation,
                player.health,
                player.attributes.max_health,
                player.attributes.scale
            );
        });
    }

    tick = () => {
        if (this.player.effects) {
            // Process effects here
        }
    };

    frame = () => {
        this.update();

        if (this.player.health < 0) {
            window.location.href = "https://www.youtube.com/results?search_query=how+to+aim";
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.draw_background();

        this.draw_triangle(this.canvas.width / 2, this.canvas.height / 2, 0, 'blue');

        // Draw local player health bar
        this.drawHealthBar(
            this.canvas.width / 2,
            this.canvas.height / 2,
            0,
            this.player.health,
            this.player.attributes.max_health,
            this.player.attributes.scale
        );

        this.drawOtherPlayers();

        // Draw all projectiles
        projectiles.forEach(projectile => {
            this.draw_projectile(projectile);
        });

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

const pressedKeys = {};
window.addEventListener("keydown", (event) => {
    pressedKeys[event.key] = true;
});

function isCapital(key) {
    return key.length === 1 && key !== key.toLowerCase();
}

window.addEventListener("keyup", (event) => {
    pressedKeys[event.key] = false;

    if (event.key === "Shift") {
        for (const key in pressedKeys) {
            if (pressedKeys.hasOwnProperty(key)) {
                if (isCapital(key)) {
                    pressedKeys[key] = false;
                }
            }
        }
    }
});