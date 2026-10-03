import { useEffect, useRef, useState } from "react";

// Visualizador GLB real: three.js carregado dinamicamente (somente no navegador).
// O GLB é carregado direto da URL do servidor com os cabeçalhos de autenticação.
export function MeshViewer({ url, token }: { url: string; token: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = ref.current;
      if (disposed || !el) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.01, 1000);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334444, 1.6));
      const dir = new THREE.DirectionalLight(0xffffff, 1.8);
      dir.position.set(3, 5, 4);
      scene.add(dir);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const loader = new GLTFLoader();
      loader.setRequestHeader({
        "X-API-Token": token,
        "ngrok-skip-browser-warning": "1",
      });
      loader.load(
        url,
        (gltf) => {
          if (disposed) return;
          const obj = gltf.scene;
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3()).length() || 1;
          const center = box.getCenter(new THREE.Vector3());
          obj.position.sub(center);
          scene.add(obj);
          camera.position.set(0, size * 0.3, size * 1.2);
          controls.target.set(0, 0, 0);
          loop();
        },
        undefined,
        () => setErr("Não foi possível carregar o GLB do servidor."),
      );
      const ro = new ResizeObserver(() => {
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        scene.traverse((o) => {
          const m = o as import("three").Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          mats.forEach((x) => x.dispose());
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setErr("Falha ao iniciar o visualizador 3D (WebGL)."));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [url, token]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="viewer-surface h-full w-full" aria-label="Visualizador 3D da malha" />
      {err && <p className="absolute inset-x-0 bottom-3 text-center text-sm text-destructive">{err}</p>}
    </div>
  );
}
