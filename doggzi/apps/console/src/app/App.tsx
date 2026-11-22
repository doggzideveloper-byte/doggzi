import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { panelsFor, useSession, type Role } from "@/lib/session";
import LoginPage from "@/features/login/LoginPage";

const ProviderApp = lazy(() => import("@/features/provider/ProviderApp"));
const VendorApp = lazy(() => import("@/features/vendor/VendorApp"));
const Soon = lazy(() => import("./Soon"));

/** Signed in with one of `roles`, else back to the login (with a reason). */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const ses = useSession();
  const loc = useLocation();
  if (!ses) return <Navigate to={`/login?reason=signin&next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!ses.user.roles.some((r) => roles.includes(r))) return <Navigate to="/login?reason=noaccess" replace />;
  return <>{children}</>;
}

function Home() {
  const ses = useSession();
  if (!ses) return <Navigate to="/login" replace />;
  const ps = panelsFor(ses.user.roles);
  const p = ps.find((x) => x.role === ses.role) || ps[0];
  return <Navigate to={p ? p.path : "/login?reason=noaccess"} replace />;
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/provider/:tab?" element={<Guard roles={["PROVIDER"]}><ProviderApp /></Guard>} />
        <Route path="/vendor/:tab?" element={<Guard roles={["VENDOR"]}><VendorApp /></Guard>} />
        <Route path="/admin/*" element={<Guard roles={["ADMIN", "OPS"]}><Soon panel="Admin" /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
