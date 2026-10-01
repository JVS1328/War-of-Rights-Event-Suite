/**
 * Unit logos for the rankings card: each unit's logo in this season, where it
 * was set, and an upload that applies to the whole event, this season only, or
 * this season and every one after. The tracker stores them (utils/eventStore).
 */
import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Seg } from '../Shell';
import { readLogoFile } from '../../utils/unitLogo';
import { initialsOf } from '../../utils/standingsImage';

export type LogoScope = 'event' | 'season' | 'onward';

/** The logo a unit shows in this season, and where it was set. */
export interface LogoSource {
  image: string;
  scope: LogoScope;
  /** The season it was set on; null for an event-wide logo. */
  seasonId: string | null;
}

const THUMB = 36;

export function UnitLogos({
  units,
  seasonId,
  seasonName,
  logoOf,
  seasonNameOf,
  onSet,
}: {
  units: string[];
  seasonId: string;
  seasonName: string;
  logoOf: (unit: string) => LogoSource | null;
  seasonNameOf: (id: string) => string;
  /** Set or (with null) clear a logo at a scope, on the given season. */
  onSet: (unit: string, image: string | null, scope: LogoScope, seasonId?: string | null) => void;
}) {
  const [scope, setScope] = useState<LogoScope>('event');
  const [target, setTarget] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file || !target) return;
    setProblem(null);
    try {
      onSet(target, await readLogoFile(file), scope);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const whereFrom = (src: LogoSource) =>
    src.scope === 'event' ? 'whole event'
      : src.scope === 'season' ? 'this season only'
        : src.seasonId === seasonId ? 'this season & later' : `from ${seasonNameOf(src.seasonId!)} on`;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="ctl" style={{ padding: 0, border: 0, background: 'none' }}>
        <span className="cap">Unit logos</span>
        <span className="cap" style={{ marginLeft: 6 }}>Upload for</span>
        <Seg
          value={scope}
          onChange={setScope}
          label="Upload for"
          options={[
            { key: 'event', label: 'Whole event' },
            { key: 'season', label: `${seasonName} only` },
            { key: 'onward', label: `${seasonName} & later` },
          ]}
        />
      </div>
      {problem && <p className="note"><strong>{problem}</strong></p>}
      <input
        ref={input} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginTop: 9 }}>
        {units.map((unit) => {
          const src = logoOf(unit);
          return (
            <div key={unit} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--line)', padding: 6 }}>
              {src ? (
                <img src={src.image} alt="" width={THUMB} height={THUMB} style={{ objectFit: 'contain', background: '#fff' }} />
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: THUMB, height: THUMB, display: 'grid', placeItems: 'center', flex: 'none',
                    border: '1px dashed var(--line)', color: 'var(--ink-3)', fontSize: 11, fontWeight: 600,
                  }}
                >
                  {initialsOf(unit)}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="wor-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unit}</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>{src ? whereFrom(src) : 'no logo'}</div>
              </div>
              <button className="gh" title={`Upload a logo for ${unit}`} onClick={() => { setTarget(unit); input.current?.click(); }}>
                <Upload size={11} />
              </button>
              {src && (
                <button
                  className="gh c-danger"
                  title={`Remove this logo (${whereFrom(src)})`}
                  onClick={() => onSet(unit, null, src.scope, src.seasonId)}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
