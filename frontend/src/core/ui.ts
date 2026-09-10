// Presentation only: an intentionally protected empty value is still empty.
export function fieldStatus(value: string | string[], protectedField: boolean, reviewed: boolean) {
  const filled = Array.isArray(value) ? value.some((item) => item.trim()) : Boolean(value.trim());
  if (!filled) return { text: '未填写', tone: 'neutral' };
  if (reviewed) return { text: '已确认', tone: 'success' };
  return protectedField ? { text: '已修改', tone: 'neutral' } : { text: '待核对', tone: 'neutral' };
}
