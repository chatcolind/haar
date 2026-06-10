import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haar — Ambient Field Machine",
  description: "A browser-based ambient sound instrument by Blind Panda",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}