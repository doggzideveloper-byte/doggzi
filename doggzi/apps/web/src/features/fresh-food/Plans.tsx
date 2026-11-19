import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Badge, buttonClass } from "@/design-system/components";
import { css } from "@/design-system/motion";
import { SITE } from "@/content/site-config";
import { track } from "@/lib/analytics";
import { useDevice } from "@/lib/device";
import { possessive } from "@/lib/format";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import s from "./ff.module.css";

const PawStamp = () => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isReduced()) ref.current?.animate([{ transform: "scale(1.6) rotate(-30deg)", opacity: 0 }, { transform: "scale(1) rotate(-12deg)", opacity: 1 }], { duration: 420, easing: css.bouncy });
  }, []);
  return (
    <span ref={ref} aria-hidden="true" className={s.paw}>
      <svg viewBox="0 0 24 24" style={{ width: 32, height: 32 }} fill="var(--dz-green-700)"><ellipse cx="12" cy="16" rx="5" ry="4.2" /><ellipse cx="5.5" cy="10.5" rx="2" ry="2.6" /><ellipse cx="9.5" cy="6.5" rx="2" ry="2.6" /><ellipse cx="14.5" cy="6.5" rx="2" ry="2.6" /><ellipse cx="18.5" cy="10.5" rx="2" ry="2.6" /></svg>
    </span>
  );
};

/** "Two ways to start": both CTAs lead to the app. Gentle 3D tilt; shine sweeps "Daily subscription" every 5s. */
export const Plans = forwardRef<HTMLElement, { name: string }>(function Plans({ name }, ref) {
  const [plan, setPlan] = useState<"trial" | "sub" | null>(null);
  const reduced = useReduced();
  const dev = useDevice();
  const shine = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced || !shine.current) return;
    const a = shine.current.animate([{ transform: "translateX(-150%) skewX(-12deg)" }, { transform: "translateX(350%) skewX(-12deg)", offset: 0.22 }, { transform: "translateX(350%) skewX(-12deg)" }], { duration: 5000, delay: 1500, iterations: Infinity, easing: css.easeOut });
    return () => a.cancel();
  }, [reduced]);

  const mobile = dev !== "Desktop";
  const href = mobile ? (dev === "iOS" ? SITE.appStoreUrl : SITE.playStoreUrl) : "#download";
  const select = (k: "trial" | "sub") => { setPlan(k); track("fresh_food_plan_select", { plan: k }); };
  const keySel = (k: "trial" | "sub") => (e: KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); select(k); }
  };
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (reduced) return void (el.style.transform = "translateY(-4px)");
    const b = el.getBoundingClientRect(), px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    el.style.transform = `perspective(900px) translateY(-4px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg)`;
  };
  const untilt = (e: PointerEvent<HTMLDivElement>) => (e.currentTarget.style.transform = "");
  const cta = (k: string) => ({
    href, target: mobile ? "_blank" : undefined, rel: mobile ? "noopener noreferrer" : undefined,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); track("app_download_click", { source: `fresh_food_plan_${k}` }); },
  });
  const poss = possessive(name);

  return (
    <section ref={ref} id="plans" data-reveal="" className={s.band}>
      <div className={`${s.wrap} ${s.sec}`}>
        <div data-ri="" className={s.head}>
          <Badge tone="cream">Two ways to start</Badge>
          <h2 className="dz-h2">Try it, or go all in</h2>
        </div>
        <div role="radiogroup" aria-label="Choose how to start" className={s.plans}>
          <div data-ri="" role="radio" tabIndex={0} aria-checked={plan === "trial"} className={s.plan} onClick={() => select("trial")} onKeyDown={keySel("trial")} onPointerMove={tilt} onPointerLeave={untilt}>
            <span className={s.planTitle}>Try it once</span>
            <ul className={s.bullets}>
              <li><span aria-hidden="true" className={s.bullet} style={{ background: "var(--dz-orange)" }} />A one-time order to see if {name} loves it</li>
              <li><span aria-hidden="true" className={s.bullet} style={{ background: "var(--dz-orange)" }} />No commitment</li>
            </ul>
            <a className={buttonClass({ variant: "secondary" })} style={{ alignSelf: "flex-start" }} {...cta("trial")}>Order a trial in the app →</a>
            {plan === "trial" && <PawStamp />}
          </div>
          <div data-ri="" role="radio" tabIndex={0} aria-checked={plan === "sub"} className={s.plan} onClick={() => select("sub")} onKeyDown={keySel("sub")} onPointerMove={tilt} onPointerLeave={untilt}>
            <span className={s.loved}>Most loved</span>
            <span aria-hidden="true" className={s.shineClip}><span ref={shine} className={s.shine} /></span>
            <span className={s.planTitle}>Daily subscription</span>
            <ul className={s.bullets}>
              <li><span aria-hidden="true" className={s.bullet} style={{ background: "var(--dz-green)" }} />A personalised nutrition plan from a certified pet nutritionist, built from {poss} exact details</li>
              <li><span aria-hidden="true" className={s.bullet} style={{ background: "var(--dz-green)" }} />Fresh meals delivered daily, cooked in a hygienic kitchen and delivered chilled, not frozen</li>
              <li><span aria-hidden="true" className={s.bullet} style={{ background: "var(--dz-green)" }} />Pause, skip or edit meals any time</li>
            </ul>
            <a className={buttonClass({ variant: "primary" })} style={{ alignSelf: "flex-start" }} {...cta("sub")}>Start the plan in the app →</a>
            {plan === "sub" && <PawStamp />}
          </div>
        </div>
      </div>
    </section>
  );
});
