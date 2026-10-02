import { afterEach, expect, test, vi } from 'vitest';

const assets = [{ role: 'table', localPath: 'assets/models/table.glb' }];
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

test('viewports and source dialog share a request and parsed catalogue', async () => {
  const json = vi.fn().mockResolvedValue({ assets });
  const fetch = vi.fn().mockResolvedValue({ ok: true, json });
  vi.stubGlobal('fetch', fetch);
  const { loadCatalogue } = await import('../asset-catalogue.js');
  const results = await Promise.all([loadCatalogue(), loadCatalogue(), loadCatalogue()]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(json).toHaveBeenCalledOnce();
  expect(results[0]).toBe(results[1]);
  expect(await loadCatalogue()).toBe(results[0]);
});

test.each([
  { ok: false, status: 503 },
  { ok: true, json: async () => ({ assets: [] }) },
])('failed catalogues can be retried without caching a failure', async response => {
  const fetch = vi.fn().mockResolvedValueOnce(response).mockResolvedValue({ ok: true, json: async () => ({ assets }) });
  vi.stubGlobal('fetch', fetch);
  const { loadCatalogue } = await import('../asset-catalogue.js');
  await expect(loadCatalogue()).rejects.toThrow();
  await expect(loadCatalogue()).resolves.toEqual({ assets });
  expect(fetch).toHaveBeenCalledTimes(2);
});
