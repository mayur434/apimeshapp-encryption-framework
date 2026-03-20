function assertAllowedHost(endpoint, allowedHostsCsv) {
  const url = new URL(endpoint);
  const allowedHosts = String(allowedHostsCsv || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedHosts.length > 0 && !allowedHosts.includes(url.host)) {
    throw new Error(`Commerce endpoint host is not allowed: ${url.host}`);
  }
  return url.toString();
}

async function executeCommerceGraphQL({ endpoint, authToken, document, variables, allowedHosts, fetchImpl }) {
  const fetchFn = fetchImpl || global.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available in this runtime.');
  }

  const safeEndpoint = assertAllowedHost(endpoint, allowedHosts);
  const headers = {
    'content-type': 'application/json'
  };
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const response = await fetchFn(safeEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: document, variables })
  });

  const json = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    json
  };
}

module.exports = { executeCommerceGraphQL };
