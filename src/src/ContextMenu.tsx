import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/* eslint-disable react-refresh/only-export-components */
// CR-011 §F.9 "context menu (token-styled, keyboard navigable, z --g-z-pop)"
// + §J "Context menus everywhere data lives ... Shift+F10 / Menu key opens
// them from keyboard focus." — ONE reusable primitive (CR011-P4b-01).
//
// Material: per §B's two-material rule this is INSTRUMENT MATTE, not console
// glass — menus are small, so no backdrop-filter here (blur stays reserved for
// the shell/FAB/Maiden-Line/shortcut-sheet surfaces). Floats in WINDOW space
// exactly like MaidenLine.tsx: callers mount `<ContextMenu>` once, as a
// sibling of `.g-deck-stage` (never inside the scaled/clipped stage), so
// screen-space (x, y) coordinates from a mouse/keyboard event are never
// affected by the stage's scale transform.

/** A single actionable row. Honesty rule (CR011-P4b-01 brief): never include
 *  an item that can't truly act — disable it (or omit it) instead. */
export type ContextMenuAction = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
};
export type ContextMenuSeparator = { id: string; separator: true };
export type ContextMenuEntry = ContextMenuAction | ContextMenuSeparator;

function isAction(entry: ContextMenuEntry): entry is ContextMenuAction {
  return !("separator" in entry) || entry.separator !== true;
}

export type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  /** Element to return focus to when the menu closes. */
  invoker: HTMLElement | null;
} | null;

/** Shift+F10 (the conventional Windows binding) or the physical Menu/
 *  Application key some keyboards ship (browsers report it as
 *  `e.key === "ContextMenu"`). Exported so callers can also gate their own
 *  `onKeyDown` wiring with the same test if needed. */
export function isContextMenuKey(e: { key: string; shiftKey: boolean }): boolean {
  return (e.key === "F10" && e.shiftKey) || e.key === "ContextMenu";
}

/** Hook that owns the menu's open/closed state. One instance per window
 *  (CommandDeck creates one and threads `openFromMouseEvent`/
 *  `openFromKeyboard` down to every target that wires a menu), mirroring how
 *  MaidenLine's open/close state has a single owner. */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>(null);

  const openAt = useCallback(
    (x: number, y: number, items: ContextMenuEntry[], invoker?: HTMLElement | null) => {
      setState({ x, y, items, invoker: invoker ?? (document.activeElement as HTMLElement | null) });
    },
    []
  );

  /** Wire directly to a target's `onContextMenu` (right-click / native Menu
   *  key on a mouse). Suppresses the OS/browser default menu. */
  const openFromMouseEvent = useCallback(
    (e: React.MouseEvent, items: ContextMenuEntry[]) => {
      e.preventDefault();
      openAt(e.clientX, e.clientY, items, e.currentTarget as HTMLElement);
    },
    [openAt]
  );

  /** Wire to a target's `onKeyDown` for Shift+F10 / the keyboard Menu key.
   *  Anchors the menu at the focused element's bottom-left corner (there is
   *  no pointer position for a keyboard invocation). Calls
   *  `stopPropagation()` so CommandDeck's single global window keydown
   *  listener never ALSO processes the same keystroke via the shortcuts.ts
   *  registry's "open-context-menu" entry (same double-handling guard
   *  MaidenLine's own Escape handling already uses). No-ops for any other
   *  key so it's safe to wire unconditionally. */
  const openFromKeyboard = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, items: ContextMenuEntry[]) => {
      if (!isContextMenuKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      openAt(rect.left, rect.bottom, items, e.currentTarget);
    },
    [openAt]
  );

  const close = useCallback(() => setState(null), []);

  return { state, openAt, openFromMouseEvent, openFromKeyboard, close };
}

const VIEWPORT_MARGIN = 8;

/** The floating menu itself. Render ONE instance, mounted as a sibling of
 *  `.g-deck-stage` (see CommandDeck.tsx), fed by a single `useContextMenu()`
 *  instance's `state`/`close`. */
