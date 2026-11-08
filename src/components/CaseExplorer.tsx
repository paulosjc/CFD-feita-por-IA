/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Case Explorer & OpenFOAM Dictionary Editor
 */

import React, { useState } from 'react';
import { Folder, FileText, CheckCircle2, ChevronRight, ChevronDown, Play, BookOpen } from 'lucide-react';
import { CASE_PRESETS, CasePreset } from '../cfd/caseManager';

interface CaseExplorerProps {
  activeCase: CasePreset;
  onSelectCase: (casePreset: CasePreset) => void;
  onUpdateCaseFile: (filename: string, content: string) => void;
}

export const CaseExplorer: React.FC<CaseExplorerProps> = ({
  activeCase,
  onSelectCase,
  onUpdateCaseFile,
}) => {
  const [selectedFile, setSelectedFile] = useState<string>('system/controlDict');
  const [editorContent, setEditorContent] = useState<string>(
    activeCase.foamFiles['system/controlDict'] || ''
  );
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    '0': true,
    constant: true,
    system: true,
  });

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const handleFileClick = (filename: string) => {
    setSelectedFile(filename);
    setEditorContent(activeCase.foamFiles[filename] || '');
  };

  const handleCaseChange = (preset: CasePreset) => {
    onSelectCase(preset);
    const firstKey = Object.keys(preset.foamFiles)[0] || 'system/controlDict';
    setSelectedFile(firstKey);
    setEditorContent(preset.foamFiles[firstKey] || '');
  };

  const filesByDir = {
    '0': Object.keys(activeCase.foamFiles).filter((f) => f.startsWith('0/')),
    constant: Object.keys(activeCase.foamFiles).filter((f) => f.startsWith('constant/')),
    system: Object.keys(activeCase.foamFiles).filter((f) => f.startsWith('system/')),
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 border-r border-slate-800 text-xs overflow-hidden select-none">
      {/* Header */}
      <div className="p-2.5 bg-slate-900 border-b border-slate-800">
        <div className="font-semibold text-slate-100 mb-1 flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span>Casos de Estudo OpenFOAM</span>
        </div>
        <select
          value={activeCase.id}
          onChange={(e) => {
            const preset = CASE_PRESETS.find((c) => c.id === e.target.value);
            if (preset) handleCaseChange(preset);
          }}
          className="w-full bg-slate-800 text-slate-100 text-xs px-2 py-1.5 rounded border border-slate-700 outline-none focus:border-cyan-500"
        >
          {CASE_PRESETS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-400 mt-1 leading-snug">{activeCase.description}</p>
      </div>

      {/* Directory Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
        <div className="text-[10px] uppercase text-slate-500 font-sans px-1 font-semibold mb-1">
          Estrutura do Caso: {activeCase.id}/
        </div>

        {/* 0/ Directory */}
        <div>
          <div
            onClick={() => toggleFolder('0')}
            className="flex items-center gap-1.5 px-1 py-1 hover:bg-slate-800/70 rounded cursor-pointer text-slate-300"
          >
            {openFolders['0'] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">0/ (Condições Iniciais e Contorno)</span>
          </div>
          {openFolders['0'] && (
            <div className="pl-6 space-y-0.5">
              {filesByDir['0'].map((f) => (
                <div
                  key={f}
                  onClick={() => handleFileClick(f)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    selectedFile === f ? 'bg-cyan-950 text-cyan-300 font-bold' : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <FileText className="w-3 h-3 text-cyan-400" />
                  <span>{f.replace('0/', '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* constant/ Directory */}
        <div>
          <div
            onClick={() => toggleFolder('constant')}
            className="flex items-center gap-1.5 px-1 py-1 hover:bg-slate-800/70 rounded cursor-pointer text-slate-300"
          >
            {openFolders.constant ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">constant/ (Propriedades Físicas)</span>
          </div>
          {openFolders.constant && (
            <div className="pl-6 space-y-0.5">
              {filesByDir.constant.map((f) => (
                <div
                  key={f}
                  onClick={() => handleFileClick(f)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    selectedFile === f ? 'bg-cyan-950 text-cyan-300 font-bold' : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <FileText className="w-3 h-3 text-cyan-400" />
                  <span>{f.replace('constant/', '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* system/ Directory */}
        <div>
          <div
            onClick={() => toggleFolder('system')}
            className="flex items-center gap-1.5 px-1 py-1 hover:bg-slate-800/70 rounded cursor-pointer text-slate-300"
          >
            {openFolders.system ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">system/ (Controles & Esquemas)</span>
          </div>
          {openFolders.system && (
            <div className="pl-6 space-y-0.5">
              {filesByDir.system.map((f) => (
                <div
                  key={f}
                  onClick={() => handleFileClick(f)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                    selectedFile === f ? 'bg-cyan-950 text-cyan-300 font-bold' : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <FileText className="w-3 h-3 text-cyan-400" />
                  <span>{f.replace('system/', '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dictionary Preview Editor */}
        <div className="mt-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[10px] text-cyan-400 font-sans font-semibold">
              {selectedFile}
            </span>
            <button
              onClick={() => onUpdateCaseFile(selectedFile, editorContent)}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-700"
            >
              Salvar Dict
            </button>
          </div>
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            rows={8}
            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-[10px] font-mono text-slate-300 leading-snug outline-none focus:border-cyan-500 resize-none"
          />
        </div>
      </div>
    </div>
  );
};
