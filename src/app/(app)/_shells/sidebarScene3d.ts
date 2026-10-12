// Three.js "sales city" for the sidebar: rounded teal towers that rise and fall
// like live sales, a growth arrow that draws itself through them, ₹ coins in
// orbit and floating particles. Solid colours only — depth comes from lighting
// and flat-shaded faces, never from gradient fills.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const TEAL = ["#0F766E", "#14897C", "#1BA394", "#2DD4BF"];
const AMBER = "#F59E0B";

export function startSidebarScene(host: HTMLElement, opts: { animate: boolean }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // ── Lights ──
  scene.add(new THREE.HemisphereLight("#d9fffa", "#06302c", 1.1));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(4, 9, 6);
  scene.add(sun);
  const glow = new THREE.PointLight("#2DD4BF", 6, 9, 2);
  glow.position.set(0, 2.2, 0);
  scene.add(glow);

  const world = new THREE.Group();
  scene.add(world);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ── Platform ──
  const platform = new THREE.Mesh(
    track(new RoundedBoxGeometry(4.4, 0.24, 4.4, 4, 0.12)),
    track(new THREE.MeshStandardMaterial({ color: "#0E4F49", roughness: 0.7, metalness: 0.1, flatShading: true })),
  );
  platform.position.y = -0.12;
  world.add(platform);
  const grid = new THREE.GridHelper(4.0, 8, "#2DD4BF", "#1B6B63");
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = 0.005;
  track(grid.geometry);
  track(grid.material as THREE.Material);
  world.add(grid);

  // ── Towers (4 × 4) ──
  const towerGeo = track(new RoundedBoxGeometry(0.62, 1, 0.62, 3, 0.08));
  towerGeo.translate(0, 0.5, 0); // scale from the floor up
  const towerMats = TEAL.map((c) =>
    track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15, flatShading: true })),
  );
  type Tower = { mesh: THREE.Mesh; base: number; amp: number; speed: number; phase: number };
  const towers: Tower[] = [];
  for (let ix = 0; ix < 4; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      // Taller towards the back-right corner: a "growing" skyline.
      const trend = 0.45 + (ix + (3 - iz)) * 0.28;
      const mesh = new THREE.Mesh(towerGeo, towerMats[Math.min(3, Math.floor(trend / 0.6))]!);
      mesh.position.set(-1.5 + ix, 0, -1.5 + iz);
      world.add(mesh);
      towers.push({
        mesh,
        base: trend,
        amp: 0.18 + Math.random() * 0.22,
        speed: 0.7 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ── Growth arrow: a tube along a rising curve + a cone head ──
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.0, 0.6, 1.6),
    new THREE.Vector3(-0.9, 1.2, 0.5),
    new THREE.Vector3(0.1, 1.6, -0.2),
    new THREE.Vector3(0.9, 2.5, -0.9),
    new THREE.Vector3(1.7, 3.3, -1.7),
  ]);
  const tubeGeo = track(new THREE.TubeGeometry(curve, 120, 0.07, 10, false));
  const arrowMat = track(
    new THREE.MeshStandardMaterial({ color: "#5EEAD4", emissive: "#2DD4BF", emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  const tube = new THREE.Mesh(tubeGeo, arrowMat);
  world.add(tube);
  const tubeIndexCount = tubeGeo.index!.count;
  const head = new THREE.Mesh(track(new THREE.ConeGeometry(0.2, 0.42, 16)), arrowMat);
  world.add(head);
  const up = new THREE.Vector3(0, 1, 0);

  // ── ₹ coins in orbit ──
  const coinGeo = track(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32));
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = track(new THREE.MeshStandardMaterial({ color: AMBER, roughness: 0.3, metalness: 0.6 }));
  const coins = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(coinGeo, coinMat);
    world.add(m);
    return { mesh: m, offset: (i * Math.PI * 2) / 3, y: 1.1 + i * 0.55 };
  });

  // ── Floating particles ──
  const P = 140;
  const pos = new Float32Array(P * 3);
  const speed = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 5;
    pos[i * 3 + 1] = Math.random() * 4;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
    speed[i] = 0.15 + Math.random() * 0.35;
  }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    pGeo,
    track(new THREE.PointsMaterial({ color: "#5EEAD4", size: 0.05, transparent: true, opacity: 0.8, depthWrite: false })),
  );
  world.add(points);

  // ── Sizing ──
  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    // Fit the whole scene (platform + coin orbit, radius ≈ 3.4) inside the
    // narrower of the two field-of-view angles.
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = 3.4 / Math.sin(Math.min(vHalf, hHalf)) + 1;
    const dir = new THREE.Vector3(0.62, 0.5, 0.62).normalize();
    camera.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 1.3, 0));
    camera.lookAt(0, 1.3, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ── Pointer parallax (whole sidebar) ──
  const target = { x: 0, y: 0 };
  const aside = host.closest("aside") ?? host;
  const onMove = (e: PointerEvent) => {
    const r = aside.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  const onLeave = () => {
    target.x = 0;
    target.y = 0;
  };
  aside.addEventListener("pointermove", onMove as EventListener);
  aside.addEventListener("pointerleave", onLeave);

  // ── Frame ──
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let raf = 0;
  let running = true;

  function frame(t: number) {
    for (const tw of towers) {
      const h = Math.max(0.25, tw.base + Math.sin(t * tw.speed + tw.phase) * tw.amp);
      tw.mesh.scale.y = h;
    }
    // Arrow draws itself over 3 s, holds, then restarts.
    const cycle = (t % 5) / 3;
    const progress = Math.min(1, cycle);
    tube.geometry.setDrawRange(0, Math.floor((tubeIndexCount * progress) / 3) * 3);
    curve.getPointAt(Math.max(0.001, progress), head.position);
    curve.getTangentAt(Math.max(0.001, progress), tmp);
    head.quaternion.setFromUnitVectors(up, tmp.normalize());
    head.visible = progress > 0.02;

    coins.forEach((c, i) => {
      const a = t * 0.6 + c.offset;
      c.mesh.position.set(Math.cos(a) * 2.7, c.y + Math.sin(t * 1.4 + i) * 0.15, Math.sin(a) * 2.7);
      c.mesh.rotation.y = t * 2.2 + i;
    });

    const arr = pGeo.attributes.position!.array as Float32Array;
    for (let i = 0; i < P; i++) {
      arr[i * 3 + 1]! += speed[i]! * 0.016;
      if (arr[i * 3 + 1]! > 4.2) arr[i * 3 + 1] = 0;
    }
    pGeo.attributes.position!.needsUpdate = true;

    // Slow turntable + pointer tilt.
    world.rotation.y += (t * 0.18 + target.x * 0.5 - world.rotation.y) * 0.05;
    world.rotation.x += (target.y * 0.12 - world.rotation.x) * 0.05;
    glow.intensity = 5 + Math.sin(t * 2) * 1.5;

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    frame(clock.getElapsedTime());
    raf = requestAnimationFrame(loop);
  }

  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
      clock.stop();
    } else if (opts.animate && !running) {
      running = true;
      clock.start();
      loop();
    }
  };

  if (opts.animate) {
    loop();
    document.addEventListener("visibilitychange", onVisibility);
  } else {
    running = false;
    frame(2.2); // one still, nicely-posed frame for reduced-motion users
  }

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVisibility);
    aside.removeEventListener("pointermove", onMove as EventListener);
    aside.removeEventListener("pointerleave", onLeave);
    ro.disconnect();
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
