import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';


const buildingURL = new URL('../model/little_house_in_lotus_island/test1.glb', import.meta.url);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0x87ceeb); // Sky blue so we can see reflection

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

const orbit = new OrbitControls(camera, renderer.domElement);
camera.position.set(6, 8, 14);
orbit.update();

const gridHelper = new THREE.GridHelper(100, 100);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(4);
scene.add(axesHelper);

// Add a cube so we have something to reflect
const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.set(0, 3, 0);
scene.add(cube);

// Lighting
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(-30, 50, 0);
scene.add(directionalLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// GLTF Loader
const assetLoader = new GLTFLoader();
assetLoader.load(
    buildingURL.href,
    function (gltf) {
        const model = gltf.scene;
        scene.add(model);
        model.position.set(0, 7, 0);
    },
    undefined,
    function (error) {
        console.log(error);
    }
);
// Sea Floor (below the water)
const seaFloorGeometry = new THREE.PlaneGeometry(100, 100);
const seaFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0xbbbf72,
    side: THREE.DoubleSide
});
const seaFloor = new THREE.Mesh(seaFloorGeometry, seaFloorMaterial);
seaFloor.rotation.x = -0.5 * Math.PI;
seaFloor.position.y = -2; // Below the water surface
scene.add(seaFloor);

// SkyBox loader
// Load skybox textures
const ftURL = new URL('../texture/Daylight Box_Front.bmp', import.meta.url);
const bkURL = new URL('../texture/Daylight Box_Back.bmp', import.meta.url);
const upURL = new URL('../texture/Daylight Box_Top.bmp', import.meta.url);
const dnURL = new URL('../texture/Daylight Box_Bottom.bmp', import.meta.url);
const rtURL = new URL('../texture/Daylight Box_Right.bmp', import.meta.url);
const lfURL = new URL('../texture/Daylight Box_Left.bmp', import.meta.url);

const cubeTextureLoader = new THREE.CubeTextureLoader();

const skyboxTexture = cubeTextureLoader.load(
    [
        rtURL.href,
        lfURL.href,
        upURL.href,
        dnURL.href,
        ftURL.href,
        bkURL.href,
    ],
    () => console.log('Skybox loaded successfully!'),
    undefined,
    (error) => console.error('Error loading skybox:', error)
);

scene.background = skyboxTexture;
scene.fog = new THREE.FogExp2(0xFFFFFF, 0.01);
/* ---------------------- WATER SHADERS ---------------------- */
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
    //uniform float opacity;
    varying vec4 vUv;

    #include <logdepthbuf_pars_fragment>

    void main() {
        #include <logdepthbuf_fragment>
        
        float waveStrength = 0.1;
        float waveSpeed = 0.03;
        
        // Calculate UV for dudv lookup (use xy components, normalized)
        vec2 dudvUv = vUv.xy / vUv.w;
        
        // First pass distortion
        vec2 distortedUv = texture2D( tDudv, vec2( dudvUv.x + time * waveSpeed, dudvUv.y ) ).rg * waveStrength;
        distortedUv = dudvUv + vec2( distortedUv.x, distortedUv.y + time * waveSpeed );
        
        // Second pass distortion
        vec2 distortion = ( texture2D( tDudv, distortedUv ).rg * 2.0 - 1.0 ) * waveStrength;
        
        // Apply distortion to reflection UV
        vec4 uv = vUv;
        uv.xy += distortion * uv.w;
        
        // Sample reflection texture with distortion
        vec4 base = texture2DProj( tDiffuse, uv );
        
        // Mix reflection with water color
        gl_FragColor = vec4( mix( base.rgb, color, 0.3 ), 1.0 );
        
        // Mix reflection with water color, then apply opacity
        //vec3 waterColor = mix( base.rgb, color, 0.3 );
        
        // Output with transparency (opacity controls see-through amount)
        //gl_FragColor = vec4( waterColor, opacity );
        
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

/* ---------------------- WATER SETUP ---------------------- */

// Use URL constructor for proper Parcel asset handling
const dudvURL = new URL('../texture/waterdudv.jpg', import.meta.url);

const loader = new THREE.TextureLoader();
let groundMirror;

loader.load(
    dudvURL.href,
    function (dudvMap) {
        console.log('DUDV texture loaded!', dudvMap);

        dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;
        dudvMap.repeat.set(4, 4); // Tile the texture for more visible waves

        const customShader = {
            name: 'WaterReflectorShader',
            uniforms: {
                color: { value: null },
                tDiffuse: { value: null },
                textureMatrix: { value: null },
                tDudv: { value: dudvMap },
                time: { value: 0 },
            },
            vertexShader: waterVertexShader,
            fragmentShader: waterFragmentShader,
        };

        const mirrorGeometry = new THREE.CircleGeometry(40, 64);
        groundMirror = new Reflector(mirrorGeometry, {
            shader: customShader,
            clipBias: 0.003,
            textureWidth: window.innerWidth * window.devicePixelRatio,
            textureHeight: window.innerHeight * window.devicePixelRatio,
            color: 0x0077be, // Water blue color
        });

        groundMirror.position.y = 5;
        groundMirror.rotateX(-Math.PI / 2);
        scene.add(groundMirror);

        /*
        const customShader = {
            name: 'WaterReflectorShader',
            uniforms: {
                color: { value: null },
                tDiffuse: { value: null },
                textureMatrix: { value: null },
                tDudv: { value: dudvMap },
                time: { value: 0 },
                opacity: { value: 0.7 }, // 0 = fully transparent, 1 = fully opaque
            },
            vertexShader: waterVertexShader,
            fragmentShader: waterFragmentShader,
        };

        const mirrorGeometry = new THREE.CircleGeometry(40, 64);
        groundMirror = new Reflector(mirrorGeometry, {
            shader: customShader,
            clipBias: 0.003,
            textureWidth: window.innerWidth * window.devicePixelRatio,
            textureHeight: window.innerHeight * window.devicePixelRatio,
            color: 0x0077be,
        });

        // Enable transparency on the material
        groundMirror.material.transparent = true;

        groundMirror.position.y = 0;
        groundMirror.rotateX(-Math.PI / 2);
        scene.add(groundMirror);
         */

        console.log('Water mirror added to scene');
    },
    function (progress) {
        console.log('Loading texture...', progress);
    },
    function (error) {
        console.error('Error loading DUDV texture:', error);
    }
);

/* ---------------------- ANIMATION ---------------------- */

const clock = new THREE.Clock();

function animate() {
    const elapsedTime = clock.getElapsedTime();

    // Rotate cube for visual feedback
    cube.rotation.y = elapsedTime * 0.5;

    // Update water shader time uniform
    if (groundMirror && groundMirror.material.uniforms.time) {
        groundMirror.material.uniforms.time.value = elapsedTime;
    }

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});