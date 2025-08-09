import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from "react-router";

import { BuilderLayout } from "../pages/builder/layout";
import { builderLoader, BuilderPage } from "../pages/builder/page";
import { DashboardLayout } from "../pages/dashboard/layout";
import { ResumesPage } from "../pages/dashboard/resumes/page";
import { SettingsPage } from "../pages/dashboard/settings/page";
import { ErrorPage } from "../pages/public/error";
import { Providers } from "../providers";

export const routes = createRoutesFromElements(
  <Route element={<Providers />}>
    <Route errorElement={<ErrorPage />}>
      {/* 直接跳转到仪表板 */}
      <Route path="/" element={<Navigate replace to="/dashboard/resumes" />} />

      <Route path="dashboard">
        <Route element={<DashboardLayout />}>
          <Route path="resumes" element={<ResumesPage />} />
          <Route path="settings" element={<SettingsPage />} />

          <Route index element={<Navigate replace to="/dashboard/resumes" />} />
        </Route>
      </Route>

      <Route path="builder">
        <Route element={<BuilderLayout />}>
          <Route path=":id" loader={builderLoader} element={<BuilderPage />} />

          <Route index element={<Navigate replace to="/dashboard/resumes" />} />
        </Route>
      </Route>

      {/* 已移除公开简历路由（本地部署不支持公开分享） */}
    </Route>
  </Route>,
);

export const router = createBrowserRouter(routes);
