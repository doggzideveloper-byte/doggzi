import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { passportStore, type Passport } from "@/lib/passport";
import { isReduced } from "@/lib/reducedMotion";
import { css, keyframes, ms } from "../motion";
import { Badge } from "./Badge";
import { PetAvatar } from "./PetAvatar";
import s from "./PassportChip.module.css";

/** Header chip shared by every page after Page 1: avatar · NAME · breed ▾ with a small menu. */
export function PassportChip({ pet, pop = true }: { pet: Passport; pop?: boolean }) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    const el = chipRef.current;
    if (!el || !pop) return;
    el.animate(isReduced() ? keyframes.fadeIn : keyframes.popIn, { duration: isReduced() ? ms.reduced : 420, easing: css.bouncy });
  }, [pop]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.animate(
      isReduced() ? keyframes.fadeIn : [{ transform: "scale(.9) translateY(-6px)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: isReduced() ? ms.reduced : 260, easing: css.bouncy },
    );
    const onDoc = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-chip-root]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div data-chip-root="" style={{ position: "relative" }}>
      <button ref={chipRef} type="button" className={s.chip} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`${pet.name}'s passport menu`}>
        <PetAvatar type={pet.type} breed={pet.breed} size={36} />
        <span className={s.text}>
          <span className={s.name}>{pet.name}</span>
          <span className={s.breed}>{pet.breed}</span>
        </span>
        <svg viewBox="0 0 12 8" aria-hidden="true" style={{ width: "0.75rem", height: "0.5rem", flex: "none" }}>
          <path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" ref={menuRef} className={s.menu}>
          <Link role="menuitem" to="/?edit=1" className={s.item} onClick={() => setOpen(false)}>
            Edit passport
          </Link>
          <div role="menuitem" aria-disabled="true" className={`${s.item} ${s.disabled}`}>
            Add another pet <Badge size="xs" style={{ borderColor: "var(--dz-ink-60)", color: "var(--dz-ink-60)", background: "transparent" }}>Coming soon</Badge>
          </div>
          <button
            type="button"
            role="menuitem"
            className={`${s.item} ${s.danger}`}
            onClick={() => {
              passportStore.set(null);
              nav("/");
            }}
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
