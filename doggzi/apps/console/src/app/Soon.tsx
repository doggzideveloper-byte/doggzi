import { useNavigate } from "react-router-dom";
import { panelsFor, session, useSession, type Role } from "@/lib/session";
import s from "@/features/login/login.module.css";

/** The Admin panel is built next (Phase B step 3). Login, roles and switching already work. */
export default function Soon({ panel }: { panel: "Admin" }) {
  const ses = useSession()!;
  const nav = useNavigate();
  const others = panelsFor(ses.user.roles).filter((p) => p.label !== panel && p.label !== "Ops");
  return (
    <div className={`${s.page} wm-root`}>
      <div className={s.card}>
        <div className={s.brand}>
          <span aria-hidden="true" className={s.mark} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <h1 className={s.title}>{panel} panel</h1>
            <span className={s.sub}>Signed in as {ses.user.name} ({ses.user.roles.join(" + ")})</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>The {panel} panel is the last step of Phase B. Your login and role are working.</p>
        {others.map((p) => (
          <button key={p.path} type="button" className={s.panelBtn} onClick={() => { session.setRole(p.role as Role); nav(p.path); }}>
            <span aria-hidden="true" className={s.dot} style={{ background: p.color }} /><span style={{ flex: 1 }}>{p.label} panel</span><span aria-hidden="true">→</span>
          </button>
        ))}
        <button type="button" className={s.secondary} onClick={() => { session.set(null); nav("/login", { replace: true }); }}>Log out</button>
      </div>
    </div>
  );
}
