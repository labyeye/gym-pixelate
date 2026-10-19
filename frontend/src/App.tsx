import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { pathEnabled } from "@/config/modules";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Dumbbell } from "lucide-react";
import PayPage from "./pages/PayPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import MemberProfilePage from "./pages/MemberProfilePage";
import FrontDeskPage from "./pages/FrontDeskPage";
import SmartEntryPage from "./pages/SmartEntryPage";
import InvoicesPage from "./pages/InvoicesPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import OnboardingPage from "./pages/OnboardingPage";
import WelcomePage from "./pages/WelcomePage";
import NotFound from "./pages/NotFound";
import PlansPage from "./pages/gym/PlansPage";
import EnquiriesPage from "./pages/gym/EnquiriesPage";
import ClassesPage from "./pages/gym/ClassesPage";
import PersonalTrainingPage from "./pages/gym/PersonalTrainingPage";
import WorkoutDietPage from "./pages/gym/WorkoutDietPage";
import TrainersTeamPage from "./pages/gym/TrainersTeamPage";
import PosPage from "./pages/gym/PosPage";
import MemberPortal from "./pages/portal/MemberPortal";
import StaffPage from "./pages/gym/StaffPage";
import ReportsPage from "./pages/gym/ReportsPage";
import FollowUpsPage from "./pages/gym/FollowUpsPage";
import {
  LockersPage,
  ExpensesPage,
  CouponsPage,
  AnnouncementsPage,
  EquipmentPage,
  MeasurementsPage,
} from "./pages/gym/FacilityPages";
import { NotificationProvider } from "@/components/ui/Notification";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-black bg-[#024BAB] flex items-center justify-center nb-shadow animate-bounce">
          <Dumbbell className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, tenant, modules } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // New owners finish the onboarding wizard (details -> plan -> pay or trial) first.
  if (user?.role === "gym_owner" && tenant && !tenant.onboarded)
    return <Navigate to="/onboarding" replace />;

  // a page whose module the owner switched off in Settings is not reachable, even by typing the URL
  if (!pathEnabled(modules, pathname)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { pathname } = useLocation();

  // public WhatsApp payment link: works signed out, signed in, even while the session is still loading
  if (pathname.startsWith("/pay/"))
    return (
      <Routes>
        <Route path="/pay/:token" element={<PayPage />} />
      </Routes>
    );

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated && user?.role === "member")
    return (
      <Routes>
        <Route path="*" element={<MemberPortal />} />
      </Routes>
    );

  return (
    <Routes>
      <Route
        path="/register"
        element={
          !isAuthenticated ? <RegisterPage /> : <Navigate to="/" replace />
        }
      />
      <Route
        path="/onboarding"
        element={
          isAuthenticated ? (
            <OnboardingPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/welcome"
        element={
          isAuthenticated ? <WelcomePage /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/members"
        element={
          <ProtectedRoute>
            <MembersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/members/:id"
        element={
          <ProtectedRoute>
            <MemberProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/membership-plans"
        element={
          <ProtectedRoute>
            <PlansPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <FrontDeskPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/smart-entry"
        element={
          <ProtectedRoute>
            <SmartEntryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/enquiries"
        element={
          <ProtectedRoute>
            <EnquiriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lockers"
        element={
          <ProtectedRoute>
            <LockersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classes"
        element={
          <ProtectedRoute>
            <ClassesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-training"
        element={
          <ProtectedRoute>
            <PersonalTrainingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workout-diet"
        element={
          <ProtectedRoute>
            <WorkoutDietPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/progress"
        element={
          <ProtectedRoute>
            <MeasurementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trainers"
        element={
          <ProtectedRoute>
            <TrainersTeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <InvoicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shop"
        element={
          <ProtectedRoute>
            <PosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coupons"
        element={
          <ProtectedRoute>
            <CouponsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/follow-ups"
        element={
          <ProtectedRoute>
            <FollowUpsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <ExpensesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <StaffPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/equipment"
        element={
          <ProtectedRoute>
            <EquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <AnnouncementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subscription"
        element={
          <ProtectedRoute>
            <SubscriptionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={<Navigate to="/subscription" replace />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
