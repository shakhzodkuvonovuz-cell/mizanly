# Notification Sounds

These placeholder files need to be replaced with real audio by a sound designer.

## Required Sounds

| File | Purpose | Duration | Style |
|------|---------|----------|-------|
| `notification-default.wav` | Default push notification | < 1 second | Subtle chime, warm tone |
| `message-received.wav` | New message in Risalah | < 0.5 second | Soft ping |
| `achievement.wav` | XP milestone / badge earned | < 1 second | Celebratory ascending tone |
| `prayer-reminder.wav` | Adhan/prayer time alert | < 1 second | Gentle melodic note, Islamic feel |

## Channel Mapping

- **Messages channel** → `message-received.wav`
- **Islamic channel** → `prayer-reminder.wav`
- **Achievements channel** → `achievement.wav`
- **Default** → `notification-default.wav`

## Technical Requirements

- Format: WAV (preferred) or MP3
- Sample rate: 44100 Hz
- Bit depth: 16-bit
- Channels: Mono
- Volume: Normalized to -6dB peak

## Integration

Sounds are referenced in `src/hooks/usePushNotifications.ts` per notification channel.
Use `expo-av` for playback: `Audio.Sound.createAsync(require('../assets/sounds/file.wav'))`.
