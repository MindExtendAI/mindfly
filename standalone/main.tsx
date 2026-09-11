import { createRoot } from 'react-dom/client';
import MindFly from '../app/mindfly';
import '../app/globals.css';
import './fonts.css';

createRoot(document.getElementById('root')!).render(<MindFly />);

// Hosting sites may supply their own analytics module. Standalone builds omit it.
const analyticsModule = import.meta.env.VITE_ANALYTICS_MODULE_URL;
if (analyticsModule) {
  void import(/* @vite-ignore */ analyticsModule).catch(() => {
    // Analytics must never prevent the simulation from running.
  });
}
