import { redirect } from "next/navigation";

// Home Inspiration now lives at the top of the Mariemont House tab.
export default function InspirationPage() {
  redirect("/mariemont-house");
}
