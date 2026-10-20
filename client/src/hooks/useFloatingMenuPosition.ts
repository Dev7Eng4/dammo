import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

const MENU_GAP = 4;
const DEFAULT_MENU_HEIGHT = 240;
const MENU_Z_INDEX = 60;

const HIDDEN_MENU_STYLE: CSSProperties = {
  position: 'fixed',
  visibility: 'hidden',
  top: 0,
  left: 0,
  zIndex: MENU_Z_INDEX,
};

export function useFloatingMenuPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  /** Transformed ancestor the menu is portaled into (e.g. a dialog); fixed coords are relative to it. */
  portalContainer?: HTMLElement | null,
) {
  const [menuStyle, setMenuStyle] = useState<CSSProperties>(HIDDEN_MENU_STYLE);
  const [isPositioned, setIsPositioned] = useState(false);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const containerRect =
      portalContainer && portalContainer !== document.body ? portalContainer.getBoundingClientRect() : null;
    const originLeft = containerRect ? containerRect.left + portalContainer!.clientLeft : 0;
    const originTop = containerRect ? containerRect.top + portalContainer!.clientTop : 0;
    const rect = {
      left: triggerRect.left - originLeft,
      top: triggerRect.top - originTop,
      bottom: triggerRect.bottom - originTop,
      width: triggerRect.width,
    };
    const menuHeight = menuRef.current?.offsetHeight ?? DEFAULT_MENU_HEIGHT;
    const spaceBelow = window.innerHeight - triggerRect.bottom - MENU_GAP;
    const spaceAbove = triggerRect.top - MENU_GAP;
    const showAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    setMenuStyle({
      position: 'fixed',
      visibility: 'visible',
      left: rect.left,
      width: rect.width,
      minWidth: rect.width,
      top: showAbove ? rect.top - menuHeight - MENU_GAP : rect.bottom + MENU_GAP,
      zIndex: MENU_Z_INDEX,
    });
    setIsPositioned(true);
  }, [triggerRef, menuRef, portalContainer]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(HIDDEN_MENU_STYLE);
      setIsPositioned(false);
      return;
    }

    updatePosition();
    const frame = requestAnimationFrame(() => {
      updatePosition();
    });

    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      updatePosition();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;

    // Modal scroll lock (react-remove-scroll) cancels wheel events that reach
    // document from outside the dialog; portaled menus live outside it.
    const stop = (event: Event) => event.stopPropagation();
    menu.addEventListener('wheel', stop);
    menu.addEventListener('touchmove', stop);

    return () => {
      menu.removeEventListener('wheel', stop);
      menu.removeEventListener('touchmove', stop);
    };
  }, [open, menuRef]);

  return { menuStyle, isPositioned };
}
