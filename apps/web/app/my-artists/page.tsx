import { permanentRedirect } from "next/navigation";

export default function MyArtistsPage() {
  permanentRedirect("/manage-artists");
}
