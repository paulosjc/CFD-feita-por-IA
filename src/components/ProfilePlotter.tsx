/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Boundary Layer & Velocity Profile Plotter
 * Compares CFD simulation data against theoretical fluid dynamics solutions:
 * - Analytical Poiseuille Parabola
 * - Turbulent 1/7th Power Law
 * - Linear Couette shear
 */

import React, { useState } from 'react';
import { LineChart, BarChart2, Layers } from 'lucide-react';
import { CfdSolver } from '../cfd/solver';
import { theoreticalPoiseuilleVelocity, theoreticalTurbulentVelocity } from '../cfd/physics';

interface ProfilePlotterProps {
  solver: CfdSolver;
}

export const ProfilePlotter: React.FC<ProfilePlotterProps> = ({ solver }) => {
  const [sliceXRatio, setSliceXRatio] = useState<number>(0.5); // 50% along domain length
  const lx = solver.mesh.config.lengthX;
  const ly = solver.mesh.config.lengthY;
  const sliceX = sliceXRatio * lx;

  // Sample vertical velocity profile at sliceX
  const nySamples = 25;
  const profilePoints: { y: number; uSim: number; uTheory: number }[] = [];
  const maxVel = Math.max(0.1, solver.currentSummary.maxVelocity);

  for (let j = 0; j <= nySamples; j++) {
    const yCoord = (j / nySamples) * ly;
    const probe = solver.probeAt(sliceX, yCoord);
    const uSim = probe.u;

    let uTheory = 0;
    if (solver.options.wallVelocity > 0) {
      // Couette linear shear: u(y) = U_lid * (y / H)
      uTheory = solver.options.wallVelocity * (yCoord / ly);
    } else if (solver.options.regime === 'turbulent') {
      // Turbulent 1/7th profile
      uTheory = theoreticalTurbulentVelocity(
        Math.min(yCoord, ly - yCoord),
        ly * 0.5,
        solver.options.inletVelocity
      );
    } else {
      // Poiseuille parabolic profile
      uTheory = theoreticalPoiseuilleVelocity(yCoord, ly, solver.options.inletVelocity * 1.5);
    }

    profilePoints.push({
      y: yCoord,
      uSim,
      uTheory,
    });
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded p-2.5 text-xs text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100">
          <LineChart className="w-4 h-4 text-cyan-400" />
          <span>Perfil de Velocidade u(y) vs Teoria Analítica</span>
        </div>
        <div className="text-[11px] font-mono text-cyan-300">
          Corte em X = {sliceX.toFixed(2)} m ({Math.round(sliceXRatio * 100)}%)
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
          <span>Posição do Corte no Domínio (X):</span>
          <span className="font-mono">{sliceX.toFixed(2)} m</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          value={sliceXRatio}
          onChange={(e) => setSliceXRatio(parseFloat(e.target.value))}
          className="w-full accent-cyan-500"
        />
      </div>

      {/* SVG Plot */}
      <div className="relative flex-1 bg-slate-950 rounded border border-slate-800 p-2 flex items-center justify-center min-h-[140px]">
        <svg viewBox="0 0 300 130" className="w-full h-full">
          {/* Grid lines */}
          <line x1="40" y1="10" x2="40" y2="110" stroke="#334155" strokeWidth="1" />
          <line x1="40" y1="110" x2="290" y2="110" stroke="#334155" strokeWidth="1" />
          <line x1="40" y1="60" x2="290" y2="60" stroke="#1e293b" strokeDasharray="2,2" />

          {/* Theoretical Curve (Dashed Cyan) */}
          <path
            d={profilePoints
              .map((p, i) => {
                const px = 40 + (Math.max(0, p.uTheory) / (maxVel * 1.5 || 1)) * 240;
                const py = 110 - (p.y / ly) * 100;
                return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
              })
              .join(' ')}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="4,2"
          />

          {/* Simulation Curve (Solid Amber) */}
          <path
            d={profilePoints
              .map((p, i) => {
                const px = 40 + (Math.max(0, p.uSim) / (maxVel * 1.5 || 1)) * 240;
                const py = 110 - (p.y / ly) * 100;
                return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
              })
              .join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
          />

          {/* Points */}
          {profilePoints.map((p, i) => {
            const px = 40 + (Math.max(0, p.uSim) / (maxVel * 1.5 || 1)) * 240;
            const py = 110 - (p.y / ly) * 100;
            return <circle key={i} cx={px} cy={py} r="1.5" fill="#fbbf24" />;
          })}

          {/* Axis Labels */}
          <text x="35" y="15" fill="#94a3b8" fontSize="8" textAnchor="end">
            y = H
          </text>
          <text x="35" y="112" fill="#94a3b8" fontSize="8" textAnchor="end">
            y = 0
          </text>
          <text x="285" y="122" fill="#94a3b8" fontSize="8" textAnchor="end">
            u (m/s)
          </text>
        </svg>

        {/* Legend */}
        <div className="absolute top-2 right-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded text-[9px] font-mono flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-3 h-0.5 bg-amber-400 inline-block" />
            <span>Simulação CFD</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-3 h-0.5 border-t border-dashed border-cyan-400 inline-block" />
            <span>Teoria Analítica</span>
          </div>
        </div>
      </div>
    </div>
  );
};
