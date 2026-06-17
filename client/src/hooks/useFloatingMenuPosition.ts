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
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const bodyOverflow = document.documentElement.style.overflow || getComputedStyle(document.documentElement).overflow;

    // #region agent log
    fetch('http://127.0.0.1:7763/ingest/a15224e6-d015-4543-8083-92c5cbe0ee93',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e44d83'},body:JSON.stringify({sessionId:'e44d83',runId:'post-fix',location:'useFloatingMenuPosition.ts:updatePosition',message:'position update',data:{rectLeft:rect.left,rectTop:rect.top,rectBottom:rect.bottom,rectWidth:rect.width,menuHeight,showAbove,computedTop:showAbove?rect.top-menuHeight-MENU_GAP:rect.bottom+MENU_GAP,scrollbarWidth,bodyOverflow,innerWidth:window.innerWidth,clientWidth:document.documentElement.clientWidth,bodyScrollH:document.body.scrollHeight,bodyClientH:document.documentElement.clientHeight,hasMenuRef:!!menuRef.current},timestamp:Date.now(),hypothesisId:'H1-H2-H5'})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7763/ingest/a15224e6-d015-4543-8083-92c5cbe0ee93',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e44d83'},body:JSON.stringify({sessionId:'e44d83',runId:'post-fix',location:'useFloatingMenuPosition.ts:useLayoutEffect-open',message:'menu opened layout effect',data:{isPositioned,open},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    updatePosition();
    const frame = requestAnimationFrame(() => {
      // #region agent log
      fetch('http://127.0.0.1:7763/ingest/a15224e6-d015-4543-8083-92c5cbe0ee93',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e44d83'},body:JSON.stringify({sessionId:'e44d83',runId:'post-fix',location:'useFloatingMenuPosition.ts:rAF',message:'rAF position update',data:{scrollbarWidth:window.innerWidth-document.documentElement.clientWidth},timestamp:Date.now(),hypothesisId:'H2-H3'})}).catch(()=>{});
      // #endregion
      updatePosition();
    });

    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onScroll = () => {
      // #region agent log
      fetch('http://127.0.0.1:7763/ingest/a15224e6-d015-4543-8083-92c5cbe0ee93',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e44d83'},body:JSON.stringify({sessionId:'e44d83',runId:'post-fix',location:'useFloatingMenuPosition.ts:scroll',message:'scroll event reposition',data:{scrollbarWidth:window.innerWidth-document.documentElement.clientWidth},timestamp:Date.now(),hypothesisId:'H3-H4'})}).catch(()=>{});
      // #endregion
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
