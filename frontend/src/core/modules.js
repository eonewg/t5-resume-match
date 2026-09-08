// A registers reviewed frontend entrypoints here. Members edit only their own module directory.
export const moduleSlots = {
  resume: { title: "简历编辑", load: null },
  jobs: { title: "岗位匹配", load: () => import("../modules/jobs/index.js") },
  diagnosis: { title: "AI 诊断", load: () => import("../modules/diagnosis/index.js") },
  analytics: { title: "市场分析", load: null },
};

// Explicit local preview lets members work before A registers their finished module.
// Only these four fixed paths are allowed; arbitrary URLs cannot be supplied.
const previewLoaders = {
  resume: () => import("../modules/resume/index.js"),
  jobs: () => import("../modules/jobs/index.js"),
  diagnosis: () => import("../modules/diagnosis/index.js"),
  analytics: () => import("../modules/analytics/index.js"),
};

export async function mountSlot(key, container, context, preview = false) {
  const slot = moduleSlots[key];
  const load = preview ? previewLoaders[key] : slot?.load;
  if (!slot) throw new Error("Unknown module");
  if (!load) {
    container.className = "card module-placeholder";
    const title = document.createElement("h1");
    title.textContent = slot.title;
    const text = document.createElement("p");
    text.textContent = "这个页面正在准备中。你可以先在诊断工作台粘贴内容，体验完整流程。";
    const link = document.createElement("a");
    link.href = "#workspace";
    link.className = "button primary";
    link.textContent = "返回诊断工作台 →";
    container.replaceChildren(title, text, link);
    return () => {};
  }
  const module = await load();
  if (context.signal.aborted) return () => {};
  if (typeof module.mount !== "function") throw new Error("Module must export mount(container, context)");
  const cleanup = await module.mount(container, context);
  if (cleanup !== undefined && typeof cleanup !== "function") throw new Error("mount must return a cleanup function or undefined");
  return cleanup || (() => {});
}
