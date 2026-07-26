import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Face-off.ai — Aesthetic Procedure Simulator",
  description: "B2B Facial Transformation Simulator for Medical Aesthetic Clinics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
