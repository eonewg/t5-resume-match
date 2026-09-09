import type { ControllerContext, AnalyticsState, Filters } from '../../core/controller-types';
import type { AnalysisResponse } from '../../core/contracts';
import { failureMessage } from '../../core/errors';

export const initialFilters = (): Filters => ({ source_type: 'real', date_from: '', date_to: '' });

export function analyticsPath(filters: Partial<Filters>) {
  const query = new URLSearchParams();
  for (const key of ['source_type', 'date_from', 'date_to'] as const)
    if (filters[key]) query.set(key, filters[key]);
  return '/api/v1/analytics' + (query.size ? '?' + query : '');
}

export function connectAnalytics(
  { api, signal }: ControllerContext,
  render: (state: AnalyticsState) => void,
) {
  let state: AnalyticsState = {
    filters: initialFilters(),
    result: null,
    busy: '',
    error: '',
    notice: '',
  };
  let version = 0,
    disposed = false;
  const active = () => !disposed && !signal.aborted;
  const show = () => {
    if (active()) render(structuredClone(state));
  };
  async function load(filters = state.filters) {
    if (!active() || state.busy === 'import') return;
    const ticket = ++version;
    state = {
      ...state,
      filters: { ...filters },
      result: null,
      busy: 'load',
      error: '',
      notice: '',
    };
    show();
    try {
      if (filters.date_from && filters.date_to && filters.date_from > filters.date_to)
        throw Error('采集日期起点不能晚于终点。');
      const { data, isMock } = await api.request<AnalysisResponse>(analyticsPath(filters));
      if (!active() || ticket !== version) return;
      if (typeof data?.summary !== 'string' || typeof data?.is_mock !== 'boolean')
        throw Error('分析响应无法读取。');
      state.result = { ...data, is_mock: data.is_mock || isMock === true };
    } catch (error) {
      if (active() && ticket === version)
        state.error = failureMessage(error, '分析加载失败，请重试。');
    } finally {
      if (active() && ticket === version) {
        state.busy = '';
        show();
      }
    }
  }
  async function importSamples() {
    if (!active() || state.busy) return;
    const ticket = ++version;
    state.busy = 'import';
    state.error = '';
    state.notice = '';
    show();
    try {
      const { data } = await api.request<{ created: number; existing: number; jd_ids: string[] }>(
        '/api/v1/analytics/sample-jobs',
        { method: 'POST' },
      );
      if (!active() || ticket !== version) return;
      if (!Number.isInteger(data.created) || !Number.isInteger(data.existing))
        throw Error('导入响应无法读取，请刷新后核对。');
      state.busy = '';
      await load(initialFilters());
      if (active()) {
        state.notice = `新增 ${data.created} 条，已有 ${data.existing} 条；已展示真实快照。`;
        show();
      }
    } catch (error) {
      if (active() && ticket === version) {
        state.busy = '';
        state.error = failureMessage(error, '导入失败，请重试。');
        show();
      }
    }
  }
  function dispose() {
    disposed = true;
    version++;
    signal.removeEventListener('abort', dispose);
  }
  signal.addEventListener('abort', dispose, { once: true });
  show();
  return { load, importSamples, dispose };
}
export type AnalyticsController = ReturnType<typeof connectAnalytics>;
