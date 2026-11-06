import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { shouldRetry } from './api/client';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // 默认的 'online' 模式在浏览器离线时会把请求“暂停”，页面会一直停在骨架屏。
      // 改成 'always'：照常发请求，失败后进入错误态，用户才能看到提示并重试
      networkMode: 'always',
      // 切回标签页就重新请求会让结果列表无故闪动，搜索结果也不需要那么“实时”
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
