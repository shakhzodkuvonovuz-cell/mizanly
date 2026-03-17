const {
  withAndroidManifest,
  withInfoPlist,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * Expo config plugin that registers Mizanly home-screen widget providers on
 * Android (AppWidgetProvider receivers) and iOS (WidgetKit plist entries).
 *
 * Widgets:
 *  1. Prayer Times — medium / large — next-prayer countdown + all five times
 *  2. Unread Count — small — unread messages + notifications badge
 *
 * Usage: add "./plugins/widgets/app.plugin" to the plugins array in app.json.
 */

const PLUGIN_NAME = 'mizanly-widgets';

// ── Android ─────────────────────────────────────────────────────────

function withAndroidWidgetReceivers(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    if (!app.receiver) {
      app.receiver = [];
    }

    // Prayer Times Widget
    app.receiver.push({
      $: {
        'android:name': '.widgets.PrayerTimesWidget',
        'android:exported': 'true',
        'android:label': 'Prayer Times',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/prayer_times_widget_info',
          },
        },
      ],
    });

    // Unread Count Widget
    app.receiver.push({
      $: {
        'android:name': '.widgets.UnreadWidget',
        'android:exported': 'true',
        'android:label': 'Mizanly',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/unread_widget_info',
          },
        },
      ],
    });

    cfg.modResults = cfg.modResults;
    return cfg;
  });
}

// ── iOS ─────────────────────────────────────────────────────────────

function withIOSWidgetKit(config) {
  return withInfoPlist(config, (cfg) => {
    // Allow the Prayer Times widget to read the user's location for
    // accurate prayer time calculations.
    cfg.modResults.NSWidgetWantsLocation = true;
    return cfg;
  });
}

// ── Entry point ─────────────────────────────────────────────────────

function withWidgets(config) {
  config = withAndroidWidgetReceivers(config);
  config = withIOSWidgetKit(config);
  return config;
}

module.exports = createRunOncePlugin(withWidgets, PLUGIN_NAME, '1.0.0');
