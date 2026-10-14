// Small 3D "icon" scenes (coin, parcel, hourglass, growth monitor) that share
// ONE WebGL renderer. Each view owns a 2D canvas; every frame we render the
// view's scene into the shared WebGL canvas and copy it across. One GL context
// for any number of icons, so the dashboard stays light.
// Flat colours only — depth comes from lighting, never gradient fills.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type Mini3DKind = "coin" | "parcel" | "hourglass" | "growth";

type Built = { scene: THREE.Scene; camera: THREE.PerspectiveCamera; update(t: number): void; dispose(): void };
type View = Built & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; visible: boolean; io: IntersectionObserver };

let renderer: THREE.WebGLRenderer | null = null;
const views = new Set<View>();
let raf = 0;
const clock = new THREE.Clock();
let animate = true;

function ensureRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

function drawView(v: View, t: number) {
  const r = ensureRenderer();
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = Math.max(1, Math.round(v.canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(v.canvas.clientHeight * dpr));
  if (v.canvas.width !== w || v.canvas.height !== h) {
    v.canvas.width = w;
    v.canvas.height = h;
  }
  const size = r.getSize(new THREE.Vector2());
  if (size.x < w || size.y < h) r.setSize(Math.max(size.x, w), Math.max(size.y, h), false);
  const full = r.getSize(new THREE.Vector2());
  v.camera.aspect = w / h;
  v.camera.updateProjectionMatrix();
  v.update(t);
  r.setViewport(0, 0, w, h);
  r.setScissor(0, 0, w, h);
  r.setScissorTest(true);
  r.clear();
  r.render(v.scene, v.camera);
  v.ctx.clearRect(0, 0, w, h);
  // WebGL's origin is bottom-left: the view occupies the bottom w×h of the canvas.
  v.ctx.drawImage(r.domElement, 0, full.y - h, w, h, 0, 0, w, h);
}

function loop() {
  const t = clock.getElapsedTime();
  for (const v of views) if (v.visible) drawView(v, t);
  raf = requestAnimationFrame(loop);
}

function syncLoop() {
  const shouldRun = animate && !document.hidden && views.size > 0;
  if (shouldRun && !raf) {
    clock.start();
    raf = requestAnimationFrame(loop);
  } else if (!shouldRun && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
    clock.stop();
  }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncLoop);

export function mountMini3D(canvas: HTMLCanvasElement, kind: Mini3DKind, opts: { animate: boolean }) {
  animate = opts.animate;
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const built = BUILDERS[kind]();
  const io = new IntersectionObserver(([e]) => {
    view.visible = Boolean(e?.isIntersecting);
  });
  const view: View = { ...built, canvas, ctx, visible: true, io };
  io.observe(canvas);
  views.add(view);
  if (animate) syncLoop();
  else drawView(view, 2.4); // one still frame for reduced-motion users
  return () => {
    io.disconnect();
    views.delete(view);
    built.dispose();
    syncLoop();
    if (views.size === 0 && renderer) {
      renderer.dispose();
      renderer = null;
    }
  };
}

// ───────────────────────── scene helpers ─────────────────────────

function baseScene(fov = 30, camPos: [number, number, number] = [0, 0.6, 6]) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);
  camera.position.set(...camPos);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight("#ffffff", "#0D110C", 1.2));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#C8E3BD", 1.2);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const trash: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (trash.push(x), x);
  const dispose = () => trash.forEach((d) => d.dispose());
  return { scene, camera, track, dispose };
}

