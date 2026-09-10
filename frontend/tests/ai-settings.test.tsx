import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AISettingsPanel from '../src/components/AISettingsPanel';

const snapshot = () => ({
  revision: 'one',
  warning: '',
  profiles: [] as any[],
  can_exit: true,
  modules: Object.fromEntries(
    ['resume', 'matching', 'diagnosis'].map((key) => [
      key,
      {
        base_url: 'https://fixture.test/v1',
        model: `${key}-model`,
        api_style: 'chat_completions',
        api_key_configured: true,
        source: 'startup',
        profile_id: null as string | null,
        configurable: true,
      },
    ]),
  ),
});
let state: ReturnType<typeof snapshot>;
let calls: { path: string; body: any; signal: AbortSignal }[];
let action: (path: string, body: any) => Response | Promise<Response>;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  state = snapshot();
  calls = [];
  action = () => json(state);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options: RequestInit) => {
      const body = options.body ? JSON.parse(String(options.body)) : null;
      calls.push({ path, body, signal: options.signal as AbortSignal });
      return body ? action(path, body) : json(state);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function open() {
  render(<AISettingsPanel />);
  await screen.findByLabelText('API 地址');
}
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

it('loads masked state without AI calls and retains unsaved module drafts in this dialog', async () => {
  await open();
  expect(value('API Key')).toBe('');
  expect(value('模型名 Model')).toBe('resume-model');
  fireEvent.change(screen.getByLabelText('模型名 Model'), { target: { value: 'my-draft' } });
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'synthetic-key' } });
  fireEvent.click(screen.getByRole('button', { name: /匹配分析/ }));
  expect(value('模型名 Model')).toBe('matching-model');
  fireEvent.click(screen.getByRole('button', { name: /简历识别/ }));
  expect(value('模型名 Model')).toBe('my-draft');
  expect(value('API Key')).toBe('synthetic-key');
  expect(calls).toHaveLength(1);
});

it('explicit save targets one module, clears the key and applies the returned revision', async () => {
  await open();
  action = (_path, body) => {
    state.revision = 'two';
    state.modules.resume = { ...state.modules.resume, model: body.model, source: 'custom' };
    return json(state);
  };
  fireEvent.change(screen.getByLabelText('模型名 Model'), { target: { value: 'my-model' } });
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'synthetic-key' } });
  fireEvent.click(screen.getByRole('button', { name: '保存并应用' }));
  await screen.findByText(/已保存并应用/);
  expect(calls[1].body).toMatchObject({
    modules: ['resume'],
    revision: 'one',
    model: 'my-model',
    api_key: 'synthetic-key',
  });
  expect(value('API Key')).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '保存并应用' }));
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[2].body).toMatchObject({ revision: 'two', api_key: null });
});

it('test connection sends only the selected draft and never saves even when apply-all is checked', async () => {
  await open();
  action = () => json({ message: '连接成功，尚未保存。' });
  fireEvent.click(screen.getByLabelText('同时应用到全部 AI 功能'));
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
  await screen.findByText('连接成功，尚未保存。');
  expect(calls[1].path).toBe('/api/v1/settings/ai/test');
  expect(calls[1].body.modules).toEqual(['resume']);
  expect(calls).toHaveLength(2);
});

it('failed save preserves input while closing discards the unsaved key', async () => {
  await open();
  action = () => json({ error: { message: '保存失败，当前配置未改变。' } }, 503);
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'synthetic-key' } });
  fireEvent.click(screen.getByRole('button', { name: '保存并应用' }));
  await screen.findByRole('alert');
  expect(value('API Key')).toBe('synthetic-key');
  cleanup();
  await open();
  expect(value('API Key')).toBe('');
});

it('changing service address requires a new key and reset sends no credentials', async () => {
  state.modules.resume.source = 'custom';
  await open();
  fireEvent.change(screen.getByLabelText('API 地址'), {
    target: { value: 'https://another.test/v1' },
  });
  expect((screen.getByLabelText('API Key') as HTMLInputElement).required).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '恢复启动配置' }));
  await screen.findByText(/已恢复启动配置/);
  expect(calls[1].path).toBe('/api/v1/settings/ai/reset');
  expect(calls[1].body).toEqual({ modules: ['resume'], revision: 'one' });
});

it('apply-all saves all three modules and pending actions cannot be sent twice', async () => {
  await open();
  let finish: (value: Response) => void;
  action = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  fireEvent.click(screen.getByLabelText('同时应用到全部 AI 功能'));
  fireEvent.click(screen.getByRole('button', { name: '保存并应用' }));
  fireEvent.click(screen.getByRole('button', { name: '正在保存…' }));
  expect(calls).toHaveLength(2);
  expect(calls[1].body.modules).toEqual(['resume', 'matching', 'diagnosis']);
  finish!(json(state));
  await screen.findByText(/已保存并应用/);
});

it('switches among saved suppliers without resending keys or deleting the previous supplier', async () => {
  state.profiles = ['a', 'b'].map((id) => ({
    id,
    name: `Supplier ${id}`,
    base_url: 'https://fixture.test/v1',
    model: `model-${id}`,
    api_style: 'chat_completions',
    api_key_configured: true,
  }));
  state.modules.resume.profile_id = 'a';
  await open();
  action = (_path, body) => {
    state.modules.resume.profile_id = body.profile_id;
    return json(state);
  };
  fireEvent.change(screen.getByLabelText('供应商配置'), { target: { value: 'b' } });
  expect(value('模型名 Model')).toBe('model-b');
  fireEvent.click(screen.getByRole('button', { name: '使用此配置' }));
  await screen.findByText(/已切换供应商/);
  expect(calls[1]).toMatchObject({
    path: '/api/v1/settings/ai/activate',
    body: { modules: ['resume'], profile_id: 'b' },
  });
  expect(calls[1].body.api_key).toBeUndefined();
  expect(state.profiles).toHaveLength(2);
});

it('shows a saved key only on request, can hide it, and clears it on closing', async () => {
  await open();
  action = () => json({ api_key: 'synthetic-visible-key' });
  fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));
  await waitFor(() => expect(value('API Key')).toBe('synthetic-visible-key'));
  expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('text');
  expect(calls[1].path).toBe('/api/v1/settings/ai/key');
  fireEvent.click(screen.getByRole('button', { name: '隐藏 API Key' }));
  expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('password');
  cleanup();
  await open();
  expect(value('API Key')).toBe('');
});

it('save-and-exit sends the edited configuration and clears displayed credentials on success', async () => {
  await open();
  const exited = vi.fn();
  window.addEventListener('vitae-exiting', exited);
  action = () => json({ exiting: true, message: '配置已保存' });
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'synthetic-exit-key' } });
  fireEvent.click(screen.getByRole('button', { name: '保存并退出' }));
  await waitFor(() => expect(exited).toHaveBeenCalledOnce());
  expect(calls[1].path).toBe('/api/v1/settings/ai/save-exit');
  expect(calls[1].body.update).toMatchObject({
    api_key: 'synthetic-exit-key',
    modules: ['resume'],
  });
  expect(screen.queryByLabelText('API Key')).toBeNull();
  window.removeEventListener('vitae-exiting', exited);
});
