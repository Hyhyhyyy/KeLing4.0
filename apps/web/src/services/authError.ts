/** Keep connection failures distinct from rejected credentials. Never display raw transport responses. */
export function authErrorMessage(error: unknown, fallback: string): string {
  const failure = error as { response?: { status?: number; data?: { error?: unknown } }; code?: string };
  if (failure?.code === 'AUTH_TIMEOUT') return '等待已超过25秒，已停止等待。请检查连接后重试；如果刚才正在注册，服务可能已收到请求，可先尝试登录。';
  if (failure?.code === 'AUTH_CANCELLED' || failure?.code === 'ERR_CANCELED') return '已停止等待。如果刚才正在注册，服务可能已收到请求，可先尝试登录。';
  if (!failure?.response && ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(failure?.code || '')) {
    return '当前网络无法连接账号服务或连接超时。请切换网络后重试；电脑与手机的网络或代理设置可能不同。';
  }
  if (failure?.response?.status === 429) return '尝试过于频繁，请稍后再试。';
  if ((failure?.response?.status || 0) >= 500) return '账号服务暂不可用，请稍后重试。';
  const detail = failure?.response?.data?.error;
  return typeof detail === 'string' ? detail.slice(0, 240) : fallback;
}

export function validAuthResponse(data: unknown): boolean {
  const result = data as { token?: unknown; user?: { id?: unknown; name?: unknown; email?: unknown } };
  return typeof result?.token === 'string' && Boolean(result.token.trim()) &&
    typeof result.user?.id === 'string' && Boolean(result.user.id) &&
    typeof result.user.name === 'string' && typeof result.user.email === 'string';
}
