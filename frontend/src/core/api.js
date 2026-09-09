export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function createApi({ fetchImpl = globalThis.fetch, timeoutMs = 45000, diagnosisTimeoutMs = 120000, resumeTimeoutMs = 150000 } = {}) {
  async function request(path, { method = "GET", body } = {}) {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      throw new ApiError("仅支持当前服务内的请求。");
    }
    const controller = new AbortController();
    const isDiagnosis = method === "POST" && ["/api/v1/diagnoses", "/api/v1/workflow"].includes(path);
    const isResume = method === "POST" && ['/api/v1/resumes/parse', '/api/v1/resumes/preview', '/api/v1/resumes/upload-preview'].includes(path);
    const timer = setTimeout(() => controller.abort(), isDiagnosis ? diagnosisTimeoutMs : isResume ? resumeTimeoutMs : timeoutMs);
    try {
      const multipart = typeof FormData !== "undefined" && body instanceof FormData;
      const response = await fetchImpl(path, {
        method, signal: controller.signal,
        headers: { Accept: "application/json", ...(body === undefined || multipart ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      });
      let data;
      try { data = await response.json(); }
      catch { throw new ApiError("服务返回了无法读取的结果，请稍后重试。", response.status); }
      if (!response.ok) {
        const detail = data?.error?.message;
        const message = typeof detail === "string" ? detail : detail?.message;
        const error = new ApiError(message || "请求未完成，请稍后重试。", response.status);
        if (path === '/api/v1/resumes/upload-preview' && typeof detail?.raw_text === 'string') {
          error.rawText = detail.raw_text;
        }
        throw error;
      }
      return { data, isMock: data?.is_mock === true || response.headers.get("X-T5-Mock") === "true" };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(controller.signal.aborted
        ? "请求超时，内容已保留，请稍后重试。"
        : "暂时无法连接服务，请确认服务已启动后重试。");
    } finally { clearTimeout(timer); }
  }
  return {
    request,
    modules: () => request("/api/v1/modules"),
    demo: () => request("/demo/sample.json"),
    createResume: (rawText) => request("/api/v1/resumes/parse", { method: "POST", body: { raw_text: rawText } }),
    createJob: (data) => request("/api/v1/jobs", { method: "POST", body: data }),
    workflow: (pair) => request("/api/v1/workflow", { method: "POST", body: pair }),
    analytics: () => request("/api/v1/analytics"),
  };
}
