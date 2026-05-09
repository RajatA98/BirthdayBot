import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BirthdayBot",
  description: "Create a cinematic birthday video from one photo and a prompt."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
