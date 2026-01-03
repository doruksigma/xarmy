import dynamic from "next/dynamic";

const PlayClient = dynamic(() => import("./play-client"), { ssr: false });

export default function PlayPage() {
  return <PlayClient />;
}
