import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML template for Expo Router web output.
 * Sets meta tags, viewport, favicon, and global web styles.
 * This file is only used on web — native platforms ignore it.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA / Mobile browser */}
        <meta name="theme-color" content="#0A7B4F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />

        {/* SEO basics */}
        <meta name="description" content="Mizanly — the social platform for the global Muslim community" />
        <meta name="application-name" content="Mizanly" />

        {/* Open Graph */}
        <meta property="og:title" content="Mizanly" />
        <meta property="og:description" content="A culturally intelligent social platform for the global Muslim community" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://mizanly.app" />

        {/* Favicon */}
        <link rel="icon" href="/assets/images/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/assets/images/icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />

        {/* Prevent auto-zoom on input focus in iOS Safari */}
        <meta name="format-detection" content="telephone=no" />

        {/*
          Disable body scrolling on web to match native app feel.
          ScrollViewStyleReset resets default web scroll behavior.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />

        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #0D1117;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

/* Disable text selection on interactive elements for app-like feel */
button, [role="button"] {
  -webkit-user-select: none;
  user-select: none;
}

/* Smooth scrolling for scroll views */
* {
  -webkit-overflow-scrolling: touch;
}

/* Remove tap highlight on mobile browsers */
* {
  -webkit-tap-highlight-color: transparent;
}

/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(139, 148, 158, 0.3);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 148, 158, 0.5);
}

/* Hide scrollbar on mobile-width viewports */
@media (max-width: 768px) {
  ::-webkit-scrollbar {
    display: none;
  }
  * {
    scrollbar-width: none;
  }
}
`;
