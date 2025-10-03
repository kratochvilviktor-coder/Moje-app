"use client";
import React, { useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, Center, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={`w-full border rounded-xl px-3 py-2 text-sm ${className||""}`} />;
}
function Select({ value, onChange, children, id }: { value: string; onChange: (v: string)=>void; children: React.ReactNode; id?: string }) {
  return <select id={id} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm bg-white">{children}</select>;
}
function Button({ children, onClick, variant="default", className, ...rest }:
  { children: React.ReactNode; onClick?: ()=>void; variant?: "default"|"ghost"|"outline"; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "px-4 py-2 rounded-2xl text-sm font-medium shadow-sm";
  const variants: Record<string,string> = {
    default: "bg-black text-white hover:opacity-90",
    ghost: "bg-white text-black border hover:bg-gray-50",
    outline: "border border-gray-300 bg-white hover:bg-gray-50",
  };
  return <button onClick={onClick} className={`${base} ${variants[variant]} ${className||""}`} {...rest}>{children}</button>;
}
function Row({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-3 items-center gap-2">{children}</div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3 border rounded-2xl p-4 bg-white/80 backdrop-blur">
    <h3 className="text-base font-semibold">{title}</h3>
    {children}
  </div>;
}

const MATERIALS: Record<string, { name: string; color: string; metalness: number; roughness: number; cost: number }> = {
  turquoise_PLA: { name: "PLA – Tyrkys", color: "#00B8B8", metalness: 0.05, roughness: 0.4, cost: 0.18 },
  woodFill:      { name: "PLA – WoodFill", color: "#8B5A2B", metalness: 0.0,  roughness: 0.7, cost: 0.20 },
  aluminum:      { name: "Kov – Alu (efekt)", color: "#B9C2C8", metalness: 1.0,  roughness: 0.25, cost: 0.60 },
  concrete:      { name: "Beton (efekt)", color: "#A6A6A6", metalness: 0.0,  roughness: 0.9, cost: 0.25 },
};

function computeGeometryVolume(geometry: THREE.BufferGeometry) {
  const geom = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geom.computeBoundingBox();
  const bbox = geom.boundingBox!;
  const size = new THREE.Vector3();
  bbox.getSize(size);
  let unitScale = 1.0;
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 10) unitScale = 0.001;
  const pos = (geom.getAttribute("position") as THREE.BufferAttribute).array as unknown as number[];
  let volume_m3 = 0;
  const u = new THREE.Vector3(), v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    u.set(pos[i], pos[i+1], pos[i+2]).multiplyScalar(unitScale);
    v.set(pos[i+3], pos[i+4], pos[i+5]).multiplyScalar(unitScale);
    w.set(pos[i+6], pos[i+7], pos[i+8]).multiplyScalar(unitScale);
    const cross = new THREE.Vector3().crossVectors(v, w);
    const dot = u.dot(cross);
    volume_m3 += dot / 6.0;
  }
  volume_m3 = Math.abs(volume_m3);
  return volume_m3 * 1e6; // cm^3
}

function ConfiguredMesh({ geometry, materialParams, scaleMultiplier }:
  { geometry: THREE.BufferGeometry; materialParams: { color: string; metalness: number; roughness: number }; scaleMultiplier: number; }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: materialParams.color, metalness: materialParams.metalness, roughness: materialParams.roughness,
  }), [materialParams]);
  return <mesh geometry={geometry} scale={[scaleMultiplier, scaleMultiplier, scaleMultiplier]} castShadow receiveShadow>
    {/* @ts-ignore */}
    <primitive object={mat} attach="material" />
  </mesh>;
}

function DefaultGeometry() {
  const geom = useMemo(() => {
    const g = new THREE.TorusKnotGeometry(0.6, 0.24, 400, 80, 2, 3);
    g.computeVertexNormals();
    return g;
  }, []);
  return geom;
}

function useLoadedGeometry(file: File | null) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    if (!file) return;
    const ext = file.name.split('.').pop()!.toLowerCase();
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target!.result as ArrayBuffer;
      if (ext === 'stl') {
        const loader = new STLLoader();
        const geom = loader.parse(arrayBuffer);
        geom.computeVertexNormals();
        setGeometry(geom);
      } else if (ext === 'obj') {
        const text = new TextDecoder().decode(arrayBuffer);
        const loader = new OBJLoader();
        const obj = loader.parse(text);
        let merged: THREE.BufferGeometry | null = null;
        obj.traverse((child: any) => {
          if (child.isMesh && child.geometry) {
            const geo = child.geometry.clone();
            geo.computeVertexNormals();
            merged = geo;
          }
        });
        if (merged) setGeometry(merged);
      } else {
        alert('Podporované formáty: STL, OBJ');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file]);
  return geometry;
}

