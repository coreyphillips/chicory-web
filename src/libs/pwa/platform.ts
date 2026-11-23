export function isAndroidIntentDevice() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent);
}
