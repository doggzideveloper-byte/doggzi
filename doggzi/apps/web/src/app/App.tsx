import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, LazyMotion, m } from "motion/react";
import { PetSprite, ToastProvider } from "@/design-system/components";
import { page } from "@/design-system/motion";
import { useReduced } from "@/lib/reducedMotion";
import { heartbeat } from "@/lib/heartbeat";
import { tweaksEnabled } from "@/lib/tweaks";
import { PassportPage } from "@/features/passport/PassportPage";
import { Tweaks } from "./Tweaks";

const ChoosePage = lazy(() => import("@/features/choose/ChoosePage"));
const ExplorePage = lazy(() => import("@/features/explore/ExplorePage"));
const FreshFoodPage = lazy(() => import("@/features/fresh-food/FreshFoodPage"));
const ServicesPage = lazy(() => import("@/features/services/ServicesPage"));
const MarketplacePage = lazy(() => import("@/features/marketplace/MarketplacePage"));
const NotFound = lazy(() => import("./NotFound"));
const OrderPage = lazy(() => import("@/features/marketplace/OrderPage"));
const AppRedirect = lazy(() => import("./AppRedirect"));

/** Animation features load in their own chunk (keeps ~100 KB gzip of motion out of the first paint). */
const motionFeatures = () => import("./motionFeatures").then((x) => x.default);

/** Signature move 6: old page fades out lifting 12px, new page slides up on a soft spring. */
function Page({ children }: { children: React.ReactNode }) {
  const reduced = useReduced();
  return reduced ? (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.15 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>{children}</m.div>
  ) : (
    <m.div variants={page} initial="initial" animate="animate" exit="exit">{children}</m.div>
  );
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => heartbeat(pathname), [pathname]);
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 400);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function App() {
  const loc = useLocation();
  useReduced();
  return (
    <ToastProvider>
      <PetSprite />
      <ScrollManager />
      <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
        <LazyMotion features={motionFeatures} strict>
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={loc} key={loc.pathname}>
            <Route path="/" element={<Page><PassportPage /></Page>} />
            <Route path="/choose" element={<Page><ChoosePage /></Page>} />
            <Route path="/explore" element={<Page><ExplorePage /></Page>} />
            <Route path="/fresh-food" element={<Page><FreshFoodPage /></Page>} />
            <Route path="/services" element={<Page><ServicesPage /></Page>} />
            <Route path="/marketplace" element={<Page><MarketplacePage /></Page>} />
            <Route path="/app" element={<AppRedirect />} />
            <Route path="/orders/:id" element={<Page><OrderPage /></Page>} />
            <Route path="*" element={<Page><NotFound /></Page>} />
          </Routes>
        </AnimatePresence>
        </LazyMotion>
      </Suspense>
      {tweaksEnabled() && <Tweaks />}
    </ToastProvider>
  );
}
