import { useEffect, useRef } from "react";
import { parseTrio } from "./petArt";

/** One hidden copy of pets-trio that every PetAvatar references with <use>. Mount once in the app shell. */
export function PetSprite() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || host.childElementCount) return;
    const src = parseTrio();
    [...src.children].forEach((c) => host.appendChild(c));
    host.querySelectorAll("[id]").forEach((el) => {
      if (["lab", "puppy", "cat"].includes(el.id)) el.id = "dz-" + el.id;
      else el.removeAttribute("id");
    });
  }, []);
  return <svg ref={ref} aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />;
}
