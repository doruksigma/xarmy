import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import type { Quality, Weather } from "./types";

const SETTINGS = {
  low: {
    pixelRatio: 0.8,
    shadow: 1024,
    distance: 54,
    bloom: false,
    ao: false,
    rain: 240,
  },
  medium: {
    pixelRatio: 1,
    shadow: 1536,
    distance: 64,
    bloom: true,
    ao: false,
    rain: 520,
  },
  high: {
    pixelRatio: 1.35,
    shadow: 2048,
    distance: 72,
    bloom: true,
    ao: true,
    rain: 900,
  },
  ultra: {
    pixelRatio: 1.75,
    shadow: 4096,
    distance: 88,
    bloom: true,
    ao: true,
    rain: 1400,
  },
} as const;

/** Keep the analytic sky in the same exposure range as the lit world. */
function atmosphericSky() {
  const sky = new Sky();
  sky.material.uniforms.radianceScale = { value: 0.43 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace(
      "uniform float mieDirectionalG;",
      "uniform float mieDirectionalG; uniform float radianceScale;",
    )
    .replace("vec4( retColor, 1.0 )", "vec4( retColor * radianceScale, 1.0 )");
  sky.material.uniforms.turbidity.value = 2.1;
  sky.material.uniforms.rayleigh.value = 2.7;
  sky.material.uniforms.mieCoefficient.value = 0.003;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  return sky;
}

/** A soft, irregular cloud mask made locally; no external texture downloads. */
function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  for (let i = 0; i < 34; i++) {
    const a = i * 2.399;
    const x = 128 + Math.cos(a) * (i % 7) * 11;
    const y = 128 + Math.sin(a) * (i % 9) * 7;
    const radius = 25 + ((i * 17) % 47);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(255,255,255,0.4)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.23)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function moonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const halo = context.createRadialGradient(64, 64, 17, 64, 64, 62);
  halo.addColorStop(0, "rgba(222,235,255,0.5)");
  halo.addColorStop(1, "rgba(222,235,255,0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "#e4ebec";
  context.beginPath();
  context.arc(64, 64, 18, 0, Math.PI * 2);
  context.fill();
  for (let i = 0; i < 9; i++) {
    context.fillStyle = "rgba(104,122,138,0.18)";
    context.beginPath();
    context.arc(
      53 + ((i * 11) % 23),
      53 + ((i * 7) % 23),
      2 + (i % 4),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

/** Fullscreen grading keeps the reticle area clear; deliberately no DOF/motion blur. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv;
    void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 source=texture2D(tDiffuse,vUv);
      vec3 c=source.rgb;
      float luminance=dot(c,vec3(0.2126,0.7152,0.0722));
      c=mix(vec3(luminance),c,1.045);
      c=mix(c*vec3(0.965,1.0,1.03),c*vec3(1.025,1.01,0.99),smoothstep(0.0,1.5,luminance));
      vec2 p=vUv-0.5;
      c*=1.0-0.12*smoothstep(0.16,0.5,dot(p,p));
      gl_FragColor=vec4(max(c,vec3(0.0)),source.a);
    }`,
};

export function createRendering(
  container: HTMLElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  initialQuality: Quality,
) {
  let quality = initialQuality;
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const keep = <T extends { dispose(): void }>(resource: T): T => {
    cleanups.push(() => resource.dispose());
    return resource;
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        cleanups[i]();
      } catch {
        /* Release the rest after context loss. */
      }
    }
    cleanups.length = 0;
  };
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    cleanups.push(() => {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });
    const hdr = renderer.extensions.has("EXT_color_buffer_float");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    // A frame includes reflection, shadow and post-processing draws. Three's
    // default resets on each pass and would report only the final fullscreen quad.
    renderer.info.autoReset = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.setAttribute(
      "aria-label",
      "Battle Royale oyun dünyası",
    );
    container.appendChild(renderer.domElement);

    const owned = new THREE.Group();
    owned.name = "battle-atmosphere";
    scene.add(owned);
    cleanups.push(() => scene.remove(owned));
    const sky = atmosphericSky();
    keep(sky.geometry);
    keep(sky.material);
    sky.scale.setScalar(1200);
    sky.frustumCulled = false;
    owned.add(sky);

    const sunVector = new THREE.Vector3(-0.5, 0.57, -0.62).normalize();
    sky.material.uniforms.sunPosition.value.copy(sunVector);
    // Bake an HDR image-based environment once, rather than rerender a cubemap
    // every frame. Direct sunlight and sky visuals still follow the day cycle.
    const environmentScene = new THREE.Scene();
    const environmentSky = atmosphericSky();
    keep(environmentSky.geometry);
    keep(environmentSky.material);
    environmentSky.scale.setScalar(500);
    for (const key of [
      "turbidity",
      "rayleigh",
      "mieCoefficient",
      "mieDirectionalG",
    ])
      environmentSky.material.uniforms[key].value =
        sky.material.uniforms[key].value;
    environmentSky.material.uniforms.sunPosition.value.copy(sunVector);
    environmentScene.add(environmentSky);
    const oldEnvironment = scene.environment;
    const oldEnvironmentIntensity = scene.environmentIntensity;
    const oldFog = scene.fog;
    cleanups.push(() => {
      scene.environment = oldEnvironment;
      scene.environmentIntensity = oldEnvironmentIntensity;
      scene.fog = oldFog;
    });
    // Keep a direct-light LDR path on GPUs without float color attachments.
    const pmrem = keep(new THREE.PMREMGenerator(renderer));
    const environment = hdr
      ? keep(pmrem.fromScene(environmentScene, 0.06, 0.1, 1000))
      : null;
    scene.environment = environment?.texture ?? null;
    scene.environmentIntensity = 0.65;
    pmrem.dispose();
    environmentSky.geometry.dispose();
    environmentSky.material.dispose();

    const sun = keep(new THREE.DirectionalLight(0xffddae, 3.4));
    sun.castShadow = true;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    owned.add(sun, sun.target);
    const ambient = new THREE.HemisphereLight(0xc7e0ed, 0x5b5944, 0.85);
    owned.add(ambient);
    const moonLight = keep(new THREE.DirectionalLight(0xb5d5ff, 0));
    owned.add(moonLight, moonLight.target);
    const moonMap = keep(moonTexture());
    const moonMaterial = keep(
      new THREE.SpriteMaterial({
        map: moonMap,
        transparent: true,
        fog: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const moon = new THREE.Sprite(moonMaterial);
    moon.scale.set(45, 45, 1);
    owned.add(moon);

    const fog = new THREE.FogExp2(0xa9c6d3, 0.0011);
    scene.fog = fog;
    const cloudMap = keep(cloudTexture());
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 22; i++) {
      const material = keep(
        new THREE.SpriteMaterial({
          map: cloudMap,
          color: 0xfff3dc,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          fog: false,
        }),
      );
      const cloud = new THREE.Sprite(material);
      cloud.position.set(
        ((i * 173) % 1100) - 550,
        135 + ((i * 31) % 95),
        ((i * 313) % 1100) - 550,
      );
      const size = 90 + ((i * 23) % 100);
      cloud.scale.set(size * 1.8, size * 0.65, 1);
      cloud.rotation.z = i * 0.3;
      cloud.frustumCulled = false;
      clouds.push(cloud);
      owned.add(cloud);
    }

    const rainGeometry = keep(new THREE.BufferGeometry());
    const rainPositions = new Float32Array(1400 * 6);
    for (let i = 0; i < 1400; i++) {
      const x = ((i * 13.71) % 80) - 40;
      const y = (i * 7.37) % 45;
      const z = ((i * 23.21) % 80) - 40;
      rainPositions.set([x, y, z, x + 0.12, y - 1.3, z + 0.2], i * 6);
    }
    rainGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(rainPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const rainMaterial = keep(
      new THREE.LineBasicMaterial({
        color: 0xc8d6df,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
    rain.frustumCulled = false;
    rain.visible = false;
    owned.add(rain);

    const composer = keep(
      new EffectComposer(
        renderer,
        new THREE.WebGLRenderTarget(1, 1, {
          type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        }),
      ),
    );
    const renderPass = keep(new RenderPass(scene, camera));
    const ao = keep(new SSAOPass(scene, camera, 1, 1, 12));
    // Upstream SSAOPass.dispose omits these resources in Three 0.170.
    keep(ao.ssaoMaterial);
    keep(ao.noiseTexture);
    ao.kernelRadius = 0.8;
    ao.minDistance = 0.0006;
    ao.maxDistance = 0.022;
    const bloom = keep(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.35, 1.3),
    );
    const grade = keep(new ShaderPass(GradeShader));
    const output = keep(new OutputPass());
    const fxaa = keep(new ShaderPass(FXAAShader));
    composer.addPass(renderPass);
    composer.addPass(ao);
    composer.addPass(bloom);
    composer.addPass(grade);
    composer.addPass(output);
    composer.addPass(fxaa);

    let previousWidth = 0;
    let previousHeight = 0;
    function resize() {
      if (disposed) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      previousWidth = width;
      previousHeight = height;
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        SETTINGS[quality].pixelRatio,
      );
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      // AO is deliberately half resolution; geometric contact/shadow detail has
      // diminishing returns beyond that and must not obscure combat silhouettes.
      ao.setSize(
        Math.max(1, Math.floor(width * dpr * 0.5)),
        Math.max(1, Math.floor(height * dpr * 0.5)),
      );
      ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
        camera.projectionMatrix,
      );
      ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
        camera.projectionMatrixInverse,
      );
      fxaa.uniforms.resolution.value.set(1 / (width * dpr), 1 / (height * dpr));
    }
    function setQuality(next: Quality) {
      quality = next;
      const settings = SETTINGS[quality];
      const shadowSize = Math.min(
        settings.shadow,
        renderer.capabilities.maxTextureSize,
      );
      const oldShadow = sun.shadow.map;
      if (sun.shadow.mapSize.x !== shadowSize) {
        oldShadow?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.setScalar(shadowSize);
      }
      const extent = settings.distance;
      Object.assign(sun.shadow.camera, {
        left: -extent,
        right: extent,
        top: extent,
        bottom: -extent,
      });
      sun.shadow.camera.updateProjectionMatrix();
      ao.enabled = hdr && settings.ao;
      bloom.enabled = hdr && settings.bloom;
      rainGeometry.setDrawRange(0, settings.rain * 2);
      resize();
    }
    setQuality(quality);
    const observer = new ResizeObserver(resize);
    cleanups.push(() => observer.disconnect());
    observer.observe(container);

    const skyWarm = new THREE.Color(0xd9c6a4);
    const skyDay = new THREE.Color(0xa9c6d3);
    const skyNight = new THREE.Color(0x1c304b);
    const stormColor = new THREE.Color(0x879b9f);
    const sunWarm = new THREE.Color(0xffc787);
    const sunDay = new THREE.Color(0xfff2d7);
    const temp = new THREE.Vector3();
    const fogTarget = new THREE.Color();
    let rainAmount = 0;
    let lastProjection = camera.fov;

    return {
      renderer,
      resize,
      setQuality,
      render(
        dt: number,
        time: number,
        player: THREE.Vector3,
        weather: Weather,
      ) {
        if (disposed) return;
        renderer.info.reset();
        if (
          container.clientWidth !== previousWidth ||
          container.clientHeight !== previousHeight
        )
          resize();
        if (camera.fov !== lastProjection) {
          lastProjection = camera.fov;
          ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
            camera.projectionMatrix,
          );
          ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
            camera.projectionMatrixInverse,
          );
        }
        const angle = time * ((Math.PI * 2) / 420) + 0.9;
        const elevation = Math.sin(angle) * 0.72;
        sunVector.set(Math.cos(angle) * -0.8, elevation, -0.62).normalize();
        const daylight = THREE.MathUtils.smoothstep(elevation, -0.12, 0.18);
        const weatherDarkness =
          weather === "storm" ? 0.48 : weather === "rain" ? 0.7 : 1;
        sky.position.set(player.x, 0, player.z);
        sky.material.uniforms.sunPosition.value.copy(sunVector);
        sky.material.uniforms.turbidity.value = THREE.MathUtils.lerp(
          sky.material.uniforms.turbidity.value,
          weather === "clear" ? 2.1 : 9,
          Math.min(1, dt * 0.4),
        );
        sky.material.uniforms.radianceScale.value = THREE.MathUtils.lerp(
          sky.material.uniforms.radianceScale.value,
          weather === "storm" ? 0.27 : weather === "rain" ? 0.35 : 0.43,
          Math.min(1, dt * 0.4),
        );
        const elevationWarmth = THREE.MathUtils.smoothstep(
          elevation,
          0.14,
          0.6,
        );
        sun.color.copy(sunWarm).lerp(sunDay, elevationWarmth);
        sun.intensity = (0.2 + daylight * 3.1) * weatherDarkness;
        // Snap the shadow focus to stable world units so slow strafing doesn't
        // produce shimmering texels on floors, weapon silhouettes, or foliage.
        const snap = (SETTINGS[quality].distance * 2) / sun.shadow.mapSize.x;
        const px = Math.round(player.x / snap) * snap;
        const pz = Math.round(player.z / snap) * snap;
        sun.target.position.set(px, Math.min(player.y, 20), pz);
        sun.position.copy(sun.target.position).addScaledVector(sunVector, 145);
        ambient.intensity = 0.38 + daylight * 0.55;
        scene.environmentIntensity = 0.2 + daylight * 0.45;
        moon.position.copy(player).addScaledVector(sunVector, -470);
        moon.position.y = Math.max(35, moon.position.y);
        moonMaterial.opacity = 1 - daylight * 0.96;
        moonLight.intensity = (1 - daylight) * 0.6;
        moonLight.position
          .copy(player)
          .add(temp.copy(sunVector).multiplyScalar(-100));
        moonLight.target.position.copy(player);
        fogTarget
          .copy(skyWarm)
          .lerp(skyDay, elevationWarmth)
          .lerp(skyNight, 1 - daylight);
        if (weather === "rain" || weather === "storm")
          fogTarget.lerp(stormColor, 0.65);
        fog.color.lerp(fogTarget, Math.min(1, dt * 0.25));
        const density =
          weather === "fog"
            ? 0.009
            : weather === "storm"
              ? 0.005
              : weather === "rain"
                ? 0.003
                : 0.0011;
        fog.density = THREE.MathUtils.lerp(
          fog.density,
          density,
          Math.min(1, dt * 0.25),
        );
        renderer.toneMappingExposure = THREE.MathUtils.lerp(
          renderer.toneMappingExposure,
          daylight > 0.2 ? 0.9 : 1.25,
          Math.min(1, dt * 0.25),
        );
        for (let i = 0; i < clouds.length; i++) {
          const cloud = clouds[i];
          cloud.position.x =
            ((i * 173 + time * (0.65 + (i % 3) * 0.1)) % 1100) -
            550 +
            player.x * 0.3;
          cloud.position.z = ((i * 313) % 1100) - 550 + player.z * 0.3;
          const material = cloud.material;
          material.color
            .copy(sunWarm)
            .lerp(sunDay, 0.6)
            .lerp(stormColor, weather === "clear" ? 0 : 0.75);
          material.opacity =
            (weather === "clear" ? 0.43 : 0.72) * (0.3 + daylight * 0.7);
          cloud.visible = quality !== "low" || i < 9;
        }
        rainAmount = THREE.MathUtils.lerp(
          rainAmount,
          weather === "rain" || weather === "storm" ? 1 : 0,
          Math.min(1, dt),
        );
        rain.visible = rainAmount > 0.01;
        if (rain.visible) {
          rain.position.copy(player);
          rainMaterial.opacity = rainAmount * 0.3;
          const count = SETTINGS[quality].rain;
          for (let i = 0; i < count; i++) {
            const offset = i * 6;
            rainPositions[offset + 1] -= dt * 27;
            if (rainPositions[offset + 1] < -2) rainPositions[offset + 1] += 45;
            rainPositions[offset + 4] = rainPositions[offset + 1] - 1.3;
          }
          rainGeometry.attributes.position.needsUpdate = true;
        }
        composer.render(dt);
      },
      dispose: cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
