/**
 * Centralized accessibility hints for interactive elements.
 * Import and use: accessibilityHint={hints.post.like}
 *
 * Screen reader users hear: "Double tap to [hint]"
 * So hints should complete the sentence "Double tap to ..."
 */

export const hints = {
  // ── Feed Interactions ──
  post: {
    like: 'like this post',
    unlike: 'remove your like from this post',
    comment: 'open comments',
    share: 'share this post',
    save: 'save this post to your bookmarks',
    unsave: 'remove this post from your bookmarks',
    more: 'open more options for this post',
    report: 'report this post for review',
    dismiss: 'dismiss this post from your feed',
    viewProfile: 'view the author profile',
    expandCaption: 'show the full caption',
    doubleTapLike: 'like this post by double tapping',
    viewComments: 'view all comments',
    react: 'add a reaction to this post',
    pin: 'pin this post to your profile',
    archive: 'archive this post',
    crossPost: 'share to other spaces',
  },

  // ── Thread Interactions ──
  thread: {
    like: 'like this thread',
    reply: 'reply to this thread',
    repost: 'repost this thread',
    bookmark: 'bookmark this thread',
    quote: 'quote this thread',
    viewReplies: 'view replies to this thread',
    unroll: 'view full thread unrolled',
    continue: 'add a continuation to this thread',
  },

  // ── Reel Interactions ──
  reel: {
    like: 'like this reel',
    comment: 'comment on this reel',
    share: 'share this reel',
    sound: 'toggle sound on or off',
    followCreator: 'follow this creator',
    viewAudio: 'view other reels with this audio',
    duet: 'create a duet with this reel',
    stitch: 'stitch this reel',
    download: 'download this reel',
  },

  // ── Story Interactions ──
  story: {
    reply: 'send a reply to this story',
    react: 'send a reaction',
    viewProfile: 'view story author profile',
    next: 'go to next story',
    previous: 'go to previous story',
    pause: 'pause this story',
    mute: 'mute story audio',
  },

  // ── Navigation ──
  nav: {
    back: 'go back to previous screen',
    close: 'close this screen',
    search: 'open search',
    notifications: 'view your notifications',
    messages: 'open your messages',
    create: 'create new content',
    settings: 'open settings',
    profile: 'view your profile',
    home: 'go to home feed',
  },

  // ── Create Flows ──
  create: {
    publish: 'publish your content',
    saveDraft: 'save as draft',
    addPhoto: 'add a photo',
    addVideo: 'add a video',
    addMusic: 'add background music',
    addLocation: 'add your location',
    addPoll: 'add a poll',
    tagPeople: 'tag people in this content',
    setAudience: 'choose who can see this',
    addHashtags: 'add hashtags',
    schedulePost: 'schedule for later',
    switchCamera: 'switch between front and back camera',
    record: 'start recording',
    stopRecording: 'stop recording',
    addSticker: 'add a sticker',
    addText: 'add text overlay',
    addFilter: 'apply a filter',
  },

  // ── Profile ──
  profile: {
    follow: 'follow this user',
    unfollow: 'unfollow this user',
    message: 'send a direct message',
    editProfile: 'edit your profile',
    viewFollowers: 'view followers list',
    viewFollowing: 'view following list',
    shareProfile: 'share this profile',
    block: 'block this user',
    restrict: 'restrict this user',
    mute: 'mute this user',
  },

  // ── Messages ──
  message: {
    send: 'send this message',
    attach: 'attach a file or photo',
    voice: 'record a voice message',
    emoji: 'open emoji picker',
    camera: 'open camera',
    reply: 'reply to this message',
    forward: 'forward this message',
    delete: 'delete this message',
    copy: 'copy message text',
    pin: 'pin this message',
    speedControl: 'change playback speed',
  },

  // ── Settings ──
  settings: {
    toggle: 'toggle this setting',
    select: 'choose an option',
    navigate: 'open this settings section',
    save: 'save your changes',
    signOut: 'sign out of your account',
    deleteAccount: 'delete your account permanently',
  },

  // ── Islamic ──
  islamic: {
    playRecitation: 'play Quran recitation',
    pauseRecitation: 'pause recitation',
    nextVerse: 'go to next verse',
    previousVerse: 'go to previous verse',
    bookmark: 'bookmark this verse',
    startDhikr: 'start dhikr counter',
    incrementDhikr: 'count one dhikr',
    viewTafsir: 'view interpretation of this verse',
    setPrayerReminder: 'set prayer time reminder',
    findMosque: 'find nearby mosques',
  },

  // ── Common Actions ──
  common: {
    refresh: 'refresh the content',
    loadMore: 'load more items',
    retry: 'try again',
    cancel: 'cancel this action',
    confirm: 'confirm this action',
    edit: 'edit this item',
    delete: 'delete this item',
    copy: 'copy to clipboard',
    share: 'share this',
    openLink: 'open this link',
    expandSection: 'expand this section',
    collapseSection: 'collapse this section',
  },
} as const;

export type HintCategory = keyof typeof hints;
export type HintKey<C extends HintCategory> = keyof typeof hints[C];
