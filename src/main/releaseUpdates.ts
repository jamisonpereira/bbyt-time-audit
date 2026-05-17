import type { ReleaseUpdateResult } from '../shared/types';

export type GitHubLatestRelease = {
  tag_name?: string;
  html_url?: string;
  name?: string | null;
  prerelease?: boolean;
  draft?: boolean;
};

type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export const normalizeReleaseTag = (tag: string): string =>
  tag.trim().replace(/^v/i, '');

export const compareVersions = (left: string, right: string): number => {
  const leftParts = normalizeReleaseTag(left).split('.').map(Number);
  const rightParts = normalizeReleaseTag(right).split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
};

export const parseLatestRelease = (
  release: GitHubLatestRelease,
  currentVersion: string,
): ReleaseUpdateResult => {
  if (release.draft || release.prerelease) {
    return {
      status: 'current',
      currentVersion,
      message: 'Latest release is not a public stable release.',
    };
  }

  if (!release.tag_name || !release.html_url) {
    return {
      status: 'unavailable',
      currentVersion,
      message: 'Latest GitHub release did not include a tag and URL.',
    };
  }

  const latestVersion = normalizeReleaseTag(release.tag_name);
  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return {
      status: 'current',
      currentVersion,
      latestVersion,
      releaseName: release.name ?? release.tag_name,
      releaseUrl: release.html_url,
    };
  }

  return {
    status: 'available',
    currentVersion,
    latestVersion,
    releaseName: release.name ?? release.tag_name,
    releaseUrl: release.html_url,
  };
};

export const checkLatestRelease = async (
  repoOwner: string,
  repoName: string,
  currentVersion: string,
  fetchImpl: FetchLike = fetch,
): Promise<ReleaseUpdateResult> => {
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'BBYT-Time-Audit',
        },
      },
    );

    if (response.status === 404) {
      return {
        status: 'unavailable',
        currentVersion,
        message: 'No public GitHub release has been published yet.',
      };
    }

    if (!response.ok) {
      return {
        status: 'error',
        currentVersion,
        message: `GitHub release check failed with HTTP ${response.status}.`,
      };
    }

    const release = (await response.json()) as GitHubLatestRelease;
    return parseLatestRelease(release, currentVersion);
  } catch (error) {
    return {
      status: 'error',
      currentVersion,
      message:
        error instanceof Error ? error.message : 'Unknown release check error.',
    };
  }
};
