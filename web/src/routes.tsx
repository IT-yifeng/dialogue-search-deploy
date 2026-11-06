import { Route, Routes } from 'react-router-dom';
import NotFound from './pages/NotFound';
import SearchPage from './pages/SearchPage';
import SharePage from './pages/SharePage';

// 手册 §4.2、§7.1：不设 GatePage；所有页面匿名可访问
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SearchPage />} />
      <Route path="/s/:id" element={<SharePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
