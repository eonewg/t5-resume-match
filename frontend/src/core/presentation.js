// Presentation only: preserve API keys, raw documents and calculation evidence.
export function userText(value = '') {
  return String(value).replace(/\bMock\b/g, '演示数据').replace(/\bJD\b/g, '岗位要求')
    .replace(/\bunknown\b/g, '暂未提供').replace(/公共契约/g, '预期格式')
    .replace(/结构化内容/g, '简历内容').replace(/已保护/g, '已确认')
    .replace(/全部字段已保护/g, '已确认内容已保留');
}

export function splitSuggestion(text) {
  const match = /^【STAR】原文：([\s\S]*?)\n优化：([\s\S]*?)\n理由：([\s\S]*)$/.exec(text);
  return match ? { original: match[1], suggested: match[2], reason: match[3] } : null;
}
