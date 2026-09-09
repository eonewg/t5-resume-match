export function failureMessage(error: unknown, fallback = '请求失败，请重试。'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
