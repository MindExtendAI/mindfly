/** Separate valid EEG estimates from the visual low-focus fallback. */
export function resolveFocusControl(input: {
  connected: boolean;
  usable: boolean;
  measuredFocus: number;
  demo: boolean;
  demoFocus: number;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (input.connected) {
    const valid = input.usable && Number.isFinite(input.measuredFocus);
    return {
      enabled: true,
      focus: valid ? clamp(input.measuredFocus) : 0,
      fallback: !valid,
    };
  }
  if (input.demo)
    return {
      enabled: true,
      focus: Number.isFinite(input.demoFocus) ? clamp(input.demoFocus) : 0,
      fallback: false,
    };
  return { enabled: false, focus: 0, fallback: false };
}

export function focusFromCalmActivity(activity: number) {
  return Number.isFinite(activity) ? Math.max(0, Math.min(1, 1 - activity)) : 0;
}
