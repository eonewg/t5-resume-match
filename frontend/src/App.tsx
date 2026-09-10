import { Component, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from './core/WorkspaceContext';
import { createApi } from './core/api';
import { nextStep, steps } from './core/state';
import HomePage from './pages/HomePage';
import ResumePage from './pages/ResumePage';
import JobsPage from './pages/JobsPage';
import MatchingPage from './pages/MatchingPage';
import DiagnosisPage from './pages/DiagnosisPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ResumeHistoryPage from './pages/ResumeHistoryPage';

const navigation = [
  ['home', '首页'],
  ['resume', '我的简历'],
  ['resume/history', '历史简历'],
  ['jobs', '目标岗位'],
  ['matching', '匹配分析'],
  ['diagnosis', 'AI 优化'],
  ['analytics', '市场洞察'],
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
  const { state } = useWorkspace();
  const active = nextStep(state);
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
        <p className="nav-caption">你的工作空间</p>
        <nav aria-label="主要导航">
          {navigation.map(([value, label]) => (
            <NavLink key={value} to={value === 'home' ? '/' : `/${value}`} end data-view={value}>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-frame">
        <header className="topbar">
          <div className="breadcrumb">
            <span>工作空间</span>
            <span>/</span>
            <strong id="page-label">{title}</strong>
          </div>
          <ServiceStatus />
        </header>
        <main id="main-content" tabIndex={-1}>
          {steps.some((step) => step.path === location.pathname) && (
            <ol className="process-strip" aria-label="求职准备流程">
              {steps.map((step, i) => (
                <li
                  key={step.path}
                  data-current={step.path === location.pathname}
                  data-complete={i < active}
                >
                  <Link to={step.path}>
                    <span aria-hidden="true">{i < active ? '✓' : i + 1}</span>
                    {step.title}
                  </Link>
                </li>
              ))}
            </ol>
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
