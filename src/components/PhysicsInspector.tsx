/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Physics Estimator & Fluid Dynamics Inspector
 */

import React, { useState } from 'react';
import {
  Activity,
  Layers,
  Droplets,
  ShieldAlert,
  Wind,
  Maximize2,
  TrendingDown,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { CfdSolver, ProbeData } from '../cfd/solver';
import {
  classifyFlowRegime,
  calculateBoundaryLayerThickness,
  calculateDarcyFrictionFactor,
  calculateTotalPressure,
} from '../cfd/physics';

interface PhysicsInspectorProps {
  solver: CfdSolver;
  probeData: ProbeData | null;
}

export const PhysicsInspector: React.FC<PhysicsInspectorProps> = ({ solver, probeData }) => {
  const [activeTab, setActiveTab] = useState<'regimes' | 'wall' | 'multiphase' | 'residuals' | 'probe'>(
    'regimes'
  );

  const summary = solver.currentSummary;
  const regimeInfo = classifyFlowRegime(
    summary.reynolds,
    solver.options.wallVelocity > 0 ? 'cavity' : 'internal_pipe'
  );

  // Boundary layer calculations
  const blLengthX = solver.mesh.config.lengthX * 0.75;
  const reX = Math.max(10, summary.reynolds);
  const blEstimates = calculateBoundaryLayerThickness(
    blLengthX,
    reX,
    solver.options.regime === 'turbulent' ? 'turbulent' : 'laminar'
  );

  // Darcy friction factor
  const darcyF = calculateDarcyFrictionFactor(summary.reynolds);

  // Bernoulli Total Pressure at max velocity
  const bernoulli = calculateTotalPressure(
    summary.maxPressure,
    solver.options.fluid1.density,
    summary.maxVelocity,
    0
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 border-l border-slate-800 text-xs overflow-hidden select-none">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-100 text-xs">
            Estimativas Físicas & Cálculos CFD
          </span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border ${
            summary.regimeName === 'laminar'
              ? 'bg-blue-950 text-blue-300 border-blue-700'
              : summary.regimeName === 'transitional'
              ? 'bg-amber-950 text-amber-300 border-amber-700'
              : 'bg-rose-950 text-rose-300 border-rose-700'
          }`}
        >
          {summary.regimeName.toUpperCase()}
        </span>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 overflow-x-auto text-[11px]">
        <button
          onClick={() => setActiveTab('regimes')}
          className={`flex-1 py-2 px-2 text-center border-b-2 font-medium transition whitespace-nowrap ${
            activeTab === 'regimes'
              ? 'border-cyan-500 text-cyan-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Regimes & Re
        </button>
        <button
          onClick={() => setActiveTab('wall')}
          className={`flex-1 py-2 px-2 text-center border-b-2 font-medium transition whitespace-nowrap ${
            activeTab === 'wall'
              ? 'border-cyan-500 text-cyan-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Parede & τw
        </button>
        <button
          onClick={() => setActiveTab('multiphase')}
          className={`flex-1 py-2 px-2 text-center border-b-2 font-medium transition whitespace-nowrap ${
            activeTab === 'multiphase'
              ? 'border-cyan-500 text-cyan-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Multifásico (VOF)
        </button>
        <button
          onClick={() => setActiveTab('residuals')}
          className={`flex-1 py-2 px-2 text-center border-b-2 font-medium transition whitespace-nowrap ${
            activeTab === 'residuals'
              ? 'border-cyan-500 text-cyan-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Convergência
        </button>
        <button
          onClick={() => setActiveTab('probe')}
          className={`flex-1 py-2 px-2 text-center border-b-2 font-medium transition whitespace-nowrap ${
            activeTab === 'probe'
              ? 'border-cyan-500 text-cyan-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sonda
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs">
        {/* TAB 1: REGIMES & REYNOLDS */}
        {activeTab === 'regimes' && (
          <div className="space-y-3">
            {/* Reynolds Card */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Número de Reynolds (Re)</span>
                <span className="font-mono text-cyan-300 font-bold text-sm">
                  {summary.reynolds.toFixed(1)}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Re = (ρ · U · L) / μ = (U · L) / ν
              </div>
              <div className="text-[11px] leading-relaxed text-slate-300 bg-slate-950 p-2 rounded border border-slate-800">
                {regimeInfo.explanation}
              </div>
            </div>

            {/* Courant CFL Stability */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Critério de Estabilidade CFL</span>
                <span
                  className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                    summary.courantNumber <= 1.0
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  C = {summary.courantNumber.toFixed(3)}{' '}
                  {summary.courantNumber <= 1.0 ? '✓ Estável' : '⚠ Instável'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                C = (|u|·Δt)/Δx + (|v|·Δt)/Δy ≤ 1.0
              </div>
              <div className="text-[11px] text-slate-400">
                Passo de tempo atual: <span className="font-mono text-slate-200">{solver.options.timeStep} s</span>.
                Garante que a informação advectiva não salte células computacionais.
              </div>
            </div>

            {/* Aerodynamic Forces / Obstacle Drag & Lift */}
            {solver.mesh.config.hasObstacle && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200">Forças Aerodinâmicas no Obstáculo</div>
                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Arrasto (Cd)</div>
                    <div className="text-sm font-bold text-amber-300">
                      {summary.dragCoefficient.toFixed(4)}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Fd = {summary.dragForce.toFixed(3)} N
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Sustentação (Cl)</div>
                    <div className="text-sm font-bold text-cyan-300">
                      {summary.liftCoefficient.toFixed(4)}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Fl = {summary.liftForce.toFixed(3)} N
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400">
                  Oscilação periódica de Cl indica desprendimento alternado de vórtices de von Kármán.
                </div>
              </div>
            )}

            {/* Bernoulli Energy / Total Pressure */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="font-semibold text-slate-200">Balanço de Pressão (Bernoulli)</div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pressão Estática (p):</span>
                  <span className="text-slate-200">{summary.maxPressure.toFixed(2)} Pa</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pressão Dinâmica (½ρU²):</span>
                  <span className="text-slate-200">{bernoulli.dynamicPressure.toFixed(2)} Pa</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1">
                  <span className="text-cyan-400 font-semibold">Pressão Total (p₀):</span>
                  <span className="text-cyan-300 font-bold">{bernoulli.totalPressure.toFixed(2)} Pa</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WALL INTERACTION & SHEAR STRESS */}
        {activeTab === 'wall' && (
          <div className="space-y-3">
            {/* Wall Shear Stress Card */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Tensão de Cisalhamento (τw)</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {summary.maxWallShear.toFixed(5)} Pa
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                τw = μ · (∂u/∂y)|parede
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Média ao longo das paredes:</span>
                  <span className="text-slate-200">{summary.avgWallShear.toFixed(5)} Pa</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fator de atrito de Darcy (f):</span>
                  <span className="text-slate-200">{darcyF.toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* Wall Boundary Condition Settings */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Condição de Parede do Recipiente</div>
              <div className="space-y-2 text-[11px]">
                <div>
                  <label className="text-slate-400 block mb-1">Tipo de Interação na Parede:</label>
                  <select
                    value={solver.options.wallCondition}
                    onChange={(e) => {
                      solver.options.wallCondition = e.target.value as any;
                    }}
                    className="w-full bg-slate-800 text-slate-200 px-2 py-1 rounded border border-slate-700 outline-none text-xs"
                  >
                    <option value="noSlip">No-Slip (Sem deslizamento - Adesão molecular exata)</option>
                    <option value="partialSlip">Partial Slip (Deslizamento parcial / Navier-Slip)</option>
                    <option value="slip">Free-Slip (Superfície livre / Simetria sem atrito)</option>
                  </select>
                </div>

                {solver.options.wallCondition === 'partialSlip' && (
                  <div>
                    <div className="flex justify-between text-slate-400">
                      <span>Coeficiente de deslizamento (β):</span>
                      <span className="font-mono text-cyan-300">{solver.options.slipFactor}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={solver.options.slipFactor}
                      onChange={(e) => {
                        solver.options.slipFactor = parseFloat(e.target.value);
                      }}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Boundary Layer Thickness */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Crescimento da Camada Limite (δ)</div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Espessura a 99% (δ):</span>
                  <span className="text-cyan-300 font-bold">{(blEstimates.delta * 1000).toFixed(2)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Espessura de Deslocamento (δ*):</span>
                  <span className="text-slate-200">{(blEstimates.displacementThickness * 1000).toFixed(2)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Espessura de Quant. Movimento (θ):</span>
                  <span className="text-slate-200">{(blEstimates.momentumThickness * 1000).toFixed(2)} mm</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1">
                  <span className="text-slate-400">Fator de Forma (H = δ*/θ):</span>
                  <span className="text-slate-200">{blEstimates.shapeFactor.toFixed(3)}</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400">
                {solver.options.regime === 'laminar'
                  ? 'Perfil laminar de Blasius (H ≈ 2.59, transição iminente se H decair).'
                  : 'Perfil turbulento lei da potência 1/7 (H ≈ 1.28 - 1.4).' }
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MULTIPHASE FLUID-FLUID INTERACTION */}
        {activeTab === 'multiphase' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Modelo Multifásico VOF (interFoam)</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                    solver.options.isMultiphase
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {solver.options.isMultiphase ? 'ATIVO' : 'MONOFÁSICO'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Rastreia a fração volumétrica α ∈ [0, 1] entre duas fases imiscíveis com conservação de massa e forças de tensão superficial.
              </div>

              {/* Fluids properties comparison */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mt-2">
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <div className="text-cyan-400 font-semibold mb-1">Fase 1 (Líquido)</div>
                  <div className="text-slate-300">{solver.options.fluid1.name}</div>
                  <div className="text-slate-400 text-[10px]">ρ₁: {solver.options.fluid1.density} kg/m³</div>
                  <div className="text-slate-400 text-[10px]">μ₁: {solver.options.fluid1.dynamicViscosity.toExponential(2)} Pa·s</div>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <div className="text-amber-400 font-semibold mb-1">Fase 2 (Gás/Óleo)</div>
                  <div className="text-slate-300">{solver.options.fluid2.name}</div>
                  <div className="text-slate-400 text-[10px]">ρ₂: {solver.options.fluid2.density} kg/m³</div>
                  <div className="text-slate-400 text-[10px]">μ₂: {solver.options.fluid2.dynamicViscosity.toExponential(2)} Pa·s</div>
                </div>
              </div>
            </div>

            {/* Interfacial Physics */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Tensão Superficial & Gravidade</div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensão Superficial (σ):</span>
                  <span className="text-cyan-300">{solver.options.surfaceTension} N/m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Aceleração Gravitacional (gy):</span>
                  <span className="text-amber-300">{solver.options.gravityY} m/s²</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1">
                  <span className="text-slate-400">Razão de Densidade (ρ₁/ρ₂):</span>
                  <span className="text-slate-200">
                    {(solver.options.fluid1.density / solver.options.fluid2.density).toFixed(1)}:1
                  </span>
                </div>
              </div>
            </div>

            {/* Quick SetFields Actions */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Inicializar Padrão de Fases (setFields)</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    solver.options.isMultiphase = true;
                    solver.options.gravityY = -9.81;
                    solver.setFields('damBreak');
                  }}
                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium border border-slate-700 transition"
                >
                  Coluna Dam Break
                </button>
                <button
                  onClick={() => {
                    solver.options.isMultiphase = true;
                    solver.options.gravityY = -9.81;
                    solver.setFields('bubble');
                  }}
                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium border border-slate-700 transition"
                >
                  Bolha de Ar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONVERGENCE RESIDUALS */}
        {activeTab === 'residuals' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Resíduos de Convergência</span>
                <span className="text-[10px] text-slate-400">Critério &lt; 10⁻⁴</span>
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-cyan-400">Resíduo Ux:</span>
                  <span className="text-slate-200">{summary.residuals.ux.toExponential(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-400">Resíduo Uy:</span>
                  <span className="text-slate-200">{summary.residuals.uy.toExponential(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-400">Resíduo Pressão (p):</span>
                  <span className="text-slate-200">{summary.residuals.p.toExponential(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-400">Resíduo Turbulência (k):</span>
                  <span className="text-slate-200">{summary.residuals.k.toExponential(3)}</span>
                </div>
              </div>

              {/* Sparkline / Miniature Residuals Chart */}
              <div className="mt-2 p-2 bg-slate-950 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1">Evolução dos Resíduos (Log):</div>
                <div className="h-20 flex items-end gap-1 overflow-hidden">
                  {solver.residualHistory.slice(-40).map((h, i) => {
                    const normUx = Math.min(1, Math.max(0.05, Math.log10(h.ux + 1e-6) / -4));
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-400 transition"
                        style={{ height: `${Math.round(normUx * 100)}%` }}
                        title={`Iter ${h.iter}: ${h.ux.toExponential(2)}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: POINT PROBE */}
        {activeTab === 'probe' && (
          <div className="space-y-3">
            {probeData ? (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-200">Sonda em ({probeData.x.toFixed(3)}m, {probeData.y.toFixed(3)}m)</span>
                  <span className="text-[10px] text-rose-400 font-mono">PONTO ATIVO</span>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Velocidade Vetorial (u, v):</span>
                    <span className="text-slate-200">
                      ({probeData.u.toFixed(3)}, {probeData.v.toFixed(3)}) m/s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Magnitude de Velocidade |U|:</span>
                    <span className="text-cyan-300 font-bold">
                      {probeData.velocityMagnitude.toFixed(3)} m/s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pressão Estática (p):</span>
                    <span className="text-slate-200">{probeData.pressure.toFixed(2)} Pa</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vorticidade (ω):</span>
                    <span className="text-slate-200">{probeData.vorticity.toFixed(2)} s⁻¹</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">y+ Estimado:</span>
                    <span className="text-amber-300 font-bold">{probeData.yPlus.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fração de Fase (α):</span>
                    <span className="text-emerald-300 font-bold">{probeData.phaseAlpha.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Viscosidade Turbulenta (νt):</span>
                    <span className="text-slate-200">{probeData.eddyViscosity.toExponential(2)} m²/s</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 bg-slate-900 rounded border border-slate-800">
                Passe o mouse ou clique no visor CFD para inspecionar as propriedades físicas ponto a ponto.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
