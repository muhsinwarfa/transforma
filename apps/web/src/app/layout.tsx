import type { ReactNode } from "react";
import { RoleLabelProvider } from "@/lib/labels/RoleLabelProvider";
import { resolveLabels } from "@/lib/labels/roleLabel";
import "./transforma.css";
import "./screens.css";
import "./subject.css";
import "./approver.css";
import "./admin.css";

export const metadata = {
  title: "Transforma",
  description: "A calm, fair place to give and receive a review.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Role words are resolved once per request from tenant config and injected so
  // every client island renders them via <RoleLabel> — never a literal.
  const labels = await resolveLabels();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend+Deca:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RoleLabelProvider labels={labels}>{children}</RoleLabelProvider>
      </body>
    </html>
  );
}
