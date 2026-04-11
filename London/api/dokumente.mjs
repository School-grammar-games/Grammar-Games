const OWNER = 'School-grammar-games';
const REPO = 'Datenschutz';
const BRANCH = 'main';
const BASE_DIR = 'Dokumente';

function normalizePath(value = '') {
  const normalized = String(value).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!normalized) return '';
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Ungueltiger Dateipfad.');
  }
  return normalized;
}

function buildRepoPath(relativePath = '') {
  return [BASE_DIR, relativePath].filter(Boolean).join('/');
}

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function createHeaders(accept) {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'london-vercel-documents'
  };
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'private, max-age=60'
    }
  });
}

async function fetchGitHubContents(repoPath, accept) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(BRANCH)}`;
  return fetch(url, {
    headers: createHeaders(accept)
  });
}

export async function GET(request) {
  if (!process.env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'GITHUB_TOKEN fehlt.' }, 500);
  }

  try {
    const url = new URL(request.url);
    const file = normalizePath(url.searchParams.get('file') || '');

    if (file) {
      const response = await fetchGitHubContents(buildRepoPath(file), 'application/vnd.github.raw');
      if (!response.ok) {
        return jsonResponse({ error: 'Datei nicht gefunden.' }, response.status === 404 ? 404 : 502);
      }

      const filename = file.split('/').pop() || 'dokument.pdf';
      return new Response(response.body, {
        status: 200,
        headers: {
          'cache-control': 'private, max-age=60',
          'content-disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
          'content-type': response.headers.get('content-type') || 'application/pdf'
        }
      });
    }

    const response = await fetchGitHubContents(BASE_DIR, 'application/vnd.github.object+json');
    if (!response.ok) {
      return jsonResponse({ error: 'Dokumentenliste konnte nicht geladen werden.' }, response.status === 404 ? 404 : 502);
    }

    const payload = await response.json();
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const files = entries
      .filter(entry => entry.type === 'file' && entry.name.toLowerCase().endsWith('.pdf'))
      .map(entry => normalizePath(entry.path.replace(/^Dokumente\/?/i, '')));

    return jsonResponse({ files });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Unbekannter Fehler.' }, 400);
  }
}
