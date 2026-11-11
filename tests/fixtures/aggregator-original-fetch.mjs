// API liveness test transport; an unexpected fetch is a test failure.
globalThis.fetch = async (url) => {
  const id = String(url).match(/boards-api\.greenhouse\.io\/v1\/boards\/fixture\/jobs\/(\d)/)?.[1];
  if (id === '1') return new Response(JSON.stringify({ id: 1, title: 'Engineer active', content: 'Apply now' }), { status: 200 });
  if (id === '2') return new Response('{}', { status: 404 });
  if (id === '3') return new Response('{}', { status: 429 });
  throw new Error(`Unexpected fixture request: ${url}`);
};
