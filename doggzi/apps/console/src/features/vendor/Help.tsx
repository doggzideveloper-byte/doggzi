import s from "./vd.module.css";

const FAQ = [
  ["How fast must I accept an order?", "Within the time shown on the card (10 minutes for now). If you miss it, the order goes to Doggzi OPS, who will reassign or refund it."],
  ["When do I get paid?", "Each order's payout is on hold until it's delivered, then released. Settlement to your bank happens through Razorpay Route (Doggzi's commission is taken out first)."],
  ["What does holiday mode do?", "It hides all your listings from the Marketplace straight away. Orders you've already accepted stay on your board."],
  ["How do I add a product that isn't in the catalog?", "Products → + Add product, search, then \"Request\". Doggzi checks it and adds it to the catalog so other stores don't create duplicates."],
  ["Why is my photo \"pending\"?", "Doggzi approves every photo before it replaces the line-art tile on the site. This keeps the shop looking consistent."],
];

export function Help({ whatsapp }: { whatsapp: string | null | undefined }) {
  const href = `https://wa.me/${whatsapp || ""}?text=${encodeURIComponent("Hi Doggzi OPS, I need help with my store.")}`;
  return (
    <>
      <h1 className={s.h1}>Help</h1>
      <a className={s.wa} href={href} target="_blank" rel="noopener noreferrer">Message Doggzi OPS on WhatsApp</a>
      <dl className={s.faq}>{FAQ.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
    </>
  );
}
