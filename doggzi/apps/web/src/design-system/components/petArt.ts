import trioSvg from "../../../public/brand/illustrations/pets-trio.svg?raw";
import type { AvatarVariant } from "@/lib/passport";

export const TRIO_SVG = trioSvg;
export const TRIO_ASPECT = "864 / 492";

/**
 * Square, padded crops of each pet inside pets-trio (computed from the art's bounding boxes:
 * 12px padding, squared, nudged down 6% so the feet sit on the frame). Until real breed avatars exist
 * (docs/ASSETS.md), small dog breeds use the puppy, other dogs the Labrador and all cats the cat.
 */
export const AVATAR_VIEWBOX: Record<AvatarVariant, string> = {
  dog: "190.15 432.74 500.78 500.78",
  puppy: "-6.75 538.43 365.73 365.73",
  cat: "511.9 540.61 364.5 364.5",
};
export const SPRITE_ID: Record<AvatarVariant, string> = { dog: "dz-lab", puppy: "dz-puppy", cat: "dz-cat" };

const SVG_NS = "http://www.w3.org/2000/svg";

/** Parse the trio and strip editor metadata / non-SVG nodes (they confuse screenshots and some browsers). */
export function parseTrio(): SVGSVGElement {
  const doc = new DOMParser().parseFromString(TRIO_SVG, "image/svg+xml");
  doc.querySelectorAll("*").forEach((n) => {
    if (n.namespaceURI !== SVG_NS || n.tagName === "metadata") n.remove();
  });
  return document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
}

export function wrapG(n: Element, origin: string): SVGGElement {
  const w = document.createElementNS(SVG_NS, "g") as SVGGElement;
  n.parentNode!.insertBefore(w, n);
  w.appendChild(n);
  w.style.transformBox = "fill-box";
  w.style.transformOrigin = origin;
  return w;
}
