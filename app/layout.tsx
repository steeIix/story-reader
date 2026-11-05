import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Story Shelf',
  description: 'A reader that shows which character is speaking each line.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
