import React, { useEffect, useState } from "react";
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
import OperatorRequestDetail from "./pages/OperatorRequestDetail";
import MobileNotifications from "./pages/mobile/MobileNotifications";
import MobileProfile from "./pages/mobile/MobileProfile";
import Notifications from "./pages/Notifications";
import ReferenceLists from "./pages/ReferenceLists";
import Teams from "./pages/Teams";
import People from "./pages/People";
import Sites from "./pages/Sites";

// client pages
import Users from "./pages/Users";
import Locations from "./pages/Locations";
import Manufacturers from "./pages/Manufacturers";
import Assets from "./pages/Assets";
import OperatorAssets from "./pages/OperatorAssets";
import OperatorAssetDetail from "./pages/OperatorAssetDetail";
import AssetDetail from "./pages/AssetDetail";
import ScanAsset from "./pages/ScanAsset";
import PartBarcode from "./pages/PartBarcode";
import WorkOrders from "./pages/WorkOrders";
import Requests from "./pages/Requests";
import Preventive from "./pages/Preventive";
import Inventory from "./pages/Inventory";
import Technicians from "./pages/Technicians";
import Analytics from "./pages/Analytics";
import AIInsights from "./pages/AIInsights";
import Billing from "./pages/Billing";
import Profile from "./pages/Profile";
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
  const isVendor = user.role === "vendor";
  return (
    <MobileShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={isVendor ? <Dashboard /> : isTech ? <TechHome /> : <OperatorHome />} />
        {isVendor && <Route path="/procurement" element={<Procurement />} />}
        {(isTech || user.role === "operator") && <Route path="/scan" element={<ScanAsset />} />}
        {(isTech || user.role === "operator") && <Route path="/assets/:assetId" element={isTech ? <AssetDetail /> : <OperatorAssetDetail />} />}
        {isTech && <Route path="/work-orders" element={<TechWorkOrders />} />}
        {isTech && <Route path="/parts/barcode" element={<PartBarcode />} />}
        {isTech && <Route path="/assets" element={<Assets />} />}
        {!isTech && <Route path="/assets" element={<OperatorAssets />} />}
        {!isTech && <Route path="/requests/:requestId" element={<OperatorRequestDetail />} />}
        {!isTech && <Route path="/requests" element={<OperatorRequests />} />}
        <Route path="/notifications" element={isVendor ? <Notifications /> : <MobileNotifications />} />
        <Route path="/profile" element={isVendor ? <Profile /> : <MobileProfile />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </MobileShell>
  );
}

function Shell() {
  const { user, authLoading } = useApp();
  const location = useLocation();
  const [compactRoleShell, setCompactRoleShell] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompactRoleShell(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  if (location.pathname === "/system-guide") return <SystemGuide />;
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Login />;
  if (user.mustChangePassword && location.pathname !== "/profile") return <Navigate to="/profile" replace />;
  if (user.mustChangePassword) return <AppLayout><Profile /></AppLayout>;
  if (compactRoleShell && ["technician", "operator", "vendor"].includes(user.role)) return <MobileAppShell />;
  return (
    <AppLayout>
      <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={user.role === "technician" ? <TechHome /> : user.role === "operator" ? <OperatorHome /> : <Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Guard roles={["company_admin", "manager", "technician", "operator", "vendor", "warehouse"]}><Notifications /></Guard>} />

        <Route path="/companies" element={<Guard roles={["super_admin"]}><Companies /></Guard>} />
        <Route path="/subscriptions" element={<Guard roles={["super_admin"]}><Subscriptions /></Guard>} />
        <Route path="/revenue" element={<Guard roles={["super_admin"]}><Revenue /></Guard>} />
        <Route path="/platform-users" element={<Guard roles={["super_admin"]}><PlatformUsers /></Guard>} />
        <Route path="/settings" element={<Guard roles={["super_admin"]}><Settings /></Guard>} />

        <Route path="/users" element={<Guard roles={["company_admin"]}><Users /></Guard>} />
        <Route path="/people" element={<Guard roles={["company_admin"]}><People /></Guard>} />
        <Route path="/teams" element={<Guard roles={["company_admin"]}><Teams /></Guard>} />
        <Route path="/asset-categories" element={<Guard roles={["company_admin", "manager", "technician"]}><ReferenceLists type="categories" /></Guard>} />
        <Route path="/sites" element={<Guard roles={["company_admin", "manager", "technician"]}><Sites /></Guard>} />
        <Route path="/locations" element={<Guard roles={["company_admin", "manager", "technician"]}><Locations /></Guard>} />
        <Route path="/manufacturers" element={<Guard roles={["company_admin", "manager"]}><Manufacturers /></Guard>} />
        <Route path="/assets" element={<Guard roles={["company_admin", "manager", "technician", "operator"]}>{user.role === "operator" ? <OperatorAssets /> : <Assets />}</Guard>} />
        <Route path="/assets/:assetId" element={<Guard roles={["company_admin", "manager", "technician", "operator"]}>{user.role === "operator" ? <OperatorAssetDetail /> : <AssetDetail />}</Guard>} />
        <Route path="/scan" element={<Guard roles={["technician"]}><ScanAsset /></Guard>} />
        <Route path="/parts/barcode" element={<Guard roles={["technician"]}><PartBarcode /></Guard>} />
        <Route path="/work-orders" element={<Guard roles={["company_admin", "manager", "technician"]}>{user.role === "technician" ? <TechWorkOrders /> : <WorkOrders />}</Guard>} />
        <Route path="/requests/:requestId" element={<Guard roles={["operator"]}><OperatorRequestDetail /></Guard>} />
        <Route path="/requests" element={<Guard roles={["operator", "company_admin", "manager"]}>{user.role === "operator" ? <OperatorRequests /> : <Requests />}</Guard>} />
        <Route path="/procurement" element={<Guard roles={["company_admin", "manager", "vendor", "warehouse"]}><Procurement /></Guard>} />
        <Route path="/preventive" element={<Guard roles={["company_admin", "manager"]}><Preventive /></Guard>} />
        <Route path="/inventory" element={<Guard roles={["company_admin", "manager", "warehouse"]}><Inventory /></Guard>} />
        <Route path="/technicians" element={<Guard roles={["company_admin", "manager"]}><Technicians /></Guard>} />
        <Route path="/analytics" element={<Guard roles={["company_admin", "manager"]}><Analytics /></Guard>} />
        <Route path="/ai-insights" element={<Guard roles={["company_admin"]}><AIInsights /></Guard>} />
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
  
