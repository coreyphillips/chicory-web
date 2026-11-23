// The receipt dialog's scroll-lock library reads Webpack's nonce when it inserts
// its accessibility stylesheet. Reuse the nonce already attached by the renderer.
declare let __webpack_nonce__: string;
const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
if (nonce) __webpack_nonce__ = nonce;
