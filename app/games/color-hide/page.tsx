import type { Metadata } from "next";
import ColorHide from "./color-hide-client";

export const metadata: Metadata = {
  title: "Color Hide 3D · XARMY",
  description:
    "Arkadaşlarınla renk değiştirerek saklan. 2–5 kişilik, üç haritalı 3D saklambaç.",
};

export default function ColorHidePage() {
  return <ColorHide />;
}
