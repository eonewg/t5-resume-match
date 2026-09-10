import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AISettingsPanel from '../src/components/AISettingsPanel';

const snapshot = () => ({
  revision: 'one',
  warning: '',
  profiles: [] as any[],
  can_exit: true,
  modules: Object.fromEntries(
    ['resume', 'matching', 'diagnosis', 'vision'].map((key) => [
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
  await screen.findByLabelText('模型配置列表');
}
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
function profiles() {
  state.profiles = ['a', 'b'].map((id) => ({
    id,
    name: `模型 ${id}`,
    model: `model-${id}`,
    base_url: 'https://fixture.test/v1',
    api_style: 'chat_completions',
    api_key_configured: true,
  }));
}
const row = (id: string) => within(screen.getByRole('article', { name: `模型 ${id}` }));

it('lists profiles without an editor or key request and creates DeepSeek or custom drafts locally', async () => {
  await open();
  expect(screen.queryByLabelText('API 地址')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '新建配置' }));
  expect(value('服务商')).toBe('deepseek');
  expect(value('API 地址')).toBe('https://api.deepseek.com');
  expect(value('模型名 Model')).toBe('deepseek-flash');
  expect((screen.getByLabelText('API Key') as HTMLInputElement).required).toBe(true);
  fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'custom' } });
  expect(value('API 地址')).toBe('');
  expect(value('API Key')).toBe('');
  expect(calls).toHaveLength(1);
});

it('stores a new profile without applying it to any module', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: '新建配置' }));
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'synthetic-only' } });
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await screen.findByText(/供应商配置已保存/);
  expect(calls[1].body).toMatchObject({
    modules: [],
    profile_id: null,
    model: 'deepseek-flash',
    api_key: 'synthetic-only',
  });
  expect(screen.queryByLabelText('API Key')).toBeNull();
});

it('switches only the checked module and unchecking restores its default', async () => {
  profiles();
  state.modules.resume.profile_id = 'a';
  await open();
  action = (path, body) => {
    state.revision = 'two';
    state.modules.resume.profile_id = path.endsWith('/reset') ? null : body.profile_id;
    return json(state);
  };
  fireEvent.click(row('b').getByRole('checkbox', { name: '简历识别' }));
  await waitFor(() =>
    expect((row('b').getByRole('checkbox', { name: '简历识别' }) as HTMLInputElement).checked).toBe(
      true,
    ),
  );
  expect((row('a').getByRole('checkbox', { name: '简历识别' }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect(calls[1]).toMatchObject({
    path: '/api/v1/settings/ai/activate',
    body: { modules: ['resume'], profile_id: 'b' },
  });
  fireEvent.click(row('b').getByRole('checkbox', { name: '简历识别' }));
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[2]).toMatchObject({
    path: '/api/v1/settings/ai/reset',
    body: { revision: 'two', modules: ['resume'] },
  });
});

it('failed assignment retains the current selection and no automatic retry occurs', async () => {
  profiles();
  state.modules.resume.profile_id = 'a';
  await open();
  action = () => json({ error: { message: '无法保存配置' } }, 503);
  fireEvent.click(row('b').getByRole('checkbox', { name: '简历识别' }));
  await screen.findByRole('alert');
  expect((row('a').getByRole('checkbox', { name: '简历识别' }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect((row('b').getByRole('checkbox', { name: '简历识别' }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect(calls).toHaveLength(2);
});

it('protects assigned profiles from deletion and deletes an unused profile explicitly', async () => {
  profiles();
  state.modules.resume.profile_id = 'a';
  await open();
  expect((row('a').getByRole('button', { name: '删除' }) as HTMLButtonElement).disabled).toBe(true);
  action = () => {
    state.profiles = state.profiles.filter((p) => p.id !== 'b');
    return json(state);
  };
  fireEvent.click(row('b').getByRole('button', { name: '删除' }));
  await waitFor(() => expect(screen.queryByRole('article', { name: '模型 b' })).toBeNull());
  expect(calls[1]).toMatchObject({
    path: '/api/v1/settings/ai/profiles/delete',
    body: { modules: [], profile_id: 'b' },
  });
});

it('editing preserves stored keys, errors keep drafts, cancelling discards revealed keys', async () => {
  profiles();
  await open();
  fireEvent.click(row('b').getByRole('button', { name: '编辑' }));
  expect(value('API Key')).toBe('');
  expect((screen.getByLabelText('API Key') as HTMLInputElement).required).toBe(false);
  action = () => json({ error: { message: '保存失败' } }, 503);
  fireEvent.change(screen.getByLabelText('模型名 Model'), { target: { value: 'edited-model' } });
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await screen.findByRole('alert');
  expect(value('模型名 Model')).toBe('edited-model');
  expect(calls[1].body).toMatchObject({ profile_id: 'b', api_key: null, modules: [] });
  action = () => json({ api_key: 'synthetic-reveal' });
  fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));
  await waitFor(() => expect(value('API Key')).toBe('synthetic-reveal'));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  fireEvent.click(row('b').getByRole('button', { name: '编辑' }));
  expect(value('API Key')).toBe('');
  fireEvent.change(screen.getByLabelText('API 地址'), { target: { value: 'https://new.test' } });
  expect((screen.getByLabelText('API Key') as HTMLInputElement).required).toBe(true);
});

it('test success stays beside the button, clears on edit and never saves', async () => {
  profiles();
  await open();
  fireEvent.click(row('a').getByRole('button', { name: '编辑' }));
  action = () => json({ message: '连接成功，模型已回复。' });
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
  const success = await screen.findByText('连接成功');
  expect(success.parentElement).toBe(
    screen.getByRole('button', { name: '测试连接' }).parentElement,
  );
  expect(calls[1].path).toBe('/api/v1/settings/ai/test');
  fireEvent.change(screen.getByLabelText('模型名 Model'), { target: { value: 'another' } });
  expect(screen.queryByText('连接成功')).toBeNull();
  expect(calls).toHaveLength(2);
});

it('disables incompatible assignments and blocks concurrent changes while saving', async () => {
  profiles();
  state.profiles[0].api_style = 'responses';
  state.modules.diagnosis.configurable = false;
  await open();
  expect((row('a').getByRole('checkbox', { name: '匹配分析' }) as HTMLInputElement).disabled).toBe(
    true,
  );
  expect((row('b').getByRole('checkbox', { name: 'AI 优化' }) as HTMLInputElement).disabled).toBe(
    true,
  );
  let finish!: (value: Response) => void;
  action = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  fireEvent.click(row('b').getByRole('checkbox', { name: '简历识别' }));
  fireEvent.click(row('a').getByRole('checkbox', { name: '简历识别' }));
  expect(calls).toHaveLength(2);
  finish(json(state));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '新建配置' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
});

it('save-and-exit retains existing profiles without sending an editor update', async () => {
  await open();
  const exited = vi.fn();
  window.addEventListener('vitae-exiting', exited);
  action = () => json({ exiting: true });
  fireEvent.click(screen.getByText('更多操作'));
  fireEvent.click(screen.getByRole('button', { name: '保存并退出' }));
  await waitFor(() => expect(exited).toHaveBeenCalledOnce());
  expect(calls[1].body).toEqual({ revision: 'one' });
  window.removeEventListener('vitae-exiting', exited);
});
