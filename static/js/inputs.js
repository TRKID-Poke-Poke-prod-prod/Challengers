const pressedKeys = {};

// Keyboard handlers
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

// Virtual joystick for mobile
class VirtualJoystick {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.stick = null;
        this.maxDistance = 50;
        this.active = false;
        this.centerX = 0;
        this.centerY = 0;
        
        this.init();
    }
    
    init() {
        this.container.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.container.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.container.addEventListener('touchend', this.onTouchEnd.bind(this));
    }
    
    onTouchStart(e) {
        e.preventDefault();
        this.active = true;
        const rect = this.container.getBoundingClientRect();
        this.centerX = rect.left + rect.width / 2;
        this.centerY = rect.top + rect.height / 2;
    }
    
    onTouchMove(e) {
        if (!this.active) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.centerX;
        const deltaY = touch.clientY - this.centerY;
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX);
        
        // Determine direction and set keys
        pressedKeys["ArrowUp"] = false;
        pressedKeys["ArrowDown"] = false;
        pressedKeys["ArrowLeft"] = false;
        pressedKeys["ArrowRight"] = false;
        
        if (distance > 10) { // deadzone
            const normalizedAngle = ((angle * 180 / Math.PI) + 360) % 360;
            
            if (normalizedAngle >= 315 || normalizedAngle < 45) {
                pressedKeys["ArrowRight"] = true;
            }
            if (normalizedAngle >= 45 && normalizedAngle < 135) {
                pressedKeys["ArrowDown"] = true;
            }
            if (normalizedAngle >= 135 && normalizedAngle < 225) {
                pressedKeys["ArrowLeft"] = true;
            }
            if (normalizedAngle >= 225 && normalizedAngle < 315) {
                pressedKeys["ArrowUp"] = true;
            }
        }
    }
    
    onTouchEnd(e) {
        e.preventDefault();
        this.active = false;
        pressedKeys["ArrowUp"] = false;
        pressedKeys["ArrowDown"] = false;
        pressedKeys["ArrowLeft"] = false;
        pressedKeys["ArrowRight"] = false;
    }
}

// Virtual buttons for mobile
function createVirtualButton(buttonId, key) {
    const button = document.getElementById(buttonId);
    
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pressedKeys[key] = true;
    });
    
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        pressedKeys[key] = false;
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Initialize joystick (assumes you have a div with id="joystick")
        const joystick = new VirtualJoystick('joystick');
        
        // Initialize buttons (assumes you have buttons with these ids)
        createVirtualButton('btn-jump', ' '); // space for jump
        createVirtualButton('btn-action', 'e'); // e for action
    }
});