export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const invokerRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number; ready: boolean }>({ x: 0, y: 0, ready: false });

  const actionable = state ? state.items.filter(isAction) : [];

  // Reset selection + remember the invoker every time a NEW menu opens.
  // Deliberately keyed on `state` alone, not the outer `actionable` (it's
  // recomputed fresh below from `state.items` so the effect never closes
  // over a value outside its own deps — no suppression needed).
  useEffect(() => {
    if (!state) return;
    invokerRef.current = state.invoker;
    const currentActionable = state.items.filter(isAction);
    const firstEnabled = currentActionable.findIndex((a) => !a.disabled);
    setActiveIndex(firstEnabled === -1 ? 0 : firstEnabled);
  }, [state]);

  // Focus moves INTO the menu on open, and back to the invoker on close
  // (spec requirement) — mirrors MaidenLine's filter-input autofocus and the
  // shortcut sheet's dialog-focus-on-open pattern. Same `state`-derived
  // `actionable` as above, computed locally so the effect's own deps stay
  // complete.
  useEffect(() => {
    if (!state) {
      invokerRef.current?.focus();
      return;
    }
    const currentActionable = state.items.filter(isAction);
    const raf = window.requestAnimationFrame(() => {
      const first = currentActionable.find((a) => !a.disabled);
      const el = first ? itemRefs.current.get(first.id) : undefined;
      (el ?? menuRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [state]);

  // Move real DOM focus (roving tabindex) whenever the active row changes.
  useEffect(() => {
    if (!state) return;
    const currentActionable = state.items.filter(isAction);
    const item = currentActionable[activeIndex];
    if (item) itemRefs.current.get(item.id)?.focus();
  }, [activeIndex, state]);

  // Clamp to the viewport edges once the real size is known (measure-then-
  // place — avoids a flash at an overflowing position).
  useLayoutEffect(() => {
    if (!state) {
      setPos((p) => ({ ...p, ready: false }));
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = state.x;
    let y = state.y;
    if (x + rect.width + VIEWPORT_MARGIN > window.innerWidth) {
      x = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
    }
    if (y + rect.height + VIEWPORT_MARGIN > window.innerHeight) {
      y = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
    }
    setPos({ x, y, ready: true });
  }, [state]);

  // Close on outside click (via the backdrop below), Esc, scroll, resize.
  useEffect(() => {
    if (!state) return;
    const onScrollOrResize = () => onClose();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [state, onClose]);

  if (!state) return null;

  function moveActive(dir: 1 | -1) {
    setActiveIndex((i) => {
      if (actionable.length === 0) return 0;
      let next = i;
      for (let step = 0; step < actionable.length; step++) {
        next = (next + dir + actionable.length) % actionable.length;
        if (!actionable[next].disabled) break;
      }
      return next;
    });
  }

  function runAction(item: ContextMenuAction) {
    if (item.disabled) return;
    item.run();
    onClose();
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = actionable[activeIndex];
      if (item) runAction(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      // A menu is a closed keyboard loop (spec: ↑↓ wrap, Enter, Esc) — Tab
      // has no defined role here, so treat it like Esc rather than letting
      // focus silently leak to whatever the browser picks next.
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="gm-menu-backdrop"
      onClick={onClose}
      // Right-click elsewhere must not stack the NATIVE menu over ours while
      // ours lingers (Opus gate, CR011-P4b): swallow it and close.
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="gm-menu"
        role="menu"
        aria-label="Context menu"
        style={{ left: pos.x, top: pos.y, visibility: pos.ready ? "visible" : "hidden" }}
        onKeyDown={onMenuKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {state.items.map((entry) =>
          !isAction(entry) ? (
            <div key={entry.id} className="gm-menu-sep" role="separator" />
          ) : (
            <div
              key={entry.id}
              ref={(el) => {
                if (el) itemRefs.current.set(entry.id, el);
                else itemRefs.current.delete(entry.id);
              }}
              role="menuitem"
              aria-disabled={entry.disabled ? "true" : undefined}
              tabIndex={actionable[activeIndex]?.id === entry.id ? 0 : -1}
              className={`gm-menu-item${entry.danger ? " danger" : ""}${entry.disabled ? " disabled" : ""}`}
              onClick={() => runAction(entry)}
            >
              {entry.label}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** Convenience alias for the hook's return shape, so callers/props don't
 *  have to spell out `ReturnType<typeof useContextMenu>` at every call site. */
export type ContextMenuController = ReturnType<typeof useContextMenu>;
