import { redirect } from "next/navigation";

// Existing navigation links use /games; game cards live on the home page.
export default function GamesPage() {
  redirect("/");
}
