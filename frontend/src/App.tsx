import vitaeLogo from './assets/vitae.svg';
import { createPortal } from 'react-dom';
import { Component, useEffect, useState, useRef, type ReactNode } from 'react';
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { WorkspaceProvider } from './core/WorkspaceContext';
import { createApi } from './core/api';
import HomePage from './pages/HomePage';
import ResumePage from './pages/ResumePage';
import JobsPage from './pages/JobsPage';
import MatchingPage from './pages/MatchingPage';
import DiagnosisPage from './pages/DiagnosisPage';
import AnalyticsPage from './pages/AnalyticsPage';
import Icon, { type IconName } from './components/Icon';
import ResumeHistoryPage from './pages/ResumeHistoryPage';
import AISettingsPanel from './components/AISettingsPanel';

const navigation: [string, string, IconName][] = [
  ['home', '首页', 'home'],
  ['resume', '我的简历', 'resume'],
  ['resume/history', '历史简历', 'history'],
  ['jobs', '目标岗位', 'jobs'],
  ['matching', '匹配分析', 'matching'],
  ['diagnosis', 'AI 优化', 'diagnosis'],
  ['analytics', '市场洞察', 'analytics'],
];
class PageBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <section className="product-empty" role="alert">
        <h1>页面暂时无法显示</h1>
        <p>已保存记录仍在。请返回首页重试。</p>
        <Link className="button primary" to="/">
          返回首页
        </Link>
      </section>
    ) : (
      this.props.children
    );
  }
}
function ServiceStatus() {
  const [tooltip, setTooltip] = useState<{ left: number; bottom: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const showTooltip = () => {
    const box = trigger.current?.getBoundingClientRect();
    if (box)
      setTooltip({ left: box.right + 12, bottom: Math.max(12, window.innerHeight - box.bottom) });
  };
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [tooltip]);
  const [status, setStatus] = useState({
    connected: false,
    text: '正在连接…',
    mock: false,
    detail: '',
  });
  useEffect(() => {
    let abort = new AbortController();
    const refresh = async () => {
      abort.abort();
      const current = new AbortController();
      abort = current;
      try {
        const { data } = await createApi({ signal: current.signal }).modules();
        if (current.signal.aborted) return;
        const mocks = Object.entries(data)
          .filter(([, value]) => value.is_mock)
          .map(
            ([key]) =>
              ({
                resume: '简历识别',
                jobs: '岗位匹配',
                diagnosis: 'AI 优化',
                analytics: '市场洞察',
              })[key],
          );
        setStatus({
          connected: true,
          text: '服务已连接',
          mock: mocks.length > 0,
          detail: `Mock · ${mocks.join('、')}使用演示服务。请以每项结果标识为准，不用于真实求职结论。`,
        });
      } catch {
        if (!current.signal.aborted)
          setStatus({
            connected: false,
            text: '服务暂不可用',
            mock: false,
            detail: '内容可继续填写，请在服务恢复后重试。',
          });
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('vitae-ai-settings-changed', refresh);
    return () => {
      abort.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('vitae-ai-settings-changed', refresh);
    };
  }, []);
  return (
    <div className="service-status">
      <button
        type="button"
        ref={trigger}
        className="connection-trigger"
        aria-label={status.mock ? 'Mock · 演示模式' : status.text}
        aria-describedby={tooltip ? 'connection-tooltip' : undefined}
        onMouseEnter={showTooltip}
        onFocus={showTooltip}
        onClick={showTooltip}
        onMouseLeave={(event) => {
          if (
            !popup.current?.contains(event.relatedTarget as Node) &&
            document.activeElement !== trigger.current
          )
            setTooltip(null);
        }}
        onBlur={() => setTooltip(null)}
      >
        <span
          id="connection-status"
          aria-label={status.text}
          role="status"
          className="status-pill"
          data-status={status.mock ? 'mock' : status.connected ? 'ok' : 'error'}
        >
          <span>{status.mock ? 'Mock · 演示模式' : status.text}</span>
        </span>
      </button>
      {tooltip &&
        createPortal(
          <div
            id="connection-tooltip"
            role="tooltip"
            ref={popup}
            className="connection-tooltip"
            style={tooltip}
            onMouseLeave={(event) => {
              if (
                !trigger.current?.contains(event.relatedTarget as Node) &&
                document.activeElement !== trigger.current
              )
                setTooltip(null);
            }}
          >
            <strong id="mode-summary">{status.mock ? 'Mock · 演示模式' : status.text}</strong>
            <p id="mode-detail">
              {status.mock || !status.connected
                ? status.detail || '正在检查本地服务连接。'
                : '本地服务连接正常。AI 模型是否可用，可在设置中测试连接。'}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
export function ProductShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('t5-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('t5-sidebar-collapsed', String(collapsed));
    } catch {
      /* Storage is optional. */
    }
  }, [collapsed]);
  const [info, setInfo] = useState<'settings' | 'help'>('help');
  const infoDialog = useRef<HTMLDialogElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitError, setExitError] = useState('');
  useEffect(() => {
    const exit = () => setExiting(true);
    window.addEventListener('vitae-exiting', exit);
    return () => window.removeEventListener('vitae-exiting', exit);
  }, []);
  async function saveAndExit() {
    if (exitBusy) return;
    setExitBusy(true);
    setExitError('');
    try {
      const api = createApi();
      const { data } = await api.request<{ revision: string }>('/api/v1/settings/ai');
      await api.request('/api/v1/settings/ai/save-exit', {
        method: 'POST',
        body: { revision: data.revision },
      });
      setExiting(true);
    } catch (error) {
      setExitError(error instanceof Error ? error.message : '保存退出失败，请重试。');
    } finally {
      setExitBusy(false);
    }
  }

  const key = location.pathname.slice(1) || 'home';
  const title = navigation.find(([value]) => value === key)?.[1] || '市场洞察';
  useEffect(() => {
    document.title = `${title} · Vitae`;
    document.querySelector<HTMLHeadingElement>('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname, title]);
  if (exiting)
    return (
      <main className="exit-screen" role="status">
        <img src={vitaeLogo} alt="" />
        <h1>配置已保存</h1>
        <p>Vitae 服务正在退出，可以关闭此页面。下次运行启动程序即可继续使用。</p>
      </main>
    );
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        跳到主要内容
      </a>
      <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-header">
          <Link className="brand" to="/" aria-label="Vitae 首页" hidden={collapsed}>
            <img src={vitaeLogo} alt="" className="brand-mark" />
            <span>Vitae</span>
          </Link>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
            aria-controls="primary-navigation"
            onClick={() => setCollapsed(!collapsed)}
          >
            <img src={vitaeLogo} alt="" className="sidebar-toggle-brand" />
            <Icon name="panel" />
            <span className="sidebar-toggle-tooltip" aria-hidden="true">
              {collapsed ? '打开侧边栏' : '收起侧边栏'}
            </span>
          </button>
        </div>
        <nav id="primary-navigation" aria-label="主要导航">
          {navigation.map(([value, label, icon]) => (
            <NavLink
              key={value}
              to={value === 'home' ? '/' : `/${value}`}
              end
              data-view={value}
              aria-label={label}
              title={collapsed ? label : undefined}
              className={
                value === 'resume/history'
                  ? 'nav-subpage'
                  : value === 'analytics'
                    ? 'nav-secondary'
                    : ''
              }
            >
              <Icon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            aria-label="设置"
            title={collapsed ? '设置' : undefined}
            onClick={() => {
              setInfo('settings');
              setInfoOpen(true);
              infoDialog.current?.showModal();
            }}
          >
            <Icon name="settings" />
            <span>设置</span>
          </button>
          <button
            type="button"
            aria-label="使用帮助"
            title={collapsed ? '使用帮助' : undefined}
            onClick={() => {
              setInfo('help');
              setInfoOpen(true);
              infoDialog.current?.showModal();
            }}
          >
            <Icon name="help" />
            <span>使用帮助</span>
          </button>
          <button
            type="button"
            aria-label="保存并退出"
            title={collapsed ? '保存并退出' : undefined}
            disabled={exitBusy}
            onClick={() => void saveAndExit()}
          >
            <Icon name="power" />
            <span>{exitBusy ? '正在退出…' : '保存并退出'}</span>
          </button>
          <ServiceStatus />
        </div>
      </aside>
      <dialog
        ref={infoDialog}
        className={`shell-dialog ${info === 'settings' ? 'ai-settings-dialog' : ''}`}
        onClose={() => setInfoOpen(false)}
        aria-labelledby="shell-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="section-heading">
          <h2 id="shell-dialog-title">{info === 'settings' ? 'AI 模型设置' : '使用帮助'}</h2>
          <button
            className="icon-button"
            aria-label="关闭"
            onClick={() => infoDialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        {info === 'settings' ? (
          infoOpen ? (
            <AISettingsPanel />
          ) : null
        ) : (
          <>
            <p>上传或粘贴简历 → 核对并保存 → 选择目标岗位 → 查看匹配 → 生成 AI 建议。</p>
            <p>支持 PDF、DOCX、TXT，单个文件不超过 10 MB。扫描 PDF 请先转为可复制的文字。</p>
            <p>AI 建议需核实后手动修改；缺失的信息请保持空白。</p>
          </>
        )}
      </dialog>
      <div
        className={`app-frame ${collapsed ? 'sidebar-collapsed' : ''} ${['resume/history', 'jobs'].includes(key) ? 'split-workspace-frame' : ''}`}
      >
        <header className="topbar">
          <form
            className="global-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate('/jobs?q=' + encodeURIComponent(search.trim()));
            }}
          >
            <Icon name="search" />
            <label htmlFor="global-search" className="sr-only">
              搜索已录入岗位
            </label>
            <input
              id="global-search"
              type="search"
              placeholder="搜索岗位、技能或行业…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
        </header>
        <main id="main-content" tabIndex={-1}>
          {exitError && (
            <p role="alert" className="feedback" data-error="true">
              {exitError}
            </p>
          )}
          <section id="module-view" aria-label="模块页面">
            <PageBoundary key={location.pathname}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/home" element={<Navigate to="/" replace />} />
                <Route path="/resume" element={<ResumePage />} />
                <Route path="/resume/history" element={<ResumeHistoryPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/matching" element={<MatchingPage />} />
                <Route path="/diagnosis" element={<DiagnosisPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageBoundary>
          </section>
        </main>
      </div>
    </>
  );
}
export default function App() {
  return (
    <HashRouter>
      <WorkspaceProvider>
        <ProductShell />
      </WorkspaceProvider>
    </HashRouter>
  );
}
