import { useEffect, useRef, useState } from 'react';
import { createApi } from '../core/api';
import { Button, Feedback } from './ui';

const moduleLabels = {
  resume: '简历识别',
  matching: '匹配分析',
  diagnosis: 'AI 优化',
  vision: '岗位与截图识别',
};
type Module = keyof typeof moduleLabels;
type Protocol = 'chat_completions' | 'responses';
interface Connection {
  base_url: string;
  model: string;
  api_style: string;
  api_key_configured: boolean;
}
interface Profile extends Connection {
  id: string;
  name: string;
}
interface ModuleConfig extends Connection {
  source: 'startup' | 'custom';
  configurable: boolean;
  profile_id: string | null;
}
interface Settings {
  revision: string;
  modules: Record<Module, ModuleConfig>;
  profiles: Profile[];
  warning: string;
  saved_profile_id?: string;
  can_exit?: boolean;
}
const empty = {
  profile_name: '',
  base_url: '',
  model: '',
  api_style: 'chat_completions' as Protocol,
  api_key: '',
};
type Action = 'store' | 'test' | 'reset' | 'activate' | 'delete' | 'exit';

export default function AISettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState('deepseek');
  const [module, setModule] = useState<Module>('resume');
  const [profileId, setProfileId] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isTestNotice, setIsTestNotice] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const revealed = useRef('');

  function fill(
    value: Settings,
    selected: Module,
    identifier = value.modules[selected].profile_id || '',
  ) {
    const profile = value.profiles.find((entry) => entry.id === identifier);
    const source = profile || value.modules[selected];
    setProfileId(identifier);
    setIsNew(false);
    setShowKey(false);
    revealed.current = '';
    setDraft({
      profile_name: profile?.name || `${source.model || '默认模型'} 配置`,
      base_url: source.base_url,
      model: source.model,
      api_style: source.api_style === 'responses' ? 'responses' : 'chat_completions',
      api_key: '',
    });
  }
  async function load(signal: AbortSignal) {
    setBusy('load');
    setError('');
    try {
      const { data } = await createApi({ signal }).request<Settings>('/api/v1/settings/ai');
      if (signal.aborted) return;
      setSettings(data);
      fill(data, module);
      setNotice('');
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : '设置加载失败。');
    } finally {
      if (!signal.aborted) setBusy('');
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    lifetime.current = abort;
    void load(abort.signal);
    return () => {
      abort.abort();
      revealed.current = '';
    };
  }, []);

  const current = settings?.modules[module];
  const profile = settings?.profiles.find((entry) => entry.id === profileId);
  const source = profile || (!isNew ? current : undefined);
  const targets = [module];
  const canEdit = Boolean(current?.configurable);
  const requiresKey =
    !source?.api_key_configured ||
    source.base_url.replace(/\/+$/, '') !== draft.base_url.trim().replace(/\/+$/, '');

  function edit(values: Partial<typeof empty>) {
    setDraft((previous) => {
      const next = { ...previous, ...values };
      return next;
    });
    setError('');
    setNotice('');
  }
  async function toggleKey() {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (draft.api_key || !source?.api_key_configured || isNew) {
      setShowKey(true);
      return;
    }
    if (!settings || !lifetime.current || pending.current) return;
    pending.current = true;
    setBusy('key');
    setError('');
    const signal = lifetime.current.signal;
    try {
      const { data } = await createApi({ signal }).request<{ api_key: string }>(
        '/api/v1/settings/ai/key',
        {
          method: 'POST',
          body: { revision: settings.revision, module, profile_id: profileId || null },
        },
      );
      if (signal.aborted) return;
      revealed.current = data.api_key;
      edit({ api_key: data.api_key });
      setShowKey(true);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : '密钥读取失败。');
    } finally {
      pending.current = false;
      if (!signal.aborted) setBusy('');
    }
  }
  async function act(action: Action, selectedProfile = profileId, selectedTargets = targets) {
    if (!settings || !lifetime.current || pending.current) return;
    pending.current = true;
    setBusy(action);
    setIsTestNotice(action === 'test');
    setError('');
    setNotice('');
    const signal = lifetime.current.signal;
    try {
      let path = '/api/v1/settings/ai';
      let body: object = { revision: settings.revision, modules: selectedTargets };
      if (action === 'activate' || action === 'delete') {
        path += action === 'delete' ? '/profiles/delete' : '/activate';
        body = { ...body, profile_id: selectedProfile };
      } else if (action === 'reset') path += '/reset';
      else {
        if (action === 'test') path += '/test';
        const testModule = (Object.keys(moduleLabels) as Module[]).find(
          (key) =>
            settings.modules[key].configurable &&
            (draft.api_style !== 'responses' || key !== 'matching'),
        );
        if (action === 'test' && !testModule) throw new Error('当前没有支持此协议的 AI 功能。');
        body = {
          ...body,
          ...draft,
          source_module: module,
          profile_id: profileId || null,
          api_key: draft.api_key.trim() || null,
          modules: action === 'store' ? [] : action === 'test' ? [testModule] : targets,
        };
      }
      if (action === 'exit') {
        path += '/save-exit';
        body = { revision: settings.revision };
      }
      const { data } = await createApi({ signal }).request<Settings | { message: string }>(path, {
        method: action === 'store' ? 'PUT' : 'POST',
        body,
      });
      if (signal.aborted) return;
      if (action === 'exit') {
        revealed.current = '';
        setDraft(empty);
        setShowKey(false);
        setSettings(null);
        window.dispatchEvent(new Event('vitae-exiting'));
        return;
      }
      if ('modules' in data) {
        if (action === 'store') {
          setEditing(false);
          setShowKey(false);
        }
        setSettings(data);
        fill(data, module, data.saved_profile_id || data.modules[module].profile_id || '');
        setNotice(
          {
            store: '供应商配置已保存。已使用这份配置的功能同步更新，其他功能不变。',
            activate: '已切换供应商，后续新请求立即生效。',
            reset: '已恢复启动配置，已保存的供应商仍可随时切换使用。',
            delete: '已删除这份供应商配置。',
            test: '',
          }[action],
        );
        window.dispatchEvent(new Event('vitae-ai-settings-changed'));
      } else setNotice(data.message);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : '操作失败，请重试。');
    } finally {
      pending.current = false;
      if (!signal.aborted) setBusy('');
    }
  }

  return (
    <div className="ai-settings-panel">
      <p className="ai-settings-intro">
        管理多份模型连接，在每行右侧勾选需要使用的功能。配置保留在本机。
      </p>
      {settings?.warning && (
        <p role="alert" className="feedback" data-error="true">
          {settings.warning}
        </p>
      )}
      <Feedback error={error} busy={Boolean(busy)}>
        {busy === 'load' ? '正在加载设置…' : isTestNotice ? '' : notice}
      </Feedback>
      {error && !editing && (
        <Button
          disabled={Boolean(busy)}
          onClick={() => lifetime.current && void load(lifetime.current.signal)}
        >
          重新加载设置
        </Button>
      )}
      {settings && (
        <>
          <div className="ai-provider-toolbar">
            <h3>模型配置</h3>
            <Button
              tone="primary"
              disabled={
                Boolean(busy) ||
                editing ||
                !Object.values(settings.modules).some((value) => value.configurable)
              }
              onClick={() => {
                setProfileId('');
                setIsNew(true);
                setEditing(true);
                setPreset('deepseek');
                setModule(
                  (Object.keys(moduleLabels) as Module[]).find(
                    (key) => settings.modules[key].configurable,
                  ) || 'resume',
                );
                setDraft({
                  ...empty,
                  profile_name: 'DeepSeek',
                  base_url: 'https://api.deepseek.com',
                  model: 'deepseek-flash',
                });
                setShowKey(false);
                revealed.current = '';
                setError('');
                setNotice('');
              }}
            >
              新建配置
            </Button>
          </div>
          <div className="ai-provider-list" aria-label="模型配置列表">
            {!settings.profiles.length && (
              <p className="ai-provider-empty">
                还没有模型配置，点击“新建配置”添加 DeepSeek 或其他服务商。
              </p>
            )}
            {settings.profiles.map((entry) => {
              const used = Object.values(settings.modules).some(
                (value) => value.profile_id === entry.id,
              );
              return (
                <article
                  className="ai-provider-card"
                  key={entry.id}
                  aria-label={entry.name}
                  data-active={used}
                >
                  <div className="ai-provider-identity">
                    <span className="ai-provider-avatar" aria-hidden="true">
                      {entry.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <h3>{entry.name}</h3>
                      <p>{entry.model}</p>
                      <small>{entry.base_url}</small>
                    </div>
                  </div>
                  <div className="ai-provider-controls">
                    <div
                      className="ai-provider-assignments"
                      role="group"
                      aria-label={`${entry.name} 应用到`}
                    >
                      {(Object.keys(moduleLabels) as Module[]).map((key) => (
                        <label
                          key={key}
                          title={
                            key === 'matching' && entry.api_style === 'responses'
                              ? '匹配分析需要 Chat Completions 协议'
                              : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={settings.modules[key].profile_id === entry.id}
                            disabled={
                              Boolean(busy) ||
                              editing ||
                              !settings.modules[key].configurable ||
                              (key === 'matching' && entry.api_style === 'responses')
                            }
                            onChange={(event) =>
                              void act(event.target.checked ? 'activate' : 'reset', entry.id, [key])
                            }
                          />
                          {moduleLabels[key]}
                        </label>
                      ))}
                    </div>
                    <div className="inline-actions">
                      <Button
                        disabled={Boolean(busy) || editing}
                        onClick={() => {
                          const selected =
                            (Object.keys(moduleLabels) as Module[]).find(
                              (key) =>
                                settings.modules[key].configurable &&
                                (entry.api_style !== 'responses' || key !== 'matching'),
                            ) || 'resume';
                          setModule(selected);
                          fill(settings, selected, entry.id);
                          setEditing(true);
                          setError('');
                          setNotice('');
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        disabled={Boolean(busy) || editing || used}
                        title={used ? '请先取消功能勾选，或切换到其他配置' : undefined}
                        onClick={() => void act('delete', entry.id, [])}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="field-help">
            每个功能只能使用一份配置，勾选其他配置会立即切换。取消勾选恢复默认，正在使用的配置需先取消勾选才能删除。
          </p>
          <div className="ai-provider-defaults">
            {(Object.keys(moduleLabels) as Module[]).map((key) => (
              <span key={key}>
                {moduleLabels[key]}：
                {settings.profiles.find((entry) => entry.id === settings.modules[key].profile_id)
                  ?.name || `默认配置（${settings.modules[key].model || '离线'}）`}
              </span>
            ))}
          </div>
          {editing && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act('store');
              }}
            >
              <fieldset disabled={Boolean(busy) || !canEdit}>
                <legend>
                  {profile ? `编辑配置：${profile.name}` : isNew ? '新建配置' : '当前默认配置'}
                </legend>
                {!canEdit && <p>当前功能使用离线或替代模块，无法在此修改 AI 配置。</p>}
                {isNew && (
                  <div className="ai-provider-preset">
                    <label htmlFor="ai-preset">服务商</label>
                    <select
                      id="ai-preset"
                      value={preset}
                      onChange={(event) => {
                        setPreset(event.target.value);
                        setDraft(
                          event.target.value === 'deepseek'
                            ? {
                                ...empty,
                                profile_name: 'DeepSeek',
                                base_url: 'https://api.deepseek.com',
                                model: 'deepseek-flash',
                              }
                            : { ...empty },
                        );
                        setShowKey(false);
                        revealed.current = '';
                        setError('');
                        setNotice('');
                      }}
                    >
                      <option value="deepseek">DeepSeek</option>
                      <option value="custom">其他服务商 / 自定义</option>
                    </select>
                  </div>
                )}
                <div className="ai-settings-row ai-connection-fields">
                  <div>
                    <label htmlFor="ai-profile-name">配置名称</label>
                    <input
                      id="ai-profile-name"
                      required
                      maxLength={80}
                      value={draft.profile_name}
                      placeholder="例如：日常使用 / 备用模型"
                      onChange={(e) => edit({ profile_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-base-url">API 地址</label>
                    <input
                      id="ai-base-url"
                      type="url"
                      required
                      autoComplete="off"
                      maxLength={2048}
                      placeholder="https://api.example.com/v1"
                      value={draft.base_url}
                      onChange={(e) => edit({ base_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="ai-settings-row">
                  <div>
                    <label htmlFor="ai-model">模型名 Model</label>
                    <input
                      id="ai-model"
                      required
                      maxLength={200}
                      autoComplete="off"
                      placeholder="服务商提供的模型 ID"
                      value={draft.model}
                      onChange={(e) => edit({ model: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-protocol">接口协议</label>
                    <select
                      id="ai-protocol"
                      value={draft.api_style}
                      onChange={(e) => edit({ api_style: e.target.value as Protocol })}
                    >
                      <option value="chat_completions">Chat Completions</option>
                      <option value="responses">Responses（简历 / 优化）</option>
                    </select>
                  </div>
                </div>
                <label htmlFor="ai-api-key">API Key</label>
                <div className="ai-key-input">
                  <input
                    id="ai-api-key"
                    type={showKey ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    maxLength={4096}
                    required={requiresKey}
                    value={draft.api_key}
                    placeholder={
                      requiresKey ? '填写此服务的 API Key' : '已配置 · 可显示查看，留空保留'
                    }
                    onChange={(e) => {
                      revealed.current = '';
                      edit({ api_key: e.target.value });
                    }}
                  />
                  <Button
                    aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                    onClick={() => void toggleKey()}
                  >
                    {showKey ? '隐藏' : '显示'}
                  </Button>
                </div>
                <div className="ai-connection-check">
                  <p className="field-help">密钥留空保留；更换 API 地址需填写新密钥。</p>
                  <div className="ai-settings-test">
                    <Button
                      onClick={(e) => {
                        if (e.currentTarget.form?.reportValidity()) void act('test');
                      }}
                    >
                      {busy === 'test' ? '正在测试…' : '测试连接'}
                    </Button>
                    {isTestNotice && notice && (
                      <span className="ai-settings-test-success" role="status">
                        连接成功
                      </span>
                    )}
                  </div>
                </div>
                <div className="ai-settings-actions">
                  <Button type="submit" tone="primary">
                    {busy === 'store' ? '正在保存…' : '保存配置'}
                  </Button>
                  <Button
                    onClick={() => {
                      setEditing(false);
                      setDraft(empty);
                      setShowKey(false);
                      revealed.current = '';
                      setError('');
                      setNotice('');
                    }}
                  >
                    取消
                  </Button>
                  <span className="field-help">保存后，在列表右侧勾选需要使用的功能。</span>
                </div>{' '}
              </fieldset>
            </form>
          )}
          {settings.can_exit && (
            <details className="ai-settings-more">
              <summary>更多操作</summary>
              <div className="ai-settings-exit-line">
                <span>保留已保存的配置并关闭 Vitae。</span>
                <Button
                  tone="danger"
                  disabled={Boolean(busy) || editing}
                  onClick={() => void act('exit')}
                >
                  保存并退出
                </Button>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