/** A face texture with a centred glyph (e.g. ₹) on a solid disc. */
function glyphTexture(glyph: string, bg: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = fg;
  g.font = "bold 150px Poppins, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(glyph, 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ───────────────────────── scenes ─────────────────────────

const BUILDERS: Record<Mini3DKind, () => Built> = {
  // Spinning gold ₹ coin hovering over a short coin stack.
  coin() {
    const { scene, camera, track, dispose } = baseScene(30, [0, 1.1, 6.2]);
    const gold = track(new THREE.MeshStandardMaterial({ color: "#F2B233", metalness: 0.75, roughness: 0.3 }));
    const goldDark = track(new THREE.MeshStandardMaterial({ color: "#D98E04", metalness: 0.75, roughness: 0.35 }));
    const face = track(glyphTexture("₹", "#F2B233", "#9A5B00"));
    const faceMat = track(new THREE.MeshStandardMaterial({ map: face, metalness: 0.6, roughness: 0.35 }));
    const coinGeo = track(new THREE.CylinderGeometry(1, 1, 0.22, 64));
    const coin = new THREE.Mesh(coinGeo, [goldDark, faceMat, faceMat]);
    coin.rotation.x = Math.PI / 2;
    const hero = new THREE.Group();
    hero.add(coin);
    hero.position.set(0.35, 0.55, 0);
    scene.add(hero);
    const stackGeo = track(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 48));
    const stack = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(stackGeo, i % 2 ? gold : goldDark);
      m.position.set((i % 2) * 0.05, i * 0.17, 0);
      stack.add(m);
    }
    stack.position.set(-0.9, -1.05, 0.3);
    scene.add(stack);
    return {
      scene,
      camera,
      dispose,
      update(t) {
        hero.rotation.y = t * 1.6;
        hero.position.y = 0.55 + Math.sin(t * 1.8) * 0.12;
        stack.rotation.y = Math.sin(t * 0.6) * 0.4;
      },
    };
  },

  // Teal parcel with flaps and a green check badge, slowly turning.
  parcel() {
    const { scene, camera, track, dispose } = baseScene(30, [0, 1.6, 6.4]);
    const boxMat = track(new THREE.MeshStandardMaterial({ color: "#7AB567", roughness: 0.6, flatShading: true }));
    const flapMat = track(new THREE.MeshStandardMaterial({ color: "#A9D49A", roughness: 0.6, flatShading: true }));
    const tapeMat = track(new THREE.MeshStandardMaterial({ color: "#F1F6EE", roughness: 0.5 }));
    const g = new THREE.Group();
    const body = new THREE.Mesh(track(new RoundedBoxGeometry(1.8, 1.4, 1.8, 3, 0.06)), boxMat);
    g.add(body);
    const tape = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 1.42, 1.82)), tapeMat);
    g.add(tape);
    const flapGeo = track(new THREE.BoxGeometry(1.8, 0.05, 0.9));
    const flapA = new THREE.Mesh(flapGeo, flapMat);
    const flapB = new THREE.Mesh(flapGeo, flapMat);
    const hingeA = new THREE.Group();
    const hingeB = new THREE.Group();
    hingeA.position.set(0, 0.7, -0.9);
    hingeB.position.set(0, 0.7, 0.9);
    flapA.position.z = 0.45;
    flapB.position.z = -0.45;
    hingeA.add(flapA);
    hingeB.add(flapB);
    g.add(hingeA, hingeB);
    const badge = new THREE.Mesh(
      track(new THREE.CircleGeometry(0.46, 48)),
      track(new THREE.MeshBasicMaterial({ map: track(glyphTexture("✓", "#406E32", "#FFFFFF")) })),
    );
    badge.position.set(0.55, 0.15, 0.93);
    g.add(badge);
    g.rotation.x = 0.15;
    scene.add(g);
    return {
      scene,
      camera,
      dispose,
      update(t) {
        g.rotation.y = -0.6 + Math.sin(t * 0.7) * 0.5;
        g.position.y = Math.sin(t * 1.5) * 0.08;
        // Flaps close, hold, open — a parcel being "completed".
        const k = (Math.sin(t * 1.2) + 1) / 2;
        hingeA.rotation.x = -0.15 - k * 1.1;
        hingeB.rotation.x = 0.15 + k * 1.1;
        badge.scale.setScalar(0.9 + (1 - k) * 0.15);
      },
    };
  },

  // Glass hourglass: sand drains top → bottom, then the whole thing flips.
  hourglass() {
    const { scene, camera, track, dispose } = baseScene(30, [0, 0.3, 6.4]);
    const frameMat = track(new THREE.MeshStandardMaterial({ color: "#B3141C", roughness: 0.5, metalness: 0.2 }));
    const glassMat = track(
      new THREE.MeshStandardMaterial({ color: "#FBE4E5", transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }),
    );
    const sandMat = track(new THREE.MeshStandardMaterial({ color: "#E5484D", roughness: 0.8, flatShading: true }));
    const g = new THREE.Group();
    const capGeo = track(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 40));
    const capTop = new THREE.Mesh(capGeo, frameMat);
    const capBot = new THREE.Mesh(capGeo, frameMat);
    capTop.position.y = 1.32;
    capBot.position.y = -1.32;
    g.add(capTop, capBot);
    const postGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 12));
    for (const [x, z] of [[0.75, 0], [-0.38, 0.65], [-0.38, -0.65]] as const) {
      const p = new THREE.Mesh(postGeo, frameMat);
      p.position.set(x, 0, z);
      g.add(p);
    }
    const profile = [
      [0.05, -1.22], [0.62, -1.18], [0.66, -0.9], [0.4, -0.35], [0.1, 0], [0.4, 0.35], [0.66, 0.9], [0.62, 1.18], [0.05, 1.22],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(track(new THREE.LatheGeometry(profile, 40)), glassMat));
    const topSand = new THREE.Mesh(track(new THREE.ConeGeometry(0.52, 0.8, 32)), sandMat);
    topSand.rotation.x = Math.PI; // point down toward the neck
    const topPivot = new THREE.Group();
    topPivot.position.y = 0.12;
    topSand.position.y = 0.4;
    topPivot.add(topSand);
    const botSand = new THREE.Mesh(track(new THREE.ConeGeometry(0.58, 0.8, 32)), sandMat);
    const botPivot = new THREE.Group();
    botPivot.position.y = -1.14;
    botSand.position.y = 0.4;
    botPivot.add(botSand);
    const stream = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8)), sandMat);
    stream.position.y = -0.55;
    g.add(topPivot, botPivot, stream);
    g.rotation.z = 0.12;
    scene.add(g);
    const PERIOD = 6; // 5 s drain + 1 s flip
    return {
      scene,
      camera,
      dispose,
      update(t) {
        const cycle = t % PERIOD;
        const drain = Math.min(1, cycle / 5);
        topPivot.scale.setScalar(Math.max(0.02, 1 - drain));
        botPivot.scale.setScalar(Math.max(0.02, drain));
        stream.visible = drain < 0.98;
        const flip = cycle > 5 ? (cycle - 5) * Math.PI : 0;
        g.rotation.z = 0.12 + flip;
        g.rotation.y = Math.sin(t * 0.5) * 0.4;
      },
    };
  },

  // A tilted monitor showing bars that grow and a rising arrow.
  growth() {
    const { scene, camera, track, dispose } = baseScene(28, [0, 0.4, 7]);
    const caseMat = track(new THREE.MeshStandardMaterial({ color: "#24401C", roughness: 0.4, metalness: 0.2 }));
    const screenMat = track(new THREE.MeshStandardMaterial({ color: "#16260F", roughness: 0.6 }));
    const barMat = track(new THREE.MeshStandardMaterial({ color: "#7AB567", emissive: "#406E32", emissiveIntensity: 0.4, roughness: 0.4 }));
    const arrowMat = track(new THREE.MeshStandardMaterial({ color: "#FF8A8F", emissive: "#D7262E", emissiveIntensity: 0.8 }));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(track(new RoundedBoxGeometry(3.4, 2.3, 0.35, 4, 0.14)), caseMat));
    const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(3.0, 1.9)), screenMat);
    screen.position.z = 0.181;
    g.add(screen);
    const barGeo = track(new RoundedBoxGeometry(0.42, 1, 0.16, 2, 0.05));
    barGeo.translate(0, 0.5, 0);
    const bars = [0, 1, 2, 3].map((i) => {
      const m = new THREE.Mesh(barGeo, barMat);
      m.position.set(-1.05 + i * 0.62, -0.85, 0.27);
      g.add(m);
      return m;
    });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.25, -0.45, 0.42),
      new THREE.Vector3(-0.35, -0.1, 0.42),
      new THREE.Vector3(0.25, -0.25, 0.42),
      new THREE.Vector3(1.15, 0.65, 0.42),
    ]);
    const tubeGeo = track(new THREE.TubeGeometry(curve, 80, 0.055, 8, false));
    const tube = new THREE.Mesh(tubeGeo, arrowMat);
    g.add(tube);
    const head = new THREE.Mesh(track(new THREE.ConeGeometry(0.15, 0.32, 16)), arrowMat);
    g.add(head);
    const stand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16)), caseMat);
    stand.position.set(0, -1.4, -0.05);
    const foot = new THREE.Mesh(track(new RoundedBoxGeometry(1.4, 0.12, 0.7, 2, 0.05)), caseMat);
    foot.position.set(0, -1.72, -0.05);
    g.add(stand, foot);
    g.rotation.set(-0.08, -0.35, 0);
    scene.add(g);
    const up = new THREE.Vector3(0, 1, 0);
    const tan = new THREE.Vector3();
    const indexCount = tubeGeo.index!.count;
    return {
      scene,
      camera,
      dispose,
      update(t) {
        bars.forEach((b, i) => {
          b.scale.y = 0.35 + (i + 1) * 0.28 + Math.sin(t * 1.6 + i * 0.9) * 0.12;
        });
        const p = Math.min(1, (t % 4.5) / 2.5);
        tube.geometry.setDrawRange(0, Math.floor((indexCount * p) / 3) * 3);
        curve.getPointAt(Math.max(0.001, p), head.position);
        curve.getTangentAt(Math.max(0.001, p), tan);
        head.quaternion.setFromUnitVectors(up, tan.normalize());
        head.visible = p > 0.03;
        g.rotation.y = -0.35 + Math.sin(t * 0.6) * 0.25;
        g.position.y = Math.sin(t * 1.2) * 0.06;
      },
    };
  },
};
