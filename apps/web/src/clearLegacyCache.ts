// Previous builds cached authenticated responses under a shared API cache.
// Remove that named legacy cache only; keep static PWA assets intact.
export async function clearLegacyApiCache(): Promise<void> {
  if ('caches' in window) await window.caches.delete('api-cache');
}
