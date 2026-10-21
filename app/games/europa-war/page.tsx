import EuropaWarClient from "./europa-war-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "XARMY Europa War — 1936",
  description:
    "II. Dünya Savaşı döneminde ülkeni yönet: ordu, sanayi, diplomasi ve araştırma. Tek oyunculu büyük strateji.",
};

export default function EuropaWarPage() {
  return <EuropaWarClient />;
}
