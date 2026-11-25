import { createEntryRoomRenderer } from "./entryRoomRenderer";

const finishCache = new Map<string, Promise<HTMLImageElement | null>>();
function wallTexture(url: string) {
  let pending = finishCache.get(url);
  if (!pending) {
    const image = new Image();
    image.src = url;
    pending = image.decode().then(() => image, () => null);
    finishCache.set(url, pending);
  }
  return pending;
}

/** Keep the completed frame on a normal canvas. The game can claim WebGL for
 * Heroes while the previous room remains visible, even on a one-context device. */
class GarageRoomElement extends HTMLElement {
  private frame = 0;
  private signature = "";
  private size?: ResizeObserver;
  private theme?: MutationObserver;
  private visibility?: IntersectionObserver;
  private renderGeneration = 0;
  private picture?: HTMLCanvasElement;
  private gpu?: NonNullable<ReturnType<typeof createEntryRoomRenderer>>;
  private source?: HTMLCanvasElement;
  private release?: number;

  connectedCallback() {
    if (this.size) return;
    this.size = new ResizeObserver(this.invalidate);
    this.size.observe(this);
    this.theme = new MutationObserver(this.invalidate);
    this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-ui-theme"] });
    this.visibility = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) this.invalidate();
      else this.releaseGPU();
    });
    this.visibility.observe(this);
    document.addEventListener("visibilitychange", this.invalidate);
    this.invalidate();
  }
  disconnectedCallback() {
    queueMicrotask(() => {
      if (this.isConnected) return;
      document.removeEventListener("visibilitychange", this.invalidate);
      this.size?.disconnect(); this.size = undefined;
      this.visibility?.disconnect(); this.theme?.disconnect();
      cancelAnimationFrame(this.frame); this.frame = 0;
      this.renderGeneration++;
      this.releaseGPU();
    });
  }
  private releaseGPU() {
    clearTimeout(this.release);
    this.gpu?.dispose();
    this.gpu = undefined; this.source = undefined;
  }
  private invalidate = () => {
    if (!this.frame && this.isConnected)
      this.frame = requestAnimationFrame(() => { this.frame = 0; void this.paint(); });
  };
  private async paint() {
    const generation = ++this.renderGeneration;
    const bounds = this.getBoundingClientRect();
    if (!bounds.width || !bounds.height || document.hidden) return;
    // This is a static background. Cap pixel cost separately from the game renderer.
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1920 / Math.max(bounds.width, bounds.height));
    const width = Math.max(1, Math.round(bounds.width * scale)), height = Math.max(1, Math.round(bounds.height * scale));
    const style = getComputedStyle(this);
    const colors = ["panel", "stripe", "wall"].map(key => style.getPropertyValue("--app-garage-" + key));
    const signature = [width, height, ...colors].join("|");
    if (signature === this.signature) return;
    const finish = await wallTexture(this.dataset.finish!);
    if (!this.isConnected || generation !== this.renderGeneration) return;
    const picture = this.picture ?? document.createElement("canvas");
    const ctx = picture.getContext("2d", { alpha: false });
    if (!ctx) return;
    this.source ??= document.createElement("canvas");
    this.gpu ??= createEntryRoomRenderer(this.source, finish) ?? undefined;
    if (!this.gpu?.draw(width, height, colors)) { this.releaseGPU(); return; }
    picture.width = width; picture.height = height;
    ctx.drawImage(this.source, 0, 0);
    if (!this.picture) { this.picture = picture; this.append(picture); }
    this.signature = signature;
    this.dataset.ready = "";
    clearTimeout(this.release);
    this.release = window.setTimeout(() => this.releaseGPU(), 350);
  }
}
if (!customElements.get("avensky-garage-room")) customElements.define("avensky-garage-room", GarageRoomElement);
