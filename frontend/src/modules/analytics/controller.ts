import type { ControllerContext, AnalyticsState, Filters } from '../../core/controller-types';
import type { AnalysisResponse } from '../../core/contracts';
import { failureMessage } from '../../core/errors';

export const initialFilters = (): Filters => ({ source_type: '', date_from: '', date_to: '' });

export function recentDates(days: number, now = new Date()) {
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - days + 1);
  return days ? { date_from: format(from), date_to: format(now) } : { date_from: '', date_to: '' };
}

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
    if (!active() || state.busy === 'import' || state.busy === 'external') return;
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
        state.notice = `新增 ${data.created} 条，已有 ${data.existing} 条；已更新已录入岗位分析。`;
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
  async function importExternal(source: 'jobicy' | 'ncss' = 'jobicy') {
    if (!active() || state.busy) return;
    state.busy = 'external';
    state.error = '';
    state.notice = '';
    show();
    try {
      const { data } = await api.request<{
        created: number;
        existing: number;
        skipped: number;
        fetched_at: string;
        cached: boolean;
        source?: string;
      }>(`/api/v1/analytics/external-jobs${source === 'ncss' ? '?source=ncss' : ''}`, {
        method: 'POST',
      });
      if (!active()) return;
      if (![data.created, data.existing, data.skipped].every(Number.isInteger))
        throw Error('同步响应无法读取，请刷新核对。');
      state.busy = '';
      await load(initialFilters());
      if (active()) {
        state.notice = `${data.source || (source === 'ncss' ? '国家大学生就业服务平台' : 'Jobicy')}：新增 ${data.created} 条，已有 ${data.existing} 条，跳过 ${data.skipped} 条；${data.cached ? '使用小时缓存' : '已获取最新快照'}。已有岗位保留首次采集版本。`;
        show();
      }
    } catch (error) {
      if (active()) {
        state.busy = '';
        state.error = failureMessage(error, '外部岗位同步失败，已保存数据保持不变。');
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
  return { load, importSamples, importExternal, dispose };
}
export type AnalyticsController = ReturnType<typeof connectAnalytics>;
