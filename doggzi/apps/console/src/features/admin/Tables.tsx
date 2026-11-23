import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PetAvatar } from "@doggzi/ui/components/PetAvatar";
import { errMsg } from "@/lib/api";
import { inr, istDayLabel, istTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Chip } from "../common/ui";
import { adm, type CustomerRow, type Product, type ServiceItem, type SubOrder } from "./api";
import { forms } from "./forms";
import { Act, Acts, AddBtns, Cell, SubTabs, TableModule, pulse, useAdmin, type Row } from "./kit";
import s from "./adm.module.css";

const istDT = (iso: string | null) => (iso ? `${istDayLabel(iso)} ${istTime(iso)}` : "—");
const mmss = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return t >= 3600 ? `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const ENDED = ["delivered", "cancelled", "rejected", "missed"];
const SO_KIND: Record<string, string> = { placed: "new", accepted: "prog", packed: "acc", out_for_delivery: "prog", delivered: "done", rejected: "alert", missed: "alert", cancelled: "muted" };
const useNow = (ms = 1000) => { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; };

/* ---------- Orders ---------- */
export function Orders() {
  const { isAdmin, flash, ask, pickFrom, openAdd } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad", "orders"], queryFn: adm.orders, refetchInterval: 15_000 });
  const now = useNow();
  const put = (o: SubOrder) => { qc.setQueryData<SubOrder[]>(["ad", "orders"], (xs) => (xs || []).some((x) => x.id === o.id) ? xs!.map((x) => (x.id === o.id ? o : x)) : [o, ...(xs || [])]); pulse(o.id); };
  const run = async (p: Promise<SubOrder>, msg: (o: SubOrder) => string, undo?: (o: SubOrder) => () => Promise<unknown>) => {
    try { const o = await p; put(o); flash(msg(o), undo?.(o)); } catch (e) { flash(errMsg(e)); }
  };
  const reassign = (o: SubOrder) => qc.fetchQuery({ queryKey: ["ad", "vendors"], queryFn: adm.vendors, staleTime: 60_000 }).then((vs) => pickFrom(`Send ${o.ref} to another store`,
    vs.filter((v) => v.stage === "live" && !v.paused && v.id !== o.vendor_id).map((v) => ({ label: v.name, sub: v.area || "", pick: async () => { const r = await adm.soReassign(o.id, v.id); put(r); flash(`${o.ref} sent to ${v.name}.`); } }))));

  const rows: Row[] = (q.data || []).map((o) => {
    const open = !ENDED.includes(o.status) && o.refund_status !== "refunded";
    const due = o.status === "placed" ? o.sla_due_at : o.deliver_by;
    const late = open && !!due && new Date(due).getTime() < now;
    const needsOps = (o.status === "rejected" || o.status === "missed") && o.refund_status !== "refunded";
    const acts = [<Act key="n" onClick={() => run(adm.soNudge(o.id), () => `WhatsApp sent to ${o.vendor}.`)}>Nudge vendor</Act>];
    if (needsOps) acts.push(<Act key="r" onClick={() => reassign(o)}>Reassign vendor</Act>);
    if (o.status !== "delivered" && o.status !== "cancelled" && o.refund_status !== "refunded") acts.push(
      <Act key="c" danger onClick={() => ask({ title: `Cancel ${o.ref}?`, body: `${o.vendor} and the customer are told. Refund separately if it was paid.`, word: o.order_ref, cta: "Cancel sub-order",
        run: () => run(adm.soCancel(o.id), (r) => `${r.ref} cancelled.`, (r) => () => adm.soUncancel(o.id, r.before || o.status).then(put)) })}>Cancel</Act>);
    if (isAdmin && o.refund_status !== "refunded" && o.payment_mode !== "ops") acts.push(
      <Act key="f" danger onClick={() => ask({ title: `Refund ${o.order_ref}?`, body: `Refunds ${inr(o.total_paise)} to the customer through Razorpay (test mode: no money moves). This can't be undone.`, word: o.order_ref, cta: "Refund",
        run: () => run(adm.soRefund(o.id), (r) => `Refund recorded for ${r.order_ref}.`) })}>Refund</Act>);
    return {
      id: o.id, fk: o.refund_status === "refunded" ? "refunded" : o.status, tone: needsOps || late ? "alert" : undefined, search: `${o.ref} ${o.order_ref} ${o.vendor} ${o.customer_phone} ${o.pet?.name || ""}`,
      cells: [
        <Cell main={o.ref} sub={o.order_ref} />,
        <Cell main={o.pet?.name || "—"} sub={o.customer_phone} />,
        <Cell main={o.vendor} sub={o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")} />,
        <b>{inr(o.total_paise)}</b>,
        <span className={`wm-chip ${SO_KIND[o.status] === "muted" ? s.chipMuted : ""}`} data-kind={o.refund_status === "refunded" ? "done" : SO_KIND[o.status]}>{o.status_label}{o.reject_reason ? ` · ${o.reject_reason}` : ""}</span>,
        open && due ? <Cell main={`${o.status === "placed" ? "Accept by" : "Deliver by"} ${istTime(due)}`} sub={late ? "Overdue" : `${mmss(new Date(due).getTime() - now)} left`} cls={late ? s.late : undefined} /> : "—",
        <Acts>{acts}</Acts>,
      ],
    };
  });
  return (
    <TableModule title="Orders" note="Sub-orders per store with SLA countdowns." cols={["Sub-order", "Customer", "Store", "Total", "Status", "SLA", "Actions"]} numCols={[3]} rows={rows}
      filters={[["all", "All statuses"], ["placed", "New"], ["accepted", "Packing"], ["packed", "Ready"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"], ["rejected", "Rejected"], ["missed", "Missed"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]]}
      adds={<AddBtns items={[["+ New order", () => forms.order(qc, put).then(openAdd, (e) => flash(errMsg(e)))]]} />} exportName="orders" searchPh="Search order, customer or store" minWidth="68rem"
      loading={q.isLoading} error={q.error} />
  );
}

/* ---------- Customers ---------- */
export function Customers() {
  const { isAdmin, openAdd, flash } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad", "customers"], queryFn: adm.customers, refetchInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const add = (c: CustomerRow) => { qc.setQueryData<CustomerRow[]>(["ad", "customers"], (xs) => [c, ...(xs || [])]); pulse(c.user_id); };
  const rows: Row[] = (q.data || []).map((c) => ({
    id: c.user_id, fk: c.pets.some((p) => p.type === "cat") ? "cat" : c.pets.length ? "dog" : "none", search: `${c.name} ${c.phone} ${c.pets.map((p) => p.name).join(" ")} ${c.area}`,
    cells: [<Cell main={c.name} sub={c.area} />, c.phone, c.pets.map((p) => `${p.name} (${p.breed || p.type})`).join(", ") || "—", c.bookings, c.orders,
      <Act onClick={() => setOpen(c.user_id)}>View</Act>],
  }));
  return (
    <>
      <TableModule title="Customers" note={isAdmin ? "Exports are logged in the audit log." : "Phone numbers are masked for OPS."} cols={["Customer", "Phone", "Pets", "Bookings", "Orders", ""]} numCols={[3, 4]} rows={rows}
        filters={[["all", "All customers"], ["dog", "Has a dog"], ["cat", "Has a cat"], ["none", "No pet yet"]]} adds={<AddBtns items={[["+ Add customer", () => openAdd(forms.customer(add))]]} />}
        exportName="customers" searchPh="Search by name, phone or pet" loading={q.isLoading} error={q.error} />
      {open && <CustomerDrawer id={open} onClose={() => setOpen(null)} onChanged={() => qc.invalidateQueries({ queryKey: ["ad", "customers"] })} flash={flash} />}
    </>
  );
}

function CustomerDrawer({ id, onClose, onChanged, flash }: { id: string; onClose: () => void; onChanged: () => void; flash: (m: string) => void }) {
  const { openAdd } = useAdmin();
  const q = useQuery({ queryKey: ["ad", "customer", id], queryFn: () => adm.customer(id) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector("button") as HTMLElement | null)?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[aria-labelledby="af-t"]') && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus(); };
  }, [onClose]);
  const c = q.data;
  const history = c ? [
    ...c.bookings.map((b) => ({ k: b.id, what: `${b.ref} · ${b.services.join(" + ")}`, when: b.slot_start, st: b.column })),
    ...c.orders.map((o) => ({ k: o.id, what: `${o.order_ref} · ${o.vendor} · ${inr(o.total_paise)}`, when: o.placed_at, st: o.status_label })),
  ].sort((a, b) => b.when.localeCompare(a.when)) : [];
  return (
    <div className={s.overlay} data-side="right" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="cu-t" className={s.drawer}>
        <div className={s.drawerHead}><h2 id="cu-t">{c?.name || "Customer"}</h2><button type="button" className={s.close} aria-label="Close" onClick={onClose}>×</button></div>
        <div className={s.drawerBody}>
          {q.isError && <p role="alert" className={s.err}>{errMsg(q.error)}</p>}
          {!c && !q.isError && <div className={s.skel} />}
          {c && (
            <>
              <span style={{ fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>{c.phone} · {c.area || "—"}{c.pincode ? ` · ${c.pincode}` : ""}</span>
              <div className={s.titleRow} style={{ alignItems: "center" }}>
                <h3 className={s.h2}>Pets</h3>
                <button type="button" className={s.small} onClick={() => openAdd(forms.pet(c.user_id, c.name, () => { q.refetch(); onChanged(); }))}>+ Add pet</button>
              </div>
              {!c.pets.length && <p className={s.muted} style={{ margin: 0 }}>No pets yet.</p>}
              {c.pets.map((p) => (
                <div key={p.id} data-row={p.id} className={s.petRow}>
                  <PetAvatar type={p.type} breed={p.breed} size={36} border={1.5} bg="var(--dz-paper)" />
                  <span><b>{p.name}</b> · {p.breed || p.type}</span>
                </div>
              ))}
              <h3 className={s.h2}>Bookings &amp; orders</h3>
              {!history.length && <p className={s.muted} style={{ margin: 0 }}>Nothing yet.</p>}
              {history.map((h) => <div key={h.k} className={s.hist}><span>{h.what}</span><span>{istDT(h.when)}</span></div>)}
              <h3 className={s.h2}>Support notes</h3>
              {c.notes.map((n, i) => <p key={i} className={s.note}>{n.body}<small>{istDT(n.at)} · {n.by}</small></p>)}
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                setBusy(true);
                try { await adm.addNote(c.user_id, note.trim()); setNote(""); q.refetch(); flash("Note added."); } catch (x) { flash(errMsg(x)); } finally { setBusy(false); }
              }} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label className={s.field}><span className="dz-sr-only">Add a support note</span>
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" maxLength={2000} />
                </label>
                <button type="submit" className={s.dark} disabled={busy || !note.trim()}>Add note</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Catalog (ADMIN) ---------- */
export function Catalog() {
  const [sub, setSub] = useState<"services" | "products" | "approvals">("services");
  const tabs = <SubTabs tabs={[["services", "Services"], ["products", "Marketplace products"], ["approvals", "Approvals"]]} value={sub} onChange={setSub} />;
  return sub === "services" ? <Services tabs={tabs} /> : sub === "products" ? <Products tabs={tabs} /> : <ApprovalsView tabs={tabs} />;
}

function Services({ tabs }: { tabs: React.ReactNode }) {
  const { ask, flash, openAdd } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad", "services"], queryFn: adm.services });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const put = (x: ServiceItem) => { qc.setQueryData<ServiceItem[]>(["ad", "services"], (xs) => (xs || []).some((y) => y.id === x.id) ? xs!.map((y) => (y.id === x.id ? x : y)) : [x, ...(xs || [])]); pulse(x.id); };
  const toggle = async (x: ServiceItem, b: Record<string, boolean>, msg: string) => { try { put(await adm.patchService(x.id, b)); flash(msg); } catch (e) { flash(errMsg(e)); } };
  const rows: Row[] = (q.data || []).map((x) => {
    const val = draft[x.id] ?? (x.price_paise ? String(x.price_paise / 100) : "");
    const changed = !!x.price_paise && +val > 0 && Math.round(+val * 100) !== x.price_paise;
    return {
      id: x.id, fk: x.group, tone: changed ? "changed" : !x.is_active ? "muted" : undefined, search: `${x.name} ${x.includes.join(" ")}`,
      cells: [
        <Cell main={x.name} sub={x.includes.length ? `Includes ${x.includes.join(", ")}` : undefined} />, x.group,
        x.price_paise ? <label className={s.inCell}><span aria-hidden="true">₹</span><input value={val} inputMode="numeric" aria-label={`Price for ${x.name}`} onChange={(e) => setDraft((d) => ({ ...d, [x.id]: e.target.value.replace(/\D/g, "") }))} /></label>
          : x.price_mode === "on_request" ? "On request" : "Availability",
        <input type="checkbox" className={s.cb} checked={x.cats} aria-label={`${x.name} for cats`} onChange={() => toggle(x, { cats: !x.cats }, `${x.name} ${x.cats ? "no longer offered" : "now offered"} for cats.`)} />,
        <input type="checkbox" className={s.cb} checked={x.is_active} aria-label={`${x.name} active`} onChange={() => toggle(x, { is_active: !x.is_active }, `${x.name} ${x.is_active ? "hidden from" : "shown on"} the site.`)} />,
        changed ? <Act danger onClick={() => ask({ title: `Change price of ${x.name}?`, body: "Customers see the new price straight away. Existing bookings keep their price.", preview: [inr(x.price_paise!), inr(+val * 100)], word: "CONFIRM", cta: "Save price",
          run: async () => { put(await adm.patchService(x.id, { price_paise: +val * 100 })); setDraft((d) => { const n = { ...d }; delete n[x.id]; return n; }); flash("Price saved."); } })}>Review price</Act> : null,
      ],
    };
  });
  return (
    <TableModule title="Catalog" note="Price changes need a preview and typed confirmation." subtabs={tabs} cols={["Service", "Group", "Price", "Cats", "Active", ""]} rows={rows}
      filters={[["all", "All groups"], ...["package", "spa", "training", "boarding", "pickup"].map((v) => [v, v[0].toUpperCase() + v.slice(1)] as [string, string])]}
      adds={<AddBtns items={[["+ Add service", () => openAdd(forms.service(put))], ["+ Add package", () => openAdd(forms.package(put))]]} />} exportName="services" loading={q.isLoading} error={q.error} />
  );
}

function Products({ tabs }: { tabs: React.ReactNode }) {
  const { flash, ask, openAdd } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad", "products"], queryFn: adm.products });
  const [brand, setBrand] = useState<Record<string, string>>({});
  const put = (x: Product) => { qc.setQueryData<Product[]>(["ad", "products"], (xs) => (xs || []).some((y) => y.id === x.id) ? xs!.map((y) => (y.id === x.id ? x : y)) : [x, ...(xs || [])]); pulse(x.id); };
  const save = async (x: Product, b: Record<string, unknown>, msg: string) => { try { put(await adm.patchProduct(x.id, b)); flash(msg); } catch (e) { flash(errMsg(e)); } };
  const rows: Row[] = (q.data || []).map((x) => {
    const mismatch = x.flags.includes("brand_mismatch") && !x.brand_confirmed;
    const b = brand[x.id] ?? x.brand;
    return {
      id: x.id, fk: x.is_blocked ? "blocked" : mismatch || x.flags.length ? "flagged" : "ok", tone: x.is_blocked ? "muted" : mismatch ? "changed" : undefined, search: `${x.name} ${x.brand} ${x.sku || ""}`,
      cells: [
        <Cell main={x.name} sub={`${x.sku || "—"} · ${x.stores.join(", ") || "not listed"}`} />,
        <label className={s.inCell}><input data-wide value={b} aria-label={`Brand for ${x.name}`} onChange={(e) => setBrand((d) => ({ ...d, [x.id]: e.target.value }))}
          onBlur={() => { if (b.trim() && b.trim() !== x.brand) save(x, { brand: b.trim() }, `Brand saved for ${x.name}.`); }} /></label>,
        x.category, x.price_paise ? inr(x.price_paise) : "—",
        x.flags.length ? <span className="wm-chip" data-kind={x.flags.includes("medicine_check_rules") ? "alert" : "new"}>{x.flags.join(", ").replace(/_/g, " ")}</span> : "—",
        <span className={`wm-chip ${x.is_blocked ? "" : ""}`} data-kind={x.is_blocked ? "alert" : "prog"}>{x.is_blocked ? "Blocked" : "Live"}</span>,
        <Acts>
          {mismatch && <Act onClick={() => save(x, { brand_confirmed: true, brand: b.trim() || x.brand }, `Brand confirmed: ${b.trim() || x.brand}.`)}>Confirm brand</Act>}
          {x.is_blocked
            ? <Act onClick={() => save(x, { is_blocked: false }, `${x.name} is back on the site.`)}>Unblock</Act>
            : <Act danger onClick={() => ask({ title: `Block ${x.name}?`, body: "It disappears from the Marketplace in every store straight away.", word: "CONFIRM", cta: "Block", run: () => save(x, { is_blocked: true }, `${x.name} blocked.`) })}>Block</Act>}
        </Acts>,
      ],
    };
  });
  return (
    <TableModule title="Catalog" note="Approve listings, fix brand names, block items such as medicines." subtabs={tabs} cols={["Product", "Brand", "Category", "Price", "Flags", "Status", ""]} numCols={[3]} rows={rows} minWidth="64rem"
      filters={[["all", "All products"], ["flagged", "Flagged"], ["blocked", "Blocked"]]} adds={<AddBtns items={[["+ Add product", () => openAdd(forms.product(put))]]} />} exportName="products" loading={q.isLoading} error={q.error} />
  );
}

function ApprovalsView({ tabs }: { tabs: React.ReactNode }) {
  const { flash } = useAdmin();
  const q = useQuery({ queryKey: ["ad", "approvals"], queryFn: adm.approvals });
  const act = async (p: Promise<unknown>, msg: string) => { try { await p; flash(msg); q.refetch(); } catch (e) { flash(errMsg(e)); } };
  const rows: Row[] = [
    ...(q.data?.photos || []).map((p) => ({ id: p.listing_id, fk: "photo", search: `${p.product} ${p.vendor}`, cells: [<Cell main="Shop photo" sub={p.meta?.name} />, <Cell main={p.product} sub={p.sku} />, p.vendor, istDT(p.at),
      <Acts><Act onClick={() => act(adm.decidePhoto(p.listing_id, true), "Photo approved.")}>Approve</Act><Act danger onClick={() => act(adm.decidePhoto(p.listing_id, false), "Photo rejected.")}>Reject</Act></Acts>] })),
    ...(q.data?.requests || []).map((r) => ({ id: r.id, fk: "request", search: `${r.name} ${r.vendor}`, cells: [<Cell main="New product" sub={[r.brand, r.category, r.price_paise ? inr(r.price_paise) : null].filter(Boolean).join(" · ")} />, r.name, r.vendor || "—", istDT(r.at),
      <Acts><Act onClick={() => act(adm.decideRequest(r.id, true), `${r.name} added to the catalog.`)}>Approve</Act><Act danger onClick={() => act(adm.decideRequest(r.id, false), "Request declined.")}>Reject</Act></Acts>] })),
  ];
  return (
    <TableModule title="Catalog" note="Vendor photos and product requests. The store is told on WhatsApp." subtabs={tabs} cols={["Type", "Product", "Store", "Sent (IST)", ""]} rows={rows}
      filters={[["all", "Everything"], ["photo", "Photos"], ["request", "Product requests"]]} exportName={null} loading={q.isLoading} error={q.error} />
  );
}

/* ---------- Payments (ADMIN, test mode) ---------- */
export function Payments() {
  const [sub, setSub] = useState<"payments" | "refunds" | "route" | "recon" | "payouts">("payments");
  const q = useQuery({ queryKey: ["ad", "payments"], queryFn: adm.payments, refetchInterval: 60_000 });
  const d = q.data;
  const tabs = <SubTabs tabs={[["payments", "Payments"], ["refunds", "Refunds"], ["route", "Route transfers"], ["recon", "Reconciliation"], ["payouts", "Provider payouts"]]} value={sub} onChange={setSub} />;
  const filters: [string, string][] = [["all", "All"], ["ok", "OK"], ["issue", "Needs attention"]];
  const common = { title: "Payments", subtabs: tabs, filters, exportName: sub, loading: q.isLoading, error: q.error, minWidth: "48rem" };
  const testNote = "Razorpay test mode: records only, no money moves.";
  if (sub === "payments") return <TableModule {...common} note={`Payments. ${testNote}`} cols={["Payment", "Order", "Amount", "Method", "Status", "When (IST)"]} numCols={[2]}
    rows={(d?.payments || []).map((p) => ({ id: p.id, fk: p.status === "captured" ? "ok" : "issue", tone: p.status === "captured" ? undefined : "alert", search: `${p.id} ${p.order_ref}`,
      cells: [<b>{p.id}</b>, p.order_ref, inr(p.amount_paise), p.method, <span className="wm-chip" data-kind={p.status === "captured" ? "prog" : "alert"}>{p.status}</span>, istDT(p.at)] }))} />;
  if (sub === "refunds") return <TableModule {...common} note="Refunds issued from Orders (ADMIN)." cols={["Sub-order", "Order", "Amount", "Status", "When (IST)"]} numCols={[2]}
    rows={(d?.refunds || []).map((r) => ({ id: r.ref, fk: "ok", search: `${r.ref} ${r.order_ref}`, cells: [<b>{r.ref}</b>, r.order_ref, inr(r.amount_paise), <span className="wm-chip" data-kind="done">{r.status}</span>, istDT(r.at)] }))} />;
  if (sub === "route") return <TableModule {...common} note="Razorpay Route transfer per store sub-order: on hold until delivered." cols={["Sub-order", "Store", "Transfer", "Status"]} numCols={[2]}
    rows={(d?.route || []).map((r) => ({ id: r.ref, fk: r.status === "Reversed" ? "issue" : "ok", search: `${r.ref} ${r.vendor}`, cells: [<b>{r.ref}</b>, r.vendor, inr(r.amount_paise),
      <span className="wm-chip" data-kind={r.status === "Released" || r.status === "Settled" ? "done" : r.status === "Reversed" ? "alert" : "new"}>{r.status}</span>] }))} />;
  if (sub === "recon") return <TableModule {...common} note="Payments vs orders. Mismatches in red." cols={["Reference", "Expected", "Captured", "Difference", "Result"]} numCols={[1, 2, 3]}
    rows={(d?.recon || []).map((r) => ({ id: r.ref, fk: r.difference_paise ? "issue" : "ok", tone: r.difference_paise ? "alert" : undefined, search: r.ref,
      cells: [<b>{r.ref}</b>, inr(r.expected_paise), inr(r.captured_paise), r.difference_paise ? <span className={s.late}>{inr(r.difference_paise)}</span> : "—",
        <span className="wm-chip" data-kind={r.difference_paise ? "alert" : "prog"}>{r.difference_paise ? "Mismatch" : "Matched"}</span>] }))} />;
  return <TableModule {...common} note="Provider payouts (fortnightly). Owed = pending payouts + completed jobs not yet in a payout." cols={["Provider", "Jobs", "Owed"]} numCols={[1, 2]}
    rows={(d?.payouts || []).map((p) => ({ id: p.provider_id, fk: "ok", search: p.name, cells: [<b>{p.name}</b>, p.jobs_done, inr(p.owed_paise)] }))} />;
}

/* ---------- Team (ADMIN) ---------- */
export function Team() {
  const { ask, flash, openAdd } = useAdmin();
  const me = useSession();
  const q = useQuery({ queryKey: ["ad", "team"], queryFn: adm.team });
  const rows: Row[] = (q.data || []).map((m) => ({
    id: m.user_id, fk: m.roles[0], search: `${m.name} ${m.phone} ${m.roles.join(" ")}`,
    cells: [<b>{m.name || "Invited"}</b>, m.phone, <span className={s.chips}>{m.roles.map((r) => <Chip key={r} kind={r === "ADMIN" ? "done" : "acc"}>{r}</Chip>)}</span>,
      m.user_id === me?.user.id ? <span className={s.muted}>You</span> : <Act danger onClick={() => ask({ title: `Remove ${m.name || m.phone}?`, body: "They lose console access straight away and are signed out on every device.", word: "CONFIRM", cta: "Remove",
        run: async () => { await adm.removeMember(m.user_id); q.refetch(); flash(`${m.name || "Member"} removed.`); } })}>Remove access</Act>],
  }));
  return (
    <TableModule title="Team" note="Invite people by phone and assign roles. They sign in to /console with an OTP." cols={["Name", "Phone", "Role", ""]} rows={rows}
      filters={[["all", "All roles"], ...["ADMIN", "OPS", "VENDOR", "PROVIDER"].map((v) => [v, v] as [string, string])]} adds={<AddBtns items={[["+ Invite member", () => openAdd(forms.member(() => q.refetch()))]]} />}
      exportName="team" searchPh="Search name or phone" minWidth="40rem" loading={q.isLoading} error={q.error} />
  );
}

/* ---------- Audit (ADMIN) ---------- */
export function Audit() {
  const q = useQuery({ queryKey: ["ad", "audit"], queryFn: adm.audit, refetchInterval: 30_000 });
  const mods = [...new Set((q.data || []).map((a) => a.module))].sort();
  const rows: Row[] = (q.data || []).map((a) => ({
    id: a.id, fk: a.module, search: `${a.who} ${a.what} ${a.module} ${a.target || ""}`,
    cells: [istDT(a.at), <Cell main={a.who} sub={a.role} />, a.module, a.what, a.before || "—", a.after || "—"],
  }));
  return (
    <TableModule title="Audit log" note="Every admin write and export, newest first. Times in IST." cols={["When (IST)", "Who", "Module", "What", "Before", "After"]} rows={rows} minWidth="60rem"
      filters={[["all", "All modules"], ...mods.map((m) => [m, m] as [string, string])]} exportName="audit" searchPh="Search person or action" loading={q.isLoading} error={q.error} />
  );
}
