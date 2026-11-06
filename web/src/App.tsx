import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from './api/client';
import { Toast } from './components/Toast';
import { gatePathFor } from './lib/gateRedirect';
import { AppRoutes } from './routes';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // 接口返回 401（cookie 过期或口令被改）时统一跳到口令页，登录后回到原页面。
  // 通过 effect 注册而不是在 client.ts 里直接操作路由：api 层不应该依赖 React。
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (location.pathname === '/gate') return;
      // 清掉缓存：里面可能有门禁失效前的结果，登录后应当重新拉取
      queryClient.clear();
      navigate(gatePathFor(location), { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [location, navigate, queryClient]);

  return (
    <>
      <AppRoutes />
      <Toast />
    </>
  );
}
