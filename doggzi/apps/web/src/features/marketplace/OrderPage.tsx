import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, ButtonLink, Header, Loading, PassportChip, Skeleton, SiteFooter } from "@/design-system/components";
import { ApiError } from "@/lib/api/client";
import { market } from "@/lib/api/market";
import { inrPaise, istDate } from "@/lib/format";
import { usePet } from "@/lib/passport";
import { useSession } from "@/lib/session";
import { OrderTrack } from "./CheckoutDrawer";

/** /orders/:id — a timeline per store (Placed → Delivered). Owner only (checked by the server). */
export default function OrderPage() {
  const { id = "" } = useParams();
  const { pet } = usePet();
  const session = useSession();
  const q = useQuery({ queryKey: ["order", id], enabled: !!session && session.token !== "demo", queryFn: () => market.order(session!.token, id), refetchInterval: 30_000 });
  const o = q.data;
  return (
    <div style={{ minHeight: "100vh" }}>
      <Header right={pet && <PassportChip pet={pet} pop={false} />} />
      <main className="dz-container" style={{ maxWidth: "47.5rem", padding: "3rem 1.25rem 5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <Badge style={{ alignSelf: "flex-start", background: "var(--dz-pink)" }}>Your order</Badge>
        {!session || session.token === "demo" ? (
          <p>Log in at checkout to track orders. <Link to="/marketplace">Back to the shop</Link></p>
        ) : q.isLoading ? (
          <Loading label="Finding your order…" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <Skeleton w="60%" h="2.75rem" /><Skeleton w="80%" /><Skeleton h="9rem" r="var(--r-lg)" /><Skeleton h="9rem" r="var(--r-lg)" />
          </Loading>
        ) : q.isError ? (
          <p role="alert">{q.error instanceof ApiError && q.error.status === 404 ? "We couldn't find that order on your account." : "We couldn't load this order. Try again in a moment."}</p>
        ) : o ? (
          <>
            <h1 className="dz-display" style={{ fontSize: "calc(clamp(2rem,5vw,3rem) * var(--h1-scale))" }}>Order {o.id.slice(0, 6).toUpperCase()}</h1>
            <p style={{ margin: 0 }}>Placed {istDate(new Date(o.created_at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST · Total {inrPaise(o.total_paise)}{o.status !== "paid" ? ` · ${o.status.replace("_", " ")}` : ""}</p>
            {o.sub_orders.map((so) => (
              <div key={so.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <OrderTrack store={so.vendor.name} reference={o.id.slice(0, 6).toUpperCase()} status={so.status} />
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.9375rem" }}>{so.items.map((i) => <li key={i.sku}>{i.qty} × {i.name}</li>)}</ul>
              </div>
            ))}
          </>
        ) : null}
        <ButtonLink to="/marketplace" variant="secondary" style={{ alignSelf: "flex-start" }}>← Keep shopping</ButtonLink>
      </main>
      <SiteFooter />
    </div>
  );
}
