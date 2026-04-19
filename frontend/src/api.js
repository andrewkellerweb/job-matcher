const BASE = 'http://localhost:3001';

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  return res;
}
