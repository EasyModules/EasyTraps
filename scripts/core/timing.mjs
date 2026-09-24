import { PLACEMENT_POINTER_RELEASE_TIMEOUT_MS } from "./constants.mjs";

export function waitForPlacementPointerRelease(event, timeoutMs = PLACEMENT_POINTER_RELEASE_TIMEOUT_MS) {
  const native = event?.nativeEvent ?? event?.data?.originalEvent ?? event;
  const pointerId = Number.isFinite(Number(native?.pointerId)) ? Number(native.pointerId) : null;
  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const targets = [window, canvas?.app?.view].filter(Boolean);
    const stage = canvas?.stage;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      for (const target of targets) {
        target.removeEventListener?.("pointerup", onRelease, true);
        target.removeEventListener?.("pointercancel", onRelease, true);
        target.removeEventListener?.("mouseup", onRelease, true);
        target.removeEventListener?.("touchend", onRelease, true);
        target.removeEventListener?.("touchcancel", onRelease, true);
      }
      stage?.off?.("pointerup", onRelease);
      stage?.off?.("pointerupoutside", onRelease);
      stage?.off?.("pointercancel", onRelease);
      resolve();
    };
    const onRelease = releaseEvent => {
      if (pointerId !== null && Number.isFinite(Number(releaseEvent?.pointerId)) && Number(releaseEvent.pointerId) !== pointerId) return;
      finish();
    };
    for (const target of targets) {
      target.addEventListener?.("pointerup", onRelease, true);
      target.addEventListener?.("pointercancel", onRelease, true);
      target.addEventListener?.("mouseup", onRelease, true);
      target.addEventListener?.("touchend", onRelease, true);
      target.addEventListener?.("touchcancel", onRelease, true);
    }
    stage?.on?.("pointerup", onRelease);
    stage?.on?.("pointerupoutside", onRelease);
    stage?.on?.("pointercancel", onRelease);
    timer = setTimeout(finish, timeoutMs);
  });
}

export async function waitForCanvasFrames(count = 1) {
  const frames = Math.max(1, Number(count) || 1);
  for (let index = 0; index < frames; index += 1) {
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
