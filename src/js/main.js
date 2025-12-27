import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { WaterRefractionShader } from 'three/examples/jsm/shaders/WaterRefractionShader.js';

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

renderer.setClearColor(0xffffff)

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
const waterVertexShader = /* glsl */ `
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

const waterFragmentShader = /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDudv;
    uniform float time;
    varying vec4 vUv;

    #include <logdepthbuf_pars_fragment>

    void main() {
        #include <logdepthbuf_fragment>
        float waveStrength = 0.5;
        float waveSpeed = 0.03;
        
        // simple distortion (ripple) via dudv map
        vec2 distortedUv = texture2D( tDudv, vec2( vUv.x + time * waveSpeed, vUv.y ) ).rg * waveStrength;
        distortedUv = vUv.xy + vec2( distortedUv.x, distortedUv.y + time * waveSpeed );
        vec2 distortion = ( texture2D( tDudv, distortedUv ).rg * 2.0 - 1.0 ) * waveStrength;
        
        // new uv coords
        vec4 uv = vec4( vUv );
        uv.xy += distortion;
        vec4 base = texture2DProj( tDiffuse, uv );  // Changed from vUv to uv to use distortion
        gl_FragColor = vec4( mix( base.rgb, color, 0.5 ), 1.0 );
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

//scene.add(seaFloor);

const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.8);
scene.add(directionalLight);
directionalLight.position.set(-30, 50, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.bottom = -12;

const dLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
scene.add(dLightHelper);

const dLightShadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
scene.add(dLightShadowHelper);


// WATER (Mirror + Refraction)
const loader = new THREE.TextureLoader();
loader.load('./textures/waterdudv.jpg', function (dudvMap) {
    dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;

    // Clone the shader to avoid modifying the original
    const customShader = {
        uniforms: {
            // Copy existing uniforms from ReflectorShader
            ...JSON.parse(JSON.stringify(Reflector.ReflectorShader.uniforms)),
            tDudv: { value: dudvMap },
            time: { value: 0 },
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
    };

    // Properly set up uniforms that can't be JSON cloned
    customShader.uniforms.color = { value: null };
    customShader.uniforms.tDiffuse = { value: null };
    customShader.uniforms.textureMatrix = { value: null };

    const mirrorGeometry = new THREE.CircleGeometry(40, 64);
    const groundMirror = new Reflector(mirrorGeometry, {
        shader: customShader,
        clipBias: 0.003,
        textureWidth: window.innerWidth,
        textureHeight: window.innerHeight,
        color: 0xb5b5b5,
    });
    groundMirror.position.y = -10;
    groundMirror.rotateX(-Math.PI / 2);
    scene.add(groundMirror);

    // Store reference to update time in animate loop
    window.waterShader = customShader;
},undefined, function (error){
    console.log(error)
});






function animate() {
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});