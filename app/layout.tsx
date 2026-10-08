import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Engine · App 2 — Brand & MJML Email Engine",
  description: "Turn content blueprints and brand books into Mailchimp-ready MJML email blasts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=JSON.parse(localStorage.getItem("brand-engine-app2-v1")).state.theme;document.documentElement.className=t==="light"?"light":"dark"}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-slate-950 font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
