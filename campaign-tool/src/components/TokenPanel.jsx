import { useState } from 'react';
import { Users, Plus, Pencil, Trash2, Crosshair, X, Check } from 'lucide-react';

/**
 * TokenPanel — Grand Campaign sidebar for managing tokens (regiments).
 *
 * Supports add/rename/remove/edit + entering "move mode" to reposition a
 * token on the map. Tokens are 1:1 with regiments, kept in sync by callers.
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
  const usaTokens = tokens.filter(t => t.side === 'USA');
  const csaTokens = tokens.filter(t => t.side === 'CSA');

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

  const renderToken = (token) => {
    const isEditing = editingTokenId === token.id;
    const isMoving = moveModeTokenId === token.id;
    const sideColor = token.side === 'USA' ? 'text-union-400' : 'text-rebel-400';
    const statusBadge = {
      'active': null,
      'last-stand': <span className="text-[10px] text-orange-400 font-bold ml-1">LAST STAND</span>,
      'wiped': <span className="text-[10px] text-mist-500 font-bold ml-1">WIPED</span>,
    }[token.status];

    if (isEditing) {
      return (
        <div key={token.id} className="bg-ink-800 border border-brass-400 rounded p-2 space-y-2">
          <input
            value={editDraft.name}
            onChange={(e) => setEditDraft(d => ({ ...d, name: e.target.value }))}
            className="w-full bg-ink-850 text-white px-2 py-1 rounded text-sm"
            placeholder="Name"
          />
          <div className="flex gap-2">
            <select
              value={editDraft.side}
              onChange={(e) => setEditDraft(d => ({ ...d, side: e.target.value }))}
              className="bg-ink-850 text-white px-2 py-1 rounded text-xs flex-1"
            >
              <option value="USA">USA</option>
              <option value="CSA">CSA</option>
            </select>
            <input
              type="number"
              value={editDraft.manpower}
              onChange={(e) => setEditDraft(d => ({ ...d, manpower: e.target.value }))}
              className="bg-ink-850 text-white px-2 py-1 rounded text-xs w-20"
              placeholder="MP"
              title="Manpower"
            />
            <input
              type="number"
              value={editDraft.fatigue}
              onChange={(e) => setEditDraft(d => ({ ...d, fatigue: e.target.value }))}
              className="bg-ink-850 text-white px-2 py-1 rounded text-xs w-14"
              placeholder="Fat"
              title="Fatigue"
            />
          </div>
          <div className="flex gap-1">
            <button onClick={saveEdit} className="ui-btn ui-btn-primary ui-btn-sm flex-1">
              <Check className="w-3 h-3" /> Save
            </button>
            <button onClick={cancelEdit} className="flex-1 bg-ink-700 hover:bg-ink-600 text-white rounded px-2 py-1 text-xs flex items-center justify-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      );
    }

    const isWiped = token.status === 'wiped';
    return (
      <div
        key={token.id}
        className={`bg-ink-800 rounded p-2 flex items-center justify-between gap-2 border ${
          isMoving ? 'border-brass-400' : isWiped ? 'border-ink-800 opacity-60' : 'border-ink-700'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`font-semibold text-sm truncate ${isWiped ? 'text-mist-400 line-through' : sideColor}`}>{token.name}</span>
            {statusBadge}
          </div>
          <div className="text-[10px] text-mist-400">
            MP: <span className="text-white">{token.manpower}</span>
            {' · '}Fat: <span className="text-white">{token.fatigue}</span>
            {' · '}{isWiped ? 'off the board' : token.position ? '📍 placed' : 'unplaced'}
            {token.inCombat && <span className="text-brass-400 ml-1">· in combat</span>}
          </div>
        </div>
        <div className="flex gap-1">
          {!isWiped && (
            <button
              onClick={() => isMoving ? onCancelMoveMode() : onEnterMoveMode(token.id)}
              className={`p-1 rounded ${
                isMoving ? 'bg-brass-500 hover:bg-brass-500' : 'bg-ink-700 hover:bg-ink-600'
              } text-white`}
              title={isMoving ? 'Cancel move' : 'Move / place token'}
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => beginEdit(token)}
            className="p-1 rounded bg-ink-700 hover:bg-ink-600 text-white"
            title="Edit token"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove token "${token.name}"? This also removes its regiment entry.`)) {
                onRemoveToken(token.id);
              }
            }}
            className="p-1 rounded bg-rebel-900 hover:bg-rebel-500 text-white"
            title="Remove token"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="ui-section p-4">
      <h3 className="ui-title mb-3">
        <Users className="w-5 h-5" />
        Tokens
        <span className="text-xs font-normal text-mist-400 ml-auto">{tokens.length} total</span>
      </h3>

      {/* Add new token */}
      <div className="mb-4 bg-ink-900 rounded p-2 flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New token name"
          className="flex-1 bg-ink-850 text-white px-2 py-1 rounded text-sm"
        />
        <select
          value={newSide}
          onChange={(e) => setNewSide(e.target.value)}
          className="bg-ink-850 text-white px-2 py-1 rounded text-xs"
        >
          <option value="USA">USA</option>
          <option value="CSA">CSA</option>
        </select>
        <button
          onClick={handleAdd}
          className="ui-btn ui-btn-primary ui-btn-sm"
          title="Add token"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {moveModeTokenId && (
        <div className="mb-3 bg-brass-900/40 border border-brass-500 rounded p-2 text-xs text-brass-300">
          Click anywhere on the map to place this token. Tokens cannot overlap.
          <button onClick={onCancelMoveMode} className="ml-2 underline">cancel</button>
        </div>
      )}

      {/* USA tokens */}
      <div className="mb-3">
        <div className="text-xs font-semibold text-union-400 mb-1">USA ({usaTokens.length})</div>
        <div className="space-y-1">
          {usaTokens.length === 0 && <div className="text-xs text-mist-500 italic">no tokens</div>}
          {usaTokens.map(renderToken)}
        </div>
      </div>

      {/* CSA tokens */}
      <div>
        <div className="text-xs font-semibold text-rebel-400 mb-1">CSA ({csaTokens.length})</div>
        <div className="space-y-1">
          {csaTokens.length === 0 && <div className="text-xs text-mist-500 italic">no tokens</div>}
          {csaTokens.map(renderToken)}
        </div>
      </div>
    </div>
  );
};

export default TokenPanel;
