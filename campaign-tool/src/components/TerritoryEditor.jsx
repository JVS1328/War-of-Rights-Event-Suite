import { useState } from 'react';
import { MAPS_BY_MAPSET } from '../data/territories';
import { Modal } from './ui/Primitives';

/**
 * TerritoryEditor - Modal for editing territory properties in-place.
 * Opened via Ctrl+double-click on the map.
 */
const TerritoryEditor = ({ territory, terrainGroups = {}, onSave, onClose }) => {
  const [name, setName] = useState(territory.name || '');
  const [owner, setOwner] = useState(territory.owner || 'NEUTRAL');
  const [victoryPoints, setVictoryPoints] = useState(territory.victoryPoints || territory.pointValue || 1);
  const [isCapital, setIsCapital] = useState(territory.isCapital || false);
  const [maps, setMaps] = useState(territory.maps || []);
  const [terrainWeights, setTerrainWeights] = useState(territory.terrainWeights || {});

  const availableGroupNames = Object.keys(terrainGroups);

  const handleToggleTerrainGroup = (groupName) => {
    setTerrainWeights(prev => {
      if (prev[groupName] !== undefined) {
        const { [groupName]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [groupName]: 1 };
    });
  };

  const handleWeightChange = (groupName, value) => {
    const num = parseInt(value) || 0;
    if (num <= 0) {
      const { [groupName]: _, ...rest } = terrainWeights;
      setTerrainWeights(rest);
    } else {
      setTerrainWeights({ ...terrainWeights, [groupName]: num });
    }
  };

  const handleToggleMap = (mapName) => {
    setMaps(prev =>
      prev.includes(mapName)
        ? prev.filter(m => m !== mapName)
        : [...prev, mapName]
    );
  };

  const handleSave = () => {
    onSave({
      ...territory,
      name,
      owner,
      victoryPoints,
      pointValue: victoryPoints,
      isCapital,
      maps,
      terrainWeights: Object.keys(terrainWeights).length > 0 ? terrainWeights : undefined,
    });
  };

  const totalWeight = Object.values(terrainWeights).reduce((s, w) => s + w, 0);

  return (
    <Modal
      dismissible={false}
      title="Edit territory"
      subtitle="Who holds this ground, what it is worth, and the maps that may be fought over it."
      width="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="ui-btn ui-btn-primary flex-1"
          >
            Save changes
          </button>
          <button onClick={onClose} className="ui-btn flex-1">
            Cancel
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="ui-label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ui-field"
          />
        </div>

        {/* Owner */}
        <div>
          <div className="ui-label">Held by</div>
          <div className="ui-segment">
            {['USA', 'CSA', 'NEUTRAL'].map(side => (
              <button
                key={side}
                onClick={() => setOwner(side)}
                data-active={owner === side}
                data-side={side}
              >
                {side === 'NEUTRAL' ? 'Neutral' : side}
              </button>
            ))}
          </div>
        </div>

        {/* Victory points */}
        <div>
          <label className="ui-label">
            Victory points — <span className="font-bold text-ink tabular">{victoryPoints}</span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            value={victoryPoints}
            onChange={(e) => setVictoryPoints(parseInt(e.target.value))}
            className="w-full accent-ink"
          />
        </div>

        {/* Capital */}
        <label className="flex cursor-pointer items-center gap-2 border-b border-paper-3 py-2">
          <input
            type="checkbox"
            checked={isCapital}
            onChange={(e) => setIsCapital(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          <span className="font-bold">Capital ★</span>
        </label>

        {/* Terrain groups and their weights */}
        {availableGroupNames.length > 0 && (
          <div>
            <div className="ui-eyebrow mb-1">Terrain groups, for the roll</div>
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th className="num">Weight</th>
                  <th className="num">Odds</th>
                </tr>
              </thead>
              <tbody>
                {availableGroupNames.map(groupName => {
                  const isActive = terrainWeights[groupName] !== undefined;
                  const weight = terrainWeights[groupName] || 0;
                  const pct = isActive && totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
                  return (
                    <tr key={groupName}>
                      <td>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => handleToggleTerrainGroup(groupName)}
                            className="h-3.5 w-3.5 accent-ink"
                          />
                          <span className={isActive ? 'font-bold' : 'text-ink-2'}>{groupName}</span>
                        </label>
                      </td>
                      <td className="num">
                        {isActive && (
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={weight}
                            onChange={(e) => handleWeightChange(groupName, e.target.value)}
                            className="ui-field w-16 py-0.5 text-right text-sm tabular"
                          />
                        )}
                      </td>
                      <td className="num w-12 text-ink-2">{isActive ? `${pct}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {Object.keys(terrainWeights).length > 0 && (
              <p className="ui-hint mt-1">
                The weights decide the roll. Maps come from the terrain group definitions in
                settings.
              </p>
            )}
          </div>
        )}

        {/* Assigned maps */}
        <div>
          <div className="ui-eyebrow mb-1">
            Assigned maps{maps.length > 0 && ` — ${maps.length}`}
          </div>
          <p className="ui-hint mb-1">
            Named maps override the terrain-group roll. Leave it empty to use the groups.
          </p>
          <div className="ui-scroll ui-box max-h-48 !p-0">
            {Object.entries(MAPS_BY_MAPSET).map(([mapset, mapList]) => (
              <div key={mapset}>
                <div className="ui-eyebrow sticky top-0 border-b border-rule bg-paper-2 px-3 py-1">
                  {mapset}
                </div>
                {mapList.map(mapName => (
                  <label
                    key={mapName}
                    className="flex cursor-pointer items-center gap-2 border-b border-paper-3 px-3 py-1 text-sm hover:bg-paper-2"
                  >
                    <input
                      type="checkbox"
                      checked={maps.includes(mapName)}
                      onChange={() => handleToggleMap(mapName)}
                      className="h-3.5 w-3.5 accent-ink"
                    />
                    <span>{mapName}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TerritoryEditor;
