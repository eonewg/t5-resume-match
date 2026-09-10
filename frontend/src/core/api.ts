import type {
  AnalysisResponse,
  Demo,
  JD,
  JDCreate,
  Modules,
  Pair,
  Resume,
  WorkflowResult,
} from './contracts';

export class ApiError extends Error {
  status: number;
  rawText?: string;
  details?: { location: (string | number)[]; type: string }[];
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}
export interface ApiResponse<T> {
  data: T;
  isMock: boolean;
}
interface ApiOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  diagnosisTimeoutMs?: number;
  resumeTimeoutMs?: number;
  signal?: AbortSignal;
}
export function createApi({
  fetchImpl = globalThis.fetch,
  timeoutMs = 45000,
  diagnosisTimeoutMs = 120000,
  resumeTimeoutMs = 150000,
  signal: scopeSignal,
}: ApiOptions = {}) {
  async function request<T = unknown>(
    path: string,
    { method = 'GET', body, signal = scopeSignal }: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
      throw new ApiError('仅支持当前服务内的请求。');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const diagnosis =
      method === 'POST' &&
      (['/api/v1/diagnoses', '/api/v1/workflow'].includes(path) ||
        /^\/api\/v1\/matches\/[^/]+\/assessment$/.test(path));
    const resume =
      method === 'POST' &&
      [
        '/api/v1/resumes/parse',
        '/api/v1/resumes/preview',
        '/api/v1/resumes/upload-preview',
        '/api/v1/jobs/upload-preview',
        '/api/v1/jobs/preview',
      ].includes(path);
    const timer = setTimeout(
      cancel,
      diagnosis ? diagnosisTimeoutMs : resume ? resumeTimeoutMs : timeoutMs,
    );
    try {
      if (signal?.aborted) {
        cancel();
        throw new Error('cancelled');
      }
      const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
      const response = await fetchImpl(path, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiError('服务返回了无法读取的结果，请稍后重试。', response.status);
      }
      if (!response.ok) {
        const detail = data?.error?.message;
        const error = new ApiError(
          (typeof detail === 'string' ? detail : detail?.message) || '请求未完成，请稍后重试。',
          response.status,
        );
        error.details = data?.error?.details;
        if (path === '/api/v1/resumes/upload-preview' && typeof detail?.raw_text === 'string')
          error.rawText = detail.raw_text;
        throw error;
      }
      return {
        data: data as T,
        isMock: data?.is_mock === true || response.headers.get('X-T5-Mock') === 'true',
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        signal?.aborted
          ? '请求已取消，内容已保留。'
          : controller.signal.aborted
            ? '请求超时，内容已保留，请稍后重试。'
            : '暂时无法连接服务，请确认服务已启动后重试。',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  return {
    request,
    modules: () => request<Modules>('/api/v1/modules'),
    demo: () => request<Demo>('/demo/sample.json'),
    createResume: (rawText: string) =>
      request<Resume>('/api/v1/resumes/parse', { method: 'POST', body: { raw_text: rawText } }),
    createJob: (body: JDCreate) => request<JD>('/api/v1/jobs', { method: 'POST', body }),
    workflow: (body: Pair) => request<WorkflowResult>('/api/v1/workflow', { method: 'POST', body }),
    analytics: () => request<AnalysisResponse>('/api/v1/analytics'),
  };
}
export type Api = ReturnType<typeof createApi>;
