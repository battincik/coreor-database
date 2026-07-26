import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
import {
  FALLBACK_RELEASE_HISTORY,
  cleanReleaseTitle,
  extractReleaseSummary,
  extractReleaseVersion,
  type ReleaseHistoryResponse,
  type ReleasePullRequest,
  type ReleasePullRequestStatus
} from '@/lib/releaseHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  user: { login: string } | null;
}

interface ReleaseHistoryMemoryCache {
  repository: string;
  fetchedAt: string;
  pullRequests: ReleasePullRequest[];
}

const DEFAULT_REPOSITORY = 'battincik/web.database.coreor.net';
const MAX_PAGES = 10;
const releaseHistoryGlobal = globalThis as typeof globalThis & {
  __coreorReleaseHistoryCache?: ReleaseHistoryMemoryCache;
};

function responseHeaders() {
  return { 'Cache-Control': 'private, no-store, max-age=0' };
}

function statusOf(pullRequest: GitHubPullRequest): ReleasePullRequestStatus {
  if (pullRequest.merged_at) return 'released';
  if (pullRequest.state === 'open') return 'in-progress';
  return 'closed';
}

function githubHeaders() {
  const token = process.env.GITHUB_RELEASES_TOKEN?.trim();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Coreor-Database-Release-History',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function fetchPullRequestPage(repository: string, page: number, fresh: boolean) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
    fresh
      ? { headers: githubHeaders(), cache: 'no-store' }
      : { headers: githubHeaders(), next: { revalidate: 300 } }
  );

  if (!response.ok) {
    const rateRemaining = response.headers.get('x-ratelimit-remaining');
    throw new Error(`GitHub PR geçmişi alınamadı (${response.status}${rateRemaining === '0' ? ', API sınırı doldu' : ''}).`);
  }

  return response.json() as Promise<GitHubPullRequest[]>;
}

async function fetchAllPullRequests(repository: string, fresh: boolean) {
  const result: GitHubPullRequest[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pullRequests = await fetchPullRequestPage(repository, page, fresh);
    result.push(...pullRequests);
    if (pullRequests.length < 100) break;
  }
  return result;
}

function normalizePullRequest(pullRequest: GitHubPullRequest): ReleasePullRequest {
  const body = pullRequest.body || '';
  return {
    number: pullRequest.number,
    version: extractReleaseVersion(pullRequest.number, pullRequest.title, body),
    title: cleanReleaseTitle(pullRequest.number, pullRequest.title),
    summary: extractReleaseSummary(pullRequest.number, body, pullRequest.title),
    body,
    url: pullRequest.html_url,
    author: pullRequest.user?.login || 'Coreor',
    status: statusOf(pullRequest),
    draft: pullRequest.draft,
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at,
    mergedAt: pullRequest.merged_at
  };
}

function fallbackPullRequests(repository: string) {
  const memory = releaseHistoryGlobal.__coreorReleaseHistoryCache;
  if (!memory || memory.repository !== repository || !memory.pullRequests.length) {
    return { pullRequests: FALLBACK_RELEASE_HISTORY, cachedAt: null };
  }

  const byNumber = new Map<number, ReleasePullRequest>();
  for (const item of FALLBACK_RELEASE_HISTORY) byNumber.set(item.number, item);
  for (const item of memory.pullRequests) byNumber.set(item.number, item);
  return {
    pullRequests: [...byNumber.values()].sort((left, right) => right.number - left.number),
    cachedAt: memory.fetchedAt
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Sürüm geçmişi için giriş yapmalısınız.' },
      { status: 401, headers: responseHeaders() }
    );
  }

  const repository = process.env.COREOR_RELEASES_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const fresh = request.nextUrl.searchParams.get('fresh') === '1';

  try {
    const pullRequests = (await fetchAllPullRequests(repository, fresh))
      .map(normalizePullRequest)
      .sort((left, right) => right.number - left.number);
    const fetchedAt = new Date().toISOString();
    releaseHistoryGlobal.__coreorReleaseHistoryCache = { repository, fetchedAt, pullRequests };

    const payload: ReleaseHistoryResponse = {
      repository,
      fetchedAt,
      source: 'github',
      pullRequests
    };
    return NextResponse.json(payload, { headers: responseHeaders() });
  } catch (error) {
    const fallback = fallbackPullRequests(repository);
    const reason = error instanceof Error ? error.message : 'GitHub sürüm geçmişine ulaşılamadı.';
    const payload: ReleaseHistoryResponse = {
      repository,
      fetchedAt: fallback.cachedAt || new Date().toISOString(),
      source: 'fallback',
      warning: fallback.cachedAt
        ? `${reason} En son başarılı GitHub okuması korunarak gösteriliyor.`
        : reason,
      pullRequests: fallback.pullRequests
    };
    return NextResponse.json(payload, { status: 200, headers: responseHeaders() });
  }
}
