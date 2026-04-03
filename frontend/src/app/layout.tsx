import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AppDialogProvider } from "@/components/app-dialog-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Engarde AI | Train from footage. Compete with clarity.",
  description: "Engarde AI turns bout video into technical corrections, tactical review, and drill-ready next steps.",
  icons: {
    icon: [
      { url: "/brand/logo-mark.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon", sizes: "any" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/brand/logo-mark.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    title: "Engarde AI | Train from footage. Compete with clarity.",
    description: "Engarde AI turns bout video into technical corrections, tactical review, and drill-ready next steps.",
    siteName: "Engarde AI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased bg-background text-foreground`}
      >
        <AppDialogProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </AppDialogProvider>
      </body>
    </html>
  );
}
