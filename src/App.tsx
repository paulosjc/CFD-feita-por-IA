/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - CFD Simulation GUI & Command Terminal
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  Layers,
  Terminal as TerminalIcon,
  Play,
  Pause,
  RotateCcw,
  Activity,
  FolderTree,
  Grid,
  BarChart2,
  FileCode,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Settings,
  HelpCircle,
  Share2,
  Download,
  Flame,
  Droplets,
  Wind,
} from 'lucide-react';

import { MeshGenerator, MeshConfig } from './cfd/mesher';
import { CfdSolver, ProbeData } from './cfd/solver';
import { CASE_PRESETS, CasePreset } from './cfd/caseManager';
import { CfdViewport, DisplayField } from './components/CfdViewport';
import { TerminalPrompt } from './components/TerminalPrompt';
import { PhysicsInspector } from './components/PhysicsInspector';
import { CaseExplorer } from './components/CaseExplorer';
import { MeshStudio } from './components/MeshStudio';
import { ProfilePlotter } from './components/ProfilePlotter';

export default function App() {
  const [activeCase, setActiveCase] = useState<CasePreset>(CASE_PRESETS[0]);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [selectedField, setSelectedField] = useState<DisplayField>('velocity');
  const [probeData, setProbeData] = useState<ProbeData | null>(null);

  // Layout view toggles
  const [showCaseExplorer, setShowCaseExplorer] = useState<boolean>(true);
  const [showPhysicsPanel, setShowPhysicsPanel] = useState<boolean>(true);
  const [showMeshStudio, setShowMeshStudio] = useState<boolean>(false);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'profile'>('terminal');

  // CFD Mesh and Solver instances
  const mesh = useMemo(() => {
    return new MeshGenerator(activeCase.mesh);
  }, [activeCase.id]);

  const solver = useMemo(() => {
    const s = new CfdSolver(mesh, {
      ...activeCase.solver,
    });
    if (activeCase.initialFieldPattern) {
      s.setFields(activeCase.initialFieldPattern);
    }
    return s;
  }, [mesh, activeCase.id]);

  // Simulation controls
  const handleToggleRun = () => {
    setIsRunning((prev) => !prev);
  };

  const isSimulationActive = isRunning && !showMeshStudio;

  const handleStep = () => {
    solver.step();
  };

  const handleReset = () => {
    solver.reset();
    if (activeCase.initialFieldPattern) {
      solver.setFields(activeCase.initialFieldPattern);
    }
  };

  const handleSwitchCase = (caseId: string) => {
    const found = CASE_PRESETS.find((c) => c.id === caseId);
    if (found) {
      setActiveCase(found);
      setIsRunning(true);
    }
  };

  const handleApplyMeshConfig = (newConfig: Partial<MeshConfig>) => {
    mesh.updateConfig(newConfig);
    solver.reinitMesh(mesh);
    if (activeCase.initialFieldPattern) {
      solver.setFields(activeCase.initialFieldPattern);
    }
    setShowMeshStudio(false);
  };

  const handleUpdateCaseFile = (filename: string, content: string) => {
    activeCase.foamFiles[filename] = content;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* 1. Windows Application Title Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          {/* Windows-style icon */}
          <div className="w-3.5 h-3.5 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[9px] font-bold text-white shadow">
            OF
          </div>
          <span className="font-semibold text-slate-200">
            OpenFOAM v2406 for Windows - CFD Simulation Studio
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono text-[11px]">
            [{activeCase.id}] - {activeCase.name}
          </span>
        </div>

        {/* Windows Window Controls */}
        <div className="flex items-center gap-1.5 text-slate-400">
          <button
            onClick={() => setShowMeshStudio((m) => !m)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition"
          >
            <Grid className="w-3 h-3 text-emerald-400" />
            <span>Malha (blockMesh)</span>
          </button>
          <div className="flex items-center ml-2 border-l border-slate-700 pl-2 gap-2 text-xs">
            <span className="cursor-pointer hover:text-slate-200">🗕</span>
            <span className="cursor-pointer hover:text-slate-200">🗖</span>
            <span className="cursor-pointer hover:text-rose-400">✕</span>
          </div>
        </div>
      </div>

      {/* 2. Ribbon Menu Bar (Fluent / CAD Style) */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-950 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">Solver:</span>
            <span className="font-mono text-cyan-400 font-semibold">{solver.options.solverType}</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">Regime:</span>
            <span
              className={`font-mono font-semibold ${
                solver.options.regime === 'laminar'
                  ? 'text-blue-400'
                  : solver.options.regime === 'transitional'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {solver.options.regime.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">Parede:</span>
            <span className="font-mono text-emerald-400">{solver.options.wallCondition}</span>
          </div>

          {solver.options.isMultiphase && (
            <div className="flex items-center gap-1 bg-blue-950/80 px-2 py-1 rounded border border-blue-800 text-cyan-300">
              <Droplets className="w-3 h-3 text-cyan-400" />
              <span className="font-mono text-[11px] font-semibold">Multifásico VOF</span>
            </div>
          )}
        </div>

        {/* View toggles */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            onClick={() => setShowCaseExplorer((e) => !e)}
            className={`px-2 py-0.5 rounded border transition ${
              showCaseExplorer
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-transparent border-slate-800 text-slate-500'
            }`}
            title="Exibir/Ocultar Explorador de Casos OpenFOAM"
          >
            Casos & Dicionários
          </button>
          <button
            onClick={() => setShowPhysicsPanel((p) => !p)}
            className={`px-2 py-0.5 rounded border transition ${
              showPhysicsPanel
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-transparent border-slate-800 text-slate-500'
            }`}
            title="Exibir/Ocultar Painel de Cálculos Físicos"
          >
            Física & Estimativas
          </button>
        </div>
      </div>

      {/* 3. Main Workspace Workstation Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: OpenFOAM Case Explorer */}
        {showCaseExplorer && (
          <div className="w-64 flex-shrink-0 h-full border-r border-slate-800">
            <CaseExplorer
              activeCase={activeCase}
              onSelectCase={setActiveCase}
              onUpdateCaseFile={handleUpdateCaseFile}
            />
          </div>
        )}

        {/* Center: Viewport & Terminal / Profile Plotter */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Top Center: 2D CFD Visualizer Viewport */}
          <div className="flex-1 min-h-[300px] overflow-hidden">
            <CfdViewport
              solver={solver}
              mesh={mesh}
              isRunning={isSimulationActive}
              onToggleRun={handleToggleRun}
              onStep={handleStep}
              onReset={handleReset}
              selectedField={selectedField}
              onSelectField={setSelectedField}
              onProbeUpdate={setProbeData}
            />
          </div>

          {/* Bottom Center: Dockable Terminal Prompt & Profile Plotter */}
          <div className="h-64 flex-shrink-0 flex flex-col border-t border-slate-800 bg-slate-950">
            {/* Dock Header Tabs */}
            <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-b border-slate-800 text-[11px]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBottomTab('terminal')}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded font-medium transition ${
                    bottomTab === 'terminal'
                      ? 'bg-slate-800 text-emerald-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span>Prompt OpenFOAM (Anaconda Terminal)</span>
                </button>

                <button
                  onClick={() => setBottomTab('profile')}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded font-medium transition ${
                    bottomTab === 'profile'
                      ? 'bg-slate-800 text-cyan-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>Perfil de Velocidade u(y) Analítico</span>
                </button>
              </div>

              <div className="text-[10px] text-slate-500 font-mono">
                {bottomTab === 'terminal' ? 'Linha de Comando Ativa' : 'Validação Analítica'}
              </div>
            </div>

            {/* Dock Content */}
            <div className="flex-1 overflow-hidden">
              {bottomTab === 'terminal' ? (
                <TerminalPrompt
                  solver={solver}
                  mesh={mesh}
                  activeCase={activeCase}
                  isRunning={isRunning}
                  onToggleRun={handleToggleRun}
                  onStep={handleStep}
                  onReset={handleReset}
                  onRebuildMesh={() => mesh.generate()}
                  onSwitchCase={handleSwitchCase}
                  onSelectField={(f: string) => setSelectedField(f as DisplayField)}
                />
              ) : (
                <div className="h-full p-2">
                  <ProfilePlotter solver={solver} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Physics Inspector & Fluid Dynamics Estimator */}
        {showPhysicsPanel && (
          <div className="w-80 flex-shrink-0 h-full border-l border-slate-800">
            <PhysicsInspector solver={solver} probeData={probeData} />
          </div>
        )}
      </div>

      {/* Modal: Mesh Studio (blockMesh generator) */}
      {showMeshStudio && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-6 z-50 animate-fade-in">
          <div className="w-full max-w-2xl h-[560px] bg-slate-900 rounded-lg shadow-2xl border border-slate-700 overflow-hidden flex flex-col">
            <MeshStudio
              mesh={mesh}
              onApplyMesh={handleApplyMeshConfig}
              onClose={() => setShowMeshStudio(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
