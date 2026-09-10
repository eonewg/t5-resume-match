// Presentation only: preserve API keys, raw documents and calculation evidence.
export function userText(value = '') {
  return String(value)
    .replace(/\bMock\b/g, '演示数据')
    .replace(/\bJD\b/g, '岗位要求')
    .replace(/\bunknown\b/g, '暂未提供')
    .replace(/公共契约/g, '预期格式')
    .replace(/结构化内容/g, '简历内容')
    .replace(/已保护/g, '已确认')
    .replace(/全部字段已保护/g, '已确认内容已保留');
}

export function splitSuggestion(text: string) {
  const match = /^【STAR】原文：([\s\S]*?)\n优化：([\s\S]*?)\n理由：([\s\S]*)$/.exec(text);
  return match ? { original: match[1], suggested: match[2], reason: match[3] } : null;
}

// Older saved responses used labelled STAR prose. Remove only structural labels;
// preserve the original quote, facts, punctuation and missing-data markers.
export function naturalRewrite(text: string) {
  if (!/^(?:情境|背景|任务)[：:]/.test(text) || !/[；。\n]\s*行动[：:]/.test(text)) return text;
  return text.replace(/(^|[；。\n])\s*(?:情境|背景|任务|行动|结果)[：:]\s*/g, '$1');
}

export function diagnosisNote(text: string) {
  return userText(text)
    .replace(/岗位要求\s*要求/g, '岗位要求')
    .replace(/\boptimized\b/g, '建议表达')
    .replace(/\bSTAR\b/g, '经历')
    .replace(/\bstar_rewrites\b/g, '经历改写');
}

export function jobSuggestion(text: string) {
  const content = diagnosisNote(text.replace(/^【岗位建议】\s*/, '')).trim();
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // New responses lead with a short, actionable sentence. Older records remain
  // readable without another model call; the complete explanation stays available.
  if (lines.length > 1 && lines[0].length <= 60)
    return { headline: lines[0], detail: lines.slice(1).join('\n') };
  const action = /[，；。]\s*((?:建议|可以|可在|若|如果|如未)[\s\S]+)$/.exec(content);
  if (action && /若|如果|只有|仅当/.test(content.slice(0, action.index)))
    return { headline: content, detail: content };
  return { headline: action?.[1] || content, detail: action || content.length > 80 ? content : '' };
}
