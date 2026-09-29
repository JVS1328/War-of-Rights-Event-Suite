import { describe, it, expect } from 'vitest';
import { worldMetersToMapPx, mapPxPerYard, headingToMapDelta, resolveMapSlug } from './mapCalibration.js';

// Expected values come from the overlay's own transform
// (wor_overlay/mod/calibration.cpp world_m_to_map_px), evaluated separately.
describe('game-art map transform', () => {
  it('puts the terrain centre at the art centre, Y down', () => {
    expect(worldMetersToMapPx('south-mountain', 2048, 2048)).toEqual({ x: 1024, y: 1024 });
    const nw = worldMetersToMapPx('south-mountain', 0, 4096);            // world top-left corner
    expect(nw.x).toBeCloseTo(0, 6);
    expect(nw.y).toBeCloseTo(0, 6);
  });

  it('tilts Antietam 50° inside its 2886 px canvas', () => {
    // A live Antietam position the overlay projected while checking fences.
    const p = worldMetersToMapPx('antietam', 1817.2, 2759.5);
    expect(p.x).toBeCloseTo(1096.30, 1);
    expect(p.y).toBeCloseTo(1302.73, 1);
    expect(worldMetersToMapPx('antietam', 2048, 2048).x).toBeCloseTo(1443, 6);   // ceil(2048·1.4088)/2
  });

  it('keeps scale uniform and headings rotated with the art', () => {
    expect(mapPxPerYard('drill-camp')).toBeCloseTo(0.5 / 1.0936, 9);
    expect(headingToMapDelta('harpers-ferry', 0, 1)).toEqual({ dx: 0, dy: -0.5 });  // north is up
    const d = headingToMapDelta('antietam', 1, 0);
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(0.5, 9);
    expect(worldMetersToMapPx('nowhere', 0, 0)).toBeNull();
    expect(resolveMapSlug('SouthMountain')).toBe('south-mountain');
  });
});
