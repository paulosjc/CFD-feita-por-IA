/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - CFD Viewport & ParaView-style Visualizer
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Layers,
  Compass,
  Eye,
  Maximize2,
  Crosshair,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { CfdSolver, ProbeData } from '../cfd/solver';
import { MeshGenerator } from '../cfd/mesher';

export type DisplayField = 'velocity' | 'pressure' | 'vorticity' | 'tke' | 'alpha' | 'wallShear';

interface CfdViewportProps {
  solver: CfdSolver;
  mesh: MeshGenerator;
  isRunning: boolean;
  onToggleRun: () => void;
  onStep: () => void;
  onReset: () => void;
  selectedField: DisplayField;
  onSelectField: (field: DisplayField) => void;
  onProbeUpdate: (probe: ProbeData | null) => void;
}

export const CfdViewport: React.FC<CfdViewportProps> = ({
  solver,
  mesh,
  isRunning,
  onToggleRun,
  onStep,
  onReset,
  selectedField,
  onSelectField,
  onProbeUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showMesh, setShowMesh] = useState<boolean>(false);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [showParticles, setShowParticles] = useState<boolean>(true);
  const [probePos, setProbePos] = useState<{ x: number; y: number } | null>(null);
  const [fieldMin, setFieldMin] = useState<number>(0);
  const [fieldMax, setFieldMax] = useState<number>(1);
  const [fps, setFps] = useState<number>(60);

  const fpsRef = useRef<{ frames: number; lastTime: number }>({
    frames: 0,
    lastTime: performance.now(),
  });

  // Render loop
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const { nx, ny } = solver;
    const lx = mesh.config.lengthX;
    const ly = mesh.config.lengthY;

    // 1. Determine min/max for selected field
    let minVal = Infinity;
    let maxVal = -Infinity;
    let targetArray: Float32Array;

    switch (selectedField) {
      case 'pressure':
        targetArray = solver.p;
        break;
      case 'vorticity':
        targetArray = solver.vorticity;
        break;
      case 'tke':
        targetArray = solver.tke;
        break;
      case 'alpha':
        targetArray = solver.alpha;
        break;
      case 'wallShear':
        targetArray = solver.wallShear;
        break;
      case 'velocity':
      default:
        // Velocity magnitude
        const velMag = new Float32Array(solver.size);
        for (let i = 0; i < solver.size; i++) {
          velMag[i] = Math.hypot(solver.u[i], solver.v[i]);
        }
        targetArray = velMag;
        break;
    }

    for (let idx = 0; idx < solver.size; idx++) {
      if (mesh.cells[idx]?.isObstacle) continue;
      const v = targetArray[idx];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }

    if (!isFinite(minVal)) minVal = 0;
    if (!isFinite(maxVal) || maxVal === minVal) maxVal = minVal + 1;

    setFieldMin(minVal);
    setFieldMax(maxVal);

    // 2. Draw scalar colormap
    const imgData = ctx.createImageData(nx, ny);
    const data = imgData.data;

    for (let j = 0; j < ny; j++) {
      // Invert Y for canvas coordinate system (0 is top)
      const canvasJ = ny - 1 - j;
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const pIdx = (canvasJ * nx + i) * 4;

        if (mesh.cells[idx]?.isObstacle) {
          // Obstacle color: dark slate metallic
          data[pIdx] = 30;
          data[pIdx + 1] = 41;
          data[pIdx + 2] = 59;
          data[pIdx + 3] = 255;
          continue;
        }

        const val = targetArray[idx];
        const norm = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));

        // Colormap: Turbo / Rainbow CFD colormap
        const rgb = turboColormap(norm);
        data[pIdx] = rgb[0];
        data[pIdx + 1] = rgb[1];
        data[pIdx + 2] = rgb[2];
        data[pIdx + 3] = 255;
      }
    }

    // Draw image to offscreen canvas or scale directly
    const offscreen = document.createElement('canvas');
    offscreen.width = nx;
    offscreen.height = ny;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
      offCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen, 0, 0, width, height);
    }

    // 3. Draw Mesh Wireframe overlay if enabled
    if (showMesh) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 0.5;

      // Vertical lines
      for (let i = 0; i <= nx; i++) {
        const xCoord = (mesh.nodeX[i] / lx) * width;
        ctx.beginPath();
        ctx.moveTo(xCoord, 0);
        ctx.lineTo(xCoord, height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let j = 0; j <= ny; j++) {
        const yCoord = height - (mesh.nodeY[j] / ly) * height;
        ctx.beginPath();
        ctx.moveTo(0, yCoord);
        ctx.lineTo(width, yCoord);
        ctx.stroke();
      }
    }

    // 4. Draw Velocity Vectors (Glyphs)
    if (showVectors) {
      const stepX = Math.max(2, Math.floor(nx / 24));
      const stepY = Math.max(2, Math.floor(ny / 16));
      const maxVel = Math.max(0.1, solver.currentSummary.maxVelocity);

      ctx.lineWidth = 1.2;

      for (let j = 1; j < ny; j += stepY) {
        for (let i = 1; i < nx; i += stepX) {
          const idx = j * nx + i;
          if (mesh.cells[idx]?.isObstacle) continue;

          const cx = (mesh.gridX[i] / lx) * width;
          const cy = height - (mesh.gridY[j] / ly) * height;

          const uVal = solver.u[idx];
          const vVal = solver.v[idx];
          const speed = Math.hypot(uVal, vVal);

          if (speed < 0.01) continue;

          const arrowLen = Math.min(22, (speed / maxVel) * 18 + 4);
          const angle = Math.atan2(-vVal, uVal); // Inverted Y for canvas

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          const headX = cx + arrowLen * Math.cos(angle);
          const headY = cy + arrowLen * Math.sin(angle);
          ctx.lineTo(headX, headY);
          ctx.stroke();

          // Arrowhead
          const headSize = 3;
          ctx.beginPath();
          ctx.moveTo(headX, headY);
          ctx.lineTo(
            headX - headSize * Math.cos(angle - Math.PI / 6),
            headY - headSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            headX - headSize * Math.cos(angle + Math.PI / 6),
            headY - headSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 5. Draw Particle streaklines
    if (showParticles && solver.particles.length > 0) {
      ctx.lineWidth = 1.5;
      for (const p of solver.particles) {
        const px = (p.x / lx) * width;
        const py = height - (p.y / ly) * height;

        const speed = Math.hypot(p.vx, p.vy);
        const trailLen = Math.min(10, speed * 4 + 2);
        const alpha = Math.max(0.2, 1.0 - p.age / p.maxAge);

        ctx.strokeStyle =
          p.phase === 1
            ? `rgba(56, 189, 248, ${alpha})` // Light cyan/water
            : `rgba(251, 191, 36, ${alpha})`; // Amber/air

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - (p.vx / (speed || 1)) * trailLen, py + (p.vy / (speed || 1)) * trailLen);
        ctx.stroke();
      }
    }

    // 6. Draw Obstacle Boundary Outline
    if (mesh.config.hasObstacle) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      const ox = (mesh.config.obstacleX / lx) * width;
      const oy = height - (mesh.config.obstacleY / ly) * height;
      const sizeX = (mesh.config.obstacleSize / lx) * width;
      const sizeY = (mesh.config.obstacleSize / ly) * height;

      if (mesh.config.obstacleType === 'cylinder') {
        ctx.beginPath();
        ctx.arc(ox, oy, sizeX * 0.5, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (mesh.config.obstacleType === 'square') {
        ctx.strokeRect(ox - sizeX * 0.5, oy - sizeY * 0.5, sizeX, sizeY);
      } else if (mesh.config.obstacleType === 'step') {
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(ox, height);
        ctx.lineTo(ox, height - sizeY);
        ctx.lineTo(0, height - sizeY);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // 7. Draw Probe Cursor if active
    if (probePos) {
      const cx = (probePos.x / lx) * width;
      const cy = height - (probePos.y / ly) * height;

      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }

    // FPS Counter calculation
    fpsRef.current.frames++;
    const now = performance.now();
    if (now - fpsRef.current.lastTime >= 1000) {
      setFps(fpsRef.current.frames);
      fpsRef.current.frames = 0;
      fpsRef.current.lastTime = now;
    }
  }, [solver, mesh, selectedField, showMesh, showVectors, showParticles, probePos]);

  // Animation frame loop
  useEffect(() => {
    let animId: number;

    const loop = () => {
      if (isRunning) {
        // Run 2 solver substeps per frame for smooth real-time simulation
        solver.step();
        solver.step();
      }
      renderFrame();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isRunning, solver, renderFrame]);

  // Mouse interaction: Probe sampling
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    const lx = mesh.config.lengthX;
    const ly = mesh.config.lengthY;

    // Convert to physical domain coords (invert Y)
    const physX = Math.max(0, Math.min(lx, xRatio * lx));
    const physY = Math.max(0, Math.min(ly, (1.0 - yRatio) * ly));

    setProbePos({ x: physX, y: physY });
    const probeData = solver.probeAt(physX, physY);
    onProbeUpdate(probeData);
  };

  const handleCanvasMouseLeave = () => {
    setProbePos(null);
    onProbeUpdate(null);
  };

  // Turbo colormap formula for scientific CFD visualization
  function turboColormap(t: number): [number, number, number] {
    // Polynomial fit for Google Turbo colormap (standard in ParaView & OpenFOAM)
    const kRedVec4 = [0.13572138, 4.6153926, -42.66032258, 132.13108234];
    const kGreenVec4 = [0.09140261, 2.19418839, 4.84296658, -14.18503333];
    const kBlueVec4 = [0.1066733, 12.64194608, -60.58204836, 110.36276771];
    const kRedVec2 = [-152.94239396, 59.28637943];
    const kGreenVec2 = [4.27729857, 2.82956604];
    const kBlueVec2 = [-89.90310912, 27.34824973];

    const s = Math.max(0, Math.min(1, t));
    const v4 = [1, s, s * s, s * s * s];
    const v2 = [v4[2] * v4[2], v4[3] * v4[2]];

    let r = kRedVec4[0] * v4[0] + kRedVec4[1] * v4[1] + kRedVec4[2] * v4[2] + kRedVec4[3] * v4[3];
    r += kRedVec2[0] * v2[0] + kRedVec2[1] * v2[1];

    let g = kGreenVec4[0] * v4[0] + kGreenVec4[1] * v4[1] + kGreenVec4[2] * v4[2] + kGreenVec4[3] * v4[3];
    g += kGreenVec2[0] * v2[0] + kGreenVec2[1] * v2[1];

    let b = kBlueVec4[0] * v4[0] + kBlueVec4[1] * v4[1] + kBlueVec4[2] * v4[2] + kBlueVec4[3] * v4[3];
    b += kBlueVec2[0] * v2[0] + kBlueVec2[1] * v2[1];

    return [
      Math.max(0, Math.min(255, Math.round(r * 255))),
      Math.max(0, Math.min(255, Math.round(g * 255))),
      Math.max(0, Math.min(255, Math.round(b * 255))),
    ];
  }

  const getFieldUnit = (field: DisplayField): string => {
    switch (field) {
      case 'velocity':
        return 'm/s';
      case 'pressure':
        return 'Pa';
      case 'vorticity':
        return 's⁻¹';
      case 'tke':
        return 'm²/s²';
      case 'alpha':
        return 'fraction [0-1]';
      case 'wallShear':
        return 'Pa (N/m²)';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 select-none overflow-hidden border border-slate-800">
      {/* Top Viewport Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 text-xs text-slate-200 gap-2">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleRun}
            className={`flex items-center gap-1 px-3 py-1 rounded font-medium transition ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
            }`}
            title={isRunning ? 'Pausar simulação' : 'Iniciar simulação'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRunning ? 'Pausar' : 'Simular'}</span>
          </button>

          <button
            onClick={onStep}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded border border-slate-700 transition"
            title="Avançar 1 passo de tempo (dt)"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Passo</span>
          </button>

          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
            title="Reiniciar campos para t = 0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Field Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Campo:</span>
          <select
            value={selectedField}
            onChange={(e) => onSelectField(e.target.value as DisplayField)}
            className="bg-slate-800 text-slate-100 text-xs px-2.5 py-1 rounded border border-slate-700 outline-none focus:border-cyan-500 font-sans"
          >
            <option value="velocity">|U| Magnitude de Velocidade</option>
            <option value="pressure">p Pressão Estática</option>
            <option value="vorticity">ω Vorticidade</option>
            <option value="tke">k Energia Cinética Turbulenta</option>
            <option value="alpha">α Fração de Fase (VOF Multifásico)</option>
            <option value="wallShear">τw Tensão Cisalhante na Parede</option>
          </select>
        </div>

        {/* Visualization Layer Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowVectors((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${
              showVectors
                ? 'bg-cyan-950 border-cyan-600 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Exibir vetores de velocidade"
          >
            <Compass className="w-3 h-3" />
            <span>Vetores</span>
          </button>

          <button
            onClick={() => setShowParticles((p) => !p)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${
              showParticles
                ? 'bg-amber-950 border-amber-600 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Exibir partículas traçadoras / linhas de emissão"
          >
            <Sparkles className="w-3 h-3" />
            <span>Traçadores</span>
          </button>

          <button
            onClick={() => setShowMesh((m) => !m)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${
              showMesh
                ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Exibir malha computacional (blockMesh)"
          >
            <Layers className="w-3 h-3" />
            <span>Malha</span>
          </button>

          <div className="text-[10px] text-slate-400 ml-1 px-1.5 py-0.5 rounded bg-slate-800 font-mono">
            {fps} FPS
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport Area */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          width={640}
          height={320}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          className="w-full h-full max-h-[520px] object-contain rounded border border-slate-800 cursor-crosshair shadow-2xl"
        />

        {/* Colormap Legend Bar (ParaView style) */}
        <div className="absolute right-4 top-4 bg-slate-900/90 backdrop-blur border border-slate-800 p-2 rounded shadow-lg text-[11px] font-mono text-slate-300 pointer-events-none select-none flex flex-col gap-1 items-end min-w-[120px]">
          <div className="text-[10px] text-cyan-400 font-sans font-semibold uppercase">
            {selectedField} [{getFieldUnit(selectedField)}]
          </div>
          <div className="text-[10px] font-bold text-slate-100">{fieldMax.toFixed(3)}</div>
          {/* Scientific Turbo Gradient Bar */}
          <div
            className="w-4 h-24 rounded border border-slate-700 my-0.5"
            style={{
              background:
                'linear-gradient(to bottom, #900000, #e60000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff)',
            }}
          />
          <div className="text-[10px] text-slate-400">{fieldMin.toFixed(3)}</div>
        </div>

        {/* Boundary Condition Badges in Canvas Viewport */}
        <div className="absolute left-4 top-4 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded text-[10px] border border-slate-800 text-slate-400 font-mono pointer-events-none">
          Domínio: {mesh.config.lengthX}m × {mesh.config.lengthY}m | Malha: {mesh.config.nx} ×{' '}
          {mesh.config.ny} ({mesh.stats.totalCells} células)
        </div>

        {/* Inlet marker */}
        {solver.options.inletVelocity > 0 && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-cyan-900/80 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded text-[10px] font-mono pointer-events-none">
            INLET: {solver.options.inletVelocity.toFixed(1)} m/s →
          </div>
        )}

        {/* Moving Lid marker */}
        {solver.options.wallVelocity > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-900/80 text-amber-300 border border-amber-700 px-2 py-0.5 rounded text-[10px] font-mono pointer-events-none">
            PAREDE MÓVEL (LID): U = {solver.options.wallVelocity.toFixed(1)} m/s →
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-slate-950 border-t border-slate-800 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-200">Iter: {solver.iteration}</span>
          </span>
          <span>Tempo: {solver.simulationTime.toFixed(4)} s</span>
          <span>dt: {solver.options.timeStep} s</span>
          <span
            className={`${
              solver.currentSummary.courantNumber <= 1.0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            CFL: {solver.currentSummary.courantNumber.toFixed(3)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span>|U| máx: {solver.currentSummary.maxVelocity.toFixed(3)} m/s</span>
          <span>Re: {solver.currentSummary.reynolds.toFixed(0)}</span>
          {solver.mesh.config.hasObstacle && (
            <>
              <span className="text-amber-300">
                Cd: {solver.currentSummary.dragCoefficient.toFixed(3)}
              </span>
              <span className="text-cyan-300">
                Cl: {solver.currentSummary.liftCoefficient.toFixed(3)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
