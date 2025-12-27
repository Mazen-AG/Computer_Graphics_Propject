import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const buildingURL = new URL('../model/little_house_in_lotus_island/test1.glb', import.meta.url);

const assetLoader = new GLTFLoader();

let mixer;
assetLoader.load(buildingURL.href, function(gltf) {
    const model = gltf.scene;
    console.log(model.children[1].material.opacity)
    scene.add(model);
    model.position.set(0, 7, 0);
    }, undefined,
    function (error)
    {console.log(error);
    });

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);



const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

// Sets orbit control to move the camera around.
const orbit = new OrbitControls(camera, renderer.domElement);

// Camera positioning.
camera.position.set(6, 8, 14);

// Has to be done everytime we update the camera position.
orbit.update();

// Creates a 12 by 12 grid helper.
const gridHelper = new THREE.GridHelper(100, 100);
scene.add(gridHelper);

// Creates an axes helper with an axis length of 4.
const axesHelper = new THREE.AxesHelper(4);
scene.add(axesHelper);


/* ---------------------- SHADERS ---------------------- */
// main.js
const waterVertexShader = /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
        vUv = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        #include <logdepthbuf_vertex>
    }
`;

const waterFragmentShader = /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    varying vec4 vUv;

    #include <logdepthbuf_pars_fragment>

    float blendOverlay( float base, float blend ) {
        return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
    }

    vec3 blendOverlay( vec3 base, vec3 blend ) {
        return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
    }

    void main() {
        #include <logdepthbuf_fragment>
        vec4 base = texture2DProj( tDiffuse, vUv );
        gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

/* ---------------------- SCENE ---------------------- */


// Sea Floor
const seaFloorGeometry = new THREE.PlaneGeometry(100,100);
const seaFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0xBBBF72,
    side: THREE.DoubleSide
});
const seaFloor = new THREE.Mesh(seaFloorGeometry, seaFloorMaterial);
seaFloor.rotation.x = -0.5 * Math.PI;

const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.8);
scene.add(directionalLight);
directionalLight.position.set(-30, 50, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.bottom = -12;

const dLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
scene.add(dLightHelper);

const dLightShadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
scene.add(dLightShadowHelper);

const customShader = Reflector.ReflectorShader;

customShader.vertexShader = waterVertexShader;
customShader.fragmentShader = waterFragmentShader;

const mirrorGeometry = new THREE.CircleGeometry( 40, 64 );
const groundMirror = new Reflector( mirrorGeometry, {
    shader: customShader,
    clipBias: 0.003,
    textureWidth: window.innerWidth,
    textureHeight: window.innerHeight,
    color: 0xb5b5b5
} );
groundMirror.position.y = -10;
groundMirror.rotateX( - Math.PI / 2 );
scene.add( groundMirror );



scene.add(seaFloor);


function animate() {
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});