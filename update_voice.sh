#!/bin/bash
FILE="apps/mobile/app/(screens)/conversation/[id].tsx"

# Add setRecordingTime and setCancelled after setIsRecording
sed -i '/setIsRecording(true);/a\    setRecordingTime(0);\n    setCancelled(false);' "$FILE"

# Add timer start after haptic.medium()
sed -i '/haptic.medium();/a\    // Start timer\n    recordingTimerRef.current = setInterval(() => {\n      setRecordingTime(prev => prev + 1);\n    }, 1000);' "$FILE"

# Update handleVoiceStop to clear interval and handle cancelled
# First, find the function and replace partially
# We'll add clearing interval at beginning
sed -i '/if (!recordingRef.current) return;/i\    // Clear timer\n    if (recordingTimerRef.current) {\n      clearInterval(recordingTimerRef.current);\n      recordingTimerRef.current = null;\n    }' "$FILE"

# Add cancelled check before sending
# Find line "setIsRecording(false);" and insert cancelled logic before it
sed -i '/setIsRecording(false);/i\    // If cancelled, just stop recording and cleanup\n    if (cancelled) {\n      const recording = recordingRef.current;\n      recordingRef.current = null;\n      await recording.stopAndUnloadAsync();\n      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });\n      setIsRecording(false);\n      setCancelled(false);\n      return;\n    }' "$FILE"

# Add cancelled to dependency array
sed -i 's/, \[id, replyTo, haptic\]);/, [id, replyTo, haptic, cancelled]);/' "$FILE"

# Add timerText style
sed -i "/voicePlayer:/a\  timerText: { color: colors.text.primary, fontSize: fontSize.md, fontFamily: 'monospace', fontWeight: '700' }," "$FILE"

# Add recording overlay styles before the closing brace of StyleSheet.create
# Find the line before "});" at end of styles
sed -i '/\};$/i\  recordingOverlay: {\n    position: "absolute",\n    top: 0,\n    left: 0,\n    right: 0,\n    bottom: 0,\n    backgroundColor: "rgba(0,0,0,0.8)",\n    justifyContent: "center",\n    alignItems: "center",\n    zIndex: 1000,\n  },\n  recordingIndicator: {\n    flexDirection: "row",\n    alignItems: "center",\n    gap: spacing.md,\n    marginBottom: spacing.lg,\n  },\n  recordingRedDot: {\n    width: 12,\n    height: 12,\n    borderRadius: 6,\n    backgroundColor: colors.error,\n  },\n  recordingHint: {\n    color: colors.text.secondary,\n    fontSize: fontSize.sm,\n  },' "$FILE"

# Add recording overlay JSX before GifPicker
sed -i '/<GifPicker/i\      {/* Recording overlay */}\n      {isRecording && (\n        <View style={styles.recordingOverlay}>\n          <View style={styles.recordingIndicator}>\n            <View style={styles.recordingRedDot} />\n            <RecordingTimer seconds={recordingTime} />\n          </View>\n          <Text style={styles.recordingHint}>Slide left to cancel ←</Text>\n        </View>\n      )}' "$FILE"

echo "Updated voice recording"
