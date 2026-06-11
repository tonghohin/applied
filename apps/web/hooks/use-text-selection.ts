"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

export type TextSelection = {
  text: string;
  rect: DOMRect;
};

/**
 * Tracks text selections made fully inside the given container.
 *
 * Returns the normalized selected text and its bounding rect (for anchoring a
 * floating element), or null when there is no valid selection. The selection
 * is dismissed automatically on scroll since the rect is a snapshot.
 */
export function useTextSelection(
  containerRef: RefObject<HTMLElement | null>,
  { minLength, maxLength }: { minLength: number; maxLength: number }
) {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePointerUp = () => {
      // Double-click word selection is finalized after pointerup in some engines
      requestAnimationFrame(() => {
        const liveSelection = window.getSelection();
        if (
          !liveSelection ||
          liveSelection.isCollapsed ||
          liveSelection.rangeCount === 0 ||
          !liveSelection.anchorNode ||
          !liveSelection.focusNode ||
          !container.contains(liveSelection.anchorNode) ||
          !container.contains(liveSelection.focusNode)
        ) {
          setSelection(null);
          return;
        }
        const text = liveSelection.toString().trim().replace(/\s+/g, " ");
        if (text.length < minLength || text.length > maxLength) {
          setSelection(null);
          return;
        }
        const rect = liveSelection.getRangeAt(0).getBoundingClientRect();
        setSelection({ text, rect });
      });
    };

    container.addEventListener("pointerup", handlePointerUp);
    return () => container.removeEventListener("pointerup", handlePointerUp);
  }, [containerRef, minLength, maxLength]);

  // The rect is a snapshot — dismiss if anything scrolls underneath it
  useEffect(() => {
    if (!selection) return;
    const handleScroll = () => setSelection(null);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [selection]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return { selection, clearSelection };
}
