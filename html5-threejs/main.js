var container, stats;
var camera, scene, renderer, objects;
var particleLight;
var light;
var container, stats;
var camera, scene, renderer;
var depthMaterial, effectComposer, depthRenderTarget;
var ssaoPass;
var group;
var depthScale = 0.1;
var postprocessing = { enabled : true, renderMode: 0 };

//default loading manager
THREE.DefaultLoadingManager.onStart = function ( url, itemsLoaded, itemsTotal ) {
	console.log( 'Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
}

THREE.DefaultLoadingManager.onLoad = function ( ) {
	console.log( 'Loading Complete!');
}

THREE.DefaultLoadingManager.onProgress = function ( url, itemsLoaded, itemsTotal ) {
	console.log( 'Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
}

THREE.DefaultLoadingManager.onError = function ( url ) {
	console.log( 'There was an error loading ' + url );
}


let target = window.location.hash.slice(1)||undefined

//load resources asynchronously
let loadResources = config => {
  let resources = {}

  //load cubemap
  let cubemapName = 'cottage'
  resources.cubemap = new Promise((res,rej)=>{
    var genCubeUrls = function( prefix, postfix ) {
      return [
        prefix + 'px' + postfix, prefix + 'nx' + postfix,
        prefix + 'py' + postfix, prefix + 'ny' + postfix,
        prefix + 'pz' + postfix, prefix + 'nz' + postfix
      ]
    }
    var hdrUrls = genCubeUrls( 'env/'+cubemapName+'/', '.hdr.gz' )
    new THREE.HDRCubeTextureLoader().load(THREE.UnsignedByteType, hdrUrls, res) 
  })

  let textureLoader = new THREE.TextureLoader()

  //return a promise that resolves to the config populated with resources
  let names = Object.keys(resources)
  let promises = names.map(n => resources[n])

  return new Promise((res,rej)=>{
    Promise.all(promises).then(values => {
      let resources = {}
      names.forEach((name,i) => {
        resources[name] = values[i] 
      })
      res(resources)
    })
  })
}

let config
let init = resources => {
  container = document.createElement( 'div' );
  document.body.appendChild( container );

  renderer = new THREE.WebGLRenderer();
  renderer.toneMapping = THREE.ReinhardToneMapping
  renderer.shadowMap.enabled = true;
  renderer.toneMappingExposure = 1 
  renderer.shadowMap.renderReverseSided = false
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );

  camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 50 );

  scene = new THREE.Scene();

  let material = new THREE.MeshPhysicalMaterial({
    //vertexColors: true,
    shading: THREE.FlatShading,
    side: 0,
    color: 0x888888,
    metalness: 0,
    roughness: 0.4,
  })

  let hdrCubeMap = resources.cubemap
  var pmremGenerator = new THREE.PMREMGenerator( hdrCubeMap );
  pmremGenerator.update( renderer );
  var pmremCubeUVPacker = new THREE.PMREMCubeUVPacker( pmremGenerator.cubeLods );
  pmremCubeUVPacker.update( renderer );
  hdrCubeRenderTarget = pmremCubeUVPacker.CubeUVRenderTarget;
  material.envMap = hdrCubeRenderTarget.texture;
  material.envMap.offset.x = 2
  material.needsUpdate = true;

  let geometry = new THREE.BoxGeometry(3,3,3)
  let mesh = new THREE.Mesh(geometry)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.material = material;
  mesh.material.needsUpdate = true;
  scene.add(mesh)

  light = new THREE.SpotLight(16770457, 1.9, 0, 2)
  light.position.set(10,7,-3)
  light.lookAt(mesh)
  light.castShadow = true;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 30;
  light.shadow.camera.fov = 20;
  let mapsize = 4096
  light.shadow.mapSize.width = mapsize;
  light.shadow.mapSize.height = mapsize;
  light.shadow.bias = -0.005;

  scene.add(light)
  //let z = new THREE.CameraHelper( light.shadow.camera ) 
  //scene.add(z)
  
  scene.add(camera)
  scene.rotation.y = -0.7  
  container.appendChild( renderer.domElement );
  initPostprocessing();

  controls = new THREE.OrbitControls( camera, renderer.domElement );
  //controls.addEventListener( 'change', render ); // add this only if there is no animation loop (requestAnimationFrame)
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enableZoom = false;

  window.addEventListener( 'resize', onWindowResize, false );
  return Promise.resolve(true)
}

let animate = time => {
  requestAnimationFrame( animate );
  render(time);
}

let lTime = 0

let impulse = 0
let velocity = 7
let angle = 0
let tilt = 0
let step

let mousemove = ev => {
  let newTilt = tilt-ev.movementY/400
  if (newTilt < 1 && -1 < newTilt) {
    tilt = newTilt
  }
  impulse += ev.movementX/50
}
//window.onmouseup = ev => window.onmousemove = null
//window.onmousedown = ev => window.onmousemove = mousemove

let mouseV = 0

let render = curr => {
  let last = lTime
  step = curr-last
  lTime = curr

  let impT = impulse*(step/100)
  impulse -= impT
  velocity -= (-impT + (velocity*Math.abs(velocity))/2000)

  angle += velocity*step/10
  //mesh.rotation.y = angle/1000
  let p = 5
  camera.position.y = p-0.6; 
  camera.position.x = p;
  camera.position.z = p;
  camera.lookAt( scene.position );
  
  // Render depth into depthRenderTarget
  scene.overrideMaterial = depthMaterial;
  //renderer.render( scene, camera );
  renderer.render( scene, camera, depthRenderTarget, true );

  // Render renderPass and SSAO shaderPass
  scene.overrideMaterial = null;
  effectComposer.render();
}

//start it up
loadResources().then(init).then(animate)

function onWindowResize() {
  let width = window.innerWidth 
  let height = window.innerHeight
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
  ssaoPass.uniforms[ 'size' ].value.set( width, height );

  var pixelRatio = renderer.getPixelRatio();
  var newWidth  = Math.floor( width / pixelRatio ) || 1;
  var newHeight = Math.floor( height / pixelRatio ) || 1;
  depthRenderTarget.setSize( newWidth, newHeight );
  effectComposer.setSize( newWidth, newHeight );
}
//
function initPostprocessing() {

  // Setup render pass
  var renderPass = new THREE.RenderPass( scene, camera );

  // Setup depth pass
  depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.depthPacking = THREE.RGBADepthPacking;
  depthMaterial.blending = THREE.NoBlending;

  var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  depthRenderTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, pars );

  // Setup SSAO pass
  ssaoPass = new THREE.ShaderPass( THREE.SSAOShader );
  ssaoPass.renderToScreen = true;
  //ssaoPass.uniforms[ "tDiffuse" ].value will be set by ShaderPass
  ssaoPass.uniforms[ "tDepth" ].value = depthRenderTarget.texture;
  ssaoPass.uniforms[ 'size' ].value.set( window.innerWidth, window.innerHeight );
  ssaoPass.uniforms[ 'cameraNear' ].value = camera.near;
  ssaoPass.uniforms[ 'cameraFar' ].value = camera.far;
  ssaoPass.uniforms[ 'onlyAO' ].value = ( postprocessing.renderMode == 1 );
  ssaoPass.uniforms[ 'aoClamp' ].value = 0.2;
  ssaoPass.uniforms[ 'lumInfluence' ].value = 1.1;

  // Add pass to effect composer
  effectComposer = new THREE.EffectComposer( renderer );
  effectComposer.addPass( renderPass );
  effectComposer.addPass( ssaoPass );

}

