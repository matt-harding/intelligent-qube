import * as THREE from 'three';

export class Cube {
    constructor(type, position) {
        this.type = type; // 'normal', 'advantage', or 'forbidden'
        this.position = position;
        this.mesh = this.createMesh();
    }

    createMesh() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        let material;

        // Create slightly transparent materials with a glowing effect
        switch (this.type) {
            case 'advantage':
                material = new THREE.MeshPhongMaterial({ 
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.8,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.5
                });
                break;
            case 'forbidden':
                material = new THREE.MeshPhongMaterial({ 
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.9,
                    emissive: 0x000000,
                    emissiveIntensity: 0.2
                });
                break;
            default:
                material = new THREE.MeshPhongMaterial({ 
                    color: 0xcccccc,
                    transparent: true,
                    opacity: 0.8,
                    emissive: 0x404040,
                    emissiveIntensity: 0.2
                });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            this.position.x,
            this.position.y,
            this.position.z
        );

        // Add shadow casting
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add wireframe outline
        const wireframe = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
        );
        mesh.add(wireframe);

        return mesh;
    }

    getPosition() {
        return this.mesh.position;
    }
} 