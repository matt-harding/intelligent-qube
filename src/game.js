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
        this.camera.position.set(0, 20, 35); // Moved back and up for better view
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

        // Create grid cells with borders
        const cellGeometry = new THREE.BoxGeometry(this.cubeSize, 0.1, this.cubeSize);
        const cellMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            transparent: true,
            opacity: 0.5
        });

        // Adjust grid cell positions to align with cubes
        for (let z = -this.rows/2; z < this.rows/2; z++) {
            for (let x = -this.cols/2; x < this.cols/2; x++) {
                const cell = new THREE.Mesh(cellGeometry, cellMaterial.clone());
                cell.position.set(x + 0.5, 0, z + 0.5); // Added 0.5 to align with cubes
                cell.receiveShadow = true;
                this.scene.add(cell);
                this.gridCells.push(cell);

                // Add border
                const borderGeometry = new THREE.EdgesGeometry(cellGeometry);
                const borderMaterial = new THREE.LineBasicMaterial({ 
                    color: 0x404040,
                    transparent: true,
                    opacity: 0.8
                });
                const border = new THREE.LineSegments(borderGeometry, borderMaterial);
                border.position.copy(cell.position);
                this.scene.add(border);
            }
        }

        // Create player and align with grid
        const playerGeometry = new THREE.BoxGeometry(this.cubeSize * 0.8, this.cubeSize * 1.5, this.cubeSize * 0.8);
        const playerMaterial = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
        this.player = new THREE.Mesh(playerGeometry, playerMaterial);
        this.player.position.set(0.5, 0.5, this.rows/2 - 1.5); // Adjusted to align with grid
        this.player.castShadow = true;
        this.player.receiveShadow = true;
        this.scene.add(this.player);
    }

    setupControls() {
        this.keys = {
            'w': false,
            'a': false,
            's': false,
            'd': false,
            ' ': false,  // Space key
            'enter': false
        };

        this.lastKeyPress = 0;
        const KEY_DELAY = 100; // Reduced delay for space and enter keys

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
                
                // Only apply delay to space and enter keys
                if (key === ' ' || key === 'enter') {
                    const now = Date.now();
                    if (now - this.lastKeyPress > KEY_DELAY) {
                        this.lastKeyPress = now;
                        
                        if (key === ' ') {
                            this.toggleMark();
                        } else if (key === 'enter') {
                            this.clearMarkedCells();
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
        // Get the player's current grid position
        const playerX = Math.floor(this.player.position.x);
        const playerZ = Math.floor(this.player.position.z);
        const gridX = playerX + 0.5; //const gridX = playerX + 0.5;
        const gridZ = playerZ;//const gridZ = playerZ + 0.5;
        const key = `${gridX},${gridZ}`;

        // Only allow marking if there's no other marked cell
        if (this.markedCells.size > 0) {
            // Remove existing mark
            for (const [_, marker] of this.markedCells) {
                this.scene.remove(marker);
            }
            this.markedCells.clear();
        }

        // Add new mark
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

        // Add visual feedback
        const flashGeometry = new THREE.BoxGeometry(this.cubeSize, 0.2, this.cubeSize);
        const flashMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(marker.position);
        this.scene.add(flash);

        // Animate the flash effect
        const startOpacity = 0.3;
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

    mark3x3Area(centerX, centerZ) {
        const key = `${centerX},${centerZ}`;
        const markers = [];

        // Create 3x3 grid of markers
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const markerX = centerX + x;
                const markerZ = centerZ + z;
                
                // Skip if outside stage bounds
                if (markerX < -this.cols/2 || markerX > this.cols/2 ||
                    markerZ < -this.rows/2 || markerZ > this.rows/2) {
                    continue;
                }

                const markerGeometry = new THREE.BoxGeometry(this.cubeSize, 0.1, this.cubeSize);
                const markerMaterial = new THREE.MeshPhongMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.5,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.3
                });
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                marker.position.set(markerX, 0.01, markerZ);
                this.scene.add(marker);
                markers.push(marker);
            }
        }

        this.advantageSpots.set(key, markers);
    }

    clearMarkedCells() {
        let pointsGained = 0;
        const cubesCleared = [];

        // Check normal marked cells
        this.cubes.forEach(cube => {
            const pos = cube.getPosition();
            const key = `${Math.floor(pos.x) + 0.5},${Math.floor(pos.z)}`;
            
            // Check if cube is on a marked cell or in a 3x3 advantage area
            const isOnMarkedCell = this.markedCells.has(key);
            const isInAdvantageArea = Array.from(this.advantageSpots.keys()).some(areaKey => {
                const [centerX, centerZ] = areaKey.split(',').map(Number);
                const dx = Math.abs(Math.floor(pos.x) + 0.5 - centerX);
                const dz = Math.abs(Math.floor(pos.z) - centerZ);
                return dx <= 1 && dz <= 1;
            });

            if (isOnMarkedCell || isInAdvantageArea) {
                if (cube.type === 'forbidden') {
                    this.handleForbiddenCube();
                } else {
                    cubesCleared.push(cube);
                    pointsGained += isInAdvantageArea ? 200 : 100;
                    
                    if (cube.type === 'advantage' && isOnMarkedCell) {
                        const alignedX = Math.floor(pos.x) + 0.5;
                        const alignedZ = Math.floor(pos.z);
                        this.mark3x3Area(alignedX, alignedZ);
                    }
                }
            }
        });

        // Remove cleared cubes with effect
        cubesCleared.forEach(cube => {
            this.createClearEffect(cube.getPosition());
            this.scene.remove(cube.mesh);
        });
        
        // Update cubes array after clearing
        this.cubes = this.cubes.filter(cube => !cubesCleared.includes(cube));

        // Update score
        if (pointsGained > 0) {
            this.score += pointsGained;
            this.updateUI();
            this.flashScore();
        }

        // Clear markers
        this.markedCells.forEach(marker => this.scene.remove(marker));
        this.markedCells.clear();
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
        // Update stage size
        const stage = this.scene.children.find(child => child.geometry.type === 'BoxGeometry');
        if (stage) {
            stage.geometry.dispose();
            stage.geometry = new THREE.BoxGeometry(this.cols * this.cubeSize, 0.5, this.rows * this.cubeSize);
        }
    }

    updatePlayer() {
        if (this.isGameOver) return;

        const currentX = this.player.position.x;
        const currentZ = this.player.position.z;
        let newX = currentX;
        let newZ = currentZ;

        // Allow smooth movement in all directions
        if (this.keys.w) {
            newZ -= this.playerSpeed; // Move up
        }
        if (this.keys.s) {
            newZ += this.playerSpeed; // Move down
        }
        if (this.keys.a) {
            newX -= this.playerSpeed; // Move left
        }
        if (this.keys.d) {
            newX += this.playerSpeed; // Move right
        }

        // Keep player within bounds and aligned to grid
        newX = Math.max(-this.cols/2 + 0.5, Math.min(this.cols/2 - 0.5, newX));
        newZ = Math.max(-this.rows/2 + 0.5, Math.min(this.rows/2 - 0.5, newZ));

        // Update position
        this.playerPosition.x = newX;
        this.playerPosition.z = newZ;
        this.player.position.set(newX, 0.5, newZ);

        // Check if any cube has rolled onto the player
        const playerKey = `${Math.round(this.player.position.x - 0.5) + 0.5},${Math.round(this.player.position.z - 0.5) + 0.5}`;
        const isPlayerCrushed = this.cubes.some(cube => {
            const cubePos = cube.getPosition();
            const cubeKey = `${Math.round(cubePos.x - 0.5) + 0.5},${Math.round(cubePos.z - 0.5) + 0.5}`;
            return cubeKey === playerKey;
        });

        if (isPlayerCrushed) {
            this.handlePlayerDeath();
        }
    }

    handlePlayerDeath() {
        this.isGameOver = true;
        
        // Create death effect
        const deathEffect = () => {
            const particles = [];
            const particleCount = 30;

            for (let i = 0; i < particleCount; i++) {
                const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                const material = new THREE.MeshPhongMaterial({
                    color: 0xff0000,
                    transparent: true,
                    opacity: 1
                });
                const particle = new THREE.Mesh(geometry, material);
                
                particle.position.copy(this.player.position);
                
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

    checkGameOver() {
        // Check if player has fallen off the stage
        if (this.playerPosition.z < -this.rows/2) {
            this.isGameOver = true;
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
} 