import { NextRequest, NextResponse } from 'next/server';
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

const DEFAULT_REPOSITORY = 'battincik/web.database.coreor.net';
const MAX_PAGES = 10;

function statusOf(pullRequest: GitHubPullRequest): ReleasePullRequestStatus {
  if (pullRequest.merged_at) return 'released';
  if (pullRequest.state === 'open') return 'in-progress';
  return 'closed';
}

function headers() {
  const token = process.env.GITHUB_RELEASES_TOKEN?.trim();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Coreor-Database-Release-History',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function fetchPullRequestPage(repository: string, page: number, fresh: boolean) {
  const response = await fetch(`https://api.github.com/repos/${repository}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`, {
    headers: headers(),
    cache: fresh ? 'no-store' : 'force-cache',
    ...(fresh ? {} : { next: { revalidate: 300 } })
  });

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

export async function GET(request: NextRequest) {
  const repository = process.env.COREOR_RELEASES_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const fresh = request.nextUrl.searchParams.get('fresh') === '1';

  try {
    const pullRequests = (await fetchAllPullRequests(repository, fresh))
      .map(normalizePullRequest)
      .sort((left, right) => right.number - left.number);

    const payload: ReleaseHistoryResponse = {
      repository,
      fetchedAt: new Date().toISOString(),
      source: 'github',
      pullRequests
    };
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': fresh ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300' }
    });
  } catch (error) {
    const payload: ReleaseHistoryResponse = {
      repository,
      fetchedAt: new Date().toISOString(),
      source: 'fallback',
      warning: error instanceof Error ? error.message : 'GitHub sürüm geçmişine ulaşılamadı.',
      pullRequests: FALLBACK_RELEASE_HISTORY
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}
