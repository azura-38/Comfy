import React, { useState } from 'react';
import { SpriteSheetEditor } from './SpriteSheetEditor';
import {
  Plus,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Maximize2,
  Trash2,
} from 'lucide-react';
import {
  CharacterSheet,
  GenreSetting,
  validateCharacterDimensionLock,
  parseCharacterSpreadsheetCSV,
} from '../utils/workflowEngine';

interface CharacterSheetsViewProps {
  characters: CharacterSheet[];
  targetWidth: number;
  targetHeight: number;
  onAddCharacter: (char: CharacterSheet) => void;
  onUpdateCharacter: (char: CharacterSheet) => void;
  onDeleteCharacter: (id: string) => void;
  onImportCSVCharacters: (chars: CharacterSheet[]) => void;
  onSyncAllDimensions: () => void;
}

export const CharacterSheetsView: React.FC<CharacterSheetsViewProps> = ({
  characters,
  targetWidth,
  targetHeight,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onImportCSVCharacters,
  onSyncAllDimensions,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newGenre, setNewGenre] = useState<GenreSetting>('Cyberpunk');
  const [newWidth, setNewWidth] = useState<number>(targetWidth);
  const [newHeight, setNewHeight] = useState<number>(targetHeight);
  const [newTrigger, setNewTrigger] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [activeSpriteEditorId, setActiveSpriteEditorId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const [csvInput, setCsvInput] = useState(
    'label,displayName,role,genre,sheetWidth,sheetHeight,triggerWord\nCHAR_SERA,Sera Nyx,Void Navigator,Sci-Fi,1080,1920,sera_nyx_void_916'
  );
  const [showCsvPanel, setShowCsvPanel] = useState(false);

  const dimStatus = validateCharacterDimensionLock(
    characters,
    targetWidth,
    targetHeight
  );

  const handleCreateCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedLabel = newLabel.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const trimmedName = newName.trim();
    if (!trimmedLabel || !trimmedName) {
      setFormError('Character Label (e.g. CHAR_NYX) and Display Name are required.');
      return;
    }

    const formattedLabel = trimmedLabel.startsWith('CHAR_')
      ? trimmedLabel
      : `CHAR_${trimmedLabel}`;

    if (characters.some((c) => c.label === formattedLabel)) {
      setFormError(`Spreadsheet label ${formattedLabel} already exists.`);
      return;
    }

    const created: CharacterSheet = {
      id: `char-${Date.now()}`,
      label: formattedLabel,
      displayName: trimmedName,
      aliases: newAliases.split(',').map((alias) => alias.trim()).filter(Boolean),
      role: newRole.trim() || 'Supporting Lead',
      genre: newGenre,
      sheetWidth: Number(newWidth) || targetWidth,
      sheetHeight: Number(newHeight) || targetHeight,
      aspectRatio: '9:16',
      triggerWord:
        newTrigger.trim() || `${formattedLabel.toLowerCase()}_sheet_916`,
      ipAdapterWeight: 0.9,
      lipSyncRegion: { x: 460, y: 515, w: 160, h: 110 },
      palettePrimary: '#1E293B',
      paletteAccent:
        newGenre === 'Sci-Fi'
          ? '#38BDF8'
          : newGenre === 'Fantasy'
          ? '#EF4444'
          : '#F59E0B',
      poses: [
        {
          poseLabel: 'POSE_NEUTRAL',
          description: 'Standard 3/4 vertical reference stance',
          keyframeCrop: `0,0,${newWidth},${newHeight}`,
        },
        {
          poseLabel: 'POSE_DRAMATIC',
          description: 'High-contrast action keyframe',
          keyframeCrop: `1080,0,${newWidth},${newHeight}`,
        },
        {
          poseLabel: 'POSE_CLOSEUP',
          description: 'Tight portrait for silent subtitle lip-sync',
          keyframeCrop: `2160,0,${newWidth},${newHeight}`,
        },
      ],
    };

    onAddCharacter(created);
    setNewLabel('');
    setNewName('');
    setNewRole('');
    setNewTrigger('');
    setNewAliases('');
    setFormError('');
  };

  const handleImportCSV = () => {
    const parsed = parseCharacterSpreadsheetCSV(csvInput);
    if (parsed.length > 0) {
      onImportCSVCharacters(parsed);
      setShowCsvPanel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Dimension Lock Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111724] border border-slate-800/80 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            01. Character Spreadsheets & Frame Dimension Lock
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Each character spreadsheet maps a single label (e.g.{' '}
            <code className="font-mono text-amber-300">[CHAR_KAEL]</code>) to
            IPAdapter reference sprites, pose regions, and silent lip-sync mouth
            coordinates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-xs font-mono tabular-nums text-slate-300 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800">
            {dimStatus.allLocked ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  All {characters.length} Sheets Locked to {targetWidth}×{targetHeight} (
                  {dimStatus.aspectRatioString})
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  {dimStatus.mismatchedIds.length} Sheet Dimension Mismatch
                </span>
              </span>
            )}
          </div>

          {!dimStatus.allLocked && (
            <button
              type="button"
              onClick={onSyncAllDimensions}
              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
            >
              Auto-Lock All to {targetWidth}×{targetHeight}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCsvPanel(!showCsvPanel)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Batch CSV Spreadsheet Import</span>
          </button>
        </div>
      </div>

      {/* Optional CSV Import Drawer */}
      {showCsvPanel && (
        <div className="bg-[#111724] border border-slate-800/80 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Import Character Spreadsheet Rows (CSV)
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Format: label,displayName,role,genre,sheetWidth,sheetHeight,triggerWord
            </span>
          </div>
          <textarea
            aria-label="Character CSV Spreadsheet Data"
            rows={3}
            value={csvInput}
            onChange={(e) => setCsvInput(e.target.value)}
            className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCsvPanel(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportCSV}
              className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400"
            >
              Parse & Append Spreadsheet Rows
            </button>
          </div>
        </div>
      )}

      {/* High-Density Character Spreadsheet Table */}
      <div className="bg-[#111724] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-slate-900/50">
                <th className="py-3 px-4">Spreadsheet Label</th>
                <th className="py-3 px-4">Character Name & Role</th>
                <th className="py-3 px-4">Setting</th>
                <th className="py-3 px-4 text-right">Frame Dimensions</th>
                <th className="py-3 px-4 text-right">IPAdapter Weight</th>
                <th className="py-3 px-4">Mapped Poses</th>
                <th className="py-3 px-4">Sprite Sheet & Crops</th>
                <th className="py-3 px-4">Silent Lip-Sync ROI</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {characters.map((char) => {
                const isMatched =
                  char.sheetWidth === targetWidth &&
                  char.sheetHeight === targetHeight;
                return (
                  <tr
                    key={char.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-amber-300">
                      [{char.label}]
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-100">
                        {char.displayName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {char.role} · Trigger:{' '}
                        <span className="font-mono text-slate-300">
                          {char.triggerWord}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      {char.genre}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                      <span
                        className={
                          isMatched ? 'text-emerald-400' : 'text-amber-400'
                        }
                      >
                        {char.sheetWidth}×{char.sheetHeight}
                      </span>
                      <span className="text-slate-500 ml-1">
                        ({isMatched ? 'Locked' : 'Mismatch'})
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="range"
                          aria-label={`IPAdapter weight for ${char.displayName}`}
                          min="0.4"
                          max="1.0"
                          step="0.02"
                          value={char.ipAdapterWeight}
                          onChange={(e) =>
                            onUpdateCharacter({
                              ...char,
                              ipAdapterWeight: Number(e.target.value),
                            })
                          }
                          className="w-20 accent-amber-500 cursor-pointer"
                        />
                        <span className="w-9 text-slate-200">
                          {char.ipAdapterWeight.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                      {char.poses.map((p) => p.poseLabel).join(' · ')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="mb-1 text-[11px] text-slate-400">
                        {char.customImageUrl ? 'Source saved' : 'No source sheet'} · {char.poses.length} crops
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSpriteEditorId(activeSpriteEditorId === char.id ? null : char.id)}
                        className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/25"
                      >
                        {activeSpriteEditorId === char.id ? 'Close editor' : char.customImageUrl ? 'Manage sprites' : 'Add sprite sheet'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-400">
                      X:{char.lipSyncRegion.x} Y:{char.lipSyncRegion.y} (
                      {char.lipSyncRegion.w}×{char.lipSyncRegion.h})
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteCharacter(char.id)}
                        aria-label={`Delete character ${char.displayName}`}
                        disabled={characters.length <= 1}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeSpriteEditorId && characters.some((character) => character.id === activeSpriteEditorId) && (
        <SpriteSheetEditor
          character={characters.find((character) => character.id === activeSpriteEditorId)!}
          onChange={onUpdateCharacter}
          onClose={() => setActiveSpriteEditorId(null)}
        />
      )}

      {/* Add Character Spreadsheet Row Form */}
      <form
        onSubmit={handleCreateCharacter}
        className="bg-[#111724] border border-slate-800/80 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            Register New Character Spreadsheet Asset
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Auto-syncs with Storyboard [CHAR_*] labels
          </span>
        </div>

        {formError && (
          <p className="text-xs text-red-400 font-medium" role="alert">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div>
            <label
              htmlFor="char-label-input"
              className="block text-xs text-slate-400 mb-1"
            >
              Spreadsheet Label
            </label>
            <input
              id="char-label-input"
              type="text"
              placeholder="CHAR_ORION"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label
              htmlFor="char-name-input"
              className="block text-xs text-slate-400 mb-1"
            >
              Character Name
            </label>
            <input
              id="char-name-input"
              type="text"
              placeholder="Commander Orion"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label
              htmlFor="char-role-input"
              className="block text-xs text-slate-400 mb-1"
            >
              Narrative Role
            </label>
            <input
              id="char-role-input"
              type="text"
              placeholder="Starfleet Vanguard"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label
              htmlFor="char-genre-select"
              className="block text-xs text-slate-400 mb-1"
            >
              Setting Genre
            </label>
            <select
              id="char-genre-select"
              value={newGenre}
              onChange={(e) => setNewGenre(e.target.value as GenreSetting)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="Cyberpunk">Cyberpunk</option>
              <option value="Sci-Fi">Sci-Fi</option>
              <option value="Fantasy">Fantasy</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="char-dim-width"
              className="block text-xs text-slate-400 mb-1"
            >
              Sheet Width × Height
            </label>
            <div className="flex items-center gap-1">
              <input
                id="char-dim-width"
                type="number"
                value={newWidth}
                onChange={(e) => setNewWidth(Number(e.target.value))}
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
              <span className="text-slate-500 text-xs">×</span>
              <input
                id="char-dim-height"
                aria-label="Sheet Height"
                type="number"
                value={newHeight}
                onChange={(e) => setNewHeight(Number(e.target.value))}
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="char-aliases-input"
              className="block text-xs text-slate-400 mb-1"
            >
              Storyboard Name Aliases
            </label>
            <input
              id="char-aliases-input"
              type="text"
              placeholder="Kaan, Kaan-kun"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Sheet Row</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
