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
    return () => {
      abort.abort();
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return (
    <div className="service-status">
      {(status.mock || !status.connected) && status.detail && (
        <details id="mode-banner" className="service-notice">
          <summary id="mode-summary">{status.mock ? 'Mock · 演示模式' : '连接说明'}</summary>
          <p id="mode-detail">{status.detail}</p>
        </details>
      )}
      <span
        id="connection-status"
        role="status"
        className="status-pill"
        data-status={status.connected ? 'ok' : 'error'}
      >
        {status.text}
      </span>
    </div>
  );
}
export function ProductShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [info, setInfo] = useState<'settings' | 'help'>('help');
  const infoDialog = useRef<HTMLDialogElement>(null);
  const key = location.pathname.slice(1) || 'home';
  const title = navigation.find(([value]) => value === key)?.[1] || '市场洞察';
  useEffect(() => {
    document.title = `${title} · T5 简历与岗位`;
    document.querySelector<HTMLHeadingElement>('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname, title]);
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
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">T5</span>
          <span>
            简历与岗位<small>求职也是工作</small>
          </span>
        </Link>
        <nav aria-label="主要导航">
          {navigation.map(([value, label, icon]) => (
            <NavLink
              key={value}
              to={value === 'home' ? '/' : `/${value}`}
              end
              data-view={value}
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
            onClick={() => {
              setInfo('settings');
              infoDialog.current?.showModal();
            }}
          >
            <Icon name="settings" />
            设置
          </button>
          <button
            type="button"
            onClick={() => {
              setInfo('help');
              infoDialog.current?.showModal();
            }}
          >
            <Icon name="help" />
            帮助与反馈
          </button>
          <ServiceStatus />
        </div>
      </aside>
      <dialog
        ref={infoDialog}
        className="shell-dialog"
        aria-labelledby="shell-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="section-heading">
          <h2 id="shell-dialog-title">{info === 'settings' ? '工作区设置' : '帮助与反馈'}</h2>
          <button
            className="icon-button"
            aria-label="关闭"
            onClick={() => infoDialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        {info === 'settings' ? (
          <>
            <p>当前使用本机工作区。模型和数据库连接沿用应用启动配置。</p>
            <p>服务状态可在侧栏查看；简历版本在“历史简历”中管理。</p>
          </>
        ) : (
          <>
            <p>上传或粘贴简历 → 核对并保存 → 选择目标岗位 → 查看匹配 → 生成 AI 建议。</p>
            <p>支持 PDF、DOCX、TXT，单个文件不超过 10 MB。扫描 PDF 请先转为可复制的文字。</p>
            <p>AI 建议需核实后手动修改；缺失的信息请保持空白。</p>
          </>
        )}
      </dialog>
      <div
        className={`app-frame ${['resume/history', 'jobs'].includes(key) ? 'split-workspace-frame' : ''}`}
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
          <span className="topbar-divider" />
          <span className="user-avatar" aria-label="本地用户工作区">
            U
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
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
