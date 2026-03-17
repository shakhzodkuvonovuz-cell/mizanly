const {
  withAndroidManifest,
  withInfoPlist,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * Expo config plugin that registers Mizanly to receive shared content from
 * other apps (images, videos, text, URLs) on both Android and iOS.
 *
 * Android: adds SEND / SEND_MULTIPLE intent filters for text/*, image/*, video/*
 * iOS: registers the mizanly:// URL scheme so the OS share sheet can deep-link
 *       back into the app, and declares supported document types for the share extension.
 */

const PLUGIN_NAME = 'mizanly-share-extension';

/** Android — add intent-filters to the main activity */
function withAndroidShareIntentFilters(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainApplication = manifest.manifest.application?.[0];

    if (!mainApplication) return cfg;

    const mainActivity = mainApplication.activity?.find(
      (activity) =>
        activity.$?.['android:name'] === '.MainActivity' ||
        activity.$?.['android:name'] === 'com.mizanly.app.MainActivity',
    );

    if (!mainActivity) return cfg;

    // Ensure intent-filter array exists
    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }

    // SEND text/* (plain text, URLs)
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'text/*' } }],
    });

    // SEND image/*
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'image/*' } }],
    });

    // SEND video/*
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'video/*' } }],
    });

    // SEND_MULTIPLE image/* (share multiple photos at once)
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'image/*' } }],
    });

    cfg.modResults = manifest;
    return cfg;
  });
}

/** iOS — register mizanly:// URL scheme and document types */
function withIOSShareScheme(config) {
  return withInfoPlist(config, (cfg) => {
    const infoPlist = cfg.modResults;

    // Register mizanly:// URL scheme
    if (!infoPlist.CFBundleURLTypes) {
      infoPlist.CFBundleURLTypes = [];
    }

    const alreadyRegistered = infoPlist.CFBundleURLTypes.some((entry) =>
      entry.CFBundleURLSchemes?.includes('mizanly'),
    );

    if (!alreadyRegistered) {
      infoPlist.CFBundleURLTypes.push({
        CFBundleURLSchemes: ['mizanly'],
        CFBundleURLName: 'com.mizanly.app',
      });
    }

    // Declare document types (images + videos) the app can receive
    if (!infoPlist.CFBundleDocumentTypes) {
      infoPlist.CFBundleDocumentTypes = [];
    }

    infoPlist.CFBundleDocumentTypes.push({
      CFBundleTypeName: 'Images',
      LSItemContentTypes: ['public.image'],
      LSHandlerRank: 'Alternate',
    });

    infoPlist.CFBundleDocumentTypes.push({
      CFBundleTypeName: 'Videos',
      LSItemContentTypes: ['public.movie'],
      LSHandlerRank: 'Alternate',
    });

    // Enable the app to appear in the iOS share sheet
    if (!infoPlist.NSAppTransportSecurity) {
      infoPlist.NSAppTransportSecurity = {};
    }

    cfg.modResults = infoPlist;
    return cfg;
  });
}

function withShareExtension(config) {
  config = withAndroidShareIntentFilters(config);
  config = withIOSShareScheme(config);
  return config;
}

module.exports = createRunOncePlugin(withShareExtension, PLUGIN_NAME, '1.0.0');
