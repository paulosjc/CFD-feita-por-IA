/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Interactive Terminal Prompt (Anaconda / OpenFOAM shell)
 */

import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, HelpCircle, Copy, Check } from 'lucide-react';
import { CfdSolver } from '../cfd/solver';
import { MeshGenerator } from '../cfd/mesher';
import { CASE_PRESETS, CasePreset } from '../cfd/caseManager';

interface TerminalPromptProps {
  solver: CfdSolver;
  mesh: MeshGenerator;
  activeCase: CasePreset;
  isRunning: boolean;
  onToggleRun: () => void;
  onStep: () => void;
  onReset: () => void;
  onRebuildMesh: () => void;
  onSwitchCase: (caseId: string) => void;
  onSelectField: (field: string) => void;
}

interface LogEntry {
  type: 'cmd' | 'output' | 'error' | 'success' | 'system';
  text: string;
}

export const TerminalPrompt: React.FC<TerminalPromptProps> = ({
  solver,
  mesh,
  activeCase,
  isRunning,
  onToggleRun,
  onStep,
  onReset,
  onRebuildMesh,
  onSwitchCase,
  onSelectField,
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [shellStyle, setShellStyle] = useState<'windows_conda' | 'foam_bash'>('windows_conda');

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      type: 'system',
      text: 'OpenFOAM v2406 for Windows [MSYS2 MinGW-w64 x86_64 CFD Environment]',
    },
    {
      type: 'system',
      text: 'Loaded case: ' + activeCase.id + ' (' + activeCase.name + ')',
    },
    {
      type: 'output',
      text: "Type 'help' to list available OpenFOAM commands (blockMesh, simpleFoam, icoFoam, interFoam, setFields, probe, etc.)",
    },
  ]);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const promptPrefix =
    shellStyle === 'windows_conda'
      ? `(openfoam-v2406) C:\\OpenFOAM\\run\\${activeCase.id}>`
      : `foam@win-cfd:~/run/${activeCase.id}$`;

  const availableCommands = [
    'help',
    'blockMesh',
    'checkMesh',
    'simpleFoam',
    'icoFoam',
    'pimpleFoam',
    'interFoam',
    'setFields',
    'paraFoam',
    'status',
    'run',
    'stop',
    'step',
    'reset',
    'probe',
    'set',
    'cat',
    'ls',
    'dir',
    'cls',
    'clear',
    'foamCloneCase',
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(input.trim());
      if (input.trim()) {
        setHistory((prev) => [...prev, input.trim()]);
        setHistoryIndex(-1);
      }
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInput(history[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;
      const match = availableCommands.find((c) => c.startsWith(trimmed));
      if (match) {
        setInput(match + ' ');
      }
    }
  };

  const executeCommand = (cmd: string) => {
    if (!cmd) return;

    // Echo input command
    setLogs((prev) => [...prev, { type: 'cmd', text: `${promptPrefix} ${cmd}` }]);

    const parts = cmd.split(' ').filter(Boolean);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
        setLogs((prev) => [
          ...prev,
          {
            type: 'output',
            text: `OpenFOAM Windows Terminal Commands:
  blockMesh              - Executa gerador de malha 2D e recalcula métricas
  checkMesh              - Avalia qualidade da malha (ortogonalidade, aspect ratio)
  simpleFoam             - Inicia solver estacionário incompressível (regime laminar/turbulento)
  icoFoam                - Inicia solver transiente incompressível laminar
  pimpleFoam             - Inicia solver transiente com modelo de turbulência
  interFoam              - Inicia solver multifásico VOF (duas fases: líquido e gás)
  setFields [dam|bubble] - Define padrão inicial de fases multifásicas
  paraFoam [u|p|omega|k] - Alterna visualização do campo escalar no viewport
  status                 - Exibe métricas atuais (Re, Courant, Cd, Cl, tau_w)
  run / stop / step      - Controla execução da simulação
  reset                  - Reinicia os campos para o estado t = 0
  probe <x> <y>          - Amostra velocidade, pressão, vorticidade na coordenada (ex: probe 0.5 0.5)
  set <param> <valor>    - Altera parâmetros (ex: set dt 0.002, set inletU 2.0, set regime turbulent)
  cat <arquivo>          - Exibe conteúdo do dicionário (ex: cat system/controlDict)
  ls / dir               - Lista arquivos do diretório de caso (0/, constant/, system/)
  foamCloneCase <id>     - Carrega caso pré-definido (cavity, cylinderFlow, damBreak, poiseuille, etc.)
  cls / clear            - Limpa tela do terminal`,
          },
        ]);
        break;

      case 'blockmesh':
        onRebuildMesh();
        setLogs((prev) => [
          ...prev,
          {
            type: 'success',
            text: `Create time step 0
Reading blockMeshDict
Creating block mesh from arg list...
Mesh dimensions: ${mesh.config.nx} x ${mesh.config.ny}
Total cell count: ${mesh.stats.totalCells} (Active fluid cells: ${mesh.stats.activeFluidCells})
Boundary patches: inlet, outlet, topWall, bottomWall, obstacle
Writing polyMesh to constant/polyMesh: Success (Exit status 0)`,
          },
        ]);
        break;

      case 'checkmesh':
        setLogs((prev) => [
          ...prev,
          {
            type: 'output',
            text: `Checking topology...
Boundary definition OK.
Cell aspect ratio: min = ${mesh.stats.minAspectRatio}, max = ${mesh.stats.maxAspectRatio}
Non-orthogonality: ${mesh.stats.nonOrthogonality}° (Strictly orthogonal Cartesian)
Skewness: OK (< 0.1)
Mesh Quality Score: ${mesh.stats.meshQualityScore}%
Mesh verification: PASSED (OK)`,
          },
        ]);
        break;

      case 'simplefoam':
      case 'icofoam':
      case 'pimplefoam':
      case 'interfoam':
        solver.options.solverType = command as any;
        if (!isRunning) onToggleRun();
        setLogs((prev) => [
          ...prev,
          {
            type: 'success',
            text: `Starting solver '${command}'...
Time = ${solver.simulationTime.toFixed(4)} s | Iteration = ${solver.iteration}
Courant Number Mean: ${(solver.currentSummary.courantNumber * 0.5).toFixed(3)} Max: ${solver.currentSummary.courantNumber.toFixed(3)}
Solving for U, p... Convergence residuals logged.`,
          },
        ]);
        break;

      case 'run':
        if (!isRunning) onToggleRun();
        setLogs((prev) => [...prev, { type: 'success', text: 'Simulation solver RUNNING.' }]);
        break;

      case 'stop':
      case 'pause':
        if (isRunning) onToggleRun();
        setLogs((prev) => [...prev, { type: 'output', text: 'Simulation solver PAUSED.' }]);
        break;

      case 'step':
        onStep();
        setLogs((prev) => [
          ...prev,
          {
            type: 'output',
            text: `Time step completed: Iteration ${solver.iteration}, t = ${solver.simulationTime.toFixed(4)} s`,
          },
        ]);
        break;

      case 'reset':
        onReset();
        setLogs((prev) => [...prev, { type: 'output', text: 'Fields reset to t = 0.0 s.' }]);
        break;

      case 'status':
        const sum = solver.currentSummary;
        setLogs((prev) => [
          ...prev,
          {
            type: 'output',
            text: `CFD State Monitor:
  Solver: ${solver.options.solverType} | Regime: ${solver.options.regime.toUpperCase()}
  Iteration: ${sum.iteration} | Time: ${sum.simulationTime.toFixed(4)} s
  Reynolds Number (Re): ${sum.reynolds.toFixed(1)} [${sum.regimeName}]
  Courant (CFL): ${sum.courantNumber.toFixed(4)} (${sum.courantNumber <= 1.0 ? 'STABLE' : 'UNSTABLE'})
  Max Velocity (|U|): ${sum.maxVelocity.toFixed(3)} m/s
  Wall Shear (tau_w max): ${sum.maxWallShear.toFixed(4)} Pa
  Drag Coeff (Cd): ${sum.dragCoefficient.toFixed(4)} | Lift Coeff (Cl): ${sum.liftCoefficient.toFixed(4)}
  Residuals: Ux=${sum.residuals.ux.toExponential(2)}, Uy=${sum.residuals.uy.toExponential(2)}, p=${sum.residuals.p.toExponential(2)}`,
          },
        ]);
        break;

      case 'setfields':
        const mode = args[0]?.toLowerCase() === 'bubble' ? 'bubble' : 'damBreak';
        solver.setFields(mode);
        setLogs((prev) => [
          ...prev,
          {
            type: 'success',
            text: `Executing setFields... Initialized phase fraction (alpha.water) with pattern '${mode}'.`,
          },
        ]);
        break;

      case 'probe':
        if (args.length < 2) {
          setLogs((prev) => [
            ...prev,
            { type: 'error', text: 'Usage: probe <x> <y>  (e.g., probe 0.5 0.2)' },
          ]);
          return;
        }
        const px = parseFloat(args[0]);
        const py = parseFloat(args[1]);
        if (isNaN(px) || isNaN(py)) {
          setLogs((prev) => [...prev, { type: 'error', text: 'Coordinates must be valid numbers.' }]);
          return;
        }
        const sample = solver.probeAt(px, py);
        setLogs((prev) => [
          ...prev,
          {
            type: 'output',
            text: `Probe at coordinate (${px.toFixed(3)}m, ${py.toFixed(3)}m):
  Velocity U: (${sample.u.toFixed(4)}, ${sample.v.toFixed(4)}) m/s | |U| = ${sample.velocityMagnitude.toFixed(4)} m/s
  Static Pressure p: ${sample.pressure.toFixed(3)} Pa
  Vorticity (omega_z): ${sample.vorticity.toFixed(3)} s^-1
  Wall Shear Stress: ${sample.wallShearStress.toFixed(5)} Pa
  y+ (Wall Distance): ${sample.yPlus.toFixed(2)}
  Phase Fraction (alpha): ${sample.phaseAlpha.toFixed(3)}`,
          },
        ]);
        break;

      case 'parafoam':
        const targetField = args[0]?.toLowerCase() || 'u';
        if (['u', 'p', 'vorticity', 'tke', 'alpha'].includes(targetField)) {
          onSelectField(targetField === 'u' ? 'velocity' : targetField);
          setLogs((prev) => [
            ...prev,
            { type: 'success', text: `paraFoam: Viewport colormap switched to '${targetField}'.` },
          ]);
        } else {
          setLogs((prev) => [
            ...prev,
            { type: 'output', text: "paraFoam options: paraFoam u | p | vorticity | tke | alpha" },
          ]);
        }
        break;

      case 'set':
        if (args.length < 2) {
          setLogs((prev) => [
            ...prev,
            { type: 'error', text: 'Usage: set <param> <value> (e.g., set dt 0.002, set inletU 2.5, set regime turbulent)' },
          ]);
          return;
        }
        const param = args[0].toLowerCase();
        const val = args[1];

        if (param === 'dt' || param === 'timestep') {
          solver.options.timeStep = parseFloat(val) || 0.005;
          setLogs((prev) => [...prev, { type: 'success', text: `Time step dt set to ${solver.options.timeStep} s` }]);
        } else if (param === 'inletu' || param === 'velocity') {
          solver.options.inletVelocity = parseFloat(val) || 1.0;
          setLogs((prev) => [...prev, { type: 'success', text: `Inlet velocity set to ${solver.options.inletVelocity} m/s` }]);
        } else if (param === 'regime') {
          if (['laminar', 'transitional', 'turbulent'].includes(val)) {
            solver.options.regime = val as any;
            setLogs((prev) => [...prev, { type: 'success', text: `Flow regime set to '${val}'` }]);
          } else {
            setLogs((prev) => [...prev, { type: 'error', text: "Regime must be 'laminar', 'transitional' or 'turbulent'" }]);
          }
        } else if (param === 'slip') {
          solver.options.wallCondition = 'partialSlip';
          solver.options.slipFactor = Math.max(0, Math.min(1, parseFloat(val) || 0.5));
          setLogs((prev) => [...prev, { type: 'success', text: `Wall slip factor set to ${solver.options.slipFactor}` }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', text: `Unknown parameter '${param}'` }]);
        }
        break;

      case 'cat':
        if (args.length === 0) {
          setLogs((prev) => [...prev, { type: 'error', text: 'Usage: cat <filename> (e.g., cat system/controlDict)' }]);
          return;
        }
        const filePath = args[0];
        const fileContent = activeCase.foamFiles[filePath];
        if (fileContent) {
          setLogs((prev) => [...prev, { type: 'output', text: `--- ${filePath} ---\n${fileContent}` }]);
        } else {
          setLogs((prev) => [
            ...prev,
            {
              type: 'error',
              text: `File '${filePath}' not found. Available files: ${Object.keys(activeCase.foamFiles).join(', ')}`,
            },
          ]);
        }
        break;

      case 'ls':
      case 'dir':
        setLogs((prev) => [
          ...prev,
          {
            type: 'output',
            text: `Directory listing of ${activeCase.id}/:
  [DIR]  0/
  [DIR]  constant/
  [DIR]  system/
  Files:
  ${Object.keys(activeCase.foamFiles).join('\n  ')}`,
          },
        ]);
        break;

      case 'foamclonecase':
        if (args.length === 0) {
          const ids = CASE_PRESETS.map((c) => c.id).join(', ');
          setLogs((prev) => [
            ...prev,
            { type: 'output', text: `Usage: foamCloneCase <case_id>\nAvailable cases: ${ids}` },
          ]);
          return;
        }
        const targetId = args[0];
        const found = CASE_PRESETS.find((c) => c.id.toLowerCase() === targetId.toLowerCase());
        if (found) {
          onSwitchCase(found.id);
          setLogs((prev) => [
            ...prev,
            { type: 'success', text: `Cloned and loaded case '${found.id}' successfully.` },
          ]);
        } else {
          setLogs((prev) => [
            ...prev,
            { type: 'error', text: `Case '${targetId}' not found. Use 'foamCloneCase' to view list.` },
          ]);
        }
        break;

      case 'cls':
      case 'clear':
        setLogs([]);
        break;

      default:
        setLogs((prev) => [
          ...prev,
          {
            type: 'error',
            text: `'${command}' is not recognized as an internal OpenFOAM command. Type 'help' for command list.`,
          },
        ]);
    }
  };

  const copyTerminalOutput = () => {
    const text = logs.map((l) => l.text).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-mono border-t border-slate-800 text-xs select-text">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-300">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-xs tracking-wide">
            OpenFOAM Windows Terminal & Prompt
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {activeCase.id}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setShellStyle((prev) => (prev === 'windows_conda' ? 'foam_bash' : 'windows_conda'))
            }
            className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
            title="Alternar estilo de prompt (Anaconda CMD / Bash)"
          >
            {shellStyle === 'windows_conda' ? 'Anaconda Prompt (CMD)' : 'OpenFOAM Bash'}
          </button>
          <button
            onClick={() => executeCommand('help')}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
            title="Ajuda de comandos"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={copyTerminalOutput}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
            title="Copiar log"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setLogs([])}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
            title="Limpar terminal (cls)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Log Output */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px] leading-relaxed">
        {logs.map((log, index) => (
          <div
            key={index}
            className={`whitespace-pre-wrap break-all ${
              log.type === 'cmd'
                ? 'text-cyan-300 font-semibold mt-1'
                : log.type === 'error'
                ? 'text-rose-400'
                : log.type === 'success'
                ? 'text-emerald-400'
                : log.type === 'system'
                ? 'text-amber-300 font-semibold'
                : 'text-slate-300'
            }`}
          >
            {log.text}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Input Line */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-t border-slate-800">
        <span className="text-emerald-400 font-semibold select-none text-[11px]">
          {promptPrefix}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite um comando OpenFOAM (ex: blockMesh, simpleFoam, status, help)..."
          className="flex-1 bg-transparent text-slate-100 outline-none text-[11px] font-mono placeholder:text-slate-600"
          autoFocus
        />
        <button
          onClick={() => {
            executeCommand(input.trim());
            if (input.trim()) setHistory((p) => [...p, input.trim()]);
            setInput('');
          }}
          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
