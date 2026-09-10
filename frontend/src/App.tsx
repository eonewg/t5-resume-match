import { Component, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { WorkspaceProvider } from './core/WorkspaceContext';
import { createApi } from './core/api';
import HomePage from './pages/HomePage';
import ResumePage from './pages/ResumePage';
import JobsPage from './pages/JobsPage';
import MatchingPage from './pages/MatchingPage';
import DiagnosisPage from './pages/DiagnosisPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ResumeHistoryPage from './pages/ResumeHistoryPage';

const navigation = [
  ['home', '首页', 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z'],
  ['resume', '我的简历', 'M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6'],
  ['resume/history', '历史简历', 'M3 5v5h5M3 10a9 9 0 1 1 1 7m8-11v6l4 2'],
  ['jobs', '目标岗位', 'M8 7V4h8v3M3 7h18v14H3Zm0 5 9 3 9-3M10 12h4'],
  ['matching', '匹配分析', 'M4 4h6v6H4Zm10 10h6v6h-6ZM14 4h6v6M20 4l-7 7M4 14v6h6M4 20l7-7'],
  [
    'diagnosis',
    'AI 优化',
    'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4',
  ],
  ['analytics', '市场洞察', 'M4 3v18h17M8 16v-4m5 4V7m5 9V4'],
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
            简历与岗位<small>求职准备工作台</small>
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
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d={icon} />
              </svg>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <ServiceStatus />
      </aside>
      <div className="app-frame">
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
