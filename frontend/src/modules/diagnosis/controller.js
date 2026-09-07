// Uses only the shared workspace and public API; no other member module imports.
export function connectDiagnosis({ api, getState, subscribe, signal }, render) {
  let disposed = false;
  let version = 0;
  let busy = false;
  let current = getState();
  let record = current.result?.diagnosis || null;
  let error = "";
  const validPair = () => Boolean(current.resumeId && current.jdId);
  const samePair = (left, right) => left.resumeId === right.resumeId && left.jdId === right.jdId;
  function display() {
    if (!disposed && !signal.aborted) render({ current, record, busy, error, canRun: validPair() });
  }
  const unsubscribe = subscribe(next => {
    if (!samePair(next, current)) {
      version += 1;
      busy = false;
      record = null;
      error = "";
    }
    current = next;
    const candidate = next.result?.diagnosis;
    if (candidate?.resume_id === next.resumeId && candidate?.jd_id === next.jdId) record = candidate;
    display();
  });
  if (record?.resume_id !== current.resumeId || record?.jd_id !== current.jdId) record = null;
  display();
  async function run() {
    if (busy || disposed || signal.aborted) return;
    if (!validPair()) { error = "请先在工作台保存简历与岗位，完成当前选择。"; display(); return; }
    const selected = { ...current };
    const ticket = ++version;
    busy = true;
    record = null;
    error = "";
    display();
    try {
      const response = await api.request("/api/v1/diagnoses", {
        method: "POST", body: { resume_id: selected.resumeId, jd_id: selected.jdId },
      });
      if (disposed || signal.aborted || ticket !== version || !samePair(selected, current)) return;
      const data = response.data;
      if (data.resume_id !== selected.resumeId || data.jd_id !== selected.jdId ||
          typeof data.summary !== "string" || !Array.isArray(data.suggestions) ||
          !data.suggestions.every(item => typeof item === "string") || typeof data.is_mock !== "boolean") {
        throw new Error("诊断响应不符合公共契约，请稍后重试。");
      }
      record = { ...data, is_mock: data.is_mock || response.isMock === true };
    } catch (failure) {
      if (!disposed && !signal.aborted && ticket === version) error = failure.message || "诊断失败，请重试。";
    } finally {
      if (ticket === version) { busy = false; display(); }
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    version += 1;
    unsubscribe();
    signal.removeEventListener("abort", dispose);
  }
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose();
  return { run, dispose };
}
