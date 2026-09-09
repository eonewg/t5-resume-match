import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './product.css';
import './modules/resume/styles.css';
import './modules/jobs/styles.css';
import './modules/analytics/styles.css';
import './shell.css';

// Keep existing bookmarks (#resume, #jobs, etc.) while Router owns new navigation.
if (/^#(?:home|resume|jobs|matching|diagnosis|analytics|workspace)$/.test(location.hash)) {
  history.replaceState(
    null,
    '',
    location.pathname + location.search + '#/' + location.hash.slice(1),
  );
}
createRoot(document.getElementById('root')!).render(<App />);
