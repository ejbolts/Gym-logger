export interface Release {
  version: string;
  title: string;
  summary: string;
  changes: string[];
  url: string;
  image?: {
    url: string;
    alt: string;
  };
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Reject incomplete notes and unsafe links before displaying a server response. */
export function parseRelease(value: unknown): Release | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as Partial<Release>;
  if (
    !text(release.version) ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version) ||
    !text(release.title) ||
    !text(release.summary) ||
    !Array.isArray(release.changes) ||
    !release.changes.length ||
    !release.changes.every(text) ||
    !text(release.url)
  ) {
    return null;
  }
  if (!/^https:\/\/github\.com\/[^\s\\]+$/.test(release.url)) {
    return null;
  }
  if (
    release.image !== undefined &&
    (!release.image ||
      !text(release.image.alt) ||
      !text(release.image.url) ||
      !/^https:\/\/raw\.githubusercontent\.com\/[^\s\\]+$/.test(release.image.url))
  ) {
    return null;
  }
  return release as Release;
}

/** Compare the numeric `major.minor.patch` parts of two release versions. */
export function compareVersions(left: string, right: string): number {
  const parts = (version: string) => version.split('-')[0].split('.').map(Number);
  const [a, b] = [parts(left), parts(right)];
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** Accept earlier releases only when each is valid, unique and listed newest first. */
export function parseReleaseHistory(value: unknown, currentVersion: string): Release[] | null {
  if (!Array.isArray(value)) return null;
  const releases = value.map(parseRelease);
  let newer = currentVersion;
  for (const release of releases) {
    if (!release || compareVersions(release.version, newer) >= 0) return null;
    newer = release.version;
  }
  return releases as Release[];
}
