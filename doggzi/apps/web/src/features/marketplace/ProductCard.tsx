import { memo, type MouseEvent } from "react";
import { inrPaise } from "@/lib/format";
import type { MListing } from "@/lib/api/market";
import { CategoryTile } from "./CategoryTile";
import s from "./mk.module.css";

interface Props {
  item: MListing;
  storeLine: string;
  inCart: number;
  notified: boolean;
  onOpen: (item: MListing, opener: HTMLElement) => void;
  onAdd: (item: MListing, e: MouseEvent<HTMLButtonElement>) => void;
  onNotify: (item: MListing) => void;
}

/** Tile, name, Doggzi price (+ struck MRP when entered), store chip, Add + / Notify me. */
export const ProductCard = memo(function ProductCard({ item, storeLine, inCart, notified, onOpen, onAdd, onNotify }: Props) {
  const out = !item.in_stock;
  return (
    <article data-card="" className={s.card}>
      <button type="button" className={s.cardOpen} aria-label={`View ${item.name}`} onClick={(e) => onOpen(item, e.currentTarget)}>
        <CategoryTile category={item.category} brand={item.brand} muted={out} />
      </button>
      <h3 className={s.cardName}>{item.name}</h3>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
        <span className={s.price}>{inrPaise(item.price_paise)}</span>
        {item.mrp_paise && <s className={s.mrp}>MRP {inrPaise(item.mrp_paise)}</s>}
      </div>
      <span className={s.storeChip}>{storeLine}</span>
      {out ? (
        <button type="button" className={s.notify} aria-pressed={notified} onClick={() => onNotify(item)}>{notified ? "We'll tell you ✓" : "Notify me"}</button>
      ) : (
        <button type="button" className={s.add} data-in={inCart > 0} aria-label={`Add ${item.name} to cart`} onClick={(e) => onAdd(item, e)}>{inCart ? `Added · ${inCart}` : "Add +"}</button>
      )}
    </article>
  );
});
