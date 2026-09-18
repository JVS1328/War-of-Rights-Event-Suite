import { useState } from 'react';
import {
  MapPin, Shield, Train, Zap, Waves, Pencil, Trash2, X, Check, Star,
  CheckCheck, Undo2, Sparkles
} from 'lucide-react';

/**
 * MapFeaturesPanel — Grand Campaign palette + roster for map overlays.
 *
 * Tool selection decides what the next map-click does:
 *   city / fort / station → drop a point (uses side + capital toggle)
 *   railway / river       → accumulate points into a polyline draft,
 *                           then Finish to commit or Undo/Cancel to back out.
 *
 * Existing features are listed below the palette with rename / side / delete.
 */
const MapFeaturesPanel = ({
  campaign,
  tool,
  pointSide,
  pointIsCapital,
  lineDraft,
  onSelectTool,
  onChangePointSide,
  onTogglePointCapital,
  onFinishLine,
  onCancelLine,
  onUndoLinePoint,
  onUpdateFeature,
  onRemoveFeature,
  onExitEditMode,
  onLoadPreset,
}) => {
  const gc = campaign?.grandCampaign;
  const [editingId, setEditingId] = useState(null);
  const [nameDraft, setNameDraft] = useState('');

  if (!gc) return null;
  const mf = gc.mapFeatures;

  const isLineTool = tool === 'railway' || tool === 'river';

  const toolBtn = (key, label, Icon) => (
    <button
      key={key}
      onClick={() => onSelectTool(tool === key ? null : key)}
      className={`flex flex-col items-center gap-1 rounded p-2 border ${
        tool === key
          ? 'bg-brass-500 border-brass-400 text-white'
          : 'bg-ink-800 border-ink-700 text-mist-300 hover:bg-ink-700'
      }`}
      title={label}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );

  const sideToggle = (
    <div className="flex gap-1">
      {['USA', 'CSA', 'NEUTRAL'].map(s => (
        <button
          key={s}
          onClick={() => onChangePointSide(s)}
          className={`flex-1 px-2 py-1 rounded text-xs font-semibold ${
            pointSide === s
              ? s === 'USA'
                ? 'bg-union-500 text-white'
                : s === 'CSA'
                ? 'bg-rebel-500 text-white'
                : 'bg-brass-500 text-white'
              : 'bg-ink-800 text-mist-300 hover:bg-ink-700'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const beginRename = (feature) => {
    setEditingId(feature.id);
    setNameDraft(feature.name);
  };
  const commitRename = () => {
    if (editingId) onUpdateFeature(editingId, { name: nameDraft.trim() || 'unnamed' });
    setEditingId(null);
  };

  const renderFeatureRow = (feature, typeColor) => {
    const isEditing = editingId === feature.id;
    return (
      <div key={feature.id} className="bg-ink-800 rounded p-1.5 flex items-center gap-1.5 text-xs border border-ink-700">
        <span className={`w-2 h-2 rounded-full ${typeColor}`} />
        {isEditing ? (
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            autoFocus
            className="flex-1 bg-ink-900 text-white px-1.5 py-0.5 rounded text-xs"
          />
        ) : (
          <span className="flex-1 truncate text-mist-300">
            {feature.name}
            {feature.isCapital && <Star className="inline w-3 h-3 text-brass-400 ml-1" />}
            {feature.side && feature.side !== 'NEUTRAL' && (
              <span className={`ml-1 text-[9px] font-bold ${
                feature.side === 'USA' ? 'text-union-400' : 'text-rebel-400'
              }`}>{feature.side}</span>
            )}
          </span>
        )}
        {!isEditing && feature.kind === 'city' && (
          <button
            onClick={() => onUpdateFeature(feature.id, { isCapital: !feature.isCapital })}
            className={`p-0.5 rounded ${feature.isCapital ? 'text-brass-400' : 'text-mist-500 hover:text-brass-400'}`}
            title="Toggle capital"
          >
            <Star className="w-3.5 h-3.5" />
          </button>
        )}
        {!isEditing && (feature.kind === 'city' || feature.kind === 'fort') && (
          <select
            value={feature.side}
            onChange={(e) => onUpdateFeature(feature.id, { side: e.target.value })}
            className="bg-ink-900 text-white text-[10px] rounded px-1 py-0.5"
          >
            <option value="USA">USA</option>
            <option value="CSA">CSA</option>
            <option value="NEUTRAL">NEUT</option>
          </select>
        )}
        {isEditing ? (
          <button onClick={commitRename} className="p-0.5 text-green-400 hover:text-green-300">
            <Check className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => beginRename(feature)} className="p-0.5 text-mist-400 hover:text-white">
            <Pencil className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => {
            if (confirm(`Remove ${feature.kind} "${feature.name}"?`)) onRemoveFeature(feature.id);
          }}
          className="p-0.5 text-rebel-400 hover:text-rebel-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const featureGroup = (label, list, typeColor) => (
    <div className="mb-2">
      <div className="text-[10px] font-semibold text-mist-400 uppercase tracking-wide mb-1">
        {label} ({list.length})
      </div>
      <div className="space-y-1">
        {list.length === 0 ? (
          <div className="text-[10px] text-mist-500 italic">none</div>
        ) : list.map(f => renderFeatureRow(f, typeColor))}
      </div>
    </div>
  );

  return (
    <div className="ui-section border-brass-500/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="ui-title">
          <MapPin className="w-5 h-5" /> Map Features
        </h3>
        <button
          onClick={onExitEditMode}
          className="px-2 py-1 bg-ink-800 hover:bg-ink-700 text-white rounded text-xs flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Done
        </button>
      </div>

      {/* One-click preset — loads the historical Eastern Theatre board. */}
      {onLoadPreset && (
        <button
          onClick={onLoadPreset}
          className="w-full mb-3 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
          title="Replace all current features with the historical Eastern Theatre preset"
        >
          <Sparkles className="w-4 h-4" />
          Load Historical Preset (Eastern Theatre)
        </button>
      )}

      {/* Tool palette */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 mb-3">
        {toolBtn('city', 'City', MapPin)}
        {toolBtn('fort', 'Fort', Shield)}
        {toolBtn('station', 'Station', Train)}
        {toolBtn('railway', 'Railway', Zap)}
        {toolBtn('river', 'River', Waves)}
      </div>

      {/* Tool-specific controls */}
      {tool && !isLineTool && (
        <div className="mb-3 bg-ink-900 rounded p-2 space-y-2">
          {tool !== 'station' && sideToggle}
          {tool === 'city' && (
            <label className="flex items-center gap-2 text-xs text-mist-300">
              <input
                type="checkbox"
                checked={pointIsCapital}
                onChange={onTogglePointCapital}
                className="accent-brass-400"
              />
              Place as capital
            </label>
          )}
          <div className="text-[10px] text-brass-300">
            Click on the map to drop a {tool}. Click a side again in the toolbar to stop.
          </div>
        </div>
      )}

      {tool && isLineTool && (
        <div className="mb-3 bg-ink-900 rounded p-2 space-y-2">
          <div className="text-[10px] text-brass-300">
            Click on the map to add points. Need at least 2 points.
            {tool === 'railway' && (
              <><br /><span className="text-brass-300">First point must be a City, Fort, or Rail Station.</span> Subsequent clicks snap to anchors or other rail endpoints when close.</>
            )}
            <br />Points so far: <span className="font-bold text-white">{lineDraft.length}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={onFinishLine}
              disabled={lineDraft.length < 2}
              className="ui-btn ui-btn-primary ui-btn-sm flex-1"
            >
              <CheckCheck className="w-3 h-3" /> Finish
            </button>
            <button
              onClick={onUndoLinePoint}
              disabled={lineDraft.length === 0}
              className="bg-ink-800 hover:bg-ink-700 disabled:bg-ink-850 disabled:text-mist-500 text-white rounded px-2 py-1 text-xs flex items-center justify-center gap-1"
            >
              <Undo2 className="w-3 h-3" /> Undo
            </button>
            <button
              onClick={onCancelLine}
              className="bg-rebel-900 hover:bg-rebel-500 text-white rounded px-2 py-1 text-xs flex items-center justify-center gap-1"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing features list */}
      <div className="max-h-96 overflow-y-auto pr-1">
        {featureGroup('Cities', mf.cities, 'bg-brass-400')}
        {featureGroup('Forts', mf.forts, 'bg-ink-500')}
        {featureGroup('Stations', mf.stations, 'bg-ink-600')}
        {featureGroup('Railways', mf.railways, 'bg-mist-300')}
        {featureGroup('Rivers', mf.rivers, 'bg-sky-400')}
      </div>
    </div>
  );
};

export default MapFeaturesPanel;
