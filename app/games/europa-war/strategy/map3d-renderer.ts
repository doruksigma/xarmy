import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MAP, GEOGRAPHY, localSupply, supplyNetwork } from "./world";
import { SEA_ZONES } from "./advanced-catalog";
import type { World, Army } from "./types";
import type { MapMode } from "./WarMap";
import {
  buildTerrain,
  colorTerrain,
  heightAt,
  provinceOutline,
} from "./map3d-geometry";
import { createScenery } from "./map3d-scenery";
import { createCityLights } from "./map3d-city-lights";
import { createMovementArrows } from "./map3d-movement-arrows";
import { createMilitaryMapIcon } from "./military-symbols";
import { politicalCountryColor } from "./map3d-cartography-palette";
import {
  createUnitModels,
  UNIT_LABEL_HEIGHT,
  type UnitFormation,
} from "./map3d-units";
import {
  detectFormationCaptures,
  detectResolvedFormationCombats,
  formationCombat,
  formationMovementBlendMs,
  formationSnapshotTransition,
  type FormationCapture,
  type ResolvedFormationCombat,
} from "./map3d-unit-events";
import { createRailways } from "./map3d-railways";
import { createAirNavalVisuals } from "./map3d-airnaval";
import { createTerrainSurfaceSampler } from "./map3d-surface";
import {
  countryLabelSignature,
  countryMapLabels,
  countryLabelsOverlap,
  type ScreenCountryLabel,
  type CountryMapLabel,
} from "./map3d-country-labels";
import {
  configureCartographicTerrain,
  createPoliticalBorders,
  CARTOGRAPHIC_TERRAINS,
} from "./map3d-cartography";
import {
  armyMapPosition,
  visibleFormations,
  GRAPHICS_QUALITY,
  visualRandom,
  type GraphicsQuality,
} from "./map3d-visuals";

export interface Map3DState {
  world: World;
  selected: string;
  armyId: string | null;
  armyIds: string[];
  mode: MapMode;
  ordering: boolean;
  draft?: string[];
  paused?: boolean;
  onSelect: (id: string, append: boolean) => void;
  onArmies: (ids: string[], append?: boolean) => void;
  onOrder?: (id: string) => void;
  onTheater?: (theater: "air" | "naval") => void;
}
export interface Map3DMetrics {
  continuous: boolean;
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}
export type MapViewpoint = "strategic" | "perspective";
type Overlay = {
  element: HTMLButtonElement;
  position: THREE.Vector3;
  kind: "capital" | "army" | "city" | "sea";
};
type CaptureVisual = FormationCapture & { elapsed: number };
type ResolvedCombatVisual = ResolvedFormationCombat & {
  elapsed: number;
  seen: boolean;
  locations: Map<string, string>;
  advancing: boolean;
};
function belongsToResolvedExchange(event: ResolvedCombatVisual, army: Army) {
  const location = event.locations.get(army.id);
  return (
    location !== undefined &&
    army.strength > 0 &&
    (army.province === location ||
      (event.advancing && army.province === event.province))
  );
}
type Formation = UnitFormation & {
  armies: Army[];
  position: THREE.Vector3;
  from: THREE.Vector3;
  target: THREE.Vector3;
  angle: number;
  moving: boolean;
  tint: number;
  overlay: Overlay;
  captureEvent?: CaptureVisual;
  resolvedCombat?: ResolvedCombatVisual;
  resumeAt?: number;
};
const CAPTURE_DURATION = 6000;
const RESOLVED_COMBAT_DURATION = 1800;
const HALF_X = MAP.width / 2,
  HALF_Z = MAP.height / 2;
const VEC = new THREE.Vector3();