function Scene({ geometry, materialParams, scaleMultiplier }:
  { geometry: THREE.BufferGeometry | null; materialParams: { color: string; metalness: number; roughness: number }; scaleMultiplier: number; }) {
  const geom = geometry || DefaultGeometry();
  const { gl } = useThree();
  useEffect(()=>{ gl.setClearColor('#f6f7f9'); }, [gl]);
  return <>
    <ambientLight intensity={0.5} />
    <directionalLight position={[5,5,5]} intensity={0.9} castShadow />
    <Bounds fit clip observe margin={1.2}>
      <Center>
        <ConfiguredMesh geometry={geom} materialParams={materialParams} scaleMultiplier={scaleMultiplier} />
      </Center>
    </Bounds>
    <Environment preset="city" />
    <OrbitControls makeDefault enablePan enableRotate enableZoom />
    {/* @ts-ignore */}
    <gridHelper args={[10, 20, '#e5e7eb', '#e5e7eb']} />
  </>;
}

function downloadBlob(data: BlobPart, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportButtons({ meshGeometry, scaleMultiplier }:
  { meshGeometry: THREE.BufferGeometry; scaleMultiplier: number; }) {
  const handleExportGLB = () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const mesh = new THREE.Mesh(meshGeometry, material);
    mesh.scale.setScalar(scaleMultiplier);
    scene.add(mesh);
    const exporter = new GLTFExporter();
    exporter.parse(scene as any, (result: any) => {
      const output = JSON.stringify(result);
      downloadBlob(output, 'tvaryon-config.glb', 'model/gltf+json');
    }, { binary: false });
  };
  const handleSnapshot = () => {
    const el = document.querySelector('#tvaryon-canvas canvas') as HTMLCanvasElement | null;
    if (!el) return;
    el.toBlob((blob) => { if (blob) downloadBlob(blob, 'snapshot.png', 'image/png'); });
  };
  return <div className="flex gap-2">
    <Button variant="outline" onClick={handleExportGLB}>Export GLB</Button>
    <Button variant="ghost" onClick={handleSnapshot}>Snapshot PNG</Button>
  </div>;
}

