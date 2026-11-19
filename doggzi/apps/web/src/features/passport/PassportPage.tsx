import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, ButtonLink, Header, PetAvatar, PetsTrio, SiteFooter, useToast, type TrioParts } from "@/design-system/components";
import { css, keyframes, ms } from "@/design-system/motion";
import { isUnreachable } from "@/lib/api/client";
import { petProfile, type PetType } from "@/lib/api/petProfile";
import { from, passportStore, usePassport, type Passport } from "@/lib/passport";
import { isReduced, useReduced } from "@/lib/reducedMotion";
import { useTweaks } from "@/lib/tweaks";
import { possessive } from "@/lib/format";
import { MIXED, useBreeds } from "./breeds";
import s from "./PassportPage.module.css";

const NAME_RE = /^[A-Za-z .'-]{1,24}$/;
const PARTIAL_RE = /^[A-Za-z .'-]*$/;
const CHARS_MSG = "Letters, spaces and . ' - only, please.";

function Paw() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || isReduced()) return;
    const a = ref.current.animate(
      [{ transform: "none" }, { transform: "translateY(-5px) rotate(-10deg)", offset: 0.04 }, { transform: "none", offset: 0.08 }, { transform: "translateY(-2px)", offset: 0.11 }, { transform: "none", offset: 0.14 }, { transform: "none" }],
      { duration: 4000, iterations: Infinity, delay: 1500, easing: "ease-out" },
    );
    return () => a.cancel();
  }, []);
  return (
    <svg ref={ref} viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20, flex: "none" }} fill="var(--dz-cream)" stroke="var(--dz-ink)" strokeWidth="1.8" strokeLinejoin="round">
      <ellipse cx="12" cy="16" rx="5" ry="4.2" /><ellipse cx="5.5" cy="10.5" rx="2" ry="2.6" /><ellipse cx="9.5" cy="6.5" rx="2" ry="2.6" /><ellipse cx="14.5" cy="6.5" rx="2" ry="2.6" /><ellipse cx="18.5" cy="10.5" rx="2" ry="2.6" />
    </svg>
  );
}

