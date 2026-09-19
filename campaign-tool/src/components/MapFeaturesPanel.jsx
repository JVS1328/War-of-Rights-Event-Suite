import { useState } from 'react';
import { Pencil, Trash2, Check, Star } from 'lucide-react';
import { Section, SectionHead, SectionBody, SIDE_TEXT } from './ui/Primitives';
import { useDialog } from './ui/Dialog';

/**
 * Map Features — the Grand Campaign's engraving tools and the register of
 * what has been drawn on the plate.
 *
 * Tool selection decides what the next map-click does:
 *   city / fort / station → drop a point (uses side + capital toggle)
 *   railway / river       → accumulate points into a polyline draft,
 *                           then Finish to commit or Undo/Cancel to back out.
 *
 * Existing features are listed below the tools with rename / side / delete.
 */
const TOOLS = [
  { key: 'city', label: 'City' },
  { key: 'fort', label: 'Fort' },
  { key: 'station', label: 'Station' },
  { key: 'railway', label: 'Railway' },
  { key: 'river', label: 'River' },
];

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
  const { confirm } = useDialog();

  if (!gc) return null;
  const mf = gc.mapFeatures;

  const isLineTool = tool === 'railway' || tool === 'river';
  const total = mf.cities.length + mf.forts.length + mf.stations.length
    + mf.railways.length + mf.rivers.length;

  const beginRename = (feature) => {
    setEditingId(feature.id);
    setNameDraft(feature.name);
  };
  const commitRename = () => {
    if (editingId) onUpdateFeature(editingId, { name: nameDraft.trim() || 'unnamed' });
    setEditingId(null);
  };

  const featureRow = (feature) => {
    const isEditing = editingId === feature.id;
    const sided = feature.kind === 'city' || feature.kind === 'fort';

    return (
      <tr key={feature.id}>
        <td>
          {isEditing ? (
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              autoFocus
              aria-label="Feature name"
              className="ui-field"
            />
          ) : (
            // The side already shows in the picker alongside, and a capital in
            // the filled star; the name only has to carry the colour.
            <span className={`${feature.isCapital ? 'font-bold' : ''} ${SIDE_TEXT[feature.side] || ''}`}>
              {feature.name}
            </span>
          )}
        </td>
        <td className="num w-[5.5rem]">
          {!isEditing && sided && (
            <select
              value={feature.side}
              onChange={(e) => onUpdateFeature(feature.id, { side: e.target.value })}
              aria-label={`Side holding ${feature.name}`}
              className={`ui-field !px-1 !py-0.5 text-xs w-full ${SIDE_TEXT[feature.side] || ''}`}
            >
              <option value="USA">USA</option>
              <option value="CSA">CSA</option>
              <option value="NEUTRAL">Neutral</option>
            </select>
          )}
        </td>
        <td className="num whitespace-nowrap w-[6.5rem]">
          {!isEditing && feature.kind === 'city' && (
            <button
              onClick={() => onUpdateFeature(feature.id, { isCapital: !feature.isCapital })}
              className={`ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ${feature.isCapital ? 'text-ink' : ''}`}
              title={feature.isCapital ? 'No longer a capital' : 'Make this the capital'}
              aria-label="Toggle capital"
            >
              <Star className="w-3.5 h-3.5" fill={feature.isCapital ? 'currentColor' : 'none'} />
            </button>
          )}
          {isEditing ? (
            <button
              onClick={commitRename}
              className="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
              title="Save the name"
              aria-label="Save the name"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => beginRename(feature)}
              className="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
              title="Rename"
              aria-label="Rename"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={async () => {
              const go = await confirm({
                title: `Remove the ${feature.kind} “${feature.name}”?`,
                confirmLabel: 'Remove',
                danger: true,
              });
              if (go) onRemoveFeature(feature.id);
            }}
            className="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet text-mark"
            title="Remove"
            aria-label="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>
    );
  };

  const featureGroup = (label, list) => (
    <div key={label}>
      <div className="flex justify-between items-baseline pt-3 pb-1 border-b border-rule text-xs font-bold uppercase tracking-[0.16em]">
        <span>{label}</span>
        <span className="font-normal tracking-[0.08em] text-ink-3 tabular">{list.length}</span>
      </div>
      {list.length === 0
        ? <p className="ui-empty !py-2">None drawn.</p>
        : <table className="ui-table"><tbody>{list.map(featureRow)}</tbody></table>}
    </div>
  );

  return (
    <Section>
      <SectionHead
        title="Map Features"
        meta={`${total} on the plate`}
        actions={
          <>
            {onLoadPreset && (
              <button
                onClick={onLoadPreset}
                className="ui-btn ui-btn-sm"
                title="Replace every feature with the historical Eastern Theatre preset"
              >
                Load the historical preset
              </button>
            )}
            <button onClick={onExitEditMode} className="ui-btn ui-btn-sm ui-btn-primary">
              Done
            </button>
          </>
        }
      />
      <SectionBody>
        {/* The engraving tools. */}
        <div className="ui-box">
          <div className="ui-eyebrow mb-1">Draw</div>
          <div className="ui-segment">
            {TOOLS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelectTool(tool === t.key ? null : t.key)}
                data-active={tool === t.key}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tool && !isLineTool && (
            <div className="mt-2.5 pt-2.5 border-t border-paper-3">
              {tool !== 'station' && (
                <>
                  <span className="ui-label">Held by</span>
                  <div className="ui-segment">
                    {['USA', 'CSA', 'NEUTRAL'].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onChangePointSide(s)}
                        data-active={pointSide === s}
                        data-side={s}
                      >
                        {s === 'NEUTRAL' ? 'Neutral' : s}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {tool === 'city' && (
                <button
                  onClick={onTogglePointCapital}
                  className={`ui-btn ui-btn-sm mt-2 ${pointIsCapital ? 'ui-btn-primary' : ''}`}
                  aria-pressed={pointIsCapital}
                >
                  Place as capital
                </button>
              )}
              <p className="ui-hint mt-2">
                Click the plate to set down a {tool}. Pick the tool again to put it away.
              </p>
            </div>
          )}

          {tool && isLineTool && (
            <div className="mt-2.5 pt-2.5 border-t border-paper-3">
              <p className="ui-hint">
                Click the plate to add points — two at the least.
                {tool === 'railway' && (
                  <> The first must be a city, fort or rail station; later clicks
                  snap to anchors and to other rail ends when they are close.</>
                )}
              </p>
              <div className="text-[13px] tabular mt-1">
                Points so far: <span className="font-bold">{lineDraft.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button
                  onClick={onFinishLine}
                  disabled={lineDraft.length < 2}
                  className="ui-btn ui-btn-primary ui-btn-sm"
                >
                  Finish
                </button>
                <button
                  onClick={onUndoLinePoint}
                  disabled={lineDraft.length === 0}
                  className="ui-btn ui-btn-sm"
                >
                  Undo
                </button>
                <button onClick={onCancelLine} className="ui-btn ui-btn-sm ui-btn-danger">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* The register of what is already on the plate. */}
        <div className="ui-scroll max-h-96 pr-1">
          {featureGroup('Cities', mf.cities)}
          {featureGroup('Forts', mf.forts)}
          {featureGroup('Stations', mf.stations)}
          {featureGroup('Railways', mf.railways)}
          {featureGroup('Rivers', mf.rivers)}
        </div>
      </SectionBody>
    </Section>
  );
};

export default MapFeaturesPanel;
