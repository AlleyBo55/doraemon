/**
 * Main Entry Point with Hash Routing
 * 
 * Routes:
 * - #/ or empty: Main mascot app
 * - #/approval: Moltbook approval window
 * - #/setup: Setup wizard (TODO: migrate)
 */

import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import './styles/globals.css';

type Route = 'main' | 'approval' | 'setup';

function getRouteFromHash(): Route {
  const hash = window.location.hash.slice(1) || '/';
  if (hash.startsWith('/approval')) return 'approval';
  if (hash.startsWith('/setup')) return 'setup';
  return 'main';
}

function Router() {
  const [route, setRoute] = useState<Route>(getRouteFromHash);
  const [Component, setComponent] = useState<FunctionComponent | null>(null);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const loadComponent = async () => {
      switch (route) {
        case 'approval':
          const { ApprovalPage } = await import('./pages/ApprovalPage');
          setComponent(() => ApprovalPage);
          break;
        case 'setup':
          const { SetupPage } = await import('./pages/SetupPage');
          setComponent(() => SetupPage);
          break;
        case 'main':
        default:
          const { MascotApp } = await import('./app');
          setComponent(() => MascotApp);
          break;
      }
    };
    loadComponent();
  }, [route]);

  if (!Component) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return <Component />;
}

render(<Router />, document.getElementById('app')!);
