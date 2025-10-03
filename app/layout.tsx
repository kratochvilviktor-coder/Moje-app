export const metadata = {
  title: "TvaryOn — Kde digitální tvar potká materiál",
  description: "Konfigurátor 3D objektů propojující 3D tisk s materiály.",
};
import "./(site)/styles/globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="cs"><body>{children}</body></html>);
}
