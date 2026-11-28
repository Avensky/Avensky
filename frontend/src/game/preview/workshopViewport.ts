import { useCharacterPreviewStore } from "../characters/characterPreviewStore";

/** React ref for the uncovered part of a station. Measure at layout changes, outside the render loop. */
export function observeWorkshopViewport(element: HTMLElement | null) {
  if (!element || typeof ResizeObserver === "undefined") return;
  const update = () => {
    const { left, top, width, height } = element.getBoundingClientRect();
    const previous = useCharacterPreviewStore.getState().viewport;
    if (previous?.left !== left || previous.top !== top || previous.width !== width || previous.height !== height) {
      useCharacterPreviewStore.setState({ viewport: { left, top, width, height } });
    }
  };
  const observer = new ResizeObserver(update);
  observer.observe(element);
  update();
  return () => {
    observer.disconnect();
    useCharacterPreviewStore.setState({ viewport: null });
  };
}
