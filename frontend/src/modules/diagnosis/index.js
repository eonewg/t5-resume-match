import { connectDiagnosis } from "./controller.js";

export function mount(container, context) {
  const node = (tag, text = "") => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  const style = node("link");
  style.rel = "stylesheet";
  style.href = new URL("./styles.css", import.meta.url).href;
  const heading = node("h1", "AI 简历诊断");
  const intro = node("p", "使用工作台当前选择的简历与岗位，生成 STAR 优化和定向建议。真实模式会向配置的模型服务发送文本。");
  const selection = node("p");
  selection.dataset.testid = "diagnosis-selection";
  const back = node("a", "返回工作台选择简历与岗位");
  back.href = "#workspace";
  const mode = node("p", "正在检查诊断服务模式…");
  mode.dataset.testid = "diagnosis-provider-mode";
  const button = node("button", "诊断当前简历");
  button.className = "button primary";
  const status = node("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const results = node("section");
  results.dataset.testid = "diagnosis-result";
  container.className = "card";
  container.replaceChildren(style, heading, intro, selection, back, mode, button, status, results);
  const controller = connectDiagnosis(context, ({ current, record, busy, error, canRun }) => {
    selection.textContent = canRun ? `当前简历：${current.resumeId} · 岗位：${current.jdId}` : "尚未选择简历与岗位。";
    button.disabled = busy || !canRun;
    button.textContent = busy ? "正在诊断…" : "诊断当前简历";
    status.textContent = error || (busy ? "正在等待诊断结果，请勿重复提交。" : "");
    status.dataset.error = String(Boolean(error));
    results.replaceChildren();
    results.hidden = !record;
    if (!record) return;
    const badge = node("p", record.is_mock ? "Mock 演示结果 · 不代表真实 AI 诊断" : "AI 诊断结果 · 使用前请核实事实");
    badge.dataset.testid = "diagnosis-result-mode";
    const title = node("h2", "诊断摘要");
    const summary = node("p", record.summary);
    const suggestions = node("ul");
    for (const text of record.suggestions) suggestions.append(node("li", text));
    if (!record.suggestions.length) suggestions.append(node("li", "当前结果暂无具体建议。"));
    results.append(badge, title, summary, node("h2", "STAR 与岗位建议"), suggestions);
  });
  button.addEventListener("click", controller.run);
  let disposed = false;
  context.api.request("/api/v1/modules").then(({ data }) => {
    if (disposed || context.signal.aborted) return;
    const mock = data.diagnosis?.is_mock;
    mode.textContent = mock === true ? "当前诊断 Provider：Mock 演示" : mock === false
      ? "当前诊断 Provider：AI 实现（密钥可用性以实际调用为准）" : "无法确认诊断服务模式。";
  }).catch(() => {
    if (!disposed && !context.signal.aborted) mode.textContent = "无法读取服务模式，请检查后重试。";
  });
  return () => {
    disposed = true;
    controller.dispose();
    button.removeEventListener("click", controller.run);
    style.remove();
  };
}
