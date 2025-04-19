import * as THREE from 'three';
import { Cube } from './cube';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            shadowMap: {
                enabled: true,
                type: THREE.PCFSoftShadowMap
            }
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // UI elements
        this.levelElement = document.getElementById('level');
        this.scoreElement = document.getElementById('score');
        this.rowsElement = document.getElementById('rows');
        
        // Add controls UI
        this.createControlsUI();
        
        // Game state
        this.level = 1;
        this.score = 0;
        this.rows = 25; // Starting with 25 rows
        this.cols = 8;  // 8 columns wide
        this.cubeSize = 1;
        this.playerPosition = { x: 0, z: this.rows/2 - 2 }; // Start player near the bottom
        this.markedCells = new Map(); // Map of "x,z" -> cell mesh
        this.advantageSpots = new Map(); // Changed to Map to store 3x3 area markers
        this.cubes = [];
        this.gridCells = []; // Array of cell meshes
        this.moveTimer = 0;
        this.moveInterval = 180; // Increased from 120 to 180 frames to slow down cube movement
        this.isGameOver = false;
        this.currentWave = 0;
        this.wavesPerLevel = 4;
        this.cubeSpeed = 0.05;
        this.advantageCubes = [];
        this.forbiddenCubes = [];
        this.rollingCubes = new Set(); // Track cubes currently in rolling animation
        this.playerMoveTimer = 0;
        this.playerMoveInterval = 150; // Add delay between player movements
        this.lastPlayerMove = { x: 0, z: 0 };
        this.playerSpeed = 0.08; // Reduced from 0.15 to 0.08 for slower player movement

        // Setup camera position to see more of the stage
        this.camera.position.set(15, 20, 35); // Moved right, back and up for better view
        this.camera.lookAt(0, 0, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // Main directional light with shadows - moved to back of stage
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(0, 15, -25); // Moved to back
        directionalLight.target.position.set(0, 0, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        directionalLight.shadow.camera.far = 40;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        this.scene.add(directionalLight.target);

        // Initialize game
        this.initStage();
        this.setupControls();
        this.startLevel();
        this.animate();
        this.updateUI();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    createPlayer() {
        // Create a group to hold all player parts
        this.player = new THREE.Group();
        this.lastDirection = 'down'; // Track player direction

        // Body material
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff, // White shirt
            emissive: 0x222222,
            emissiveIntensity: 0.2
        });
        const pantsMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x000000, // Black pants
            emissive: 0x111111,
            emissiveIntensity: 0.2
        });
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffccaa, // Skin tone
            emissive: 0x221100,
            emissiveIntensity: 0.1
        });

        // Create body parts with names for easy reference
        this.playerParts = {
            head: new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.3, 0.3),
                headMaterial
            ),
            body: new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.6, 0.2),
                bodyMaterial
            ),
            leftLeg: new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.4, 0.15),
                pantsMaterial
            ),
            rightLeg: new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.4, 0.15),
                pantsMaterial
            ),
            leftArm: new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.4, 0.12),
                bodyMaterial
            ),
            rightArm: new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.4, 0.12),
                bodyMaterial
            )
        };

        // Set initial positions
        this.playerParts.head.position.y = 0.8;
        this.playerParts.body.position.y = 0.4;
        this.playerParts.leftLeg.position.set(-0.1, 0.2, 0);
        this.playerParts.rightLeg.position.set(0.1, 0.2, 0);
        this.playerParts.leftArm.position.set(-0.26, 0.4, 0);
        this.playerParts.rightArm.position.set(0.26, 0.4, 0);

        // Enable shadows
        Object.values(this.playerParts).forEach(part => {
            part.castShadow = true;
        });

        // Add all parts to the player group
        Object.values(this.playerParts).forEach(part => {
            this.player.add(part);
        });

        // Set initial position
        this.player.position.set(0.5, 0, this.rows/2 - 1.5);
        this.player.castShadow = true;
        this.player.receiveShadow = true;

        // Add the player to the scene
        this.scene.add(this.player);
    }

    updatePlayerDirection(newX, newZ, currentX, currentZ) {
        if (!this.playerParts) return;

        let direction = this.lastDirection;
        const dx = newX - currentX;
        const dz = newZ - currentZ;

        // Determine direction based on movement
        if (Math.abs(dx) > Math.abs(dz)) {
            // Horizontal movement is dominant
            direction = dx > 0 ? 'right' : 'left';
        } else if (Math.abs(dz) > 0) {
            // Vertical movement is dominant
            direction = dz > 0 ? 'down' : 'up';
        }

        if (direction !== this.lastDirection) {
            // Update character appearance based on direction
            switch (direction) {
                case 'down':
                    this.player.rotation.y = 0;
                    this.playerParts.body.scale.z = 0.2;
                    this.playerParts.body.scale.x = 1;
                    break;
                case 'up':
                    this.player.rotation.y = Math.PI;
                    this.playerParts.body.scale.z = 0.2;
                    this.playerParts.body.scale.x = 1;
                    break;
                case 'left':
                    this.player.rotation.y = -Math.PI / 2;
                    this.playerParts.body.scale.z = 1;
                    this.playerParts.body.scale.x = 0.2;
                    break;
                case 'right':
                    this.player.rotation.y = Math.PI / 2;
                    this.playerParts.body.scale.z = 1;
                    this.playerParts.body.scale.x = 0.2;
                    break;
            }
            this.lastDirection = direction;
        }
    }

    updatePlayer() {
        if (this.isGameOver) return;

        const currentX = this.player.position.x;
        const currentZ = this.player.position.z;
        let newX = currentX;
        let newZ = currentZ;

        // Allow smooth movement in all directions using both WASD and arrow keys
        if (this.keys.w || this.keys.arrowup) {
            newZ -= this.playerSpeed; // Move up
        }
        if (this.keys.s || this.keys.arrowdown) {
            newZ += this.playerSpeed; // Move down
        }
        if (this.keys.a || this.keys.arrowleft) {
            newX -= this.playerSpeed; // Move left
        }
        if (this.keys.d || this.keys.arrowright) {
            newX += this.playerSpeed; // Move right
        }

        // Keep player within bounds and aligned to grid
        newX = Math.max(-this.cols/2 + 0.5, Math.min(this.cols/2 - 0.5, newX));
        newZ = Math.max(-this.rows/2 + 0.5, Math.min(this.rows/2 - 0.5, newZ));

        // Check for collision with stationary cubes
        const wouldCollide = this.cubes.some(cube => {
            if (this.rollingCubes.has(cube)) return false; // Ignore rolling cubes
            const cubePos = cube.getPosition();
            
            // Calculate the grid positions
            const playerGridX = Math.round(newX - 0.5) + 0.5;
            const playerGridZ = Math.round(newZ - 0.5) + 0.5;
            const cubeGridX = Math.round(cubePos.x - 0.5) + 0.5;
            const cubeGridZ = Math.round(cubePos.z - 0.5) + 0.5;
            
            // Check if they occupy the same grid cell
            return playerGridX === cubeGridX && playerGridZ === cubeGridZ;
        });

        // If would collide, keep current position
        if (!wouldCollide) {
            // Update direction before moving
            this.updatePlayerDirection(newX, newZ, currentX, currentZ);

            // Update position (keep y at 0 to stay on surface)
            this.playerPosition.x = newX;
            this.playerPosition.z = newZ;
            this.player.position.set(newX, 0, newZ);
        }

        // Check if any rolling cube has rolled onto the player
        const playerKey = `${Math.round(this.player.position.x - 0.5) + 0.5},${Math.round(this.player.position.z - 0.5) + 0.5}`;
        const isPlayerCrushed = this.cubes.some(cube => {
            if (!this.rollingCubes.has(cube)) return false; // Only check rolling cubes
            const cubePos = cube.getPosition();
            const cubeKey = `${Math.round(cubePos.x - 0.5) + 0.5},${Math.round(cubePos.z - 0.5) + 0.5}`;
            return cubeKey === playerKey;
        });

        if (isPlayerCrushed) {
            this.handlePlayerDeath();
        }
    }

    initStage() {
        // Create stage base
        const stageGeometry = new THREE.BoxGeometry(this.cols * this.cubeSize, 0.5, this.rows * this.cubeSize);
        const stageMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x808080,
            transparent: true,
            opacity: 0.9
        });
        this.stage = new THREE.Mesh(stageGeometry, stageMaterial);
        this.stage.position.set(0, -0.25, 0);
        this.stage.receiveShadow = true;
        this.scene.add(this.stage);

        // Create player
        this.createPlayer();
    }

    setupControls() {
        this.keys = {
            'w': false,
            'a': false,
            's': false,
            'd': false,
            'arrowup': false,
            'arrowdown': false,
            'arrowleft': false,
            'arrowright': false,
            ' ': false,  // Space key
            'backspace': false
        };

        this.lastKeyPress = 0;
        const KEY_DELAY = 100;

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
                
                // Only apply delay to space and backspace keys
                if (key === ' ' || key === 'backspace') {
                    const now = Date.now();
                    if (now - this.lastKeyPress > KEY_DELAY) {
                        this.lastKeyPress = now;
                        
                        if (key === ' ') {
                            this.toggleMark();
                        } else if (key === 'backspace') {
                            if (this.advantageSpots.size > 0) {
                                this.triggerAllAdvantageSpots();
                            }
                        }
                    }
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = false;
            }
        });
    }

    startLevel() {
        this.currentWave = 0;
        this.generateWave();
    }

    generateWave() {
        // Clear existing cubes
        this.cubes.forEach(cube => {
            this.scene.remove(cube.mesh);
            if (cube.marker) {
                this.scene.remove(cube.marker);
            }
        });
        this.cubes = [];

        // Generate new wave based on level
        const numRows = Math.min(3 + this.level, 14);
        const rowLength = this.cols; // Use full width of the stage

        for (let i = 0; i < numRows; i++) {
            for (let j = 0; j < rowLength; j++) {
                const type = this.getRandomCubeType();
                const cube = new Cube(type, {
                    x: j - Math.floor(rowLength/2) + 0.5, // Added 0.5 to align with grid
                    y: 0.5,
                    z: -this.rows/2 - i - 0.5 // Added 0.5 to align with grid
                });
                this.scene.add(cube.mesh);
                this.cubes.push(cube);
            }
        }
    }

    getRandomCubeType() {
        const rand = Math.random();
        if (rand < 0.7) return 'normal';
        if (rand < 0.85) return 'advantage';
        return 'forbidden';
    }

    toggleMark() {
        // If a cell is already marked, activate it
        if (this.markedCells.size > 0) {
            const [key, marker] = Array.from(this.markedCells.entries())[0]; // Only one mark allowed
            const [gridX, gridZ] = key.split(',').map(Number);
    
            // Create animation for the cell
            this.createClearAnimation({ x: gridX, z: gridZ });
    
            // Check for cubes to clear
            const cubesCleared = [];
            let pointsGained = 0;
    
            this.cubes.forEach(cube => {
                const pos = cube.getPosition();
                const cubeKey = `${Math.floor(pos.x) + 0.5},${Math.floor(pos.z)}`;
    
                if (cubeKey === key) {
                    if (cube.type === 'forbidden') {
                        this.handleForbiddenCube();
                    } else {
                        pointsGained += 100;
    
                        if (cube.type === 'advantage') {
                            const alignedX = Math.floor(pos.x) + 0.5;
                            const alignedZ = Math.floor(pos.z);
                            this.createAdvantageMarker(alignedX, alignedZ);
                        }
                    }
                    cubesCleared.push(cube);
                }
            });
    
            // Clear cubes
            cubesCleared.forEach(cube => {
                this.createClearEffect(cube.getPosition());
                this.scene.remove(cube.mesh);
            });
    
            // Update state
            this.cubes = this.cubes.filter(cube => !cubesCleared.includes(cube));
            if (pointsGained > 0) {
                this.score += pointsGained;
                this.updateUI();
                this.flashScore();
            }
    
            // Remove the mark
            this.scene.remove(marker);
            this.markedCells.clear();
    
        } else {
            // Mark a new cell under the player
            const playerX = Math.floor(this.player.position.x);
            const playerZ = Math.floor(this.player.position.z);
            const gridX = playerX + 0.5;
            const gridZ = playerZ;
            const key = `${gridX},${gridZ}`;
    
            // Create and store the mark
            const markerGeometry = new THREE.BoxGeometry(this.cubeSize, 0.1, this.cubeSize);
            const markerMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.7,
                emissive: 0xff0000,
                emissiveIntensity: 0.5
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(gridX, 0.01, gridZ);
            this.scene.add(marker);
            this.markedCells.set(key, marker);
    
            // Flash feedback
            const flashGeometry = new THREE.BoxGeometry(this.cubeSize, 0.2, this.cubeSize);
            const flashMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.3
            });
            const flash = new THREE.Mesh(flashGeometry, flashMaterial);
            flash.position.copy(marker.position);
            this.scene.add(flash);
    
            const animate = () => {
                if (flash.material.opacity > 0) {
                    flash.material.opacity -= 0.02;
                    flash.position.y += 0.02;
                    requestAnimationFrame(animate);
                } else {
                    this.scene.remove(flash);
                    flash.geometry.dispose();
                    flash.material.dispose();
                }
            };
            animate();
        }
    }
    
    triggerAllAdvantageSpots() {
        if (this.advantageSpots.size === 0) return;

        // Store all spots to trigger
        const spotsToTrigger = Array.from(this.advantageSpots.keys());
        
        // Process each spot in sequence
        for (const key of spotsToTrigger) {
            const [centerX, centerZ] = key.split(',').map(Number);
            let pointsGained = 0;
            const cubesCleared = [];
            const cellsToAnimate = new Set();
            let forbiddenCount = 0;

            // Check for cubes in the 3x3 area
            this.cubes.forEach(cube => {
                const pos = cube.getPosition();
                const cubeX = Math.round(pos.x - 0.5) + 0.5;
                const cubeZ = Math.round(pos.z - 0.5) + 0.5;
                const dx = Math.abs(cubeX - centerX);
                const dz = Math.abs(cubeZ - centerZ);
                
                if (dx <= 1 && dz <= 1) {
                    if (cube.type === 'forbidden') {
                        forbiddenCount++;
                    } else {
                        pointsGained += 200;
                    }
                    cubesCleared.push(cube);
                    cellsToAnimate.add(`${cubeX},${cubeZ}`);
                }
            });

            // Apply forbidden cube penalties
            for (let i = 0; i < forbiddenCount; i++) {
                this.handleForbiddenCube();
            }

            // Clear the cubes
            cubesCleared.forEach(cube => {
                this.createClearEffect(cube.getPosition());
                this.scene.remove(cube.mesh);
                if (cube.marker) {
                    this.scene.remove(cube.marker);
                }
            });

            // Update cubes array
            this.cubes = this.cubes.filter(cube => !cubesCleared.includes(cube));

            // Create clear animations
            cellsToAnimate.forEach(key => {
                const [x, z] = key.split(',').map(Number);
                this.createClearAnimation({ x, z });
            });

            // Remove the triggered advantage spot markers
            const markers = this.advantageSpots.get(key);
            if (markers) {
                markers.forEach(marker => this.scene.remove(marker));
            }
            this.advantageSpots.delete(key);

            // Update score
            if (pointsGained > 0) {
                this.score += pointsGained;
                this.updateUI();
                this.flashScore();
            }
        }
    }

    createAdvantageMarker(x, z) {
        const key = `${x},${z}`;
        const markers = [];

        // Create 3x3 grid of markers
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const markerX = x + dx;
                const markerZ = z + dz;
                
                // Skip if outside stage bounds
                if (markerX < -this.cols/2 || markerX > this.cols/2 ||
                    markerZ < -this.rows/2 || markerZ > this.rows/2) {
                    continue;
                }

                const markerGeometry = new THREE.BoxGeometry(this.cubeSize, 0.1, this.cubeSize);
                const markerMaterial = new THREE.MeshPhongMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.7,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.5
                });
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                marker.position.set(markerX, 0.01, markerZ);
                this.scene.add(marker);
                markers.push(marker);
            }
        }

        this.advantageSpots.set(key, markers);
    }

    updateUI() {
        this.levelElement.textContent = `LEVEL ${this.level}`;
        this.scoreElement.textContent = `SCORE ${this.score}`;
        this.rowsElement.textContent = `ROWS ${this.rows}`;
    }

    flashScore() {
        this.scoreElement.classList.remove('flash-text');
        void this.scoreElement.offsetWidth; // Trigger reflow
        this.scoreElement.classList.add('flash-text');
    }

    createClearAnimation(position) {
        const geometry = new THREE.BoxGeometry(this.cubeSize, 0.1, this.cubeSize);
        const material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });
        const animation = new THREE.Mesh(geometry, material);
        animation.position.set(position.x, 0.01, position.z);
        this.scene.add(animation);

        // Animate the effect
        let scale = 1;
        const animate = () => {
            if (scale <= 1.5) {
                scale += 0.1;
                animation.scale.set(scale, 1, scale);
                animation.material.opacity = 0.8 * (1.5 - scale) / 0.5;
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(animation);
                animation.geometry.dispose();
                animation.material.dispose();
            }
        };
        animate();
    }

    createClearEffect(position) {
        const particles = [];
        const particleCount = 20;

        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const material = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 1
            });
            const particle = new THREE.Mesh(geometry, material);
            
            // Set random initial position within cube bounds
            particle.position.set(
                position.x + (Math.random() - 0.5) * 0.5,
                position.y + (Math.random() - 0.5) * 0.5,
                position.z + (Math.random() - 0.5) * 0.5
            );
            
            // Set random velocity
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.2
            );

            this.scene.add(particle);
            particles.push(particle);
        }

        // Animate particles
        const animate = () => {
            if (particles.length === 0) return;

            particles.forEach((particle, index) => {
                particle.position.add(particle.velocity);
                particle.material.opacity -= 0.02;

                if (particle.material.opacity <= 0) {
                    this.scene.remove(particle);
                    particle.geometry.dispose();
                    particle.material.dispose();
                    particles.splice(index, 1);
                }
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    handleForbiddenCube() {
        this.score -= 1000;
        this.rows--;
    
        // Shift the stage back so the far rows stay in place
        const zOffset = this.cubeSize / 2;
    
        // Update stage geometry with new row count
        const newStageGeometry = new THREE.BoxGeometry(this.cols * this.cubeSize, 0.5, this.rows * this.cubeSize);
        this.stage.geometry.dispose();
        this.stage.geometry = newStageGeometry;
    
        // Move the stage back so the rest stays in place visually
        this.stage.position.z -= zOffset;
    
        // Rebuild gridCells array and potentially re-layout cubes
        this.gridCells = [];
    
        // Update UI
        this.updateUI();
        this.flashScore();
    
        // Check if game should end due to too few rows
        if (this.rows < 5) {
            this.isGameOver = true;
            this.handlePlayerDeath();
        }
    }

    handlePlayerDeath() {
        this.isGameOver = true;
        
        // Create death effect
        const deathEffect = () => {
            const particles = [];
            const particleCount = 50;
            const colors = [0xffffff, 0x000000, 0xffccaa]; // Colors matching player parts

            for (let i = 0; i < particleCount; i++) {
                const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                const material = new THREE.MeshPhongMaterial({
                    color: colors[Math.floor(Math.random() * colors.length)],
                    transparent: true,
                    opacity: 1
                });
                const particle = new THREE.Mesh(geometry, material);
                
                // Distribute particles across player's height
                particle.position.copy(this.player.position);
                particle.position.y += Math.random() * 1.5; // Distribute across player height
                
                // Set random velocity
                particle.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    Math.random() * 0.3,
                    (Math.random() - 0.5) * 0.3
                );

                this.scene.add(particle);
                particles.push(particle);
            }

            // Hide player
            this.player.visible = false;

            // Animate particles
            const animate = () => {
                if (particles.length === 0 || !this.isGameOver) return;

                particles.forEach((particle, index) => {
                    particle.position.add(particle.velocity);
                    particle.velocity.y -= 0.01; // Add gravity
                    particle.rotation.x += 0.1;
                    particle.rotation.z += 0.1;
                    particle.material.opacity -= 0.02;

                    if (particle.material.opacity <= 0) {
                        this.scene.remove(particle);
                        particle.geometry.dispose();
                        particle.material.dispose();
                        particles.splice(index, 1);
                    }
                });

                requestAnimationFrame(animate);
            };

            animate();
        };

        deathEffect();
        
        // Display game over message
        const gameOverDiv = document.createElement('div');
        gameOverDiv.style.position = 'fixed';
        gameOverDiv.style.top = '50%';
        gameOverDiv.style.left = '50%';
        gameOverDiv.style.transform = 'translate(-50%, -50%)';
        gameOverDiv.style.color = 'red';
        gameOverDiv.style.fontSize = '48px';
        gameOverDiv.style.fontFamily = 'monospace';
        gameOverDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        gameOverDiv.textContent = 'GAME OVER';
        document.body.appendChild(gameOverDiv);
    }

    updateCubes() {
        this.moveTimer++;
        if (this.moveTimer >= this.moveInterval) {
            this.moveTimer = 0;
            
            // Move cubes one cell at a time with rolling animation
            this.cubes.forEach(cube => {
                if (!this.rollingCubes.has(cube)) {
                    const currentPos = cube.getPosition();
                    const targetPos = {
                        x: currentPos.x,
                        y: currentPos.y,
                        z: Math.round(currentPos.z) + 1
                    };

                    this.rollingCubes.add(cube);
                    
                    // Create rolling animation
                    let progress = 0;
                    const animate = () => {
                        if (progress < 1) {
                            progress += 0.05; // Reduced from 0.1 to 0.05 for slower rolling
                            
                            // Update position - maintain x alignment
                            cube.mesh.position.x = currentPos.x;
                            cube.mesh.position.z = currentPos.z + (targetPos.z - currentPos.z) * progress;
                            
                            // Add rolling rotation
                            cube.mesh.rotation.x = -Math.PI * 2 * progress;
                            
                            requestAnimationFrame(animate);
                        } else {
                            // Snap to final position and reset rotation
                            cube.mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
                            cube.mesh.rotation.set(0, 0, 0);
                            this.rollingCubes.delete(cube);

                            // Check if cube has rolled off the edge
                            if (cube.getPosition().z > this.rows/2) {
                                cube.startFalling();
                            }
                        }
                    };
                    animate();
                }
            });

            // Remove cubes that have fallen off
            this.cubes = this.cubes.filter(cube => {
                if (cube.getPosition().z > this.rows/2) {
                    return false;
                }
                return true;
            });

            // Check if wave is complete
            if (this.cubes.length === 0) {
                this.currentWave++;
                if (this.currentWave < this.wavesPerLevel) {
                    this.generateWave();
                } else {
                    this.level++;
                    this.startLevel();
                    this.updateUI();
                }
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.isGameOver) {
            this.updatePlayer();
            this.updateCubes();
        }
        this.renderer.render(this.scene, this.camera);
    }

    createControlsUI() {
        const controlsDiv = document.createElement('div');
        controlsDiv.style.position = 'fixed';
        controlsDiv.style.bottom = '20px';
        controlsDiv.style.right = '20px';
        controlsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        controlsDiv.style.padding = '15px';
        controlsDiv.style.borderRadius = '10px';
        controlsDiv.style.color = 'white';
        controlsDiv.style.fontFamily = 'monospace';
        controlsDiv.style.fontSize = '14px';
        controlsDiv.style.zIndex = '1000';

        const controls = [
            'Controls:',
            'WASD/Arrows - Move',
            'SPACE - Mark/Activate Cell',
            'BACKSPACE - Trigger Green Areas'
        ];

        controls.forEach((text, index) => {
            const line = document.createElement('div');
            line.textContent = text;
            if (index === 0) {
                line.style.fontWeight = 'bold';
                line.style.marginBottom = '5px';
                line.style.borderBottom = '1px solid white';
            }
            controlsDiv.appendChild(line);
        });

        document.body.appendChild(controlsDiv);
    }
} 