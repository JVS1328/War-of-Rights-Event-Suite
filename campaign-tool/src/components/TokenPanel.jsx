import { useState } from 'react';
import { Crosshair, Pencil, Trash2 } from 'lucide-react';
import { Section, SectionHead, SectionBody, Tag, SIDE_TEXT } from './ui/Primitives';

/**
 * The Roster — the Grand Campaign's formations, by side.
 *
 * Supports add / rename / remove / edit, and entering "move mode" to set a
 * token down on the map. Tokens are 1:1 with regiments, kept in sync by
 * callers.
 */
const TokenPanel = ({
  campaign,
  moveModeTokenId,
  onAddToken,
  onRenameToken,
  onRemoveToken,
  onUpdateToken,
  onEnterMoveMode,
  onCancelMoveMode,
}) => {
  const [newName, setNewName] = useState('');
  const [newSide, setNewSide] = useState('USA');
  const [editingTokenId, setEditingTokenId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const gc = campaign?.grandCampaign;
  if (!gc) return null;

  const tokens = gc.tokens;

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddToken({ name: newName.trim(), side: newSide });
    setNewName('');
  };

  const beginEdit = (token) => {
    setEditingTokenId(token.id);
    setEditDraft({
      name: token.name,
      manpower: token.manpower,
      fatigue: token.fatigue,
      side: token.side,
    });
  };

  const saveEdit = () => {
    if (!editingTokenId || !editDraft) return;
    const original = tokens.find(t => t.id === editingTokenId);
    if (original && editDraft.name !== original.name) {
      onRenameToken(editingTokenId, editDraft.name);
    }
    onUpdateToken(editingTokenId, {
      manpower: Math.max(0, Math.round(Number(editDraft.manpower) || 0)),
      fatigue: Math.max(0, Math.round(Number(editDraft.fatigue) || 0)),
      side: editDraft.side,
    });
    setEditingTokenId(null);
    setEditDraft(null);
  };

  const cancelEdit = () => {
    setEditingTokenId(null);
    setEditDraft(null);
  };

  /** The open edit form, set in place of the line it belongs to. */
  const editRow = (token) => (
    <tr key={token.id}>
      <td colSpan={4} className="!py-2">
        <div className="ui-box space-y-2">
          <div>
            <label className="ui-label" htmlFor={`token-name-${token.id}`}>Name</label>
            <input
              id={`token-name-${token.id}`}
              value={editDraft.name}
              onChange={(e) => setEditDraft(d => ({ ...d, name: e.target.value }))}
              className="ui-field"
              placeholder="Name"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0">
              <span className="ui-label">Side</span>
              <div className="ui-segment">
                {['USA', 'CSA'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditDraft(d => ({ ...d, side: s }))}
                    data-active={editDraft.side === s}
                    data-side={s}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <label className="ui-label" htmlFor={`token-men-${token.id}`}>Men</label>
              <input
                id={`token-men-${token.id}`}
                type="number"
                value={editDraft.manpower}
                onChange={(e) => setEditDraft(d => ({ ...d, manpower: e.target.value }))}
                className="ui-field tabular"
              />
            </div>
            <div className="w-20">
              <label className="ui-label" htmlFor={`token-fat-${token.id}`}>Fatigue</label>
              <input
                id={`token-fat-${token.id}`}
                type="number"
                value={editDraft.fatigue}
                onChange={(e) => setEditDraft(d => ({ ...d, fatigue: e.target.value }))}
                className="ui-field tabular"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveEdit} className="ui-btn ui-btn-primary ui-btn-sm flex-1">Save</button>
            <button onClick={cancelEdit} className="ui-btn ui-btn-sm flex-1">Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );

  const tokenRow = (token) => {
    if (editingTokenId === token.id) return editRow(token);

    const isMoving = moveModeTokenId === token.id;
    const isWiped = token.status === 'wiped';

    return (
      <tr key={token.id}>
        <td>
          <span className={`font-bold ${isWiped ? 'text-ink-3 line-through' : SIDE_TEXT[token.side]}`}>
            {token.name}
          </span>
          {token.status === 'last-stand' && <Tag tone="mark" className="ml-1.5">Last stand</Tag>}
          {isWiped && <Tag className="ml-1.5">Destroyed</Tag>}
          {token.inCombat && <Tag tone="mark" className="ml-1.5">Engaged</Tag>}
          <div className="text-[12px] italic text-ink-3">
            {isWiped
              ? 'off the board'
              : token.position
                ? (isMoving ? 'click the map to set it down' : 'placed')
                : 'not yet placed'}
          </div>
        </td>
        <td className="num tabular">{(token.manpower || 0).toLocaleString('en-US')}</td>
        <td className="num tabular">{token.fatigue}</td>
        <td className="num whitespace-nowrap">
          {!isWiped && (
            <button
              onClick={() => isMoving ? onCancelMoveMode() : onEnterMoveMode(token.id)}
              className={`ui-btn ui-btn-sm ui-btn-icon ${isMoving ? 'ui-btn-primary' : 'ui-btn-quiet'}`}
              title={isMoving ? 'Cancel the move' : 'Move or place this token'}
              aria-label={isMoving ? 'Cancel the move' : 'Move or place this token'}
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => beginEdit(token)}
            className="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
            title="Edit this token"
            aria-label="Edit this token"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove token "${token.name}"? This also removes its regiment entry.`)) {
                onRemoveToken(token.id);
              }
            }}
            className="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet text-mark"
            title="Remove this token"
            aria-label="Remove this token"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>
    );
  };

  const roll = (side, label) => {
    const rows = tokens.filter(t => t.side === side);
    const men = rows
      .filter(t => t.status !== 'wiped')
      .reduce((sum, t) => sum + (t.manpower || 0), 0);

    return (
      <div key={side}>
        <div
          className={`flex justify-between items-baseline pt-3 pb-1 border-b border-rule text-xs font-bold uppercase tracking-[0.16em] ${SIDE_TEXT[side]}`}
        >
          <span>{label}</span>
          <span className="font-normal tracking-[0.08em] text-ink-3 tabular">
            {rows.length} · {men.toLocaleString('en-US')} men
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="ui-empty">None on the roster.</p>
        ) : (
          <table className="ui-table">
            <thead>
              <tr>
                <th>Formation</th>
                <th className="num">Men</th>
                <th className="num">Fatigue</th>
                <th />
              </tr>
            </thead>
            <tbody>{rows.map(tokenRow)}</tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <Section>
      <SectionHead title="The Roster" meta={`${tokens.length} in all`} />
      <SectionBody>
        {/* Raise a new formation. */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Name a new formation"
            aria-label="New token name"
            className="ui-field flex-1 min-w-[9rem]"
          />
          <div className="ui-segment">
            {['USA', 'CSA'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setNewSide(s)}
                data-active={newSide === s}
                data-side={s}
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={handleAdd} className="ui-btn ui-btn-sm" title="Add this token">
            Add
          </button>
        </div>

        {moveModeTokenId && (
          <p className="ui-hint mt-2 text-mark">
            Click anywhere on the map to set this token down — they cannot share ground.{' '}
            <button onClick={onCancelMoveMode} className="underline">cancel</button>
          </p>
        )}

        {roll('USA', 'Union')}
        {roll('CSA', 'Confederate')}
      </SectionBody>
    </Section>
  );
};

export default TokenPanel;
