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
        
        switch(this.type) {
            case 'advantage':
                material = new THREE.MeshPhongMaterial({ 
                    color: 0x00ff00,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.5
                });
                break;
            case 'forbidden':
                material = new THREE.MeshPhongMaterial({ 
                    color: 0xff0000,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.5
                });
                break;
            default:
                material = new THREE.MeshPhongMaterial({ 
                    color: 0x808080,
                    emissive: 0x808080,
                    emissiveIntensity: 0.2
                });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.position.x, this.position.y, this.position.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add wireframe outline
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x000000 })
        );
        mesh.add(line);

        return mesh;
    }

    getPosition() {
        return this.mesh.position;
    }

    // Add falling animation
    startFalling() {
        const startY = this.mesh.position.y;
        const fallSpeed = 0.05;
        const rotateSpeed = 0.05;
        let progress = 0;

        const animate = () => {
            if (progress < 1) {
                progress += fallSpeed;
                
                // Move down and rotate with easing
                this.mesh.position.y = startY - (progress * progress * 10);
                this.mesh.rotation.x += rotateSpeed;
                this.mesh.rotation.z += rotateSpeed;
                
                // Fade out more slowly
                this.mesh.material.opacity = 1 - (progress * progress);
                
                requestAnimationFrame(animate);
            } else {
                // Remove the cube when animation is complete
                this.mesh.parent.remove(this.mesh);
            }
        };

        animate();
    }
} 