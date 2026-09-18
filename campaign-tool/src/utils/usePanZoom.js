import { useCallback, useEffect, useRef, useState } from 'react';

// A full fit is the floor: zooming out past it would letterbox the theatre
// and show empty space around it, which is the thing clampView exists to
// prevent. Together they keep the map filling the frame at every view.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;

const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

const touchGap = (touches) =>
  Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );

const touchMid = (touches) => ({
  x: (touches[0].clientX + touches[1].clientX) / 2,
  y: (touches[0].clientY + touches[1].clientY) / 2,
});

/**
 * Keep the map covering the frame.
 *
 * The transform is `translate(x, y) scale(zoom)` inside the viewBox, so the
 * content spans (x, y) to (x + W*zoom, y + H*zoom). Holding that span over
 * [0,W] x [0,H] is what stops a drag pulling the theatre off the edge and
 * leaving empty space where the map should be. Zoomed out past a full fit the
 * content cannot cover the frame, so it is centred instead.
 */
const clampView = (view, W, H) => {
  const spanX = W * view.zoom;
  const spanY = H * view.zoom;
  return {
    ...view,
    x: spanX >= W ? Math.min(0, Math.max(W - spanX, view.x)) : (W - spanX) / 2,
    y: spanY >= H ? Math.min(0, Math.max(H - spanY, view.y)) : (H - spanY) / 2,
  };
};

/**
 * Scale a view while keeping the content under `from` pinned, and let it ride
 * along to `to`. Every zoom gesture is this one operation: the wheel and the
 * buttons pass the same point twice, a pinch passes the centre as it drifts.
 * All points are SVG user units relative to the element's top-left corner.
 */
const scaleAround = (view, nextZoom, from, to = from) => {
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / view.zoom;
  return {
    zoom,
    x: to.x - (from.x - view.x) * ratio,
    y: to.y - (from.y - view.y) * ratio,
  };
};

/**
 * Pan and zoom for the campaign map, with one gesture vocabulary per device:
 *
 *   mouse — Shift/Ctrl + wheel zooms about the cursor, Shift-drag or
 *           middle-drag pans
 *   touch — two fingers pinch to zoom, one finger pans once zoomed in
 *           (at 1x the page keeps its own vertical scroll)
 *   both  — zoomBy / reset, driving the on-screen controls
 *
 * Deltas are converted from screen pixels into SVG user units, so a drag
 * tracks the finger or cursor at any container width — a phone included.
 *
 * @param {number} viewBoxWidth width of the SVG viewBox the transform lives in
 * @param {number} viewBoxHeight height of that viewBox, for the vertical bound
 */
export function usePanZoom(viewBoxWidth = 1000, viewBoxHeight = 589) {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const elementRef = useRef(null);
  const dragRef = useRef(null);  // last client point of a one-pointer drag
  const pinchRef = useRef(null); // { gap, mid } of the previous pinch frame

  // SVG user units per screen pixel, so gestures track the pointer 1:1.
  const unitsPerPixel = useCallback(() => {
    const rect = elementRef.current?.getBoundingClientRect();
    return rect?.width ? viewBoxWidth / rect.width : 1;
  }, [viewBoxWidth]);

  // Client point → SVG units relative to the element's top-left corner.
  const toLocalUnits = useCallback((clientX, clientY) => {
    const rect = elementRef.current?.getBoundingClientRect();
    const scale = unitsPerPixel();
    return {
      x: (clientX - (rect?.left || 0)) * scale,
      y: (clientY - (rect?.top || 0)) * scale,
    };
  }, [unitsPerPixel]);

  /** Zoom by a factor about a client point, defaulting to the map's middle. */
  const zoomBy = useCallback((factor, anchor = null) => {
    const rect = elementRef.current?.getBoundingClientRect();
    const at = anchor || {
      x: (rect?.left || 0) + (rect?.width || 0) / 2,
      y: (rect?.top || 0) + (rect?.height || 0) / 2,
    };
    const point = toLocalUnits(at.x, at.y);
    setView(v => clampView(scaleAround(v, v.zoom * factor, point), viewBoxWidth, viewBoxHeight));
  }, [toLocalUnits, viewBoxWidth, viewBoxHeight]);

  const reset = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), []);

  // React registers wheel listeners as passive, where preventDefault is a
  // no-op, so the wheel is bound natively through this callback ref.
  const attachRef = useCallback((node) => {
    elementRef.current?._panZoomCleanup?.();
    elementRef.current = node;
    if (!node) return;
    const onWheel = (e) => {
      // Shift+wheel is the documented gesture; Ctrl+wheel is what a trackpad
      // pinch sends, and zooming the map beats zooming the whole page.
      if (!e.shiftKey && !e.ctrlKey) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const scale = rect.width ? viewBoxWidth / rect.width : 1;
      const point = { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
      setView(v => clampView(scaleAround(v, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1), point), viewBoxWidth, viewBoxHeight));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node._panZoomCleanup = () => node.removeEventListener('wheel', onWheel);
  }, [viewBoxWidth, viewBoxHeight]);

  /** Shared by the mouse drag and the one-finger pan. */
  const panFrom = useCallback((clientX, clientY) => {
    const from = dragRef.current;
    if (!from) return;
    const scale = unitsPerPixel();
    dragRef.current = { x: clientX, y: clientY };
    setView(v => clampView({
      ...v,
      x: v.x + (clientX - from.x) * scale,
      y: v.y + (clientY - from.y) * scale,
    }, viewBoxWidth, viewBoxHeight));
  }, [unitsPerPixel, viewBoxWidth, viewBoxHeight]);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return;
    e.preventDefault();
    dragRef.current = { x: e.clientX, y: e.clientY };
    setIsPanning(true);
  }, []);

  // Tracked on the window so releasing outside the map still ends the drag.
  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e) => panFrom(e.clientX, e.clientY);
    const onUp = () => {
      dragRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning, panFrom]);

  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { gap: touchGap(e.touches), mid: touchMid(e.touches) };
      dragRef.current = null;
    } else if (e.touches.length === 1) {
      pinchRef.current = null;
      dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const previous = pinchRef.current;
      const gap = touchGap(e.touches);
      const mid = touchMid(e.touches);
      pinchRef.current = { gap, mid };
      if (previous.gap <= 0) return;
      const was = toLocalUnits(previous.mid.x, previous.mid.y);
      const now = toLocalUnits(mid.x, mid.y);
      setView(v => clampView(scaleAround(v, v.zoom * (gap / previous.gap), was, now), viewBoxWidth, viewBoxHeight));
      return;
    }

    // One finger pans only when there is something to pan to; at 1x the
    // gesture belongs to the page so the map never traps the scroll.
    if (e.touches.length === 1 && dragRef.current && view.zoom > 1) {
      panFrom(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [toLocalUnits, panFrom, view.zoom, viewBoxWidth, viewBoxHeight]);

  const onTouchEnd = useCallback((e) => {
    pinchRef.current = null;
    dragRef.current = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null;
  }, []);

  return {
    zoom: view.zoom,
    isPanning,
    isDefaultView: view.zoom === 1 && view.x === 0 && view.y === 0,
    transform: `translate(${view.x}, ${view.y}) scale(${view.zoom})`,
    // At 1x the page owns vertical scrolling; zoomed in, the map owns the drag.
    touchAction: view.zoom > 1 ? 'none' : 'pan-y',
    elementRef,
    attachRef,
    zoomBy,
    reset,
    onMouseDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
