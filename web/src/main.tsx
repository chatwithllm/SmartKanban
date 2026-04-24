import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import { MirrorView } from './MirrorView.tsx';
import { AuthProvider } from './auth.tsx';
import './index.css';

const isMirror = location.pathname.startsWith('/my-day');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMirror ? (
      <MirrorView />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>,
);
