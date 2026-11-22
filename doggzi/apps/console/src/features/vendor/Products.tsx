import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { download, errMsg } from "@/lib/api";
import { inr } from "@/lib/format";
import { Switch, useUi } from "../common/ui";
import { vendor, type CatalogHit, type Store, type VListing } from "./api";
import s from "./vd.module.css";

const CATS: Record<string, string> = { treats: "Treats", toys: "Toys", grooming: "Grooming & hygiene", walking: "Walking gear", health: "Health & supplements" };
const toPaise = (v: string) => (v.trim() ? Math.round(parseFloat(v) * 100) : null);

/** Debounced PATCH per listing; the row updates instantly and rolls back if the server says no. */
function useListingPatch() {
  const qc = useQueryClient();
  const { flash } = useUi();
  const timers = useRef<Record<string, number>>({});
  const pending = useRef<Record<string, Parameters<typeof vendor.patchListing>[1]>>({});
  const m = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof vendor.patchListing>[1] }) => vendor.patchListing(id, body),
    onSuccess: (x) => qc.setQueryData<VListing[]>(["vd", "listings"], (old) => old?.map((l) => (l.id === x.id ? x : l))),
    onError: (e) => { flash(errMsg(e)); qc.invalidateQueries({ queryKey: ["vd", "listings"] }); },
  });
  return (l: VListing, body: Parameters<typeof vendor.patchListing>[1], delay = 500) => {
    qc.setQueryData<VListing[]>(["vd", "listings"], (old) => old?.map((x) => (x.id === l.id ? { ...x, ...body, mrp_paise: body.mrp_paise === 0 ? null : body.mrp_paise ?? x.mrp_paise } : x)));
    // Edits to the same row within the debounce window are merged, so a stock change is never lost to an MRP change.
    pending.current[l.id] = { ...pending.current[l.id], ...body };
    window.clearTimeout(timers.current[l.id]);
    timers.current[l.id] = window.setTimeout(() => { const b = pending.current[l.id]; delete pending.current[l.id]; m.mutate({ id: l.id, body: b }); }, delay);
  };
}

function MrpInput({ l, onSave }: { l: VListing; onSave: (paise: number) => void }) {
  const [v, setV] = useState(l.mrp_paise ? String(l.mrp_paise / 100) : "");
  useEffect(() => setV(l.mrp_paise ? String(l.mrp_paise / 100) : ""), [l.mrp_paise]);
  const p = toPaise(v);
  const bad = p != null && p < l.price_paise;
  const commit = () => { if (bad) return; const next = p ?? 0; if (next !== (l.mrp_paise ?? 0)) onSave(next); };
  return (
    <label className={s.mrp} data-set={!!v} data-bad={bad} title={bad ? "MRP can't be lower than your price" : undefined}>
      <span aria-hidden="true">₹</span>
      <input inputMode="numeric" value={v} placeholder="Add" aria-label={`MRP for ${l.name}`} aria-invalid={bad} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </label>
  );
}

