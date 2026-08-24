import React from "react";
import { Route, Routes, BrowserRouter as Router, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import MobileShell from "./components/MobileShell";
import { AppProvider, useApp } from "./store/store";
import Login from "./pages/Login";
import SystemGuide from "./pages/SystemGuide";
import Dashboard from "./pages/Dashboard";
import TechHome from "./pages/mobile/TechHome";
import TechWorkOrders from "./pages/mobile/TechWorkOrders";
import OperatorHome from "./pages/mobile/OperatorHome";
import OperatorRequests from "./pages/mobile/OperatorRequests";
import MobileNotifications from "./pages/mobile/MobileNotifications";
import MobileProfile from "./pages/mobile/MobileProfile";
import Notifications from "./pages/Notifications";
import ReferenceLists from "./pages/ReferenceLists";
import Teams from "./pages/Teams";
import Sites from "./pages/Sites";

// client pages
import Users from "./pages/Users";
import Locations from "./pages/Locations";
import Manufacturers from "./pages/Manufacturers";
import Assets from "./pages/Assets";
import WorkOrders from "./pages/WorkOrders";
import Requests from "./pages/Requests";
import Preventive from "./pages/Preventive";
import Inventory from "./pages/Inventory";
import Technicians from "./pages/Technicians";
import Analytics from "./pages/Analytics";
import AIInsights from "./pages/AIInsights";
import Billing from "./pages/Billing";
import Procurement from "./pages/Procurement";

// super admin pages
import Companies from "./pages/super/Companies";
import Subscriptions from "./pages/super/Subscriptions";
import Revenue from "./pages/super/Revenue";
import PlatformUsers from "./pages/super/PlatformUsers";
import Settings from "./pages/super/Settings";

function Guard({ roles, children }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function MobileAppShell() {
  const { user } = useApp();
  const isTech = user.role === "technician";
  return (
    <MobileShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={isTech ? <TechHome /> : <OperatorHome />} />
        {isTech && <Route path="/work-orders" element={<TechWorkOrders />} />}
        {!isTech && <Route path="/requests" element={<OperatorRequests />} />}
        <Route path="/notifications" element={<MobileNotifications />} />
        <Route path="/profile" element={<MobileProfile />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </MobileShell>
  );
}

function Shell() {
  const { user, authLoading } = useApp();
  const location = useLocation();
  if (location.pathname === "/system-guide") return <SystemGuide />;
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Login />;
  if (user.role === "technician" || user.role === "operator") return <MobileAppShell />;
  return (
    <AppLayout>
      <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/notifications" element={<Guard roles={["company_admin", "manager"]}><Notifications /></Guard>} />

        <Route path="/companies" element={<Guard roles={["super_admin"]}><Companies /></Guard>} />
        <Route path="/subscriptions" element={<Guard roles={["super_admin"]}><Subscriptions /></Guard>} />
        <Route path="/revenue" element={<Guard roles={["super_admin"]}><Revenue /></Guard>} />
        <Route path="/platform-users" element={<Guard roles={["super_admin"]}><PlatformUsers /></Guard>} />
        <Route path="/settings" element={<Guard roles={["super_admin"]}><Settings /></Guard>} />

        <Route path="/users" element={<Guard roles={["company_admin"]}><Users /></Guard>} />
        <Route path="/teams" element={<Guard roles={["company_admin"]}><Teams /></Guard>} />
        <Route path="/asset-categories" element={<Guard roles={["company_admin", "manager"]}><ReferenceLists type="categories" /></Guard>} />
        <Route path="/sites" element={<Guard roles={["company_admin", "manager"]}><Sites /></Guard>} />
        <Route path="/locations" element={<Guard roles={["company_admin", "manager"]}><Locations /></Guard>} />
        <Route path="/manufacturers" element={<Guard roles={["company_admin", "manager"]}><Manufacturers /></Guard>} />
        <Route path="/assets" element={<Guard roles={["company_admin", "manager"]}><Assets /></Guard>} />
        <Route path="/work-orders" element={<Guard roles={["company_admin", "manager"]}><WorkOrders /></Guard>} />
        <Route path="/requests" element={<Guard roles={["operator", "company_admin", "manager"]}><Requests /></Guard>} />
        <Route path="/procurement" element={<Guard roles={["company_admin", "manager"]}><Procurement /></Guard>} />
        <Route path="/preventive" element={<Guard roles={["company_admin", "manager"]}><Preventive /></Guard>} />
        <Route path="/inventory" element={<Guard roles={["company_admin", "manager"]}><Inventory /></Guard>} />
        <Route path="/technicians" element={<Guard roles={["company_admin", "manager"]}><Technicians /></Guard>} />
        <Route path="/analytics" element={<Guard roles={["company_admin", "manager"]}><Analytics /></Guard>} />
        <Route path="/ai-insights" element={<Guard roles={["company_admin", "manager"]}><AIInsights /></Guard>} />
        <Route path="/billing" element={<Guard roles={["company_admin"]}><Billing /></Guard>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </ErrorBoundary>
    </AppLayout>
  );
}

function App() {
  return (
    <AppProvider>
      <Router>
        <ScrollToTop />
        <Shell />
        <Toaster richColors position="top-right" />
      </Router>
    </AppProvider>
  );
}

export default App;
