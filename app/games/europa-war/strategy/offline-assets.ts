/** Keep assets that Next has already executed and removed from the live DOM. */
export function collectOfflinePageAssets(
  origin: string,
  documentAssets: readonly string[],
  loadedResources: readonly Pick<PerformanceEntry, "name">[],
): string[] {
  const assets = new Set<string>();
  const add = (value: string, scriptOrStyleOnly: boolean) => {
    try {
      const url = new URL(value, origin);
      if (
        url.origin !== origin ||
        !url.pathname.startsWith("/_next/static/") ||
        (scriptOrStyleOnly && !/\.(?:js|css)$/.test(url.pathname))
      )
        return;
      assets.add(url.href);
    } catch {
      // A malformed unrelated resource cannot invalidate the game's pack.
    }
  };
  for (const value of documentAssets) add(value, false);
  for (const resource of loadedResources) add(resource.name, true);
  return [...assets];
}