/** Presentation owns its buffers and camera; it never writes into the campaign. */
export class Map3DRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private terrain: ReturnType<typeof buildTerrain>;
  private surfaceHeightAt = heightAt;
  private land: THREE.Mesh;
  private scenery: ReturnType<typeof createScenery>;
  private units: ReturnType<typeof createUnitModels>;
  private cityLights: ReturnType<typeof createCityLights>;
  private railways: ReturnType<typeof createRailways>;
  private airNaval: ReturnType<typeof createAirNavalVisuals>;
  private unitFrustum = new THREE.Frustum();
  private unitProjection = new THREE.Matrix4();
  private unitBounds = new THREE.Sphere();
  private visibleUnits: Formation[] = [];
  private sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private sun = new THREE.DirectionalLight(0xc8d7ef, 1.7);
  private selection: THREE.LineSegments | null = null;
  private movementArrows: ReturnType<typeof createMovementArrows>;
  private markers = new THREE.Group();
  private battleRings: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private formations: Formation[] = [];
  private captureEvents: CaptureVisual[] = [];
  private resolvedCombats: ResolvedCombatVisual[] = [];
  private lastUnitFrame = 0;
  private unitAnimationActive = false;
  private overlays: Overlay[] = [];
  private countryLabels: {
    element: HTMLSpanElement;
    label: CountryMapLabel;
    position: THREE.Vector3;
    axisFrom: THREE.Vector3;
    axisTo: THREE.Vector3;
  }[] = [];
  private countrySignature = "";
  private viewpoint: MapViewpoint = "strategic";
  private props: Map3DState;
  private quality: GraphicsQuality;
  private observer: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposed = false;
  private frame = 0;
  private dirty = true;
  private lastFrame = 0;
  private lastStats = 0;
  private lastContinuous: boolean | undefined;
  private renderedFrames = 0;
  private frameCount = 0;
  private updateAt = 0;
  private lastSimulationSnapshotAt: number | null = null;
  private movementBlendDuration = 650;
  private width = 1;
  private height = 1;
  private down = { x: 0, y: 0, shift: false };
  private selectionBox: HTMLDivElement | null = null;
  private draggingBox = false;
  private activePointers = new Set<number>();
  private multiTouch = false;
  private pointerDragged = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private unsubscribers: (() => void)[] = [];
  private worldRef: World | null = null;
  private borderMaterial: THREE.LineBasicMaterial;
  private terrainMaterial: THREE.MeshStandardMaterial;
  private cartography: ReturnType<typeof configureCartographicTerrain>;
  private politicalBorders: ReturnType<typeof createPoliticalBorders>;
  private coastMaterial = new THREE.MeshStandardMaterial({
    color: 0x111b2a,
    roughness: 0.95,
  });
  private provinceColors = new Map<string, number>();
  private noise: THREE.DataTexture;
  constructor(
    private canvas: HTMLCanvasElement,
    private labels: HTMLDivElement,
    state: Map3DState,
    quality: GraphicsQuality,
    private metrics: (value: Map3DMetrics) => void,
    private unavailable: (message: string) => void,
  ) {
    this.props = state;
    this.quality = quality;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene.background = new THREE.Color(0x050b18);
      this.scene.fog = new THREE.Fog(0x050b18, 1200, 3200);
      this.scene.add(new THREE.HemisphereLight(0x99b1db, 0x0b111d, 0.85));
      this.sun.position.set(-300, 550, 250);
      this.sun.target.position.set(0, 0, 0);
      this.sun.castShadow = true;
      this.sun.shadow.camera.left = -500;
      this.sun.shadow.camera.right = 500;
      this.sun.shadow.camera.top = 500;
      this.sun.shadow.camera.bottom = -500;
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 1500;
      this.sun.shadow.bias = -0.0003;
      this.sun.shadow.normalBias = 0.7;
      this.scene.add(this.sun, this.sun.target);
      this.terrain = buildTerrain({ maxEdge: quality === "low" ? 24 : 18 });
      this.surfaceHeightAt = createTerrainSurfaceSampler(this.terrain.geometry);
      const noiseData = new Uint8Array(64 * 64 * 4),
        random = visualRandom(64851);
      for (let i = 0; i < noiseData.length; i += 4) {
        const n = 170 + Math.floor(random() * 60);
        noiseData[i] = noiseData[i + 1] = noiseData[i + 2] = n;
        noiseData[i + 3] = 255;
      }
      this.noise = new THREE.DataTexture(noiseData, 64, 64);
      this.noise.wrapS = this.noise.wrapT = THREE.RepeatWrapping;
      this.noise.repeat.set(85, 60);
      this.noise.magFilter = THREE.LinearFilter;
      this.noise.needsUpdate = true;
      this.terrainMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        bumpMap: this.noise,
        bumpScale: 0.32,
      });
      this.cartography = configureCartographicTerrain(this.terrainMaterial);
      this.land = new THREE.Mesh(this.terrain.geometry, this.terrainMaterial);
      this.land.receiveShadow = true;
      this.scene.add(this.land);
      const coast = new THREE.Mesh(
        this.terrain.coastGeometry,
        this.coastMaterial,
      );
      coast.receiveShadow = true;
      this.scene.add(coast);
      this.borderMaterial = new THREE.LineBasicMaterial({
        color: 0x151d2b,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const borders = new THREE.LineSegments(
        this.terrain.borderGeometry,
        this.borderMaterial,
      );
      borders.renderOrder = 2;
      this.scene.add(borders);
      this.politicalBorders = createPoliticalBorders(
        this.scene,
        this.surfaceHeightAt,
      );
      this.sea = new THREE.Mesh(
        new THREE.PlaneGeometry(4000, 3400),
        new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            detail: { value: quality === "low" ? 0 : 1 },
          },
          vertexShader:
            "varying vec3 worldPos;void main(){vec4 p=modelMatrix*vec4(position,1.);worldPos=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}",
          fragmentShader: `
varying vec3 worldPos;
uniform float time;
uniform float detail;
void main() {
  float swell = sin(worldPos.x * .008 + worldPos.z * .012 + time * .08)
              * sin(worldPos.z * .019 - time * .05);
  float ripple = pow(max(0., sin(worldPos.x * .11 + worldPos.z * .07 + time * .2)), 28.);
  vec3 deep = vec3(.0015, .0035, .014);
  vec3 shallow = vec3(.004, .012, .04);
  vec3 color = mix(deep, shallow, .4 + swell * .22);
  color += vec3(.0004, .001, .002) * ripple * detail;
  gl_FragColor = vec4(color, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
        }),
      );
      this.sea.rotation.x = -Math.PI / 2;
      this.sea.position.y = -0.4;
      this.scene.add(this.sea);
      this.scenery = createScenery(this.scene, this.surfaceHeightAt);
      this.cityLights = createCityLights(this.scene, this.surfaceHeightAt);
      this.units = createUnitModels(
        this.scene,
        (x, z) => this.surfaceHeightAt(x + HALF_X, z + HALF_Z) + 0.12,
      );
      this.railways = createRailways(this.scene, this.surfaceHeightAt);
      this.airNaval = createAirNavalVisuals(this.scene, this.surfaceHeightAt);
      this.movementArrows = createMovementArrows(
        this.scene,
        this.surfaceHeightAt,
      );
      this.scene.add(this.markers);
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.13;
      this.controls.minDistance = 45;
      this.controls.maxDistance = 1900;
      this.controls.minPolarAngle = 0.2;
      this.controls.maxPolarAngle = Math.PI * 0.46;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      this.controls.mouseButtons.RIGHT = undefined as unknown as THREE.MOUSE;
      this.controls.touches.ONE = THREE.TOUCH.PAN;
      this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      this.controls.addEventListener("change", this.markDirty);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas.parentElement!);
      this.listen(canvas, "pointerdown", this.pointerDown, true);
      this.listen(canvas, "pointerup", this.pointerUp, true);
      this.listen(canvas, "pointermove", this.pointerMove, true);
      this.listen(canvas, "pointercancel", this.pointerCancel, true);
      this.listen(canvas, "contextmenu", this.contextMenu);
      this.listen(canvas, "keydown", this.keyDown);
      this.listen(canvas, "webglcontextlost", this.contextLost);
      this.listen(document, "visibilitychange", () => {
        if (!document.hidden) {
          this.dirty = true;
          this.lastFrame = 0;
          this.schedule();
        }
      });
      this.setQuality(quality);
      this.canvas.dataset.viewpoint = this.viewpoint;
      this.canvas.dataset.atlasStyle = "night";
      this.resize();
      this.update(state);
      this.focusProvince(
        state.world.countries[state.world.player].capital,
        550,
      );
      this.schedule();
    } catch (error) {
      // Constructor failures otherwise leave no instance for React to dispose.
      this.dispose();
      throw error;
    }
  }
  private listen(
    target: EventTarget,
    type: string,
    fn: EventListenerOrEventListenerObject,
    capture = false,
  ) {
    target.addEventListener(type, fn, capture);
    this.unsubscribers.push(() =>
      target.removeEventListener(type, fn, capture),
    );
  }
  private markDirty = () => {
    this.dirty = true;
    this.schedule();
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.unavailable(
      "3D görüntü bağlantısı kesildi. Seferin korunuyor; 2D haritayla devam edebilirsin.",
    );
  };
  private resize() {
    if (this.disposed) return;
    const box = this.canvas.parentElement!.getBoundingClientRect();
    this.width = Math.max(1, box.width);
    this.height = Math.max(1, box.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.markDirty();
  }
  setReducedMotion(reduced: boolean) {
    if (this.disposed || this.reduced === reduced) return;
    this.reduced = reduced;
    this.lastUnitFrame = performance.now();
    this.unitAnimationActive = false;
    if (reduced) {
      // Reduced motion shows the current location, not an indefinitely frozen
      // replay at a battle that has already finished.
      this.resolvedCombats.length = 0;
      this.rebuildMarkers();
    }
    this.markDirty();
  }
  setQuality(value: GraphicsQuality) {
    this.quality = value;
    const preset = GRAPHICS_QUALITY[value];
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, preset.pixelRatio),
    );
    this.renderer.shadowMap.enabled = preset.shadows > 0;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.mapSize.set(preset.shadows || 512, preset.shadows || 512);
    this.sun.shadow.needsUpdate = true;
    this.scenery.setQuality(value);
    this.cityLights.setQuality(value);
    this.publishCityCoverage();
    this.railways.setQuality(value);
    this.sea.material.uniforms.detail.value = value === "low" ? 0 : 1;
    this.canvas.dataset.quality = value;
    this.resize();
  }
  update(state: Map3DState) {
    if (this.disposed) return;
    const old = this.props;
    this.props = state;
    const previousWorld = this.worldRef;
    const changedWorld = previousWorld !== state.world;
    const now = performance.now();
    let resetPositions = false;
    this.worldRef = state.world;
    if (changedWorld || old.mode !== state.mode) this.colorMap();
    if (changedWorld) {
      const transition = formationSnapshotTransition(
        previousWorld,
        state.world,
      );
      if (transition === "reset") {
        resetPositions = true;
        this.captureEvents.length = 0;
        this.resolvedCombats.length = 0;
        this.lastSimulationSnapshotAt = now;
        this.movementBlendDuration = 650;
      }
      if (transition === "step") {
        this.movementBlendDuration = formationMovementBlendMs(
          this.lastSimulationSnapshotAt === null
            ? 650
            : now - this.lastSimulationSnapshotAt,
        );
        this.lastSimulationSnapshotAt = now;
      }
      // A same-hour command replaces the order immediately; never keep firing
      // an old exchange after a halt, peace agreement or loaded campaign.
      if (transition === "command") this.resolvedCombats.length = 0;
      this.resolvedCombats = this.resolvedCombats.filter((event) => {
        const participants = state.world.armies.filter((army) =>
          belongsToResolvedExchange(event, army),
        );
        return (
          event.elapsed < RESOLVED_COMBAT_DURATION &&
          state.world.countries[event.country]?.wars.includes(event.opponent) &&
          participants.length > 0 &&
          !formationCombat(state.world, participants)
        );
      });
      const exchanges = this.reduced
        ? []
        : detectResolvedFormationCombats(previousWorld, state.world);
      this.resolvedCombats.unshift(
        ...exchanges.map((event) => ({
          ...event,
          elapsed: 0,
          seen: false,
          advancing: state.world.battles.some(
            (battle) =>
              battle.id === event.battleId && battle.attacker === event.country,
          ),
          locations: new Map(
            state.world.armies
              .filter((army) => event.armyIds.includes(army.id))
              .map((army) => [army.id, army.province]),
          ),
        })),
      );
      this.resolvedCombats = this.resolvedCombats.slice(0, 32);
      const arrivals = detectFormationCaptures(previousWorld, state.world);
      this.captureEvents.push(
        ...arrivals.map((event) => ({ ...event, elapsed: 0 })),
      );
      this.captureEvents = this.captureEvents
        .filter(
          (event) =>
            event.elapsed < CAPTURE_DURATION &&
            state.world.provinces[event.province]?.controller ===
              event.country &&
            state.world.armies.some(
              (army) =>
                event.armyIds.includes(army.id) &&
                army.strength > 0 &&
                army.province === event.province &&
                !army.move,
            ),
        )
        .slice(-32);
      this.scenery.update(state.world);
      this.cityLights.update(state.world);
      this.updateCountryLabels();
      this.politicalBorders.update(state.world);
      this.publishCityCoverage();
      this.railways.update(state.world);
      this.airNaval.update(state.world);
    }
    if (
      changedWorld ||
      old.selected !== state.selected ||
      old.armyIds !== state.armyIds ||
      old.mode !== state.mode
    ) {
      this.rebuildMarkers(resetPositions);
      this.updateAt = now;
    }
    if (
      changedWorld ||
      old.selected !== state.selected ||
      old.armyIds !== state.armyIds ||
      old.draft !== state.draft
    )
      this.updateRoutes();
    this.markDirty();
  }
  private point(x: number, z: number, lift = 0) {
    return new THREE.Vector3(
      x - HALF_X,
      this.surfaceHeightAt(x, z) + lift,
      z - HALF_Z,
    );
  }
  private publishCityCoverage() {
    this.canvas.dataset.emptyCityProvinces = JSON.stringify(
      this.scenery.stats.emptyProvinces,
    );
    this.canvas.dataset.cityHouseCounts = JSON.stringify(
      this.scenery.stats.housesByProvince,
    );
  }
  private updateCountryLabels() {
    const signature = countryLabelSignature(this.props.world);
    if (signature === this.countrySignature) return;
    this.countrySignature = signature;
    this.countryLabels.forEach(({ element }) => element.remove());
    this.countryLabels = countryMapLabels(this.props.world).map((label) => {
      const element = document.createElement("span");
      element.className = "map3d-country-label";
      element.textContent = label.name.toLocaleUpperCase("tr-TR");
      element.dataset.mapCountry = label.country;
      element.setAttribute("aria-hidden", "true");
      this.labels.prepend(element);
      const position = this.point(label.x, label.y, 3);
      const offset = new THREE.Vector3(
        label.axisX,
        0,
        label.axisY,
      ).multiplyScalar(label.span / 2);
      return {
        element,
        label,
        position,
        axisFrom: position.clone().sub(offset),
        axisTo: position.clone().add(offset),
      };
    });
  }
  private drawCountryLabels() {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const occupied: ScreenCountryLabel[] = [];
    for (const { element, label, position, axisFrom, axisTo } of this
      .countryLabels) {
      VEC.copy(axisFrom).project(this.camera);
      const fromX = ((VEC.x + 1) * this.width) / 2;
      const fromY = ((1 - VEC.y) * this.height) / 2;
      VEC.copy(axisTo).project(this.camera);
      const dx = ((VEC.x + 1) * this.width) / 2 - fromX;
      const dy = ((1 - VEC.y) * this.height) / 2 - fromY;
      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      const span = Math.hypot(dx, dy);
      const textLength = element.textContent!.length;
      const idealFont = THREE.MathUtils.clamp(
        span / (textLength * 0.76 + 2),
        9,
        36,
      );
      VEC.copy(position).project(this.camera);
      const x = ((VEC.x + 1) * this.width) / 2;
      const y = ((1 - VEC.y) * this.height) / 2 - 18;
      let placed: ScreenCountryLabel | undefined;
      let font = idealFont;
      if (distance > 300 && VEC.z > -1 && VEC.z < 1) {
        for (const scale of [1, 0.82, 0.66, 0.5]) {
          font = Math.max(9, idealFont * scale);
          const width = textLength * font * 0.76 + 8;
          const height = font * 1.3;
          const boxWidth =
            Math.abs(Math.cos(angle)) * width +
            Math.abs(Math.sin(angle)) * height;
          const boxHeight =
            Math.abs(Math.sin(angle)) * width +
            Math.abs(Math.cos(angle)) * height;
          const candidate = { x, y, width, height, angle };
          if (
            x > boxWidth / 2 &&
            x < this.width - boxWidth / 2 &&
            y > boxHeight / 2 + 12 &&
            y < this.height - boxHeight / 2 - 12 &&
            (span > width * 0.75 ||
              label.country === this.props.world.player) &&
            !occupied.some((box) => countryLabelsOverlap(box, candidate))
          ) {
            placed = candidate;
            break;
          }
        }
      }
      element.style.display = placed ? "" : "none";
      if (!placed) continue;
      element.style.fontSize = `${font.toFixed(1)}px`;
      const degrees = ((angle * 180) / Math.PI).toFixed(1);
      element.dataset.angle = degrees;
      element.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${degrees}deg)`;
      occupied.push(placed);
    }
  }
  private colorMap() {
    const { world, mode } = this.props;
    this.cartography.setMode(mode);
    const network =
      mode === "supply" ? supplyNetwork(world, world.player) : null;
    const color = new THREE.Color(),
      terrain = new THREE.Color();
    for (const p of MAP.provinces) {
      const province = world.provinces[p.id],
        country = world.countries[province.controller];
      if (!country) continue;
      terrain.setHex(
        CARTOGRAPHIC_TERRAINS[p.terrain as keyof typeof CARTOGRAPHIC_TERRAINS]
          .color,
      );
      if (mode === "terrain") color.copy(terrain);
      else if (mode === "supply" && province.controller === world.player) {
        const value = localSupply(world, world.player, p.id, network!);
        color.setHSL(0.02 + Math.min(1, value) * 0.31, 0.38, 0.42);
      } else if (mode === "military")
        color.set(
          province.controller === world.player
            ? 0x759f79
            : world.countries[world.player].wars.includes(province.controller)
              ? 0xaa6157
              : 0x8a9082,
        );
      else if (mode === "air")
        color.set(
          province.buildings.airfield > 0
            ? 0x7197a5
            : politicalCountryColor(province.controller, country.color),
        );
      else if (mode === "naval")
        color.set(
          p.port
            ? 0xb49a65
            : politicalCountryColor(province.controller, country.color),
        );
      else
        color
          .set(politicalCountryColor(province.controller, country.color))
          .lerp(terrain, 0.06);
      const hex = color.getHex();
      if (this.provinceColors.get(p.id) !== hex) {
        colorTerrain(this.terrain, p.id, color);
        this.provinceColors.set(p.id, hex);
      }
    }
  }
  private clearMarkers() {
    this.overlays.forEach((o) => o.element.remove());
    this.overlays = [];
    this.battleRings = [];
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.markers.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        geometries.add(child.geometry);
        const material = child.material;
        if (Array.isArray(material)) material.forEach((m) => materials.add(m));
        else materials.add(material);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.markers.clear();
  }
  private overlay(
    text: string,
    position: THREE.Vector3,
    kind: Overlay["kind"],
    action: (event: MouseEvent) => void,
  ) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.dataset.kind = kind;
    element.className = "map3d-label";
    element.addEventListener("click", (e) => {
      e.stopPropagation();
      action(e);
    });
    this.labels.appendChild(element);
    const item = { element, position, kind };
    this.overlays.push(item);
    return item;
  }
  private rebuildMarkers(resetPositions = false) {
    const previous = new Map(
      (resetPositions ? [] : this.formations).map((f) => [
        f.armies.map((a) => a.id).join(","),
        f.position.clone(),
      ]),
    );
    this.clearMarkers();
    const { world, selected, armyIds } = this.props;
    const chosen = new Set(armyIds);
    const capitals = new Set(
      Object.values(world.countries)
        .filter((c) => !c.capitulated)
        .map((c) => c.capital),
    );
    for (const id of new Set([...capitals, selected])) {
      const p = GEOGRAPHY[id];
      if (!p) continue;
      const overlay = this.overlay(
        p.name,
        this.point(p.x, p.y, 4),
        capitals.has(id) ? "capital" : "city",
        () => this.props.onSelect(id, false),
      );
      if (capitals.has(id))
        overlay.element.prepend(createMilitaryMapIcon("capital", 12));
      overlay.element.dataset.provinceLabel = id;
      overlay.element.setAttribute(
        "aria-label",
        `${p.name}, ${world.countries[world.provinces[id].controller].name}`,
      );
    }
    this.formations = visibleFormations(world).map((armies, index) => {
      const army = armies[0],
        p = armyMapPosition(army),
        target = this.point(p.x, p.y, 0.12),
        key = armies.map((a) => a.id).join(",");
      // Idle miniatures use the same compact footprint reserved by city scenery.
      // Moving formations can be separated without clearing more city buildings.
      if (army.move) target.x += ((index % 3) - 1) * 1.8;
      const position = previous.get(key) ?? target.clone();
      const overlay = this.overlay(
        String(armies.length),
        position.clone().add(new THREE.Vector3(0, 8, 0)),
        "army",
        (event) => {
          if (this.props.ordering)
            this.props.onSelect(army.province, event.shiftKey);
          else if (army.country === world.player)
            this.props.onArmies(
              armies.map((a) => a.id),
              event.shiftKey,
            );
          else this.props.onSelect(army.province, false);
        },
      );
      const symbol = armies.some((unit) => unit.type.includes("Tank"))
        ? "tank"
        : armies.some((unit) => unit.type === "artillery")
          ? "artillery"
          : armies.some(
                (unit) =>
                  unit.type === "motorized" || unit.type === "mechanized",
              )
            ? "truck"
            : "infantry";
      overlay.element.prepend(createMilitaryMapIcon(symbol, 19));
      overlay.element.dataset.formation = `${army.country}:${army.province}:${army.move?.to ?? "idle"}`;
      overlay.element.dataset.country = army.country;
      overlay.element.setAttribute(
        "aria-label",
        `${world.countries[army.country].name}, ${armies.length} tümen, ${GEOGRAPHY[army.province].name}`,
      );
      overlay.element.dataset.selected = String(
        armies.some((a) => chosen.has(a.id)),
      );
      overlay.element.style.setProperty(
        "--army-color",
        world.countries[army.country].color,
      );
      const to = army.move ? GEOGRAPHY[army.move.to] : null,
        origin = GEOGRAPHY[army.province];
      const battle = formationCombat(world, armies);
      const resolvedCombat = !battle
        ? this.resolvedCombats.find(
            (event) =>
              event.elapsed < RESOLVED_COMBAT_DURATION &&
              event.country === army.country &&
              armies.every((member) =>
                belongsToResolvedExchange(event, member),
              ),
          )
        : undefined;
      const exchange = battle ?? resolvedCombat;
      const combat = exchange
        ? {
            key: exchange.key,
            target: this.point(exchange.target.x, exchange.target.y, 0.12),
          }
        : undefined;
      const captureEvent =
        !army.move && !battle
          ? this.captureEvents.find(
              (event) =>
                event.province === army.province &&
                event.country === army.country &&
                armies.some((member) => event.armyIds.includes(member.id)),
            )
          : undefined;
      return {
        armies,
        position: position.clone(),
        from: position.clone(),
        target,
        moving: !!army.move && !combat,
        angle: combat
          ? Math.atan2(combat.target.x - target.x, combat.target.z - target.z)
          : to
            ? Math.atan2(to.x - origin.x, to.y - origin.y)
            : Math.PI,
        tint: new THREE.Color(world.countries[army.country].color).getHex(),
        overlay,
        combat,
        resolvedCombat,
        captureEvent,
        capture: captureEvent
          ? {
              key: captureEvent.key,
              progress: captureEvent.elapsed / CAPTURE_DURATION,
            }
          : undefined,
      };
    });
    const player = world.countries[world.player];
    for (const battle of world.battles
      .filter(
        (b) =>
          b.attacker === world.player ||
          b.defender === world.player ||
          player.allies.includes(b.attacker) ||
          player.allies.includes(b.defender) ||
          player.intel[b.attacker]?.expires > world.day ||
          player.intel[b.defender]?.expires > world.day,
      )
      .slice(0, 12)) {
      const province = GEOGRAPHY[battle.province];
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(4.8, 6.5, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffae58,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(this.point(province.x, province.y, 1.4));
      this.markers.add(ring);
      this.battleRings.push(ring);
      const positions = [];
      for (let i = 0; i < 8; i++)
        positions.push(Math.sin(i * 5) * 3, 2 + i * 1.6, Math.cos(i * 7) * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      const smoke = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0x777567,
          size: 5,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      smoke.position.copy(this.point(province.x, province.y));
      this.markers.add(smoke);
    }
    // Model clocks advance only when a frame will actually be rendered. An
    // eager update here used to consume short muzzle flashes before drawing.
    if (this.props.mode === "naval")
      for (const zone of Object.values(SEA_ZONES)) {
        this.overlay(
          zone.name.toLocaleUpperCase("tr-TR"),
          new THREE.Vector3(zone.x - HALF_X, 2, zone.y - HALF_Z - 35),
          "sea",
          () => {},
        ).element.disabled = true;
      }
  }
  private updateRoutes() {
    if (this.selection) {
      this.scene.remove(this.selection);
      this.selection.geometry.dispose();
      (this.selection.material as THREE.Material).dispose();
      this.selection = null;
    }
    if (GEOGRAPHY[this.props.selected]) {
      this.selection = new THREE.LineSegments(
        provinceOutline(this.props.selected, 1),
        new THREE.LineBasicMaterial({ color: 0xffe4a1, depthWrite: false }),
      );
      this.selection.renderOrder = 4;
      this.scene.add(this.selection);
    }
    this.movementArrows.update(
      this.props.world,
      this.props.armyIds,
      this.props.draft,
    );
    this.canvas.dataset.movementArrows = JSON.stringify(
      this.movementArrows.stats,
    );
  }

  private updateUnitMatrices(now: number) {
    const active = !this.props.paused && !this.reduced && !document.hidden;
    const elapsed =
      active && this.unitAnimationActive
        ? Math.max(0, Math.min(100, now - this.lastUnitFrame))
        : 0;
    const combatElapsed =
      active && this.unitAnimationActive
        ? Math.max(0, Math.min(250, now - this.lastUnitFrame))
        : 0;
    this.lastUnitFrame = now;
    this.unitAnimationActive = active;
    for (const event of this.captureEvents) event.elapsed += elapsed;
    this.captureEvents = this.captureEvents.filter(
      (event) => event.elapsed < CAPTURE_DURATION,
    );
    for (const event of this.resolvedCombats) {
      if (event.seen) event.elapsed += combatElapsed;
      event.seen = true;
    }
    this.resolvedCombats = this.resolvedCombats.filter(
      (event) => event.elapsed < RESOLVED_COMBAT_DURATION,
    );
    this.camera.updateMatrixWorld();
    this.unitFrustum.setFromProjectionMatrix(
      this.unitProjection.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    this.visibleUnits.length = 0;
    for (const formation of this.formations) {
      const exchange = formation.resolvedCombat;
      if (exchange && exchange.elapsed >= RESOLVED_COMBAT_DURATION) {
        formation.resolvedCombat = undefined;
        formation.combat = undefined;
        formation.from.copy(formation.position);
        formation.resumeAt = now;
        formation.moving = !!formation.armies[0]?.move;
        const army = formation.armies[0];
        const from = GEOGRAPHY[army.province];
        const to = army.move && GEOGRAPHY[army.move.to];
        formation.angle = to
          ? Math.atan2(to.x - from.x, to.y - from.y)
          : Math.PI;
      }
      if (formation.capture && formation.captureEvent) {
        formation.capture.progress =
          formation.captureEvent.elapsed / CAPTURE_DURATION;
        if (formation.capture.progress >= 1) formation.capture = undefined;
      }
      if (formation.resolvedCombat) {
        const event = formation.resolvedCombat;
        formation.position.copy(this.point(event.position.x, event.position.y));
        formation.angle = Math.atan2(
          event.target.x - event.position.x,
          event.target.y - event.position.y,
        );
        // Show the actual exchange before the victory flag, without holding
        // back the authoritative simulation or creating extra divisions.
        formation.capture = undefined;
      } else {
        if (
          !formation.capture &&
          formation.captureEvent &&
          formation.captureEvent.elapsed < CAPTURE_DURATION
        )
          formation.capture = {
            key: formation.captureEvent.key,
            progress: formation.captureEvent.elapsed / CAPTURE_DURATION,
          };
        const blend =
          this.props.paused || this.reduced
            ? 1
            : Math.min(
                1,
                (now - (formation.resumeAt ?? this.updateAt)) /
                  this.movementBlendDuration,
              );
        formation.position.lerpVectors(formation.from, formation.target, blend);
      }
      const combatStatus = formation.resolvedCombat
        ? "recent"
        : formation.combat
          ? "active"
          : "none";
      if (formation.overlay.element.dataset.combat !== combatStatus)
        formation.overlay.element.dataset.combat = combatStatus;
      formation.position.y =
        this.surfaceHeightAt(
          formation.position.x + HALF_X,
          formation.position.z + HALF_Z,
        ) + 0.12;
      formation.overlay.position.copy(formation.position).y +=
        UNIT_LABEL_HEIGHT;
      if (
        this.unitFrustum.intersectsSphere(
          this.unitBounds.set(formation.position, UNIT_LABEL_HEIGHT * 2.5),
        )
      )
        this.visibleUnits.push(formation);
    }
    this.units.update(this.visibleUnits, now, {
      quality: this.quality,
      paused: !!this.props.paused,
      reduced: this.reduced,
      distance: this.camera.position.distanceTo(this.controls.target),
    });
  }
  focusProvince(id: string, distance = 220) {
    const p = GEOGRAPHY[id];
    if (!p) return;
    const target = this.point(p.x, p.y);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(this.viewOffset(distance));
    this.controls.update();
    this.markDirty();
  }
  focusArmies() {
    const a = this.props.world.armies.find((a) =>
      this.props.armyIds.includes(a.id),
    );
    if (a) this.focusProvince(a.province);
  }
  reset() {
    this.controls.target.set(0, 0, 0);
    const distance = this.width / this.height < 0.8 ? 1550 : 1100;
    this.camera.position.copy(this.viewOffset(distance));
    this.controls.update();
    this.markDirty();
  }
  private viewOffset(distance: number) {
    return (
      this.viewpoint === "strategic"
        ? new THREE.Vector3(0, 0.98, 0.22)
        : new THREE.Vector3(0, 0.82, 0.68)
    )
      .normalize()
      .multiplyScalar(distance);
  }
  setViewpoint(viewpoint: MapViewpoint) {
    if (this.disposed) return;
    this.viewpoint = viewpoint;
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.camera.position
      .copy(this.controls.target)
      .add(this.viewOffset(distance));
    this.canvas.dataset.viewpoint = viewpoint;
    this.controls.update();
    this.markDirty();
  }
  zoom(factor: number) {
    VEC.copy(this.camera.position)
      .sub(this.controls.target)
      .multiplyScalar(factor);
    VEC.clampLength(this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(VEC);
    this.controls.update();
    this.markDirty();
  }
  private hit(clientX: number, clientY: number) {
    const box = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - box.left) / box.width) * 2 - 1,
      (-(clientY - box.top) / box.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.land, false)[0];
    return hit?.faceIndex != null
      ? this.terrain.faceProvinceIds[hit.faceIndex]
      : null;
  }
  private pointerDown = ((event: PointerEvent) => {
    if (event.button !== 0) return;
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) {
      this.multiTouch = true;
      this.pointerCancel();
      return;
    }
    this.pointerDragged = false;
    this.canvas.focus({ preventScroll: true });
    this.down = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
    if (event.shiftKey) {
      this.draggingBox = true;
      this.controls.enabled = false;
      this.selectionBox = document.createElement("div");
      this.selectionBox.className = "map3d-selection-box";
      this.labels.appendChild(this.selectionBox);
      this.canvas.setPointerCapture(event.pointerId);
    }
  }) as EventListener;
  private pointerMove = ((event: PointerEvent) => {
    if (
      this.activePointers.has(event.pointerId) &&
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 5
    )
      this.pointerDragged = true;
    if (!this.draggingBox || !this.selectionBox) return;
    const box = this.canvas.getBoundingClientRect();
    Object.assign(this.selectionBox.style, {
      left: `${Math.min(this.down.x, event.clientX) - box.left}px`,
      top: `${Math.min(this.down.y, event.clientY) - box.top}px`,
      width: `${Math.abs(this.down.x - event.clientX)}px`,
      height: `${Math.abs(this.down.y - event.clientY)}px`,
    });
  }) as EventListener;
  private pointerCancel = (event?: Event) => {
    if (event instanceof PointerEvent) {
      this.activePointers.delete(event.pointerId);
      if (!this.activePointers.size) this.multiTouch = false;
    }
    this.draggingBox = false;
    if (this.controls) this.controls.enabled = true;
    this.selectionBox?.remove();
    this.selectionBox = null;
  };
  private pointerUp = ((event: PointerEvent) => {
    if (event.button !== 0) return;
    const tracked = this.activePointers.delete(event.pointerId);
    const wasMultiTouch = this.multiTouch;
    if (!this.activePointers.size) this.multiTouch = false;
    if (!tracked || wasMultiTouch) {
      this.pointerCancel();
      return;
    }
    const distance = Math.hypot(
      event.clientX - this.down.x,
      event.clientY - this.down.y,
    );
    if (this.draggingBox && distance > 5) {
      const box = this.canvas.getBoundingClientRect();
      const left = Math.min(this.down.x, event.clientX) - box.left,
        right = Math.max(this.down.x, event.clientX) - box.left,
        top = Math.min(this.down.y, event.clientY) - box.top,
        bottom = Math.max(this.down.y, event.clientY) - box.top;
      const ids: string[] = [];
      for (const formation of this.formations) {
        const p = formation.position.clone().project(this.camera),
          x = ((p.x + 1) * this.width) / 2,
          y = ((-p.y + 1) * this.height) / 2;
        if (x >= left && x <= right && y >= top && y <= bottom)
          ids.push(
            ...formation.armies
              .filter((a) => a.country === this.props.world.player)
              .map((a) => a.id),
          );
      }
      this.props.onArmies(ids, true);
      this.pointerCancel();
      return;
    }
    this.pointerCancel();
    if (distance > 5 || this.pointerDragged) return;
    const id = this.hit(event.clientX, event.clientY);
    if (id) this.props.onSelect(id, event.shiftKey);
  }) as EventListener;
  private contextMenu = ((event: MouseEvent) => {
    event.preventDefault();
    const id = this.hit(event.clientX, event.clientY);
    if (id) this.props.onOrder?.(id);
  }) as EventListener;
  private keyDown = ((event: KeyboardEvent) => {
    const k = event.key.toLowerCase();
    if (k === "home") {
      event.preventDefault();
      this.reset();
      return;
    }
    if (k === "+" || k === "=") {
      event.preventDefault();
      this.zoom(0.8);
      return;
    }
    if (k === "-") {
      event.preventDefault();
      this.zoom(1.25);
      return;
    }
    const directions: Record<string, [number, number]> = {
      w: [0, -1],
      arrowup: [0, -1],
      s: [0, 1],
      arrowdown: [0, 1],
      a: [-1, 0],
      arrowleft: [-1, 0],
      d: [1, 0],
      arrowright: [1, 0],
    };
    const move = directions[k];
    if (move) {
      event.preventDefault();
      const size =
        this.camera.position.distanceTo(this.controls.target) * 0.035;
      const offset = new THREE.Vector3(move[0] * size, 0, move[1] * size);
      this.controls.target.add(offset);
      this.camera.position.add(offset);
      this.controls.update();
      this.markDirty();
    }
  }) as EventListener;
  private schedule() {
    if (this.disposed || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(this.draw);
  }
  private draw = (now: number) => {
    this.frame = 0;
    if (this.disposed || document.hidden) return;
    const interval = 1000 / GRAPHICS_QUALITY[this.quality].fps;
    if (now - this.lastFrame < interval) {
      this.schedule();
      return;
    }
    this.controls.update();
    const animated =
      !this.reduced &&
      (!this.props.paused ||
        this.quality !== "low" ||
        this.railways.stats.trains > 0);
    if (this.dirty || animated) {
      this.lastFrame = now;
      this.dirty = false;
      this.controls.target.x = THREE.MathUtils.clamp(
        this.controls.target.x,
        -HALF_X,
        HALF_X,
      );
      this.controls.target.z = THREE.MathUtils.clamp(
        this.controls.target.z,
        -HALF_Z,
        HALF_Z,
      );
      this.sea.material.uniforms.time.value = this.reduced ? 0 : now / 1000;
      for (let i = 0; i < this.battleRings.length; i++)
        this.battleRings[i].material.opacity =
          this.reduced || this.props.paused
            ? 0.75
            : 0.55 + Math.sin(now * 0.004 + i) * 0.2;
      this.scenery.updateLOD(
        this.camera.position.distanceTo(this.controls.target),
      );
      this.cityLights.updateView(
        this.camera.position.distanceTo(this.controls.target),
      );
      this.canvas.dataset.nightCityLights = JSON.stringify(
        this.cityLights.stats(),
      );
      this.updateUnitMatrices(now);
      this.railways.animate(now / 1000, {
        paused: !!this.props.paused,
        reduced: this.reduced,
        distance: this.camera.position.distanceTo(this.controls.target),
        focus: this.controls.target,
      });
      this.airNaval.animate(now, {
        paused: !!this.props.paused,
        reduced: this.reduced,
        quality: this.quality,
        camera: this.camera,
      });
      const theater = this.airNaval.stats();
      this.canvas.dataset.aircraftModels = String(theater.aircraft);
      this.canvas.dataset.shipModels = String(theater.ships);
      this.canvas.dataset.movingAircraft = String(theater.movingAircraft);
      this.canvas.dataset.movingShips = String(theater.movingShips);
      this.canvas.dataset.airCombats = String(theater.airCombats);
      this.canvas.dataset.navalCombats = String(theater.navalCombats);
      this.canvas.dataset.bombingRuns = String(theater.bombingRuns);
      this.canvas.dataset.theaterEffects = String(theater.effects);
      this.canvas.dataset.theaterConfirmedEvents = String(
        theater.confirmedEvents,
      );
      this.canvas.dataset.theaterPositions = JSON.stringify(theater.positions);
      this.canvas.dataset.theaterAnimationTime = String(theater.animationTime);
      this.renderer.render(this.scene, this.camera);
      this.drawCountryLabels();
      this.canvas.dataset.politicalBorderStats = JSON.stringify(
        this.politicalBorders.stats,
      );
      this.canvas.dataset.renderedFrames = String(++this.renderedFrames);
      this.frameCount++;
      for (const item of this.overlays) {
        VEC.copy(item.position).project(this.camera);
        const x = ((VEC.x + 1) * this.width) / 2,
          y = ((-VEC.y + 1) * this.height) / 2;
        const visible =
          VEC.z > -1 &&
          VEC.z < 1 &&
          x > -80 &&
          x < this.width + 80 &&
          y > -30 &&
          y < this.height + 30;
        item.element.style.display = visible ? "" : "none";
        if (visible)
          item.element.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
      }
      this.canvas.dataset.ready = "true";
      this.canvas.dataset.railEdges = String(this.railways.stats.edges);
      this.canvas.dataset.railProvinces = JSON.stringify(
        this.railways.stats.provinces,
      );
      this.canvas.dataset.trainCount = String(this.railways.stats.trains);
      this.canvas.dataset.trainCountries = JSON.stringify(
        this.railways.stats.countries,
      );
      this.canvas.dataset.trainPositions = JSON.stringify(
        this.railways.stats.positions,
      );
      this.canvas.dataset.unitInstances = String(this.units.stats.instances);
      this.canvas.dataset.infantryModels = String(this.units.stats.infantry);
      this.canvas.dataset.vehicleModels = String(this.units.stats.vehicles);
      this.canvas.dataset.tankModels = String(this.units.stats.tanks);
      this.canvas.dataset.artilleryModels = String(this.units.stats.artillery);
      this.canvas.dataset.truckModels = String(this.units.stats.trucks);
      this.canvas.dataset.combatFormations = String(
        this.units.stats.combatFormations,
      );
      this.canvas.dataset.animations = this.reduced ? "reduced" : "full";
      this.canvas.dataset.recentCombats = String(
        this.visibleUnits.filter((formation) => formation.resolvedCombat)
          .length,
      );
      this.canvas.dataset.infantryTracers = String(
        this.units.stats.infantryTracers,
      );
      this.canvas.dataset.tankShells = String(this.units.stats.tankShells);
      this.canvas.dataset.muzzleFlashes = String(
        this.units.stats.muzzleFlashes,
      );
      this.canvas.dataset.shells = String(this.units.stats.shells);
      this.canvas.dataset.impacts = String(this.units.stats.impacts);
      this.canvas.dataset.unitGlows = String(this.units.stats.glows);
      this.canvas.dataset.unitGroundGlows = String(
        this.units.stats.groundGlows,
      );
      this.canvas.dataset.unitDynamicLights = String(
        this.units.stats.dynamicLights,
      );
      this.canvas.dataset.unitHeadlights = String(this.units.stats.headlights);
      this.canvas.dataset.captures = String(this.units.stats.captures);
      this.canvas.dataset.modelDetail = String(this.units.stats.detail);
      this.canvas.dataset.cameraDistance = this.camera.position
        .distanceTo(this.controls.target)
        .toFixed(3);
      this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
      this.canvas.dataset.triangles = String(
        this.renderer.info.render.triangles,
      );
      // animate() may have hidden distant trains during this draw. Publish
      // the settled state before an on-demand renderer stops scheduling.
      const continuous =
        !this.reduced &&
        (!this.props.paused ||
          this.quality !== "low" ||
          this.railways.stats.trains > 0);
      if (now - this.lastStats > 1000 || continuous !== this.lastContinuous) {
        const elapsed = this.lastStats ? now - this.lastStats : 1000;
        const metric = {
          continuous,
          fps: Math.round((this.frameCount * 1000) / elapsed),
          calls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          geometries: this.renderer.info.memory.geometries,
          textures: this.renderer.info.memory.textures,
        };
        this.metrics(metric);
        this.lastStats = now;
        this.lastContinuous = continuous;
        this.frameCount = 0;
      }
    }
    // Ambient trains keep paused campaigns alive; Low without visible trains
    // and reduced-motion scenes still settle to drawing only on demand.
    if (animated || this.dirty) this.schedule();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.unsubscribers.forEach((f) => f());
    this.controls?.removeEventListener("change", this.markDirty);
    this.controls?.dispose();
    this.clearMarkers();
    this.countryLabels.forEach(({ element }) => element.remove());
    this.countryLabels = [];
    this.captureEvents.length = 0;
    this.resolvedCombats.length = 0;
    this.pointerCancel();
    this.units?.dispose();
    this.railways?.dispose();
    this.airNaval?.dispose();
    this.scenery?.dispose();
    this.cityLights?.dispose();
    this.politicalBorders?.dispose();
    this.cartography?.dispose();
    this.terrain?.dispose();
    this.terrainMaterial?.dispose();
    this.coastMaterial.dispose();
    this.borderMaterial?.dispose();
    this.noise?.dispose();
    this.sea?.geometry.dispose();
    this.sea?.material.dispose();
    this.movementArrows?.dispose();
    if (this.selection) {
      this.selection.geometry.dispose();
      (this.selection.material as THREE.Material).dispose();
    }
    this.sun.shadow.map?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    delete this.canvas.dataset.ready;
  }
}
