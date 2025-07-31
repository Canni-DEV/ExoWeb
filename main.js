import * as THREE from 'https://unpkg.com/three@0.150.1/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.150.1/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.150.1/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.150.1/examples/jsm/postprocessing/UnrealBloomPass.js';

let scene, camera, renderer, composer;
let terrain, sky, clouds, sphere;
let clock = new THREE.Clock();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
const keys = {};

init();

function getShader(id) {
  return document.getElementById(id).textContent.trim();
}

function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x332233, 0.0006);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(0, 50, 100);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('app'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(100, 200, 100);
  scene.add(sun);

  const terrainGeom = new THREE.PlaneGeometry(2000, 2000, 256, 256);
  const terrainMaterial = new THREE.ShaderMaterial({
    vertexShader: getShader('terrainVertex'),
    fragmentShader: getShader('terrainFragment'),
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x553333) }
    }
  });
  terrain = new THREE.Mesh(terrainGeom, terrainMaterial);
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  const sphereGeom = new THREE.SphereGeometry(5, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  sphere = new THREE.Mesh(sphereGeom, sphereMat);
  sphere.position.set(0, 20, 0);
  scene.add(sphere);

  const skyGeom = new THREE.SphereGeometry(5000, 32, 15);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: getShader('skyVertex'),
    fragmentShader: getShader('skyFragment'),
    uniforms: {
      topColor: { value: new THREE.Color(0xffaa88) },
      bottomColor: { value: new THREE.Color(0x221122) }
    },
    side: THREE.BackSide,
    depthWrite: false
  });
  sky = new THREE.Mesh(skyGeom, skyMat);
  scene.add(sky);

  const cloudGeom = new THREE.PlaneGeometry(1000, 1000, 1, 1);
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: getShader('cloudFragment'),
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      cloudColor: { value: new THREE.Color(0xffffff) }
    }
  });
  clouds = new THREE.Mesh(cloudGeom, cloudMat);
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = 150;
  scene.add(clouds);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.85);
  composer.addPass(bloomPass);

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('keydown', e => { keys[e.code] = true; });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const speed = 40.0;

  direction.set(0, 0, 0);
  if (keys['ArrowUp'] || keys['KeyW']) direction.z -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) direction.z += 1;
  if (keys['ArrowLeft'] || keys['KeyA']) direction.x -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) direction.x += 1;
  direction.normalize();

  velocity.addScaledVector(direction, speed * delta);
  velocity.multiplyScalar(0.95);
  sphere.position.addScaledVector(velocity, delta * speed);
  camera.position.lerp(new THREE.Vector3(sphere.position.x, sphere.position.y + 20, sphere.position.z + 60), 0.1);
  camera.lookAt(sphere.position);
  camera.rotation.z = -velocity.x * 0.01;

  terrain.material.uniforms.uTime.value += delta;
  clouds.material.uniforms.uTime.value += delta;

  composer.render();
}
