/**
 * Season → Roster: who is in this season at all.
 *
 * Adding a unit, renaming it and marking it token or non-token used to live in
 * an "enlarged" panel nothing could open once the rail replaced the old
 * dashboard, which left no way to do any of it. This is that screen, on the
 * rail where the rest of the season lives.
 *
 * Renaming is this season's by default; a name the registry has never seen is
 * added to it. Ticking "every season" instead renames the registry entry and
 * sweeps every season. Removing only takes the unit out of this season.
 */
import { useState } from 'react';

/** Where a rename lands: this season only, or the registry and every season. */
export type RenameScope = 'season' | 'event';

export interface RosterUnit {
  name: string;
  /** Non-token units play but hold no standings token, so they score nothing. */
  token: boolean;
  /** Division this season puts it in, if any. */
  division: string | null;
  /** Nights it appears on a side this season. */
  nights: number;
  /** Expected men, from the season's player counts. Null when none is set. */
  men: number | null;
}

export function RosterScreen({
  seasonName,
  units,
  draft = '',
  onDraft,
  onAdd,
  registryUnits = [],
  onRename,
  onToggleToken,
  onRemove,
  readOnly = false,
}: {
  seasonName: string;
  units: RosterUnit[];
  /** The name being typed into the add field. Unused when read-only. */
  draft?: string;
  onDraft?: (name: string) => void;
  onAdd?: () => void;
  /** Every name in the event's unit registry, to say whether a rename adds one. */
  registryUnits?: string[];
  onRename?: (from: string, to: string, scope: RenameScope) => void;
  onToggleToken?: (unit: string) => void;
  onRemove?: (unit: string) => void;
  /**
   * The public site's roster: the same table, with nothing on it that would
   * change the season. Adding, renaming, removing and the token toggle all go.
   */
  readOnly?: boolean;
}) {
  const tokens = units.filter((u) => u.token).length;
  const taken = new Set(units.map((u) => u.name.trim().toLowerCase()));
  const duplicate = taken.has(draft.trim().toLowerCase());
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <>
      <div className="panel">
        <header className="ph">
          <h2>Season roster</h2>
          <span className="rule" />
          <span className="meta">
            {seasonName} · {units.length} unit{units.length === 1 ? '' : 's'} · {tokens} scoring,{' '}
            {units.length - tokens} guest
          </span>
        </header>
        {!readOnly && (
          <div className="ctl">
            <input
              type="text"
              value={draft}
              onChange={(e) => onDraft?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !duplicate) onAdd?.(); }}
              placeholder="Unit name…"
              aria-label="New unit name"
              style={{ minWidth: 220 }}
            />
            <button className="gh live" onClick={onAdd} disabled={!draft.trim() || duplicate}>
              ＋ Add unit
            </button>
            <span className="rule" />
            <span className="meta">
              {duplicate ? `${draft.trim()} is already on the roster` : 'added to this season and to the event registry'}
            </span>
          </div>
        )}
        <div className="pb flush scroll-x">
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Scores</th>
                <th>Division</th>
                <th className="num">Nights</th>
                <th className="num">Men</th>
                {!readOnly && <th className="num" />}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.name}>
                  <td className="wor-name">{u.name}</td>
                  <td>
                    {readOnly ? (
                      <span className="tag q">{u.token ? 'Token' : 'Guest'}</span>
                    ) : (
                      <button
                        className="gh"
                        onClick={() => onToggleToken?.(u.name)}
                        style={u.token ? undefined : { borderColor: 'var(--live)', color: 'var(--live)' }}
                        title={
                          u.token
                            ? `${u.name} holds a token — click to make it a guest unit that scores nothing`
                            : `${u.name} is a guest unit and scores nothing — click to give it a token`
                        }
                      >
                        {u.token ? 'Token' : 'Guest'}
                      </button>
                    )}
                  </td>
                  <td>{u.division ? <span className="tag q">{u.division}</span> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                  <td className="num" style={{ color: 'var(--ink-2)' }}>{u.nights || <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                  <td className="num" style={{ color: 'var(--ink-2)' }}>
                    {u.men == null || u.men === 0 ? <span style={{ color: 'var(--ink-3)' }}>—</span> : `~${u.men.toFixed(0)}`}
                  </td>
                  {!readOnly && (
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="gh" onClick={() => setRenaming(u.name)} title={`Rename ${u.name}`}>
                        Rename
                      </button>
                      <button
                        className="gh c-danger"
                        style={{ marginLeft: 5 }}
                        onClick={() => onRemove?.(u.name)}
                        title={`Take ${u.name} out of ${seasonName}`}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {units.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 5 : 6} style={{ color: 'var(--ink-3)' }}>
                    {readOnly ? 'No units recorded for this season.' : 'No units in this season yet — add one above.'}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  Token units hold a standings place; guest units play and are balanced but score no points.
                  Renaming applies to this season unless you choose every season. Removing takes it out of this
                  season only — the registry keeps it so older seasons still resolve.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {renaming && (
        <RenameDialog
          from={renaming}
          seasonName={seasonName}
          roster={units.map((u) => u.name)}
          registry={registryUnits}
          onCancel={() => setRenaming(null)}
          onConfirm={(to, scope) => { onRename?.(renaming, to, scope); setRenaming(null); }}
        />
      )}
    </>
  );
}

/**
 * The rename popup: the new name, where it applies, and — before anything is
 * written — what that will do to the registry.
 */
function RenameDialog({
  from,
  seasonName,
  roster,
  registry,
  onCancel,
  onConfirm,
}: {
  from: string;
  seasonName: string;
  roster: string[];
  registry: string[];
  onCancel: () => void;
  onConfirm: (to: string, scope: RenameScope) => void;
}) {
  const [to, setTo] = useState(from);
  const [scope, setScope] = useState<RenameScope>('season');
  const name = to.trim();
  const has = (list: string[]) => list.some((n) => n.toLowerCase() === name.toLowerCase());

  const problem =
    !name || name === from ? null
    : scope === 'season' && has(roster) ? `${name} is already on the ${seasonName} roster`
    : scope === 'event' && has(registry) ? `${name} is already in the registry — rename it for ${seasonName} only instead`
    : null;
  const ok = !!name && name !== from && !problem;

  const effect =
    scope === 'event'
      ? `Renames ${from} in the registry and in every season.`
      : has(registry)
        ? `${seasonName} will use the registry's ${name}. Other seasons keep ${from}.`
        : `${name} is new — it will be added to the unit registry. Other seasons keep ${from}.`;

  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal narrow" role="dialog" aria-label={`Rename ${from}`} onClick={(e) => e.stopPropagation()}>
        <header className="ph">
          <h2>Rename {from}</h2>
          <span className="rule" />
        </header>
        <div className="pb">
          <input
            type="text"
            autoFocus
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) onConfirm(name, scope);
              if (e.key === 'Escape') onCancel();
            }}
            aria-label="New unit name"
            className="fld-i"
          />
          <label className="chk" style={{ marginTop: 9 }}>
            <input
              type="checkbox"
              checked={scope === 'event'}
              onChange={(e) => setScope(e.target.checked ? 'event' : 'season')}
            />
            <span className="l">Rename across every season and in the unit registry</span>
          </label>
          <p className={problem ? 'note c-warn' : 'note'} style={{ marginTop: 9 }}>
            {problem ?? (ok ? effect : `Renames ${from} in ${seasonName} only.`)}
          </p>
          <div style={{ display: 'flex', gap: 5, marginTop: 11, justifyContent: 'flex-end' }}>
            <button className="gh" onClick={onCancel}>Cancel</button>
            <button className="gh live" disabled={!ok} onClick={() => onConfirm(name, scope)}>
              {scope === 'event' ? 'Rename everywhere' : `Rename in ${seasonName}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
