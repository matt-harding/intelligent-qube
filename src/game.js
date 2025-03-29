import * as THREE from 'three';
import { Cube } from './cube';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000);
        document.body.appendChild(this.renderer.domElement);

        // Game state
        this.level = 1;
        this.score = 0;
        this.rows = 25; // Starting with 25 rows
        this.cols = 8;  // 8 columns wide
        this.cubeSize = 1;
        this.playerPosition = { x: 0, z: this.rows/2 - 2 }; // Start player near the bottom
        this.markedCells = new Map(); // Map of "x,z" -> cell mesh
        this.advantageSpots = new Set();
        this.cubes = [];
        this.gridCells = []; // Array of cell meshes
        this.moveTimer = 0;
        this.moveInterval = 60; // Frames between cube movements
        this.isGameOver = false;
        this.currentWave = 0;
        this.wavesPerLevel = 4;
        this.cubeSpeed = 0.05;
        this.advantageCubes = [];
        this.forbiddenCubes = [];

        // Setup camera position to match original game perspective
        this.camera.position.set(0, 12, 20);
        this.camera.lookAt(0, 0, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
        directionalLight.position.set(-5, 10, 5);
        this.scene.add(directionalLight);

        // Initialize game
        this.initStage();
        this.setupControls();
        this.startLevel();
        this.animate();

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
        this.scene.add(this.stage);

        // Create grid cells
        const cellGeometry = new THREE.BoxGeometry(this.cubeSize, 0.1, this.cubeSize);
        const cellMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            transparent: true,
            opacity: 0.5
        });

        for (let z = -this.rows/2; z < this.rows/2; z++) {
            for (let x = -this.cols/2; x < this.cols/2; x++) {
                const cell = new THREE.Mesh(cellGeometry, cellMaterial.clone());
                cell.position.set(x + 0.5, 0, z + 0.5);
                this.scene.add(cell);
                this.gridCells.push(cell);
            }
        }

        // Create player
        const playerGeometry = new THREE.BoxGeometry(this.cubeSize * 0.8, this.cubeSize * 1.5, this.cubeSize * 0.8);
        const playerMaterial = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
        this.player = new THREE.Mesh(playerGeometry, playerMaterial);
        this.player.position.set(0, 0.5, this.rows/2 - 2);
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
        const KEY_DELAY = 200; // ms between key presses

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
                
                const now = Date.now();
                if (now - this.lastKeyPress > KEY_DELAY) {
                    this.lastKeyPress = now;
                    
                    if (key === ' ') {  // Space key
                        this.toggleMark();
                    } else if (key === 'enter') {
                        this.clearMarkedCells();
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
        const rowLength = Math.min(4 + this.level, 7);

        for (let i = 0; i < numRows; i++) {
            for (let j = 0; j < rowLength; j++) {
                const type = this.getRandomCubeType();
                const cube = new Cube(type, {
                    x: j - Math.floor(rowLength/2),
                    y: 0.5,
                    z: -this.rows/2 - i // Start cubes at the top of the stage
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
        const gridX = Math.round(this.player.position.x);
        const gridZ = Math.round(this.player.position.z);
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

    clearMarkedCells() {
        this.cubes.forEach(cube => {
            const pos = cube.getPosition();
            const key = `${Math.round(pos.x)},${Math.round(pos.z)}`;
            if (this.markedCells.has(key)) {
                if (cube.type === 'forbidden') {
                    this.handleForbiddenCube();
                } else {
                    this.scene.remove(cube.mesh);
                    this.score += 100;
                    if (cube.type === 'advantage') {
                        this.advantageSpots.add(key);
                    }
                }
            }
        });

        // Remove all markers
        this.markedCells.forEach(marker => {
            this.scene.remove(marker);
        });
        this.markedCells.clear();
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
        const moveSpeed = 1;
        const newPosition = {
            x: this.playerPosition.x,
            z: this.playerPosition.z
        };

        if (this.keys.w) newPosition.z -= moveSpeed;
        if (this.keys.s) newPosition.z += moveSpeed;
        if (this.keys.a) newPosition.x -= moveSpeed;
        if (this.keys.d) newPosition.x += moveSpeed;

        // Check collision with cubes
        const wouldCollide = this.cubes.some(cube => {
            const cubePos = cube.getPosition();
            return Math.round(cubePos.x) === Math.round(newPosition.x) &&
                   Math.round(cubePos.z) === Math.round(newPosition.z);
        });

        if (!wouldCollide) {
            // Keep player within bounds
            this.playerPosition.x = Math.max(-this.cols/2 + 0.5, Math.min(this.cols/2 - 0.5, newPosition.x));
            this.playerPosition.z = Math.max(-this.rows/2 + 0.5, Math.min(this.rows/2 - 0.5, newPosition.z));

            // Update player position
            this.player.position.set(
                Math.round(this.playerPosition.x),
                0.5,
                Math.round(this.playerPosition.z)
            );
        }
    }

    updateCubes() {
        this.moveTimer++;
        if (this.moveTimer >= this.moveInterval) {
            this.moveTimer = 0;
            
            // Move cubes one cell at a time
            this.cubes.forEach(cube => {
                const currentPos = cube.getPosition();
                cube.mesh.position.set(
                    Math.round(currentPos.x),
                    currentPos.y,
                    Math.round(currentPos.z) + 1
                );
            });

            // Remove cubes that have moved past the stage
            this.cubes = this.cubes.filter(cube => {
                if (cube.getPosition().z > this.rows/2) {
                    this.scene.remove(cube.mesh);
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
        this.updatePlayer();
        this.updateCubes();
        this.checkGameOver();
        this.renderer.render(this.scene, this.camera);
    }
} 