export default function Page() {
  const [materialKey, setMaterialKey] = useState<string>('turquoise_PLA');
  const [color, setColor] = useState<string>(MATERIALS.turquoise_PLA.color);
  const [roughness, setRoughness] = useState<number>(MATERIALS.turquoise_PLA.roughness);
  const [metalness, setMetalness] = useState<number>(MATERIALS.turquoise_PLA.metalness);
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const materialParams = useMemo(()=>({ color, roughness, metalness }), [color, roughness, metalness]);
  const loadedGeometry = useLoadedGeometry(uploadedFile);
  const baseGeometry = (loadedGeometry || DefaultGeometry());
  const [volume, setVolume] = useState<number | null>(null);

  useEffect(() => {
    try {
      const vol = computeGeometryVolume(baseGeometry as THREE.BufferGeometry);
      setVolume(vol * Math.pow(scaleMultiplier, 3));
    } catch (e) { setVolume(null); }
  }, [loadedGeometry, scaleMultiplier]);

  const activeMat = MATERIALS[materialKey];
  const estimatedCost = useMemo(() => {
    if (!volume) return 0;
    return volume * activeMat.cost;
  }, [volume, activeMat]);

  useEffect(()=>{
    setColor(activeMat.color);
    setRoughness(activeMat.roughness);
    setMetalness(activeMat.metalness);
  }, [materialKey]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-50 text-gray-900">
      <header className="max-w-6xl mx-auto p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="TvaryOn" className="w-8 h-8" />
          <div className="text-xl font-semibold tracking-tight">TvaryOn</div>
        </div>
        <nav className="hidden md:flex gap-6 text-sm">
          <a href="#about" className="hover:opacity-70">O projektu</a>
          <a href="#config" className="hover:opacity-70">Konfigurátor</a>
          <a href="#contact" className="hover:opacity-70">Kontakt</a>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-8 md:py-14">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
              Kde digitální <span className="text-[#00B8B8]">tvar</span> potká materiál
            </h1>
            <p className="text-base md:text-lg text-gray-600">
              TvaryOn propojuje 3D tisk s dřevem, kovem, betonem a dalšími materiály. Vytvoř si vlastní objekt – uprav tvar, barvu i materiál a rovnou ho objednej k tisku.
            </p>
            <div className="flex gap-3">
              <a href="#config"><Button>Spustit konfigurátor</Button></a>
              <Button variant="outline">Zjistit více</Button>
            </div>
          </div>
          <div id="tvaryon-canvas" className="h-[360px] md:h-[420px] rounded-3xl overflow-hidden border">
            <Canvas shadows camera={{ position: [2.6, 1.8, 2.6], fov: 45 }}>
              <Suspense fallback={<Html center>Načítám 3D…</Html>}>
                <Scene geometry={loadedGeometry} materialParams={{ color, roughness, metalness }} scaleMultiplier={scaleMultiplier} />
              </Suspense>
            </Canvas>
          </div>
        </div>
      </section>

      <section id="config" className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            <Section title="Model / Soubor">
              <Row>
                <Label htmlFor="file">Nahrát STL/OBJ</Label>
                <div className="col-span-2 flex items-center gap-2">
                  <Input id="file" type="file" accept=".stl,.obj" onChange={(e)=> setUploadedFile((e.target as HTMLInputElement).files?.[0] || null)} />
                </div>
              </Row>
              <p className="text-xs text-gray-500">TIP: Pokud nemáš vlastní soubor, pracuj s výchozím tvarem (hladký uzel).</p>
            </Section>

            <Section title="Materiál">
              <Row>
                <Label htmlFor="material">Zvol materiál</Label>
                <div className="col-span-2">
                  <Select id="material" value={materialKey} onChange={setMaterialKey}>
                    {Object.entries(MATERIALS).map(([key, m]) => (
                      <option key={key} value={key}>{m.name}</option>
                    ))}
                  </Select>
                </div>
              </Row>
              <Row>
                <Label htmlFor="color">Barva</Label>
                <div className="col-span-2">
                  <Input id="color" type="color" value={color} onChange={(e)=>setColor((e.target as HTMLInputElement).value)} />
                </div>
              </Row>
              <Row>
                <Label htmlFor="rough">Roughness</Label>
                <div className="col-span-2">
                  <Input id="rough" type="range" min={0} max={1} step={0.01} value={roughness} onChange={(e)=>setRoughness(parseFloat((e.target as HTMLInputElement).value))} />
                </div>
              </Row>
              <Row>
                <Label htmlFor="metal">Metalness</Label>
                <div className="col-span-2">
                  <Input id="metal" type="range" min={0} max={1} step={0.01} value={metalness} onChange={(e)=>setMetalness(parseFloat((e.target as HTMLInputElement).value))} />
                </div>
              </Row>
            </Section>

            <Section title="Měřítko a cena">
              <Row>
                <Label htmlFor="scale">Měřítko</Label>
                <div className="col-span-2">
                  <Input id="scale" type="range" min={0.25} max={3} step={0.01} value={scaleMultiplier} onChange={(e)=>setScaleMultiplier(parseFloat((e.target as HTMLInputElement).value))} />
                </div>
              </Row>
              <div className="text-sm text-gray-700 flex items-center justify-between">
                <span>Objem (odhad)</span>
                <span className="font-semibold">{volume !== null ? volume.toFixed(1) : "–"} cm³</span>
              </div>
              <div className="text-sm text-gray-700 flex items-center justify-between">
                <span>Odhad ceny</span>
                <span className="font-semibold">€ {(volume ? volume * MATERIALS[materialKey].cost : 0).toFixed(2)}</span>
              </div>
            </Section>

            <Section title="Export / Akce">
              <ExportButtons meshGeometry={baseGeometry as THREE.BufferGeometry} scaleMultiplier={scaleMultiplier} />
              <p className="text-xs text-gray-500">Export GLB pro předání do sliceru / dalšího zpracování. Napojení na objednávku a tisk lze doprogramovat přes API.</p>
            </Section>
          </div>

          <div className="md:col-span-2">
            <div className="h-[560px] rounded-3xl overflow-hidden border bg-white" id="tvaryon-canvas-2">
              <Canvas shadows camera={{ position: [2.6, 1.8, 2.6], fov: 45 }}>
                <Suspense fallback={<Html center>Načítám 3D…</Html>}>
                  <Scene geometry={loadedGeometry} materialParams={{ color, roughness, metalness }} scaleMultiplier={scaleMultiplier} />
                </Suspense>
              </Canvas>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-3">O projektu</h2>
        <p className="text-gray-600">TvaryOn je experimentální platforma, která propojuje 3D tisk a materiálové řemeslo. Cílem je otevřít konfiguraci objektů veřejnosti a zjednodušit cestu od nápadu k fyzickému artefaktu.</p>
      </section>

      <footer id="contact" className="border-t bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-gray-600 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} TvaryOn</div>
          <div className="flex gap-3 items-center">
            <span>Kontakt: </span>
            <a className="underline" href="mailto:studio@tvaryon.com">studio@tvaryon.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
