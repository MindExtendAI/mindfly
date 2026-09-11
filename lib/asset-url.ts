declare const __MINDFLY_BASE__: string | undefined;

/** Resolve local resources under the configured application base path. */
export function assetUrl(path: string): string {
  const base = typeof __MINDFLY_BASE__ === 'string' ? __MINDFLY_BASE__ : '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
