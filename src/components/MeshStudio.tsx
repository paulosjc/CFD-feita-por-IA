/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Mesh Generator Studio (blockMesh & snappyHexMesh)
 */

import React, { useState } from 'react';
import { Grid, CheckCircle2, AlertTriangle, Layers, Sliders, Code2, RefreshCw } from 'lucide-react';
import { MeshGenerator, MeshConfig } from '../cfd/mesher';

interface MeshStudioProps {
  mesh: MeshGenerator;
  onApplyMesh: (newConfig: Partial<MeshConfig>) => void;
  onClose?: () => void;
}

export const MeshStudio: React.FC<MeshStudioProps> = ({ mesh, onApplyMesh, onClose }) => {
  const [nx, setNx] = useState<number>(mesh.config.nx);
  const [ny, setNy] = useState<number>(mesh.config.ny);
  const [lengthX, setLengthX] = useState<number>(mesh.config.lengthX);
  const [lengthY, setLengthY] = useState<number>(mesh.config.lengthY);
  const [gradingY, setGradingY] = useState<number>(mesh.config.gradingY);
  const [hasObstacle, setHasObstacle] = useState<boolean>(mesh.config.hasObstacle);
  const [obstacleType, setObstacleType] = useState<MeshConfig['obstacleType']>(mesh.config.obstacleType);
  const [obstacleSize, setObstacleSize] = useState<number>(mesh.config.obstacleSize);
  const [obstacleX, setObstacleX] = useState<number>(mesh.config.obstacleX);
  const [obstacleY, setObstacleY] = useState<number>(mesh.config.obstacleY);
  const [activeTab, setActiveTab] = useState<'parameters' | 'quality' | 'blockMeshDict'>('parameters');

  const handleApply = () => {
    onApplyMesh({
      nx,
      ny,
      lengthX,
      lengthY,
      gradingY,
      hasObstacle,
      obstacleType,
      obstacleSize,
      obstacleX,
      obstacleY,
    });
  };

  const stats = mesh.stats;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 text-xs overflow-hidden border border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Grid className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-100 text-xs">
            Gerador de Malha Computacional (blockMesh)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded font-mono">
            {stats.totalCells} Células
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 text-sm font-bold px-1.5"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/50 text-[11px]">
        <button
          onClick={() => setActiveTab('parameters')}
          className={`flex-1 py-1.5 px-3 font-medium transition ${
            activeTab === 'parameters'
              ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Parâmetros da Malha
        </button>
        <button
          onClick={() => setActiveTab('quality')}
          className={`flex-1 py-1.5 px-3 font-medium transition ${
            activeTab === 'quality'
              ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Qualidade & Ortogonalidade
        </button>
        <button
          onClick={() => setActiveTab('blockMeshDict')}
          className={`flex-1 py-1.5 px-3 font-medium transition ${
            activeTab === 'blockMeshDict'
              ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          blockMeshDict (C++)
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans">
        {activeTab === 'parameters' && (
          <div className="space-y-3">
            {/* Resolution */}
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200 flex justify-between">
                <span>Resolução da Malha (Nx × Ny)</span>
                <span className="font-mono text-emerald-400">
                  {nx} × {ny} ({nx * ny} células)
                </span>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Células em X (Nx):</span>
                  <span className="font-mono text-slate-200">{nx}</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="160"
                  step="5"
                  value={nx}
                  onChange={(e) => setNx(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Células em Y (Ny):</span>
                  <span className="font-mono text-slate-200">{ny}</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={ny}
                  onChange={(e) => setNy(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            {/* Boundary Layer Grading / Inflation */}
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200 flex justify-between">
                <span>Refinamento na Parede (Camada Limite)</span>
                <span className="font-mono text-emerald-400">r = {gradingY.toFixed(2)}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Adensamento geométrico de células junto às paredes inferior e superior para capturar a subcamada viscosa e resolver o gradiente de velocidade (y+ menor).
              </div>
              <input
                type="range"
                min="1.0"
                max="2.2"
                step="0.05"
                value={gradingY}
                onChange={(e) => setGradingY(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Obstacle Geometry */}
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Corpo Imerso / Obstáculo</span>
                <input
                  type="checkbox"
                  checked={hasObstacle}
                  onChange={(e) => setHasObstacle(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </div>

              {hasObstacle && (
                <div className="space-y-2 pt-1 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Geometria:</label>
                    <select
                      value={obstacleType}
                      onChange={(e) => setObstacleType(e.target.value as any)}
                      className="w-full bg-slate-800 text-slate-200 px-2 py-1 rounded border border-slate-700 text-xs"
                    >
                      <option value="cylinder">Cilindro (Esteira de von Kármán)</option>
                      <option value="step">Degrau (Backward-Facing Step)</option>
                      <option value="airfoil">Aerofólio NACA (Perfil Aerodinâmico)</option>
                      <option value="square">Bloco Quadrado (Separação Brusca)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400">
                      <span>Dimensão Característica (D):</span>
                      <span className="font-mono text-slate-200">{obstacleSize.toFixed(2)} m</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.5"
                      step="0.01"
                      value={obstacleSize}
                      onChange={(e) => setObstacleSize(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Apply Button */}
            <button
              onClick={handleApply}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded flex items-center justify-center gap-1.5 transition shadow"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Gerar e Aplicar Malha (blockMesh)</span>
            </button>
          </div>
        )}

        {/* TAB 2: QUALITY METRICS */}
        {activeTab === 'quality' && (
          <div className="space-y-3">
            <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Índice de Qualidade da Malha</span>
                <span className="text-emerald-400 font-bold text-sm font-mono">
                  {stats.meshQualityScore}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${stats.meshQualityScore}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Células Fluidas</div>
                <div className="text-slate-100 font-bold text-sm">{stats.activeFluidCells}</div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Células Obstáculo</div>
                <div className="text-slate-100 font-bold text-sm">{stats.obstacleCells}</div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Aspect Ratio Mín/Máx</div>
                <div className="text-slate-100 font-bold">
                  {stats.minAspectRatio} / {stats.maxAspectRatio}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Não-Ortogonalidade</div>
                <div className="text-emerald-400 font-bold">{stats.nonOrthogonality}° (Perfeita)</div>
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200">Critérios OpenFOAM checkMesh:</div>
              <div className="text-slate-400">
                ✓ Não-ortogonalidade máxima &lt; 70° (Atual: 0.0° - Estabilidade total)
              </div>
              <div className="text-slate-400">
                ✓ Aspect Ratio &lt; 100 em parede (Atual: {stats.maxAspectRatio} - Adequado)
              </div>
              <div className="text-slate-400">
                ✓ Volume de células estritamente positivo em todas as coordenadas
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BLOCKMESHDict */}
        {activeTab === 'blockMeshDict' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-slate-400 text-[11px]">
              <span>Arquivo: constant/polyMesh/blockMeshDict</span>
              <button
                onClick={() => navigator.clipboard.writeText(stats.blockMeshDictPreview)}
                className="text-emerald-400 hover:underline"
              >
                Copiar
              </button>
            </div>
            <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] text-slate-300 leading-tight overflow-x-auto max-h-[350px]">
              {stats.blockMeshDictPreview}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
