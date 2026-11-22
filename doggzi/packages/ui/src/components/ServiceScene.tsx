import { memo, useEffect, useRef } from "react";
import type { AvatarVariant } from "../lib/pet";
import { isReduced, useReduced } from "../lib/reducedMotion";
import { css } from "../motion";
import { SCENE_ID, SCENE_MS, SCENE_VB, SCENES } from "./sceneLib";

interface Props {
  scene?: string;
  /** Package story: scenes played one after another (bath → dry → trim → style). */
  sequence?: string[];
  pet: AvatarVariant;
  petName?: string;
  label?: string;
  onStep?: (i: number) => void;
  className?: string;
}

/**
 * One component for every service illustration. Loops for ~2.6s, plays only while on screen,
 * and is static with reduced motion. With `sequence`, steps advance every 2.6s and `onStep` fires in sync.
 */
export const ServiceScene = memo(function ServiceScene({ scene = "bath", sequence, pet, petName, label, onStep, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReduced();
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const seqKey = sequence?.join(",") || "";

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const seq = seqKey ? seqKey.split(",") : null;
    let step = 0, visible = false, anims: Animation[] = [], tickT: number | null = null, seqT: number | null = null;

    const stop = () => {
      anims.forEach((a) => a.cancel());
      anims = [];
      if (tickT) clearInterval(tickT);
      tickT = null;
    };
    const current = () => (seq ? seq[step % seq.length] : scene);
    const draw = (slideIn = false) => {
      stop();
      const sc = SCENES[current()] || SCENES.bath;
      el.innerHTML = `<svg viewBox="0 0 240 200" width="100%" height="100%" style="display:block;overflow:visible" fill="var(--dz-paper)" stroke="var(--dz-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${sc.svg(SCENE_VB[pet], SCENE_ID[pet], petName)}</svg>`;
      if (isReduced()) return;
      const root = el.firstElementChild!;
      anims = sc.anim(root);
      if (slideIn) anims.push(root.animate([{ opacity: 0, transform: "translateX(12px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: css.easeOut }));
      sync();
    };
    const sync = () => {
      const run = visible && !isReduced();
      anims.forEach((a) => (run ? a.play() : a.pause()));
      const sc = SCENES[current()];
      if (run && sc?.tick && !tickT) tickT = sc.tick(el);
      if (!run && tickT) { clearInterval(tickT); tickT = null; }
      if (seq && run && !seqT) {
        onStepRef.current?.(step % seq.length);
        seqT = window.setInterval(() => {
          step = (step + 1) % seq.length;
          draw(true);
          onStepRef.current?.(step);
        }, SCENE_MS);
      }
      if ((!seq || !run) && seqT) { clearInterval(seqT); seqT = null; }
    };

    draw();
    const io = new IntersectionObserver(([e]) => {
      if (visible === e.isIntersecting) return;
      visible = e.isIntersecting;
      sync();
    }, { threshold: 0.15 });
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
      if (seqT) clearInterval(seqT);
    };
  }, [scene, seqKey, pet, petName, reduced]);

  const sc = SCENES[sequence?.[0] || scene] || SCENES.bath;
  return <div ref={host} role="img" aria-label={label || `Illustration: ${sc.label}`} className={className} style={{ position: "relative", width: "100%", aspectRatio: "6 / 5" }} />;
});
