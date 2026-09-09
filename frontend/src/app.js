import { userText } from "./core/presentation.js";
import { createApi } from "./core/api.js";
import { runWorkflow } from "./core/workflow.js";
import { createWorkspace } from "./core/workspace.js";
import { moduleSlots, mountSlot } from "./core/modules.js";

const api = createApi();
const workspace = createWorkspace();
const byId = (id) => document.getElementById(id);
const form = byId("workflow-form");
const demoButton = byId("load-demo");
const runButton = byId("run-workflow");
const fields = [byId("resume-text"), byId("job-title"), byId("job-company"), byId("job-text")];
let busy = false;

function showError(message) {
  const banner = byId("workflow-error");
  banner.textContent = userText(message);
  banner.hidden = !message;
}

function renderTags(id, values) {
  const elements = values.map((value) => {
    const element = document.createElement("span");
    element.textContent = userText(value);
    return element;
  });
  if (!elements.length) {
    const element = document.createElement("span");
    element.className = "empty-label";
    element.textContent = "暂无结果";
    elements.push(element);
  }
  byId(id).replaceChildren(...elements);
}

function renderList(id, values) {
  byId(id).replaceChildren(...values.map((value) => {
    const item = document.createElement("li");
    item.textContent = userText(value);
    return item;
  }));
}

function renderResult(data) {
  const { match, diagnosis } = data.result;
  byId("match-score").textContent = data.isMock ? "—" : Number(match.score).toFixed(0);
  byId("score-caption").textContent = data.isMock ? "演示结果，不展示真实匹配分数" : "综合匹配度 / 100";
  byId("result-mode").textContent = data.isMock ? "演示数据" : "诊断已完成";
  byId("result-mode").dataset.real = String(!data.isMock);
  renderTags("matched-skills", match.matched_skills);
  renderTags("missing-skills", match.missing_skills);
  renderList("gap-analysis", match.gap_analysis);
  byId("diagnosis-summary").textContent = diagnosis.summary;
  renderList("diagnosis-suggestions", diagnosis.suggestions);
  byId("results").hidden = false;
  byId("empty-results").hidden = true;
  byId("results-title").focus({ preventScroll: true });
}

function updateCounts() {
  byId("resume-count").textContent = `${fields[0].value.length} / 50000`;
  byId("job-count").textContent = `${fields[3].value.length} / 50000`;
}
form.addEventListener("input", () => {
  updateCounts();
  if (!busy) {
    workspace.updateSelection({ resumeId: null, jdId: null, result: null, isMock: true });
    byId("results").hidden = true;
    byId("empty-results").hidden = false;
    showError("");
    byId("form-status").textContent = "内容已更新，重新提交后生成新的诊断。";
  }
});

demoButton.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  runButton.disabled = demoButton.disabled = true;
  fields.forEach((field) => { field.readOnly = true; });
  showError("");
  try {
    const { data } = await api.demo();
    fields[0].value = data.resume.raw_text;
    fields[1].value = data.jobs[0].title;
    fields[2].value = data.jobs[0].company || "";
    fields[3].value = data.jobs[0].jd_text;
    updateCounts();
    byId("results").hidden = true;
    byId("empty-results").hidden = false;
    byId("form-status").textContent = "已填入合成样例，不含真实个人或招聘信息。";
    workspace.updateSelection({ resumeId: null, jdId: null, result: null, isMock: true });
  } catch (error) { showError(error.message); }
  finally {
    busy = false;
    runButton.disabled = demoButton.disabled = false;
    fields.forEach((field) => { field.readOnly = false; });
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  showError("");
  runButton.disabled = demoButton.disabled = true;
  fields.forEach((field) => { field.readOnly = true; });
  form.setAttribute("aria-busy", "true");
  byId("results").hidden = true;
  byId("empty-results").hidden = false;
  try {
    const result = await runWorkflow(api, {
      resumeText: fields[0].value, title: fields[1].value,
      company: fields[2].value, jdText: fields[3].value,
    }, (message) => { byId("form-status").textContent = message; });
    workspace.updateSelection(result);
    renderResult(result);
    byId("form-status").textContent = "本次结果已保存。修改内容后可再次诊断。";
  } catch (error) {
    showError(error.message);
    byId("form-status").textContent = "本次流程未完成，填写的内容已保留。";
  } finally {
    busy = false;
    runButton.disabled = demoButton.disabled = false;
    fields.forEach((field) => { field.readOnly = false; });
    form.removeAttribute("aria-busy");
  }
});

async function refreshStatus() {
  try {
    const { data } = await api.modules();
    const hasMock = Object.values(data).some((module) => module.is_mock);
    byId("connection-status").textContent = "服务已连接";
    byId("connection-status").dataset.status = "ok";
    byId("mode-banner").hidden = !hasMock;
    const mockNames = Object.entries(data).filter(([, module]) => module.is_mock)
      .map(([key]) => moduleSlots[key]?.title || key);
    byId("mode-summary").textContent = `演示服务 · ${mockNames.join("、")}`;
    byId("mode-detail").textContent = `演示数据：${mockNames.join("、")}使用演示服务，请以各项结果标识为准。`;
  } catch {
    byId("connection-status").textContent = "服务暂不可用";
    byId("connection-status").dataset.status = "error";
    byId("mode-banner").hidden = false;
    byId("mode-summary").textContent = "服务状态暂不可用";
    byId("mode-detail").textContent = "暂时无法读取服务状态。内容可继续填写，请在服务恢复后提交。";
  }
}

let disposeModule = () => {};
let navigation = new AbortController();
async function navigate() {
  navigation.abort();
  disposeModule();
  disposeModule = () => {};
  navigation = new AbortController();
  const signal = navigation.signal;
  const requested = location.hash.slice(1);
  const key = requested === "workspace" ? requested : Object.hasOwn(moduleSlots, requested) ? requested : "resume";
  byId("page-label").textContent = key === "workspace" ? "快捷原文分析" : moduleSlots[key].title;
  document.querySelectorAll("[data-view]").forEach((link) => {
    if (link.dataset.view === key) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  byId("workspace-view").hidden = key !== "workspace";
  byId("module-view").hidden = key === "workspace";
  byId("module-view").replaceChildren();
  if (key === "workspace") return;
  const container = document.createElement("div");
  container.dataset.module = key;
  byId("module-view").append(container);
  const preview = new URLSearchParams(location.search).get("preview") === key;
  try {
    const cleanup = await mountSlot(key, container, { api, ...workspace, signal, view: key }, preview);
    if (signal.aborted) cleanup();
    else disposeModule = cleanup;
  } catch {
    if (signal.aborted) return;
    container.className = "error-banner";
    container.textContent = preview ? "模块预览未能加载，请按前端接入文档检查自己的入口。" : "页面暂时无法加载，请重新选择页面或刷新后重试。";
  }
}
window.addEventListener("hashchange", navigate);
window.addEventListener("focus", refreshStatus);
refreshStatus();
navigate();