/** Page 1 (/): name, dog or cat, breed → a Doggzi Pet Passport in about 10 seconds. No login yet. */
export function PassportPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const editing = params.get("edit") === "1";
  const saved = usePassport();
  const tweaks = useTweaks();
  const reduced = useReduced();

  const [name, setName] = useState("");
  const [type, setType] = useState<PetType | null>(null);
  const [breed, setBreed] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [errors, setErrors] = useState<{ name?: string | null; type?: string | null }>({});
  const [approved, setApproved] = useState(false);
  const { list: breeds } = useBreeds(type);

  const cardRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLImageElement>(null);
  const trio = useRef<TrioParts | null>(null);
  const createReq = useRef<Promise<Partial<Passport>> | null>(null);

  // Returning visitors skip straight to /choose; ?edit=1 reopens the form with their details.
  useEffect(() => {
    if (saved?.name && !editing && !approved) nav("/choose", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (editing && saved?.name) {
      setName(saved.name);
      setType(saved.type);
      setBreed(saved.breed);
      setQ(saved.breed || "");
    } else if (!saved && (tweaks.demoPet === "dog" || tweaks.demoPet === "cat")) {
      const d = tweaks.demoPet === "dog" ? { n: "Bruno", b: "Labrador Retriever" } : { n: "Mishti", b: "Persian" };
      setName(d.n);
      setType(tweaks.demoPet);
      setBreed(d.b);
      setQ(d.b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (wordRef.current && !isReduced()) wordRef.current.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 520, easing: css.bouncy });
  }, []);

  const applyType = useCallback((t: PetType | null, animate: boolean) => {
    const g = trio.current;
    if (!g) return;
    (["puppy", "lab", "cat"] as const).forEach((k) => {
      const dim = t && (t === "dog") === (k === "cat");
      g[k].style.opacity = dim ? "0.4" : "1";
    });
    if (!animate || isReduced()) return;
    if (t === "dog") {
      g.puppy.animate(keyframes.hop(22), { duration: 620, easing: "ease-out" });
      g.lab.animate(keyframes.hop(16), { duration: 620, delay: 90, easing: "ease-out" });
    } else if (t === "cat") {
      g.cat.animate(keyframes.hop(10), { duration: 620, easing: "ease-out" });
      g.tail.animate(keyframes.tailSwish, { duration: 900, delay: 120, easing: "ease-in-out" });
    }
  }, []);
  const typeRef = useRef(type);
  typeRef.current = type;
  const onTrio = useCallback((p: TrioParts) => {
    trio.current = p;
    applyType(typeRef.current, false);
  }, [applyType]);

  const options = useMemo(() => {
    const query = q.trim().toLowerCase();
    const exact = breeds.some((b) => b.name === q);
    return breeds.filter((b) => !query || exact || b.name.toLowerCase().includes(query));
  }, [breeds, q]);

  useEffect(() => {
    const l = listRef.current;
    const li = l?.children[active] as HTMLElement | undefined;
    if (!l || !li) return;
    if (li.offsetTop < l.scrollTop) l.scrollTop = li.offsetTop - 6;
    else if (li.offsetTop + li.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = li.offsetTop + li.offsetHeight - l.clientHeight + 6;
  }, [active]);

  // Stamp (signature move 3): scale 1.4 → 1 with a small rotate, then an ink-splat burst.
  useEffect(() => {
    const el = stampRef.current;
    if (!approved || !el) return;
    const st = el.querySelector<HTMLElement>("[data-stamp]")!;
    if (isReduced()) {
      st.animate(keyframes.fadeIn, { duration: ms.reduced, fill: "both" });
      return;
    }
    st.animate([{ transform: "scale(1.4) rotate(-8deg)", opacity: 0 }, { transform: "scale(1) rotate(-3deg)", opacity: 1 }], { duration: 420, easing: css.bouncy, fill: "both" });
    el.querySelectorAll<HTMLElement>("[data-splat]").forEach((d, i) => {
      const a = (i / 7) * Math.PI * 2 + 0.3, r = 70 + (i % 3) * 14;
      d.animate([{ transform: "translate(0,0) scale(.3)", opacity: 0 }, { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0.2 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r * 0.55}px) scale(.5)`, opacity: 0 }], { duration: 520, delay: 260, easing: css.easeOut, fill: "both" });
    });
  }, [approved]);

  const pickType = (t: PetType) => {
    if (approved) return;
    const keep = breed && breeds.some((b) => b.name === breed) && t === type;
    setType(t);
    if (!keep) {
      setBreed(null);
      setQ("");
    }
    setErrors((e) => ({ ...e, type: null }));
    applyType(t, true);
  };
  const pick = (n: string) => {
    setBreed(n);
    setQ(n);
    setOpen(false);
  };

  const validateName = (n: string) => {
    const v = n.trim();
    if (!v) return type === "cat" ? "Every cat deserves a name 🐾" : "Every good boy needs a name 🐾";
    if (!NAME_RE.test(v)) return CHARS_MSG;
    return null;
  };

  /** Create (or update, when editing) the pet on the server. Never blocks the animation. */
  const persist = (p: { name: string; type: PetType; breed: string }): Promise<Partial<Passport>> => {
    const breedId = breeds.find((b) => b.name === p.breed)?.id || null;
    const run = async (): Promise<Partial<Passport>> => {
      if (editing && saved?.pet_id && saved.guest_token) {
        await petProfile.update(saved.pet_id, saved.guest_token, { name: p.name, type: p.type, breed_id: breedId });
        return { pet_id: saved.pet_id, guest_token: saved.guest_token, breed_id: breedId };
      }
      const r = await petProfile.createGuest({ name: p.name, type: p.type, breed_id: breedId });
      return { pet_id: r.pet.id, guest_token: r.guest_token, breed_id: breedId };
    };
    return run().catch((e) => {
      // Keep the passport locally; it syncs the next time the visitor needs the backend (first booking).
      if (!isUnreachable(e)) toast(e instanceof Error ? e.message : "Couldn't save the passport", "error");
      return { breed_id: breedId };
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (approved) return;
    const nameErr = validateName(name);
    const typeErr = type ? null : "Dog or cat? Pick one so we get it right.";
    if (nameErr || typeErr) {
      setErrors({ name: nameErr, type: typeErr });
      return;
    }
    const finalBreed = breed || breeds.find((b) => b.name.toLowerCase() === q.trim().toLowerCase())?.name || MIXED;
    const finalName = name.trim();
    setBreed(finalBreed);
    setQ(finalBreed);
    setName(finalName);
    setOpen(false);
    setErrors({});
    setApproved(true);
    createReq.current = persist({ name: finalName, type: type!, breed: finalBreed });
    setTimeout(() => fly({ name: finalName, type: type!, breed: finalBreed }), isReduced() ? 600 : 1150);
  };

  // Shared-element passport (signature move 5): the card shrinks into the header chip slot, then we route.
  const fly = (p: { name: string; type: PetType; breed: string }) => {
    const done = async () => {
      const server = await (createReq.current ?? Promise.resolve({}));
      const base = editing && saved ? saved : null;
      passportStore.set({ ...(base || {}), ...p, ...server, created_at: base?.created_at || new Date().toISOString() } as Passport);
      from.set(editing ? "edit" : "passport");
      nav("/choose");
    };
    const card = cardRef.current, slot = slotRef.current;
    if (!card || !slot) return void done();
    if (isReduced()) {
      card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms.reduced, fill: "forwards" }).onfinish = done;
      return;
    }
    const c = card.getBoundingClientRect(), sl = slot.getBoundingClientRect();
    const k = 48 / c.height;
    const dx = sl.right - c.width * k - c.left, dy = sl.top - c.top;
    card.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.15 }], { duration: 650, easing: css.inOut, fill: "forwards" }).onfinish = done;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = options.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (open ? Math.min(n - 1, a + 1) : 0));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      pick(options[active].name);
    } else if (e.key === "Escape") setOpen(false);
  };

  const trimmed = name.trim();
  const typeLabel = type === "dog" ? "Dog" : type === "cat" ? "Cat" : null;
  const meta = typeLabel ? (breed ? `${typeLabel} · ${breed}` : typeLabel) : "Dog or cat · Breed";
  const letterAnim = reduced ? "dzFade 150ms both" : `dzLetter 360ms ${css.bouncy} both`;
  const showList = open && !!type;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header ref={slotRef} />
      <main className={s.main}>
        <section aria-label="Doggzi" className={s.hero}>
          <img ref={wordRef} src="/brand/logo/doggzi-wordmark.svg" alt="Doggzi — Not just food. Their food." className={s.wordmark} width={520} height={169} />
          <PetsTrio lineDraw onReady={onTrio} className={s.trio} />
        </section>

        <section aria-labelledby="dz-h1" className={s.formCol}>
          <h1 id="dz-h1" className={`dz-display ${s.h1}`}>
            {trimmed ? <>Let's make <span className={s.nameTag}>{possessive(trimmed)}</span> passport</> : "Let's make a pet passport"}
          </h1>

          <div ref={cardRef} className={s.card}>
            <div className={s.cardBar}><span>Doggzi pet passport</span><span>Delhi NCR</span></div>
            <div className={s.cardBody}>
              <PetAvatar type={type} breed={breed} size={104} border={2.5} animate placeholder="?" />
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span className={s.label}>Name</span>
                <div aria-live="polite" className={s.petName}>
                  {trimmed ? trimmed.toUpperCase().split("").map((l, i) => <span key={i} className={s.letter} style={{ animation: letterAnim }}>{l}</span>) : <span style={{ color: "var(--ink-25)" }}>Your pet</span>}
                </div>
                <span className={s.meta}>{meta}</span>
              </div>
            </div>
            {approved && (
              <div ref={stampRef} aria-live="assertive" className={s.stamp}>
                <div data-stamp="" className={s.stampInk}>Approved</div>
                {Array.from({ length: 7 }, (_, i) => <span key={i} data-splat="" className={s.splat} />)}
              </div>
            )}
          </div>

          <form onSubmit={submit} noValidate className={s.form}>
            <div className={s.field}>
              <label htmlFor="dz-name" className={s.q}><span className={s.step}>Step 1</span>What's their name?</label>
              <input id="dz-name" className={s.input} value={name} maxLength={24} autoComplete="off" placeholder="e.g. Bruno" aria-invalid={!!errors.name} aria-describedby="dz-name-err"
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  setErrors((er) => ({ ...er, name: v && !PARTIAL_RE.test(v) ? CHARS_MSG : null }));
                }} />
              {errors.name && <p id="dz-name-err" role="alert" className={s.err}>{errors.name}</p>}
            </div>

            <div role="radiogroup" aria-labelledby="dz-type-l" className={s.field}>
              <div id="dz-type-l" className={s.q}><span className={s.step}>Step 2</span>Dog or cat?</div>
              <div className={s.toggles}>
                <button type="button" role="radio" aria-checked={type === "dog"} className={s.toggle} onClick={() => pickType("dog")}><span aria-hidden="true">🐶</span>Dog</button>
                <button type="button" role="radio" aria-checked={type === "cat"} className={s.toggle} onClick={() => pickType("cat")}><span aria-hidden="true">🐱</span>Cat</button>
              </div>
              {errors.type && <p role="alert" className={s.err}>{errors.type}</p>}
            </div>

            <div className={s.field}>
              <label htmlFor="dz-breed" className={s.q}>
                <span className={s.step}>Step 3</span>Breed <span style={{ fontWeight: 400, fontSize: 15, color: "rgba(20,18,16,.65)" }}>(optional)</span>
              </label>
              <input id="dz-breed" role="combobox" className={s.input} aria-expanded={showList} aria-controls="dz-breed-list" aria-autocomplete="list"
                aria-activedescendant={showList && options[active] ? `dz-opt-${active}` : undefined}
                value={q} disabled={!type} autoComplete="off"
                placeholder={type ? (type === "dog" ? "Search — Labrador, Indie, Shih Tzu…" : "Search — Persian, Indie, Siamese…") : "Pick dog or cat first"}
                onChange={(e) => {
                  const v = e.target.value;
                  setQ(v);
                  setOpen(true);
                  setActive(0);
                  setBreed(breeds.some((b) => b.name === v) ? v : null);
                }}
                onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey} />
              {showList && (
                <ul id="dz-breed-list" role="listbox" ref={listRef} className={s.list}>
                  {options.map((o, i) => (
                    <li key={o.name} id={`dz-opt-${i}`} role="option" aria-selected={i === active} className={`${s.opt} ${o.name === breed && i !== active ? s.optChosen : ""}`}
                      onMouseDown={(e) => { e.preventDefault(); pick(o.name); }} onMouseEnter={() => setActive(i)}>
                      <span>{o.name}</span>
                      {o.pinned && <span className={s.popular}>Popular</span>}
                    </li>
                  ))}
                  {options.length === 0 && <li style={{ padding: "12px 14px", fontSize: 15, color: "rgba(20,18,16,.7)" }}>No match — we'll save it as Mixed / Not sure.</li>}
                </ul>
              )}
            </div>

            <Button type="submit" size="lg" block disabled={approved} style={{ marginTop: 6 }}>
              {editing ? "Save passport" : "Create passport"} <span aria-hidden="true">→</span>
            </Button>
          </form>
          <ButtonLink to="/explore" variant="ghost" className={s.explore}>
            <Paw /> New to Doggzi? Explore first ↓
          </ButtonLink>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
