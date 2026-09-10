import { useEffect, useRef, useState } from 'react';
import { createApi } from '../core/api';
import { Button, Feedback } from './ui';

const moduleLabels = { resume: '简历识别', matching: '匹配分析', diagnosis: 'AI 优化' };
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
type Action = 'save' | 'store' | 'test' | 'reset' | 'activate' | 'delete' | 'exit';

export default function AISettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [module, setModule] = useState<Module>('resume');
  const [profileId, setProfileId] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [all, setAll] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isTestNotice, setIsTestNotice] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const revealed = useRef('');
  const drafts = useRef<Record<string, typeof empty>>({});
  const draftKey = `${module}:${profileId || (isNew ? 'new' : 'startup')}`;

  function fill(
    value: Settings,
    selected: Module,
    identifier = value.modules[selected].profile_id || '',
    reuse = false,
  ) {
    const profile = value.profiles.find((entry) => entry.id === identifier);
    const source = profile || value.modules[selected];
    const key = `${selected}:${identifier || 'startup'}`;
    setProfileId(identifier);
    setIsNew(false);
    setShowKey(false);
    revealed.current = '';
    setDraft(
      reuse && drafts.current[key]
        ? drafts.current[key]
        : {
            profile_name: profile?.name || '我的供应商',
            base_url: source.base_url,
            model: source.model,
            api_style: source.api_style === 'responses' ? 'responses' : 'chat_completions',
            api_key: '',
          },
    );
    setAll(false);
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
      drafts.current = {};
      revealed.current = '';
    };
  }, []);

  const current = settings?.modules[module];
  const profile = settings?.profiles.find((entry) => entry.id === profileId);
  const source = profile || (!isNew ? current : undefined);
  const targets = all ? (Object.keys(moduleLabels) as Module[]) : [module];
  const canEdit = Boolean(current?.configurable);
  const requiresKey =
    !source?.api_key_configured ||
    source.base_url.replace(/\/+$/, '') !== draft.base_url.trim().replace(/\/+$/, '');
  const inUse = Boolean(
    profile && Object.values(settings!.modules).some((value) => value.profile_id === profile.id),
  );
  const unchanged = Boolean(
    profile &&
    profile.name === draft.profile_name &&
    profile.base_url === draft.base_url &&
    profile.model === draft.model &&
    profile.api_style === draft.api_style &&
    (!draft.api_key || draft.api_key === revealed.current),
  );

  function edit(values: Partial<typeof empty>) {
    setDraft((previous) => {
      const next = { ...previous, ...values };
      drafts.current[draftKey] = next;
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
  async function act(action: Action) {
    if (!settings || !lifetime.current || pending.current) return;
    pending.current = true;
    setBusy(action);
    setIsTestNotice(action === 'test');
    setError('');
    setNotice('');
    const signal = lifetime.current.signal;
    try {
      let path = '/api/v1/settings/ai';
      let body: object = { revision: settings.revision, modules: targets };
      if (action === 'activate' || action === 'delete') {
        path += action === 'delete' ? '/profiles/delete' : '/activate';
        body = { ...body, profile_id: profileId };
      } else if (action === 'reset') path += '/reset';
      else {
        if (action === 'test') path += '/test';
        body = {
          ...body,
          ...draft,
          source_module: module,
          profile_id: profileId || null,
          api_key: draft.api_key.trim() || null,
          modules: action === 'store' ? [] : action === 'test' ? [module] : targets,
        };
      }
      if (action === 'exit') {
        path += '/save-exit';
        body = { revision: settings.revision, update: body };
      }
      const { data } = await createApi({ signal }).request<Settings | { message: string }>(path, {
        method: action === 'save' || action === 'store' ? 'PUT' : 'POST',
        body,
      });
      if (signal.aborted) return;
      if (action === 'exit') {
        drafts.current = {};
        revealed.current = '';
        setDraft(empty);
        setShowKey(false);
        setSettings(null);
        window.dispatchEvent(new Event('vitae-exiting'));
        return;
      }
      if ('modules' in data) {
        delete drafts.current[draftKey];
        setSettings(data);
        fill(data, module, data.saved_profile_id || data.modules[module].profile_id || '');
        setNotice(
          {
            save: '已保存并应用。后续新请求使用此配置，已有分析结果保留。',
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
        保存多份供应商配置，按功能切换。配置保留在本机，启动时读取；页面与本次运行中的密钥在关闭后清除。
      </p>
      {settings?.warning && (
        <p role="alert" className="feedback" data-error="true">
          {settings.warning}
        </p>
      )}
      <Feedback error={error} busy={Boolean(busy)}>
        {busy === 'load' ? '正在加载设置…' : isTestNotice ? '' : notice}
      </Feedback>
      {error && (
        <Button
          disabled={Boolean(busy)}
          onClick={() => lifetime.current && void load(lifetime.current.signal)}
        >
          重新加载设置
        </Button>
      )}
      {settings && (
        <>
          <div className="ai-settings-modules" aria-label="选择 AI 功能">
            {(Object.keys(moduleLabels) as Module[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={module === key}
                disabled={Boolean(busy)}
                onClick={() => {
                  setModule(key);
                  fill(settings, key, undefined, true);
                  setError('');
                  setNotice('');
                }}
              >
                <strong>{moduleLabels[key]}</strong>
                <small>{settings.modules[key].model || '离线 / 替代模块'}</small>
                <span>
                  {settings.profiles.find((entry) => entry.id === settings.modules[key].profile_id)
                    ?.name || '启动配置'}
                </span>
              </button>
            ))}
          </div>
          <div className="ai-profile-picker">
            <div>
              <label htmlFor="ai-profile">供应商配置</label>
              <select
                id="ai-profile"
                value={profileId}
                disabled={Boolean(busy)}
                onChange={(e) => {
                  fill(settings, module, e.target.value, true);
                  setError('');
                  setNotice('');
                }}
              >
                <option value="">{isNew ? '新建供应商' : '从启动配置新建'}</option>
                {settings.profiles.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.model}
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={Boolean(busy) || !canEdit}
              onClick={() => {
                setProfileId('');
                setIsNew(true);
                setDraft({ ...empty });
                setShowKey(false);
                revealed.current = '';
                setError('');
                setNotice('');
              }}
            >
              新建
            </Button>
            <Button
              disabled={Boolean(busy) || !profile || inUse}
              title={inUse ? '正在使用，请先切换或恢复启动配置' : undefined}
              onClick={() => void act('delete')}
            >
              删除
            </Button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act('save');
            }}
          >
            <fieldset disabled={Boolean(busy) || !canEdit}>
              <legend>
                {moduleLabels[module]} · 当前使用{' '}
                {settings.profiles.find((entry) => entry.id === current?.profile_id)?.name ||
                  '启动配置'}
              </legend>
              {!canEdit && <p>当前功能使用离线或替代模块，无法在此修改 AI 配置。</p>}
              <label htmlFor="ai-profile-name">配置名称</label>
              <input
                id="ai-profile-name"
                required
                maxLength={80}
                value={draft.profile_name}
                placeholder="例如：日常使用 / 备用模型"
                onChange={(e) => edit({ profile_name: e.target.value })}
              />
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
              <p className="field-help">
                使用服务商给出的 HTTPS 基础地址，保留其要求的 /v1 等路径。模型需要支持 JSON
                结构化输出。
              </p>
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
              <p className="field-help">
                更换地址需填写对应密钥。测试连接仅发送一条简短消息，不包含简历或岗位内容。
              </p>
              <div className="ai-profile-apply">
                <label className="ai-settings-all">
                  <input
                    type="checkbox"
                    checked={all}
                    disabled={!Object.values(settings.modules).every((value) => value.configurable)}
                    onChange={(e) => {
                      setAll(e.target.checked);
                      setError('');
                      setNotice('');
                    }}
                  />
                  同时应用到全部 AI 功能
                </label>
                <Button disabled={!unchanged} onClick={() => void act('activate')}>
                  使用此配置
                </Button>
              </div>
              <div className="ai-settings-actions">
                <Button type="submit" tone="primary">
                  {busy === 'save' ? '正在保存…' : '保存并应用'}
                </Button>
                <Button
                  onClick={(e) => {
                    if (e.currentTarget.form?.reportValidity()) void act('store');
                  }}
                >
                  仅保存配置
                </Button>
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
                      {notice}
                    </span>
                  )}
                </div>
                <Button
                  className="ai-settings-reset"
                  disabled={!targets.some((key) => settings.modules[key].source === 'custom')}
                  onClick={() => void act('reset')}
                >
                  恢复启动配置
                </Button>
              </div>
              {settings.can_exit && (
                <div className="ai-settings-exit-line">
                  <span>保留本机配置，下次启动继续使用。</span>
                  <Button
                    tone="danger"
                    onClick={(event) => {
                      if (event.currentTarget.form?.reportValidity()) void act('exit');
                    }}
                  >
                    {busy === 'exit' ? '正在保存并退出…' : '保存并退出'}
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
        </>
      )}
    </div>
  );
}
