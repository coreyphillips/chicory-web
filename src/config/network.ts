/** Ring and the wallet must use the same HTTP relay for an approval. */
export function getDefaultHttpRelay() {
  return process.env.NEXT_PUBLIC_PUBKY_HTTP_RELAY || 'https://httprelay.staging.pubky.app/inbox';
}
