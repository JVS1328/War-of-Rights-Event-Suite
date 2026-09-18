import { Fragment, useState } from 'react';
import { Section, SectionHead, SectionBody, Tag, Row, SIDE_TEXT } from './ui/Primitives';

/**
 * The regimental standing, set as a ruled ledger: one line per regiment with
 * its record and casualties, opening to its aggregate figures and every
 * battle it commanded.
 */
const RegimentStats = ({ campaign }) => {
  const [expandedRegiments, setExpandedRegiments] = useState({});

  const regiments = campaign?.regiments || { USA: [], CSA: [] };
  const regimentStats = campaign?.regimentStats || {};

  const hasRegiments = regiments.USA.length > 0 || regiments.CSA.length > 0;
  if (!hasRegiments) return null;

  const toggleRegiment = (regimentId) => {
    setExpandedRegiments(prev => ({ ...prev, [regimentId]: !prev[regimentId] }));
  };

  const getRegimentStats = (regimentId) =>
    regimentStats[regimentId] || {
      wins: 0, losses: 0, casualties: 0, spLost: 0, vpGained: 0, vpLost: 0, battles: []
    };

  const getWinRate = (stats) => {
    const total = stats.wins + stats.losses;
    return total === 0 ? 0 : Math.round((stats.wins / total) * 100);
  };

  const renderRegimentRow = (regiment, side) => {
    const stats = getRegimentStats(regiment.id);
    const isExpanded = !!expandedRegiments[regiment.id];
    const winRate = getWinRate(stats);
    const played = stats.wins + stats.losses;

    return (
      <Fragment key={regiment.id}>
        <tr
          className={`cursor-pointer ${isExpanded ? 'font-bold' : ''}`}
          data-open={isExpanded}
          onClick={() => toggleRegiment(regiment.id)}
        >
          <td className={SIDE_TEXT[side]}>{regiment.name}</td>
          <td className="num w-16">
            {played === 0
              ? <span className="italic text-ink-3 text-xs">none</span>
              : <>{stats.wins}<span className="text-ink-3">–</span>{stats.losses}</>}
          </td>
          <td className="num w-12 text-ink-2">{played === 0 ? '—' : `${winRate}%`}</td>
          <td className="num w-20 text-ink-2">{stats.casualties.toLocaleString()}</td>
        </tr>

        {isExpanded && (
          <tr>
            <td colSpan={4} className="!py-0">
              <div className="ui-line-body">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6">
                  <Row label="Casualties" value={stats.casualties.toLocaleString()} />
                  <Row label="SP lost" value={stats.spLost} />
                  <Row label="VP gained" value={<span className="text-good">+{stats.vpGained}</span>} />
                  <Row label="VP lost" value={<span className="text-mark">−{stats.vpLost}</span>} />
                </div>

                {stats.battles.length === 0 ? (
                  <p className="ui-empty">No battles commanded yet.</p>
                ) : (
                  <div className="ui-scroll max-h-56 mt-3">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          <th>Ground</th>
                          <th>Role</th>
                          <th className="num">Turn</th>
                          <th className="num">Casualties</th>
                          <th className="num">SP</th>
                          <th className="num">VP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.battles.map((battle, idx) => (
                          <tr key={idx}>
                            <td>
                              {battle.territoryName}
                              <span className="text-ink-3"> · {battle.mapName}</span>
                            </td>
                            <td>
                              <Tag tone={battle.won ? 'good' : 'mark'}>
                                {battle.won ? 'won' : 'lost'}
                              </Tag>
                              <span className="text-ink-3 text-xs italic ml-1.5">{battle.role}</span>
                            </td>
                            <td className="num text-ink-3">{battle.turn}</td>
                            <td className="num text-ink-2">{battle.casualties}</td>
                            <td className="num text-ink-2">−{battle.spLost}</td>
                            <td className="num">
                              {battle.vpGained > 0 && <span className="text-good">+{battle.vpGained}</span>}
                              {battle.vpGained > 0 && battle.vpLost > 0 && ' '}
                              {battle.vpLost > 0 && <span className="text-mark">−{battle.vpLost}</span>}
                              {!battle.vpGained && !battle.vpLost && <span className="text-ink-3">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <Section>
      <SectionHead title="The Regimental Standing" meta="click a line for its battles" />
      <SectionBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-9">
          {['USA', 'CSA'].map(side => (
            <div key={side}>
              <div
                className={`flex justify-between items-baseline pt-3 pb-1 border-b border-rule text-xs font-bold uppercase tracking-[0.16em] ${SIDE_TEXT[side]}`}
              >
                <span>{side === 'USA' ? 'Union' : 'Confederate'}</span>
                <span className="font-normal tracking-[0.08em] text-ink-3 tabular">
                  {regiments[side].length} {regiments[side].length === 1 ? 'regiment' : 'regiments'}
                </span>
              </div>
              {regiments[side].length === 0 ? (
                <p className="ui-empty">None on the rolls.</p>
              ) : (
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>Regiment</th>
                      <th className="num">W–L</th>
                      <th className="num">Rate</th>
                      <th className="num">Casualties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regiments[side].map(regiment => renderRegimentRow(regiment, side))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </SectionBody>
    </Section>
  );
};

export default RegimentStats;
