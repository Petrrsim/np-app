"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Size = { width: number; height: number };
type Limits = { min: number; max: number; start: number; fit: number };
/** A canvas point (cx, cy) that should end up under a window point (px, py). */
type Anchor = { cx: number; cy: number; px: number; py: number };

const STEP = 1.4;
/** Mouse moves less than this (px) still count as a click, not a drag. */
const DRAG_SLOP = 4;

const clamp = (z: number, l: Limits) => Math.min(l.max, Math.max(l.min, z));

/**
 * Map-style moving around a canvas inside a scrolling window (put the returned `scroller` ref on an
 * overflow: auto element):
 * - panning is native scrolling (one finger on phones, trackpad / wheel on laptops) plus
 *   drag-with-the-mouse; a drag doesn't count as a click on whatever it started on;
 * - zoom: pinch (phones), pinch on a trackpad or Ctrl + wheel (laptops), and the returned
 *   `zoomIn` / `zoomOut` / `showAll`, always keeping the point under the fingers / cursor in place;
 * - `resetKey` changing (window size, canvas size, filter) goes back to `limits.start`, centred.
 * The canvas is drawn at `zoom`, `offset` px in from the top-left (it's centred while smaller
 * than the window).
 */
export function usePanZoom(view: Size, canvas: Size, limits: Limits, resetKey: string) {
  const scroller = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ z: limits.start, seq: 0 });
  const zoom = clamp(state.z, limits);
  const anchor = useRef<Anchor | null>(null);
  // Latest values for the native listeners and callbacks.
  const live = useRef({ view, canvas, limits, zoom });
  useLayoutEffect(() => {
    live.current = { view, canvas, limits, zoom };
  });

  const offsetAt = useCallback((z: number) => {
    const { view: v, canvas: c } = live.current;
    return {
      x: Math.max(0, (v.width - c.width * z) / 2),
      y: Math.max(0, (v.height - c.height * z) / 2),
    };
  }, []);

  /** Zoom to `z` keeping the canvas point now under window point (px, py) there (default: centre). */
  const zoomTo = useCallback(
    (z: number, px?: number, py?: number, at?: { cx: number; cy: number }) => {
      const el = scroller.current;
      if (!el) return;
      const { view: v, limits: l, zoom: cur } = live.current;
      const x = px ?? v.width / 2;
      const y = py ?? v.height / 2;
      const o = offsetAt(cur);
      anchor.current = at
        ? { ...at, px: x, py: y }
        : {
            cx: (el.scrollLeft + x - o.x) / cur,
            cy: (el.scrollTop + y - o.y) / cur,
            px: x,
            py: y,
          };
      setState((s) => ({ z: clamp(z, l), seq: s.seq + 1 }));
    },
    [offsetAt],
  );

  // After a zoom renders: scroll so the anchor lands where it should.
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    const o = offsetAt(zoom);
    el.scrollLeft = a.cx * zoom + o.x - a.px;
    el.scrollTop = a.cy * zoom + o.y - a.py;
  }, [state, zoom, offsetAt]);

  // New window / canvas / filter: start zoom, centred.
  useLayoutEffect(() => {
    const { view: v, canvas: c, limits: l } = live.current;
    if (!v.width) return;
    zoomTo(l.start, v.width / 2, v.height / 2, {
      cx: c.width / 2,
      cy: c.height / 2,
    });
  }, [resetKey, zoomTo]);

  const showAll = useCallback(() => {
    const { view: v, canvas: c, limits: l } = live.current;
    zoomTo(l.fit, v.width / 2, v.height / 2, {
      cx: c.width / 2,
      cy: c.height / 2,
    });
  }, [zoomTo]);
  const zoomIn = useCallback(() => zoomTo(live.current.zoom * STEP), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo(live.current.zoom / STEP), [zoomTo]);

  // Pinch (touch) and trackpad pinch / Ctrl + wheel: native, non-passive listeners so the page
  // itself doesn't zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const local = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // plain wheel / two-finger scroll pans natively
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      zoomTo(live.current.zoom * Math.exp(-e.deltaY * 0.01), p.x, p.y);
    };

    let pinch: { d0: number; z0: number; cx: number; cy: number } | null = null;
    const two = (t: TouchList) => {
      const a = t[0];
      const b = t[1];
      return {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        mid: local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
      };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const { d, mid } = two(e.touches);
      const z = live.current.zoom;
      const o = offsetAt(z);
      pinch = {
        d0: Math.max(d, 1),
        z0: z,
        cx: (el.scrollLeft + mid.x - o.x) / z,
        cy: (el.scrollTop + mid.y - o.y) / z,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const { d, mid } = two(e.touches);
      // The point first pinched stays under the fingers: zooms and pans together.
      zoomTo(pinch.z0 * (d / pinch.d0), mid.x, mid.y, {
        cx: pinch.cx,
        cy: pinch.cy,
      });
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    // iOS Safari: stop its own page zoom gesture over the web.
    const stop = (e: Event) => e.preventDefault();

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("gesturestart", stop);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("gesturestart", stop);
    };
  }, [zoomTo, offsetAt]);

  // Drag with the mouse to pan (touch and pen already pan natively).
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      dragged.current = false;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const el = e.currentTarget;
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
        moved: false,
      };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const g = drag.current;
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!g.moved) {
        g.moved = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      e.currentTarget.scrollLeft = g.left - dx;
      e.currentTarget.scrollTop = g.top - dy;
    },
    onPointerUp: () => {
      dragged.current = drag.current?.moved ?? false;
      drag.current = null;
      setDragging(false);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
    },
    // A drag isn't a click on the person / line / background it started on.
    onClickCapture: (e: React.MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  return {
    scroller,
    zoom,
    offset: {
      x: Math.max(0, (view.width - canvas.width * zoom) / 2),
      y: Math.max(0, (view.height - canvas.height * zoom) / 2),
    },
    canZoomIn: zoom < limits.max - 1e-3,
    canZoomOut: zoom > limits.min + 1e-3,
    zoomIn,
    zoomOut,
    showAll,
    dragging,
    handlers,
  };
}
