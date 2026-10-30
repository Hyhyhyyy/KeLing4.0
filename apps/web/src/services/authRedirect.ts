export function shouldRedirectToLogin(status: number | undefined, url = ''): boolean {
  return status === 401 && !/\/auth\/(login|register)(?:\?|$)/.test(url);
}
