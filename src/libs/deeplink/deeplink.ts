/** Android can send a canonical approval URI straight to the Ring application. */
export function toAndroidAuthIntentUrl(url: string, signer: 'ring') {
  if (signer !== 'ring' || !/^pubkyauth:\/\/signin_grant(?:\/[^\s?#]*)?(?:\?[^\s#]+)?$/.test(url)) return url;
  return 'intent://' + url.slice('pubkyauth://'.length) + '#Intent;scheme=pubkyauth;package=to.pubky.ring;end';
}
