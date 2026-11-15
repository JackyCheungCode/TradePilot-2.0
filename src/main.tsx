import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { DesignSystemProvider } from './design-system/providers';
import './design-system/typography/fonts';
import './design-system/styles/index.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesignSystemProvider>
      <RouterProvider router={router} />
    </DesignSystemProvider>
  </React.StrictMode>,
);
