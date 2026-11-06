import { Route, Routes } from 'react-router-dom';
import GatePage from './pages/GatePage';
import NotFound from './pages/NotFound';
import SearchPage from './pages/SearchPage';
import SharePage from './pages/SharePage';

// 分享页 /s/:id 免口令；其余页面没有门禁 cookie 时，接口 401 会触发跳转到 /gate（手册 §7.1）
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/gate" element={<GatePage />} />
      <Route path="/" element={<SearchPage />} />
      <Route path="/s/:id" element={<SharePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