/** Square crop: the photo is shown with object-fit: cover; the slider moves the visible window; the canvas exports exactly that. */
function CropDialog({ file, onCancel, onSave }: { file: File; onCancel: () => void; onSave: (b: Blob) => void }) {
  const [x, setX] = useState(50);
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const save = async () => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = ((img.naturalWidth - side) * x) / 100, sy = ((img.naturalHeight - side) * x) / 100;
    const c = document.createElement("canvas");
    c.width = c.height = Math.min(1200, side);
    c.getContext("2d")!.drawImage(img, sx, sy, side, side, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onSave(b), "image/jpeg", 0.88);
  };
  return (
    <div className={s.scrim}>
      <div role="dialog" aria-modal="true" aria-labelledby="cr-t" className={s.dialog} style={{ maxWidth: "26.25rem" }} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2 id="cr-t" className={s.h2} style={{ fontSize: "1.125rem" }}>Crop to square</h2>
        <div className={s.crop}><img src={url} alt="Photo preview" style={{ objectPosition: `${x}% ${x}%` }} /></div>
        <label className={s.field}>Position<input type="range" min={0} max={100} value={x} onChange={(e) => setX(+e.target.value)} style={{ accentColor: "var(--dz-pink)", height: "auto", border: 0, padding: 0 }} /></label>
        <div className={s.two} style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button type="button" className={s.ghost} onClick={onCancel}>Cancel</button>
          <button type="button" className={s.btn} data-tone="pink" onClick={save}>Send for approval</button>
        </div>
      </div>
    </div>
  );
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [pick, setPick] = useState<CatalogHit | null>(null);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const hits = useQuery({ queryKey: ["vd", "catalog", dq], queryFn: () => vendor.search(dq), enabled: dq.length >= 2 });
  const add = useMutation({
    mutationFn: () => vendor.addListing({ product_id: pick!.product_id, price_paise: toPaise(price) || 0, stock_qty: Math.max(0, parseInt(stock || "0", 10)) }),
    onSuccess: (x) => { qc.setQueryData<VListing[]>(["vd", "listings"], (old) => [...(old || []), x]); flash(`${x.name} is now in your store.`); onClose(); },
    onError: (e) => flash(errMsg(e)),
  });
  const req = useMutation({ mutationFn: () => vendor.requestProduct(dq), onSuccess: () => { flash(`Requested "${dq}". Doggzi will review it.`); onClose(); }, onError: (e) => flash(errMsg(e)) });
  return (
    <div className={s.scrim} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="ad-t" className={s.dialog} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.625rem" }}>
          <h2 id="ad-t" className={s.h2} style={{ fontSize: "1.125rem" }}>Add a product</h2>
          <button type="button" className={s.close} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p style={{ margin: 0, fontSize: "0.8125rem" }}>Search the Doggzi catalog first so products aren't duplicated.</p>
        <input ref={input} type="search" className={s.search} style={{ flex: "none", height: "2.75rem" }} value={q} aria-label="Search Doggzi catalog" placeholder="e.g. JerHigh, rope toy" onChange={(e) => { setQ(e.target.value); setPick(null); }} />
        {pick ? (
          <form className={s.request} onSubmit={(e) => { e.preventDefault(); if ((toPaise(price) || 0) > 0) add.mutate(); }}>
            <span style={{ fontWeight: 600 }}>{pick.name} <span className={s.pbrand}>{pick.brand}</span></span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <label className={s.field}>Your price (₹)<input inputMode="numeric" required autoFocus value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} /></label>
              <label className={s.field} style={{ width: "7rem" }}>Stock<input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className={s.mini} onClick={() => setPick(null)}>Back</button>
              <button type="submit" className={s.tool} data-tone="pink" disabled={add.isPending || !(toPaise(price) || 0)}>List it</button>
            </div>
          </form>
        ) : (
          <ul className={s.hits}>
            {hits.data?.map((h) => (
              <li key={h.product_id}>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontWeight: 600 }}>{h.name}</span><span style={{ fontSize: "0.75rem" }}>{h.brand}</span></span>
                {h.already_listed ? <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Already listed</span> : <button type="button" className={s.mini} onClick={() => setPick(h)}>Add</button>}
              </li>
            ))}
          </ul>
        )}
        {!pick && dq.length >= 2 && hits.data && !hits.data.length && (
          <div className={s.request}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Not in the catalog? Request it.</span>
            <button type="button" className={s.tool} data-tone="pink" style={{ alignSelf: "flex-start" }} disabled={req.isPending} onClick={() => req.mutate()}>Request "{dq}"</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Products({ store, holiday }: { store: Store | undefined; holiday: boolean }) {
  const qc = useQueryClient();
  const { flash } = useUi();
  const q = useQuery({ queryKey: ["vd", "listings"], queryFn: vendor.listings });
  const patch = useListingPatch();
  const [pq, setPq] = useState("");
  const [cat, setCat] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [crop, setCrop] = useState<{ l: VListing; f: File } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const th = threshold ?? store?.low_stock_threshold ?? 5;
  const thTimer = useRef<number>();
  const setTh = (n: number) => {
    setThreshold(n);
    window.clearTimeout(thTimer.current);
    thTimer.current = window.setTimeout(() => vendor.patchStore({ low_stock_threshold: n }).then((st) => qc.setQueryData(["vd", "store"], st)).catch((e) => flash(errMsg(e))), 600);
  };
  const photo = useMutation({
    mutationFn: ({ l, b }: { l: VListing; b: Blob }) => vendor.photo(l.id, b),
    onSuccess: (x, { b }) => { setPreviews((p) => ({ ...p, [x.id]: URL.createObjectURL(b) })); qc.setQueryData<VListing[]>(["vd", "listings"], (old) => old?.map((l) => (l.id === x.id ? x : l))); flash("Photo sent to Doggzi for approval."); },
    onError: (e) => flash(errMsg(e)),
  });
  const imp = useMutation({
    mutationFn: vendor.importCsv,
    onSuccess: (r) => { setImportMsg(`Imported: ${r.updated} updated, ${r.requested} sent to Doggzi as new-product requests${r.errors.length ? `, ${r.errors.length} skipped (${r.errors.slice(0, 2).join("; ")}${r.errors.length > 2 ? "…" : ""})` : ""}.`); qc.invalidateQueries({ queryKey: ["vd", "listings"] }); },
    onError: (e) => flash(errMsg(e)),
  });
  const all = q.data || [];
  const low = all.filter((l) => l.stock_qty < th);
  const qn = pq.trim().toLowerCase();
  const rows = useMemo(() => all.filter((l) => (!qn || `${l.name} ${l.brand}`.toLowerCase().includes(qn)) && (cat === "all" || l.category === cat) && (!lowOnly || l.stock_qty < th)), [all, qn, cat, lowOnly, th]);
  return (
    <>
      <div className={s.titleRow}>
        <h1 className={s.h1}>Products</h1>
        <div className={s.tools}>
          <button type="button" className={s.tool} data-tone="pink" onClick={() => setAddOpen(true)}>+ Add product</button>
          <label className={s.tool}><input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) imp.mutate(f); e.target.value = ""; }} />{imp.isPending ? "Importing…" : "Import CSV"}</label>
          <button type="button" className={s.tool} onClick={() => download("market", "/vendor/listings/export.csv", "doggzi-listings.csv").catch((e) => flash(errMsg(e)))}>Export CSV template</button>
        </div>
      </div>
      {low.length > 0 && (
        <p role="alert" className={s.alert}>{low.length} product{low.length === 1 ? " is" : "s are"} below {th} in stock.<button type="button" className={s.mini} onClick={() => setLowOnly(true)}>Show them</button></p>
      )}
      {importMsg && <p role="status" className={s.ok}>{importMsg}</p>}
      <div className={s.filters}>
        <input type="search" className={s.search} value={pq} aria-label="Search your products" placeholder="Search name or brand" onChange={(e) => setPq(e.target.value)} />
        <select className={s.select} value={cat} aria-label="Category" onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {Object.entries(CATS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <label className={s.lbl}><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />Low stock only</label>
        <label className={s.lbl}>Alert below<input type="number" min={0} max={99} className={s.num} value={th} onChange={(e) => setTh(Math.max(0, Math.min(99, +e.target.value || 0)))} /></label>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table} style={{ minWidth: "53.75rem" }}>
          <thead>
            <tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col" className={s.right}>Price</th><th scope="col">MRP</th><th scope="col">Stock</th><th scope="col">Photo</th><th scope="col">Active</th></tr>
          </thead>
          <tbody>
            {!q.data && <tr><td colSpan={7} className={s.muted}>Loading your products…</td></tr>}
            {rows.map((l) => {
              const isLow = l.stock_qty < th;
              return (
                <tr key={l.id} data-low={isLow} data-off={!l.is_active || holiday}>
                  <td><span className={s.pname}>{l.name}</span><span className={s.pbrand}>{l.brand}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{CATS[l.category] || l.category}</td>
                  <td className={s.right} style={{ fontWeight: 600 }}>{inr(l.price_paise)}</td>
                  <td><MrpInput l={l} onSave={(p) => patch(l, { mrp_paise: p }, 0)} /></td>
                  <td>
                    <span role="group" aria-label={`Stock for ${l.name}`} className={s.stepper} data-low={isLow}>
                      <button type="button" aria-label="One less" onClick={() => patch(l, { stock_qty: Math.max(0, l.stock_qty - 1) })}>−</button>
                      <b>{l.stock_qty}</b>
                      <button type="button" aria-label="One more" onClick={() => patch(l, { stock_qty: Math.min(9999, l.stock_qty + 1) })}>+</button>
                    </span>
                  </td>
                  <td>
                    {l.photo_status === "none" ? (
                      <label className={s.upload}><input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCrop({ l, f }); e.target.value = ""; }} />+ Photo</label>
                    ) : (
                      <span className={s.thumb}>
                        {(previews[l.id] || l.photo_url) && <img src={previews[l.id] || l.photo_url!} alt="" />}
                        <span className="wm-chip" data-kind={l.photo_status === "approved" ? "done" : l.photo_status === "rejected" ? "alert" : "new"}>{l.photo_status}</span>
                      </span>
                    )}
                  </td>
                  <td><Switch tone="on" small checked={l.is_active} label={`${l.name} is ${l.is_active ? "active" : "hidden"}`} onChange={() => patch(l, { is_active: !l.is_active }, 0)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className={s.muted} style={{ fontSize: "0.75rem" }}>{rows.length} of {all.length} listings. Photos go to Doggzi for approval before they replace the line-art tile on the site.</span>
      {addOpen && <AddDialog onClose={() => setAddOpen(false)} />}
      {crop && <CropDialog file={crop.f} onCancel={() => setCrop(null)} onSave={(b) => { photo.mutate({ l: crop.l, b }); setCrop(null); }} />}
    </>
  );
}
