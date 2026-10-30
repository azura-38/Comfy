import React, { useEffect, useState } from 'react';
import { Crop, Grid2X2, ImagePlus, Save, Trash2, X } from 'lucide-react';
import { CharacterPoseSprite, CharacterSheet } from '../utils/workflowEngine';

interface SpriteSheetEditorProps {
  character: CharacterSheet;
  onChange: (character: CharacterSheet) => void;
  onClose: () => void;
}
interface Rect { x: number; y: number; w: number; h: number; }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const slug = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the sprite sheet image.'));
    image.src = src;
  });
}
function cropDataUrl(image: HTMLImageElement, x: number, y: number, w: number, h: number): string {
  const scale = Math.min(1, 512 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create crop canvas.');
  ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.82);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}
async function saveLocalImage(dataUrl: string, fileName: string): Promise<string> {
  const response = await fetch('/api/assets/character-sprite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, fileName }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) throw new Error(body.error || 'Failed to save image locally.');
  return String(body.url);
}
async function compressImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, 1800 / image.naturalWidth, 1800 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create image compression canvas.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.86);
    return {
      dataUrl: webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  } finally { URL.revokeObjectURL(objectUrl); }
}

export const SpriteSheetEditor: React.FC<SpriteSheetEditorProps> = ({ character, onChange, onClose }) => {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [poseLabel, setPoseLabel] = useState('POSE_CUSTOM');
  const [poseDescription, setPoseDescription] = useState('Manually selected pose or angle');
  const [aliasesDraft, setAliasesDraft] = useState((character.aliases || []).join(', '));
  const [selection, setSelection] = useState<Rect | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editingPoseLabel, setEditingPoseLabel] = useState<string | null>(null);
  const [editedLabel, setEditedLabel] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  useEffect(() => {
    setAliasesDraft((character.aliases || []).join(', '));
    setSelection(null);
  }, [character.id]);

  const imageUrl = character.customImageUrl;
  const width = character.spriteSheetWidth || 0;
  const height = character.spriteSheetHeight || 0;

  const point = (event: React.PointerEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  };
  const startCrop = (event: React.PointerEvent<HTMLImageElement>) => {
    const p = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragOrigin(p);
    setSelection({ x: p.x, y: p.y, w: 0, h: 0 });
    setDragging(true);
  };
  const moveCrop = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragOrigin || !dragging) return;
    const p = point(event);
    setSelection({ x: Math.min(dragOrigin.x, p.x), y: Math.min(dragOrigin.y, p.y), w: Math.abs(p.x - dragOrigin.x), h: Math.abs(p.y - dragOrigin.y) });
  };
  const endCrop = (event: React.PointerEvent<HTMLImageElement>) => {
    if (dragOrigin) {
      const p = point(event);
      setSelection({ x: Math.min(dragOrigin.x, p.x), y: Math.min(dragOrigin.y, p.y), w: Math.abs(p.x - dragOrigin.x), h: Math.abs(p.y - dragOrigin.y) });
    }
    setDragging(false);
    setDragOrigin(null);
  };

  const uploadSheet = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessage('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    setBusy(true);
    setMessage('Preparing and saving sprite sheet locally…');
    try {
      const compressed = await compressImage(file);
      const url = await saveLocalImage(compressed.dataUrl, file.name);
      onChange({ ...character, customImageUrl: url, spriteSheetFileName: file.name, spriteSheetWidth: compressed.width, spriteSheetHeight: compressed.height, poses: [] });
      setSelection(null);
      setMessage('Sprite sheet saved. Split it with a grid or draw a crop region.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not process sprite sheet.');
    } finally { setBusy(false); }
  };

  const createPose = async (image: HTMLImageElement, rect: Rect, rawLabel: string, description: string): Promise<CharacterPoseSprite> => {
    const clean = slug(rawLabel);
    const label = clean.startsWith('POSE_') ? clean : 'POSE_' + (clean || 'CUSTOM');
    const dataUrl = cropDataUrl(image, rect.x, rect.y, rect.w, rect.h);
    const url = await saveLocalImage(dataUrl, character.label + '_' + label + '.webp');
    return {
      poseLabel: label,
      description,
      keyframeCrop: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)].join(','),
      cropImageUrl: url,
    };
  };

  const splitGrid = async () => {
    if (!imageUrl || !width || !height) { setMessage('Upload a sprite sheet first.'); return; }
    const r = Math.max(1, Math.min(6, Math.floor(rows)));
    const c = Math.max(1, Math.min(6, Math.floor(columns)));
    setBusy(true);
    setMessage('Splitting the sheet into ' + (r * c) + ' crop references…');
    try {
      const image = await loadImage(imageUrl);
      const poses: CharacterPoseSprite[] = [];
      for (let row = 0; row < r; row += 1) {
        for (let col = 0; col < c; col += 1) {
          const x = Math.round(col * width / c);
          const y = Math.round(row * height / r);
          const right = Math.round((col + 1) * width / c);
          const bottom = Math.round((row + 1) * height / r);
          const label = 'POSE_GRID_R' + String(row + 1).padStart(2, '0') + '_C' + String(col + 1).padStart(2, '0');
          poses.push(await createPose(image, { x, y, w: right - x, h: bottom - y }, label, 'Grid cell ' + (row + 1) + ', column ' + (col + 1)));
        }
      }
      onChange({ ...character, poses });
      setMessage('Created ' + poses.length + ' separate crop references. Review and remove unused cells.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not split the sprite sheet.');
    } finally { setBusy(false); }
  };

  const saveManualCrop = async () => {
    if (!imageUrl || !selection || !width || !height || selection.w < 0.015 || selection.h < 0.015) {
      setMessage('Drag a rectangle around a pose or angle first.');
      return;
    }
    setBusy(true);
    try {
      const image = await loadImage(imageUrl);
      const x = Math.max(0, Math.round(selection.x * width));
      const y = Math.max(0, Math.round(selection.y * height));
      const w = Math.min(width - x, Math.max(1, Math.round(selection.w * width)));
      const h = Math.min(height - y, Math.max(1, Math.round(selection.h * height)));
      const pose = await createPose(image, { x, y, w, h }, poseLabel, poseDescription);
      onChange({ ...character, poses: [...character.poses.filter((p) => p.poseLabel !== pose.poseLabel), pose] });
      setSelection(null);
      setPoseLabel('POSE_CUSTOM');
      setMessage('Saved ' + pose.poseLabel + '.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the manual crop.');
    } finally { setBusy(false); }
  };

  const saveAliases = () => {
    const aliases = Array.from(new Set(aliasesDraft.split(',').map((v) => v.trim()).filter(Boolean)));
    onChange({ ...character, aliases });
    setMessage('Saved ' + aliases.length + ' character name aliases.');
  };

  const startEditingPose = (pose: CharacterPoseSprite) => {
    setEditingPoseLabel(pose.poseLabel);
    setEditedLabel(pose.poseLabel);
    setEditedDescription(pose.description);
  };

  const saveEditedPose = (oldLabel: string) => {
    const clean = slug(editedLabel);
    const label = clean.startsWith('POSE_') ? clean : 'POSE_' + (clean || 'CUSTOM');
    const alreadyUsed = character.poses.some((pose) => pose.poseLabel === label && pose.poseLabel !== oldLabel);
    if (alreadyUsed) {
      setMessage('That pose label already exists for this character.');
      return;
    }
    const poses = character.poses.map((pose) =>
      pose.poseLabel === oldLabel
        ? { ...pose, poseLabel: label, description: editedDescription.trim() || label }
        : pose
    );
    onChange({ ...character, poses });
    setEditingPoseLabel(null);
    setMessage('Updated pose label and description.');
  };

  const removePose = (label: string) => onChange({ ...character, poses: character.poses.filter((p) => p.poseLabel !== label) });

  return (
    <section className="space-y-5 rounded-xl border border-amber-500/35 bg-[#111724] p-5" aria-label={'Sprite sheet editor for ' + character.displayName}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Sprite Sheet · {character.displayName}</h3>
          <p className="mt-1 text-xs text-slate-400">The source and small pose crops are stored as local assets, separate from workspace settings.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close sprite editor"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-300">Upload or replace sprite sheet
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { void uploadSheet(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-amber-500 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-950" />
          </label>
          {imageUrl && <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-2 text-xs text-slate-400"><div className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-amber-300" />{character.spriteSheetFileName || 'Character reference image'}</div><div className="mt-1 font-mono">{width}×{height} · {character.poses.length} crop references</div></div>}
          <div className="space-y-1">
            <label htmlFor={'aliases-' + character.id} className="text-xs font-medium text-slate-300">Names used in storyboard (comma separated)</label>
            <input id={'aliases-' + character.id} value={aliasesDraft} onChange={(e) => setAliasesDraft(e.target.value)} placeholder="Kaan, Kaan-kun, protagonist" className="w-full rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100" />
            <button type="button" onClick={saveAliases} disabled={busy} className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700">Save aliases</button>
          </div>
          {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Grid split</h4>
          <p className="text-xs text-slate-400">Best for evenly spaced sheets; every cell becomes its own image reference.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-400">Rows<input type="number" min={1} max={6} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} className="mt-1 block w-20 rounded-md border border-slate-800 bg-[#0B0F17] px-2 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Columns<input type="number" min={1} max={6} value={columns} onChange={(e) => setColumns(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} className="mt-1 block w-20 rounded-md border border-slate-800 bg-[#0B0F17] px-2 py-2 text-sm text-white" /></label>
            <button type="button" disabled={!imageUrl || busy} onClick={() => void splitGrid()} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"><Grid2X2 className="h-4 w-4" /> Split grid</button>
          </div>
          <p className="text-[11px] text-slate-500">Grid split is limited to 36 cells. Uneven sheets should use manual crop.</p>
        </div>
      </div>
      {imageUrl && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Manual crop · choose pose or angle</h4><p className="mt-1 text-xs text-slate-400">Drag a rectangle on the image. This works better for irregular reference collages.</p></div>
          <div className="max-h-[460px] overflow-auto rounded-lg border border-slate-800 bg-[#0B0F17] p-2">
            <div className="relative inline-block max-w-full align-top">
              <img src={imageUrl} alt={character.displayName + ' sprite sheet'} draggable={false} onPointerDown={startCrop} onPointerMove={moveCrop} onPointerUp={endCrop} onPointerCancel={() => { setDragging(false); setDragOrigin(null); }} className="block max-h-[420px] max-w-full select-none object-contain touch-none cursor-crosshair" />
              {selection && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-amber-300 bg-amber-300/15" style={{ left: (selection.x * 100) + '%', top: (selection.y * 100) + '%', width: (selection.w * 100) + '%', height: (selection.h * 100) + '%' }} />}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-400">Pose label<input value={poseLabel} onChange={(e) => setPoseLabel(e.target.value)} placeholder="POSE_SIDE" className="mt-1 block w-full rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs text-white" /></label>
            <label className="text-xs text-slate-400 md:col-span-2">Pose description<input value={poseDescription} onChange={(e) => setPoseDescription(e.target.value)} placeholder="Left profile, neutral expression" className="mt-1 block w-full rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs text-white" /></label>
          </div>
          <button type="button" disabled={busy || !selection || selection.w < 0.015 || selection.h < 0.015} onClick={() => void saveManualCrop()} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"><Crop className="h-4 w-4" /> Save selected crop</button>
        </div>
      )}
      <div className="space-y-3 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Saved pose references</h4><span className="font-mono text-xs text-slate-500">{character.poses.length} items</span></div>
        {character.poses.length === 0 ? <p className="rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-500">No crops yet. Upload a sheet, then split the grid or draw a manual crop.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {character.poses.map((pose) => <article key={pose.poseLabel} className="overflow-hidden rounded-lg border border-slate-800 bg-[#0B0F17]">
              {pose.cropImageUrl ? <img src={pose.cropImageUrl} alt={pose.poseLabel} className="h-36 w-full bg-black object-contain" /> : <div className="flex h-36 items-center justify-center text-xs text-slate-600">No crop image</div>}
              <div className="space-y-1 p-2">
                {editingPoseLabel === pose.poseLabel ? (
                  <div className="space-y-2">
                    <input aria-label="Edit pose label" value={editedLabel} onChange={(e) => setEditedLabel(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-amber-100" />
                    <input aria-label="Edit pose description" value={editedDescription} onChange={(e) => setEditedDescription(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-200" />
                    <button type="button" onClick={() => saveEditedPose(pose.poseLabel)} className="rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-slate-950">Save</button>
                    <button type="button" onClick={() => setEditingPoseLabel(null)} className="ml-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">Cancel</button>
                  </div>
                ) : (
                  <>
                    <p className="break-words font-mono text-[10px] text-amber-200">{pose.poseLabel}</p>
                    <p className="line-clamp-2 text-[10px] text-slate-400">{pose.description}</p>
                    <p className="font-mono text-[10px] text-slate-600">{pose.keyframeCrop}</p>
                    <button type="button" onClick={() => startEditingPose(pose)} disabled={busy} className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-amber-200 hover:bg-slate-800">Rename / retag</button>
                    <button type="button" onClick={() => removePose(pose.poseLabel)} disabled={busy} aria-label={'Remove ' + pose.poseLabel} className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-red-950 hover:text-red-300"><Trash2 className="h-3 w-3" /> Remove</button>
                  </>
                )}
              </div>
            </article>)}
          </div>
        )}
      </div>
      {busy && <div className="flex items-center gap-2 text-xs text-amber-200"><Save className="h-4 w-4 animate-pulse" />Saving local character assets…</div>}
    </section>
  );
};
