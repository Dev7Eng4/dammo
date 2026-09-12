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
) {
  const [menuStyle, setMenuStyle] = useState<CSSProperties>(HIDDEN_MENU_STYLE);
  const [isPositioned, setIsPositioned] = useState(false);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? DEFAULT_MENU_HEIGHT;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
    const spaceAbove = rect.top - MENU_GAP;
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
  }, [triggerRef, menuRef]);

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

    const onScroll = () => {
      updatePosition();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePosition]);

  return { menuStyle, isPositioned };
}
