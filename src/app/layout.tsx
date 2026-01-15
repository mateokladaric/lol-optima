import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoL Optima",
  description:
    "Optimize your League of Legends builds for the best performance and experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
