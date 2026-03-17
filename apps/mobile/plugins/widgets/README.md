# Mizanly Home Screen Widgets Plugin

Expo config plugin that registers native home-screen widget providers for
Android (AppWidgetProvider) and iOS (WidgetKit).

## Setup

Add the plugin to `app.json` (or `app.config.js`):

```json
{
  "plugins": [
    "./plugins/widgets/app.plugin"
  ]
}
```

Then run a native build (`npx expo prebuild` or EAS Build). The plugin
modifies AndroidManifest.xml and Info.plist at prebuild time.

> Widgets will **not** work in Expo Go — a development or production build is
> required.

## Widget types

| Widget        | Sizes          | Description                                   |
|---------------|----------------|-----------------------------------------------|
| Prayer Times  | medium, large  | Next-prayer countdown + all five daily times   |
| Unread Count  | small          | Unread messages and notifications badge        |

## Data flow

```
App (React Native)
  ├─ widgetData.updatePrayerTimes(...)
  └─ widgetData.updateUnreadCounts(...)
        │
        ├─ AsyncStorage (JS-side cache)
        └─ NativeModules.WidgetModule  (bridges to native)
              │
              ├─ Android: SharedPreferences → AppWidgetProvider reads on update
              └─ iOS:     UserDefaults (App Group) → WidgetKit timeline reads
```

The JS service (`src/services/widgetData.ts`) serialises data to JSON and
pushes it both to AsyncStorage (for in-app reads) and to the native module
(for OS widget reads). The native Kotlin/Swift widget implementations read
from SharedPreferences (Android) or a shared App Group UserDefaults (iOS).

## Native implementations

The config plugin registers the widget receivers/extensions but the actual
native widget UI code (Kotlin + Swift/SwiftUI) must be added in:

- **Android:** `android/app/src/main/java/.../widgets/` +
  `android/app/src/main/res/xml/prayer_times_widget_info.xml` and
  `unread_widget_info.xml`
- **iOS:** An iOS WidgetKit extension target in the Xcode project

These native files are outside the scope of the Expo JS layer and would be
added when preparing a production native build.
