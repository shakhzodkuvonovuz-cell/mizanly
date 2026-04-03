#!/usr/bin/env node
/**
 * Add missing i18n keys to all 8 language files.
 * Wave 8 audit — ~250 keys across 21 namespaces.
 *
 * Usage: node scripts/add-i18n-keys.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const I18N_DIR = join(import.meta.dirname, '..', 'apps', 'mobile', 'src', 'i18n');
const LANGUAGES = ['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'];

// ── English keys to add ──
const NEW_KEYS = {
  // I01 #49: 2FA Setup keys
  auth: {
    twoFactorAuthentication: "Two-Factor Authentication",
    secureYourAccount: "Secure Your Account",
    twoFactorDescription: "Add an extra layer of security to your account with two-factor authentication.",
    step1InstallAuthenticatorApp: "Step 1: Install an Authenticator App",
    step1Description: "Download one of the following apps on your phone:",
    selectAuthenticatorApp: "Select Authenticator App",
    step2ScanQRCode: "Step 2: Scan QR Code",
    step2Description: "Open your authenticator app and scan this QR code.",
    generatingQRCode: "Generating QR code...",
    qrCode: "QR Code",
    scanWithAuthenticatorApp: "Scan with your authenticator app",
    enterSecretManually: "Enter secret manually",
    scannedCodeButton: "I've scanned the code",
    step3EnterVerificationCode: "Step 3: Enter Verification Code",
    step3Description: "Enter the 6-digit code from your authenticator app.",
    enable2FA: "Enable 2FA",
    step4SaveBackupCodes: "Step 4: Save Backup Codes",
    step4Description: "Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator.",
    backupCodeCopied: "Backup code copied",
    allBackupCodesCopied: "All backup codes copied",
    setupFailed: "Setup Failed",
    setupFailedMessage: "Could not set up two-factor authentication. Please try again.",
    twoFactorEnabledMessage: "Two-factor authentication has been enabled.",
    verificationFailed: "Verification Failed",
    verificationFailedMessage: "Invalid verification code. Please try again.",
    downloadBackupCodesMessage: "Download your backup codes before continuing."
  },

  // I01 #50: 2FA Verify screen
  "screens.2faVerify": {
    title: "Verify Identity",
    heroTitle: "Two-Factor Verification",
    heroSubtitle: "Enter the code from your authenticator app to continue.",
    codeInputLabel: "Verification Code",
    backupInputLabel: "Backup Code",
    backupPlaceholder: "Enter your backup code",
    backupHint: "Use one of the backup codes you saved during setup.",
    useBackupCodeInstead: "Use a backup code instead",
    useAuthenticatorCodeInstead: "Use authenticator code instead",
    verificationSuccessMessage: "Verification successful",
    invalidCodeMessage: "Invalid code. Please try again.",
    lostAccessLinkText: "Lost access to your authenticator?",
    lostAccessTitle: "Lost Access",
    lostAccessMessage: "If you've lost access to your authenticator app, you can use a backup code or contact support.",
    lostAccessButtonContact: "Contact Support",
    helpTitle: "Need Help?",
    helpDescription: "If you're having trouble, make sure you're using the correct authenticator app and that the time on your device is accurate."
  },

  // I01 #51: Account Settings
  accountSettings: {
    title: "Account Settings",
    notSet: "Not set",
    joined: "Joined",
    "sections.accountInfo": "Account Information",
    "sections.dataPrivacy": "Data & Privacy",
    "sections.accountActions": "Account Actions",
    downloadMyData: "Download My Data",
    exportDataHint: "Get a copy of all your Mizanly data",
    manageDataHint: "Control what data Mizanly stores about you",
    deactivateAccount: "Deactivate Account",
    deactivateHint: "Temporarily disable your account",
    deleteAccount: "Delete Account",
    deleteHint: "Permanently delete your account and all data",
    deactivateAlertTitle: "Deactivate Account?",
    deactivateAlertMessage: "Your profile will be hidden and you won't receive notifications. You can reactivate anytime by logging in.",
    deactivateButton: "Deactivate",
    deactivateConfirmTitle: "Confirm Deactivation",
    deactivateConfirmMessage: "Enter your password to confirm account deactivation.",
    deactivateConfirmButton: "Confirm Deactivation",
    deleteAlertTitle: "Delete Account?",
    deleteAlertMessage: "This action is permanent and cannot be undone. All your data, posts, messages, and connections will be permanently removed.",
    deleteConfirmTitle: "Confirm Deletion",
    deleteConfirmMessage: "Type DELETE to confirm permanent account deletion.",
    deleteConfirmButton: "Delete Forever",
    confirmIdentity: "Confirm Your Identity",
    dataReadyMessage: "Your data export is ready for download.",
    downloadDataTitle: "Download Data",
    downloadDataMessage: "Your data export has been prepared. It includes your profile, posts, messages, and activity."
  },

  // I01 #52: Account Switcher
  "screens.accountSwitcher": {
    title: "Switch Account",
    activeNow: "Active now",
    tapToSwitch: "Tap to switch",
    accountFallback: "Account",
    switchFailed: "Could not switch accounts. Please try again.",
    signOutAll: "Sign Out All",
    signOutAllConfirm: "Are you sure you want to sign out of all accounts?",
    signOutAllButton: "Sign Out All",
    noAccountsFound: "No accounts found",
    signInToGetStarted: "Sign in to get started",
    personalLabel: "Personal",
    creatorLabel: "Creator",
    addAccount: "Add Account",
    maxAccounts: "Maximum accounts reached",
    switchingTo: "Switching to",
    currentAccount: "Current",
    lastActive: "Last active",
    removeAccount: "Remove Account",
    removeConfirm: "Are you sure you want to remove this account?",
    accountRemoved: "Account removed"
  },

  // I01 #53: Appeal Moderation
  appealModeration: {
    title: "Appeal Moderation",
    actionTitle: "Action Taken",
    actionReason: "Reason",
    actionDate: "Date",
    actionId: "Action ID",
    contentHeader: "Content Under Review",
    guidelinesText: "Our community guidelines help keep Mizanly safe and respectful for everyone.",
    formTitle: "Submit Your Appeal",
    reasonLabel: "Appeal Reason",
    detailsPlaceholder: "Explain why you believe this action was incorrect...",
    evidenceTitle: "Supporting Evidence",
    evidenceLabel: "Attach Evidence",
    uploadImage: "Upload Image",
    uploadDocument: "Upload Document",
    historyTitle: "Appeal History",
    noHistory: "No previous appeals",
    appealNumber: "Appeal #",
    submitted: "Submitted",
    importantNotes: "Important Notes",
    note1: "Appeals are typically reviewed within 24-48 hours.",
    note2: "You can submit one appeal per moderation action.",
    note3: "Providing clear evidence increases the chance of a successful appeal.",
    submitAppeal: "Submit Appeal",
    documentUploadComingSoon: "Document upload coming soon"
  },

  // I01 #54: Archive
  "screens.archive": {
    title: "Archive",
    emptyTitle: "No archived items",
    emptySubtitle: "Items you archive will appear here",
    unarchive: "Unarchive",
    errorTitle: "Something went wrong",
    errorSubtitle: "Could not load your archive. Please try again.",
    confirmTitle: "Unarchive?",
    confirmMessage: "This item will be visible on your profile again.",
    unarchived: "Item unarchived",
    archiveFailed: "Could not archive item",
    unarchiveFailed: "Could not unarchive item"
  },

  // I01 #55: Blocked Users
  "screens.blocked": {
    title: "Blocked Users",
    unblock: "Unblock",
    unblockConfirmTitle: "Unblock User?",
    unblockConfirmMessage: "They will be able to see your profile and contact you again.",
    emptyTitle: "No blocked users",
    emptySubtitle: "Users you block will appear here",
    errorTitle: "Something went wrong",
    errorSubtitle: "Could not load blocked users",
    unblockFailed: "Could not unblock user"
  },

  // I01 #56: Blocked Keywords
  "screens.blockedKeywords": {
    title: "Blocked Keywords",
    addKeyword: "Add Keyword",
    placeholder: "Enter keyword to block",
    emptyTitle: "No blocked keywords",
    emptySubtitle: "Content containing blocked keywords will be hidden from your feed",
    deleteConfirm: "Remove this keyword?",
    added: "Keyword added",
    removed: "Keyword removed",
    errorAdd: "Could not add keyword",
    errorRemove: "Could not remove keyword",
    errorLoad: "Could not load keywords",
    maxReached: "Maximum keywords reached"
  },

  // I01 #57: Bookmark Collections
  "screens.bookmarkCollections": {
    title: "Collections",
    emptyTitle: "No collections",
    emptySubtitle: "Create collections to organize your saved posts",
    createCollection: "Create Collection",
    itemsCount: "{{count}} items",
    deleteConfirm: "Delete this collection?",
    collectionDeleted: "Collection deleted"
  },

  // I01 #58: Boost Post
  boost: {
    title: "Boost Post",
    budget: "Budget",
    duration: "Duration",
    custom: "Custom",
    enterAmount: "Enter amount",
    customAmountLabel: "Custom Budget",
    postPreview: "Post Preview",
    postIdLabel: "Post ID",
    boostHint: "Boosting helps your post reach more people in the community.",
    estimatedReach: "Estimated Reach",
    reachHonestMessage: "Reach estimates are approximate and depend on content quality and engagement.",
    infoText: "Your boost will start immediately and run for the selected duration.",
    boostNow: "Boost Now",
    successMessage: "Post boosted successfully!",
    errorMessage: "Could not boost post. Please try again.",
    noPost: "No Post Selected",
    noPostSub: "Select a post to boost",
    totalCost: "Total Cost",
    day: "day",
    days: "days",
    duration1Day: "1 Day",
    duration3Days: "3 Days",
    duration7Days: "7 Days",
    duration14Days: "14 Days"
  },

  // I01 #59: Branded Content
  branded: {
    title: "Branded Content",
    paidPartnership: "Paid Partnership",
    paidPartnershipSub: "Disclose paid partnerships to maintain transparency with your audience.",
    togglePartnership: "This is a paid partnership",
    partnerName: "Partner Name",
    partnerPlaceholder: "Enter brand or partner name",
    partnerNameLabel: "Brand Partner",
    preview: "Preview",
    yourName: "Your Name",
    paidPartnershipWith: "Paid partnership with",
    paidPartnershipLabel: "Paid Partnership Label",
    disclosureTitle: "Disclosure",
    disclosureText: "This content is a paid partnership. Disclosing partnerships builds trust with your audience.",
    save: "Save",
    savedMessage: "Branded content settings saved",
    saveError: "Could not save settings",
    noPost: "No Post Selected",
    noPostSub: "Select a post to configure branded content"
  },

  // I01 #60: AudioRoom extras
  audioRoom: {
    moreListeners: "+{{count}} more",
    raisedAgo: "Raised {{time}} ago",
    youAreSpeaker: "You are a speaker",
    youAreListener: "You are a listener"
  },

  // I02: Caption Editor extras
  captionEditor: {
    captionsGenerated: "Captions generated",
    generateFailed: "Failed to generate captions",
    captionsSaved: "Captions saved",
    saveFailed: "Failed to save captions"
  },

  // I02: Chat Theme Picker
  chatThemePicker: {
    title: "Chat Theme",
    "tab.solidColors": "Solid Colors",
    "tab.gradients": "Gradients",
    "tab.patterns": "Patterns",
    "tab.photos": "Photos",
    resetDefault: "Reset to Default",
    applied: "Theme applied"
  },

  // I02: Chat Wallpaper
  chatWallpaper: {
    title: "Chat Wallpaper",
    chooseWallpaper: "Choose Wallpaper",
    removeWallpaper: "Remove Wallpaper",
    setForAll: "Set for all chats",
    setForThis: "Set for this chat only",
    wallpaperApplied: "Wallpaper applied",
    wallpaperRemoved: "Wallpaper removed"
  },

  // I04: Dhikr extras
  dhikr: {
    joinedChallenge: "Joined challenge",
    contributed: "Contributed",
    challengeCreated: "Challenge created"
  },

  // I04: Dhikr Counter
  "screens.dhikrCounter": {
    title: "Dhikr Counter",
    sessionSaved: "Session saved",
    tapToCount: "Tap to count",
    reset: "Reset",
    target: "Target",
    completed: "Completed"
  },

  // I04: Islamic namespace
  islamic: {
    audioRecitationComingSoon: "Audio recitation coming soon"
  },

  // I04: Enable Tips
  "screens.enableTips": {
    title: "Enable Tips",
    errorLoadFailed: "Could not load tip settings",
    tipPreferencesDesc: "Choose how you'd like to receive tips from your supporters.",
    stripeConnectDesc: "Connect your Stripe account to receive payouts."
  },

  // I04: Disappearing Default extras
  disappearingDefault: {
    errorSave: "Could not save disappearing message settings"
  },

  // I04: Gift Shop extras
  giftShop: {
    shop: "Shop",
    history: "History",
    coins: "Coins",
    diamonds: "Diamonds",
    buy: "Buy",
    noGiftHistory: "No gift history",
    send: "Send",
    sendGift: "Send Gift",
    giftSent: "Gift sent!",
    giftFailed: "Could not send gift",
    coinPackages: "Coin Packages",
    diamondPackages: "Diamond Packages",
    balance: "Balance",
    insufficientCoins: "Not enough coins",
    insufficientDiamonds: "Not enough diamonds",
    confirmPurchase: "Confirm Purchase",
    confirmSend: "Confirm Send",
    giftAmount: "Gift Amount",
    recipientLabel: "Recipient",
    selectGift: "Select a Gift"
  },

  // Common extras
  common: {
    listen: "Listen",
    copyAll: "Copy All",
    submitting: "Submitting..."
  }
};

// ── Translations for other languages ──
const TRANSLATIONS = {
  ar: {
    auth: {
      twoFactorAuthentication: "المصادقة الثنائية",
      secureYourAccount: "تأمين حسابك",
      twoFactorDescription: "أضف طبقة أمان إضافية لحسابك بالمصادقة الثنائية.",
      step1InstallAuthenticatorApp: "الخطوة 1: تثبيت تطبيق المصادقة",
      step1Description: "قم بتحميل أحد التطبيقات التالية على هاتفك:",
      selectAuthenticatorApp: "اختر تطبيق المصادقة",
      step2ScanQRCode: "الخطوة 2: مسح رمز QR",
      step2Description: "افتح تطبيق المصادقة وامسح رمز QR هذا.",
      generatingQRCode: "جاري إنشاء رمز QR...",
      qrCode: "رمز QR",
      scanWithAuthenticatorApp: "امسح بتطبيق المصادقة",
      enterSecretManually: "أدخل السر يدوياً",
      scannedCodeButton: "لقد مسحت الرمز",
      step3EnterVerificationCode: "الخطوة 3: أدخل رمز التحقق",
      step3Description: "أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة.",
      enable2FA: "تفعيل المصادقة الثنائية",
      step4SaveBackupCodes: "الخطوة 4: حفظ رموز الاسترداد",
      step4Description: "احفظ رموز الاسترداد هذه في مكان آمن. يمكنك استخدامها للوصول لحسابك إذا فقدت تطبيق المصادقة.",
      backupCodeCopied: "تم نسخ رمز الاسترداد",
      allBackupCodesCopied: "تم نسخ جميع رموز الاسترداد",
      setupFailed: "فشل الإعداد",
      setupFailedMessage: "تعذر إعداد المصادقة الثنائية. حاول مرة أخرى.",
      twoFactorEnabledMessage: "تم تفعيل المصادقة الثنائية.",
      verificationFailed: "فشل التحقق",
      verificationFailedMessage: "رمز تحقق غير صالح. حاول مرة أخرى.",
      downloadBackupCodesMessage: "قم بتحميل رموز الاسترداد قبل المتابعة."
    },
    "screens.2faVerify": {
      title: "تحقق من الهوية",
      heroTitle: "التحقق الثنائي",
      heroSubtitle: "أدخل الرمز من تطبيق المصادقة للمتابعة.",
      codeInputLabel: "رمز التحقق",
      backupInputLabel: "رمز الاسترداد",
      backupPlaceholder: "أدخل رمز الاسترداد",
      backupHint: "استخدم أحد رموز الاسترداد التي حفظتها أثناء الإعداد.",
      useBackupCodeInstead: "استخدم رمز استرداد بدلاً من ذلك",
      useAuthenticatorCodeInstead: "استخدم رمز المصادقة بدلاً من ذلك",
      verificationSuccessMessage: "تم التحقق بنجاح",
      invalidCodeMessage: "رمز غير صالح. حاول مرة أخرى.",
      lostAccessLinkText: "فقدت الوصول للمصادقة؟",
      lostAccessTitle: "فقدان الوصول",
      lostAccessMessage: "إذا فقدت الوصول لتطبيق المصادقة، يمكنك استخدام رمز استرداد أو الاتصال بالدعم.",
      lostAccessButtonContact: "اتصل بالدعم",
      helpTitle: "تحتاج مساعدة؟",
      helpDescription: "إذا كنت تواجه صعوبة، تأكد من استخدام تطبيق المصادقة الصحيح وأن الوقت على جهازك دقيق."
    },
    accountSettings: {
      title: "إعدادات الحساب",
      notSet: "غير محدد",
      joined: "انضم",
      "sections.accountInfo": "معلومات الحساب",
      "sections.dataPrivacy": "البيانات والخصوصية",
      "sections.accountActions": "إجراءات الحساب",
      downloadMyData: "تحميل بياناتي",
      exportDataHint: "احصل على نسخة من جميع بياناتك",
      manageDataHint: "تحكم في البيانات المخزنة عنك",
      deactivateAccount: "تعطيل الحساب",
      deactivateHint: "تعطيل حسابك مؤقتاً",
      deleteAccount: "حذف الحساب",
      deleteHint: "حذف حسابك وجميع البيانات نهائياً",
      deactivateAlertTitle: "تعطيل الحساب؟",
      deactivateAlertMessage: "سيتم إخفاء ملفك الشخصي ولن تتلقى إشعارات. يمكنك إعادة التفعيل بتسجيل الدخول.",
      deactivateButton: "تعطيل",
      deactivateConfirmTitle: "تأكيد التعطيل",
      deactivateConfirmMessage: "أدخل كلمة المرور لتأكيد تعطيل الحساب.",
      deactivateConfirmButton: "تأكيد التعطيل",
      deleteAlertTitle: "حذف الحساب؟",
      deleteAlertMessage: "هذا الإجراء نهائي ولا يمكن التراجع عنه. سيتم حذف جميع بياناتك ومنشوراتك ورسائلك.",
      deleteConfirmTitle: "تأكيد الحذف",
      deleteConfirmMessage: "اكتب DELETE لتأكيد حذف الحساب نهائياً.",
      deleteConfirmButton: "حذف نهائياً",
      confirmIdentity: "تأكيد هويتك",
      dataReadyMessage: "تصدير بياناتك جاهز للتحميل.",
      downloadDataTitle: "تحميل البيانات",
      downloadDataMessage: "تم تحضير تصدير بياناتك. يشمل ملفك الشخصي ومنشوراتك ورسائلك ونشاطك."
    },
    "screens.accountSwitcher": { title: "تبديل الحساب", activeNow: "نشط الآن", tapToSwitch: "اضغط للتبديل", accountFallback: "حساب", switchFailed: "تعذر تبديل الحسابات. حاول مرة أخرى.", signOutAll: "تسجيل خروج الكل", signOutAllConfirm: "هل أنت متأكد من تسجيل الخروج من جميع الحسابات؟", signOutAllButton: "تسجيل خروج الكل", noAccountsFound: "لم يتم العثور على حسابات", signInToGetStarted: "سجل الدخول للبدء", personalLabel: "شخصي", creatorLabel: "منشئ", addAccount: "إضافة حساب", maxAccounts: "تم الوصول للحد الأقصى", switchingTo: "جاري التبديل إلى", currentAccount: "الحالي", lastActive: "آخر نشاط", removeAccount: "إزالة الحساب", removeConfirm: "هل أنت متأكد من إزالة هذا الحساب؟", accountRemoved: "تم إزالة الحساب" },
    appealModeration: { title: "الطعن في الإجراء", actionTitle: "الإجراء المتخذ", actionReason: "السبب", actionDate: "التاريخ", actionId: "رقم الإجراء", contentHeader: "المحتوى قيد المراجعة", guidelinesText: "إرشادات المجتمع تساعد في الحفاظ على ميزانلي آمنة ومحترمة للجميع.", formTitle: "قدم طعنك", reasonLabel: "سبب الطعن", detailsPlaceholder: "اشرح لماذا تعتقد أن هذا الإجراء كان غير صحيح...", evidenceTitle: "أدلة داعمة", evidenceLabel: "إرفاق دليل", uploadImage: "رفع صورة", uploadDocument: "رفع مستند", historyTitle: "سجل الطعون", noHistory: "لا توجد طعون سابقة", appealNumber: "طعن رقم", submitted: "تم التقديم", importantNotes: "ملاحظات مهمة", note1: "تتم مراجعة الطعون عادة خلال 24-48 ساعة.", note2: "يمكنك تقديم طعن واحد لكل إجراء.", note3: "تقديم أدلة واضحة يزيد من فرص نجاح الطعن.", submitAppeal: "تقديم الطعن", documentUploadComingSoon: "رفع المستندات قريباً" },
    "screens.archive": { title: "الأرشيف", emptyTitle: "لا توجد عناصر مؤرشفة", emptySubtitle: "العناصر المؤرشفة ستظهر هنا", unarchive: "إلغاء الأرشفة", errorTitle: "حدث خطأ", errorSubtitle: "تعذر تحميل الأرشيف. حاول مرة أخرى.", confirmTitle: "إلغاء الأرشفة؟", confirmMessage: "سيكون هذا العنصر مرئياً على ملفك الشخصي مرة أخرى.", unarchived: "تم إلغاء الأرشفة", archiveFailed: "تعذر أرشفة العنصر", unarchiveFailed: "تعذر إلغاء الأرشفة" },
    "screens.blocked": { title: "المستخدمون المحظورون", unblock: "إلغاء الحظر", unblockConfirmTitle: "إلغاء حظر المستخدم؟", unblockConfirmMessage: "سيتمكن من رؤية ملفك الشخصي والتواصل معك مرة أخرى.", emptyTitle: "لا يوجد مستخدمون محظورون", emptySubtitle: "المستخدمون الذين تحظرهم سيظهرون هنا", errorTitle: "حدث خطأ", errorSubtitle: "تعذر تحميل المستخدمين المحظورين", unblockFailed: "تعذر إلغاء الحظر" },
    "screens.blockedKeywords": { title: "الكلمات المحظورة", addKeyword: "إضافة كلمة", placeholder: "أدخل كلمة لحظرها", emptyTitle: "لا توجد كلمات محظورة", emptySubtitle: "المحتوى الذي يحتوي على كلمات محظورة سيتم إخفاؤه من خلاصتك", deleteConfirm: "إزالة هذه الكلمة؟", added: "تمت إضافة الكلمة", removed: "تم إزالة الكلمة", errorAdd: "تعذر إضافة الكلمة", errorRemove: "تعذر إزالة الكلمة", errorLoad: "تعذر تحميل الكلمات", maxReached: "تم الوصول للحد الأقصى" },
    "screens.bookmarkCollections": { title: "المجموعات", emptyTitle: "لا توجد مجموعات", emptySubtitle: "أنشئ مجموعات لتنظيم منشوراتك المحفوظة", createCollection: "إنشاء مجموعة", itemsCount: "{{count}} عناصر", deleteConfirm: "حذف هذه المجموعة؟", collectionDeleted: "تم حذف المجموعة" },
    boost: { title: "ترويج المنشور", budget: "الميزانية", duration: "المدة", custom: "مخصص", enterAmount: "أدخل المبلغ", customAmountLabel: "ميزانية مخصصة", postPreview: "معاينة المنشور", postIdLabel: "رقم المنشور", boostHint: "الترويج يساعد منشورك في الوصول لعدد أكبر من الأشخاص.", estimatedReach: "الوصول التقديري", reachHonestMessage: "تقديرات الوصول تقريبية وتعتمد على جودة المحتوى والتفاعل.", infoText: "سيبدأ الترويج فوراً ويستمر للمدة المحددة.", boostNow: "ترويج الآن", successMessage: "تم ترويج المنشور بنجاح!", errorMessage: "تعذر ترويج المنشور. حاول مرة أخرى.", noPost: "لم يتم اختيار منشور", noPostSub: "اختر منشوراً للترويج", totalCost: "التكلفة الإجمالية", day: "يوم", days: "أيام", duration1Day: "يوم واحد", duration3Days: "3 أيام", duration7Days: "7 أيام", duration14Days: "14 يوم" },
    branded: { title: "محتوى ممول", paidPartnership: "شراكة مدفوعة", paidPartnershipSub: "أفصح عن الشراكات المدفوعة للحفاظ على الشفافية مع جمهورك.", togglePartnership: "هذه شراكة مدفوعة", partnerName: "اسم الشريك", partnerPlaceholder: "أدخل اسم العلامة التجارية", partnerNameLabel: "شريك العلامة التجارية", preview: "معاينة", yourName: "اسمك", paidPartnershipWith: "شراكة مدفوعة مع", paidPartnershipLabel: "تسمية الشراكة المدفوعة", disclosureTitle: "الإفصاح", disclosureText: "هذا المحتوى شراكة مدفوعة. الإفصاح عن الشراكات يبني الثقة مع جمهورك.", save: "حفظ", savedMessage: "تم حفظ إعدادات المحتوى الممول", saveError: "تعذر حفظ الإعدادات", noPost: "لم يتم اختيار منشور", noPostSub: "اختر منشوراً لتهيئة المحتوى الممول" },
    audioRoom: { moreListeners: "+{{count}} آخرين", raisedAgo: "رفع يده منذ {{time}}", youAreSpeaker: "أنت متحدث", youAreListener: "أنت مستمع" },
    captionEditor: { captionsGenerated: "تم إنشاء التسميات التوضيحية", generateFailed: "فشل إنشاء التسميات التوضيحية", captionsSaved: "تم حفظ التسميات التوضيحية", saveFailed: "فشل حفظ التسميات التوضيحية" },
    chatThemePicker: { title: "سمة المحادثة", "tab.solidColors": "ألوان صلبة", "tab.gradients": "تدرجات", "tab.patterns": "أنماط", "tab.photos": "صور", resetDefault: "إعادة التعيين", applied: "تم تطبيق السمة" },
    chatWallpaper: { title: "خلفية المحادثة", chooseWallpaper: "اختر خلفية", removeWallpaper: "إزالة الخلفية", setForAll: "تعيين لجميع المحادثات", setForThis: "تعيين لهذه المحادثة فقط", wallpaperApplied: "تم تطبيق الخلفية", wallpaperRemoved: "تم إزالة الخلفية" },
    dhikr: { joinedChallenge: "انضم للتحدي", contributed: "ساهم", challengeCreated: "تم إنشاء التحدي" },
    "screens.dhikrCounter": { title: "عداد الذكر", sessionSaved: "تم حفظ الجلسة", tapToCount: "اضغط للعد", reset: "إعادة تعيين", target: "الهدف", completed: "مكتمل" },
    islamic: { audioRecitationComingSoon: "التلاوة الصوتية قريباً" },
    "screens.enableTips": { title: "تفعيل الإكراميات", errorLoadFailed: "تعذر تحميل إعدادات الإكراميات", tipPreferencesDesc: "اختر كيف تريد تلقي الإكراميات من داعميك.", stripeConnectDesc: "اربط حسابك في Stripe لتلقي المدفوعات." },
    disappearingDefault: { errorSave: "تعذر حفظ إعدادات الرسائل المختفية" },
    giftShop: { shop: "متجر", history: "السجل", coins: "عملات", diamonds: "ماسات", buy: "شراء", noGiftHistory: "لا يوجد سجل هدايا", send: "إرسال", sendGift: "إرسال هدية", giftSent: "تم إرسال الهدية!", giftFailed: "تعذر إرسال الهدية", coinPackages: "حزم العملات", diamondPackages: "حزم الماسات", balance: "الرصيد", insufficientCoins: "عملات غير كافية", insufficientDiamonds: "ماسات غير كافية", confirmPurchase: "تأكيد الشراء", confirmSend: "تأكيد الإرسال", giftAmount: "قيمة الهدية", recipientLabel: "المستلم", selectGift: "اختر هدية" },
    common: { listen: "استمع", copyAll: "نسخ الكل", submitting: "جاري الإرسال..." }
  },
  // For other languages, use English as placeholder (better than raw key paths)
  // Real translations should be done by native speakers
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key in target && typeof target[key] === 'object' && typeof source[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], source[key]);
    } else if (!(key in target)) {
      target[key] = source[key];
    }
  }
  return target;
}

function flatToNested(flat) {
  const result = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current)) current[parts[i]] = {};
        current = current[parts[i]];
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Nested value — merge into the nested path
        const lastKey = parts[parts.length - 1];
        if (!(lastKey in current)) current[lastKey] = {};
        Object.assign(current[lastKey], value);
      } else {
        current[parts[parts.length - 1]] = value;
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      if (!(key in result)) result[key] = {};
      deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Process each language
for (const lang of LANGUAGES) {
  const filePath = join(I18N_DIR, `${lang}.json`);
  const existing = JSON.parse(readFileSync(filePath, 'utf-8'));

  let keysToAdd;
  if (lang === 'en') {
    keysToAdd = flatToNested(NEW_KEYS);
  } else if (lang === 'ar' && TRANSLATIONS.ar) {
    keysToAdd = flatToNested(TRANSLATIONS.ar);
  } else {
    // For other languages, use English as placeholder
    keysToAdd = flatToNested(NEW_KEYS);
  }

  deepMerge(existing, keysToAdd);

  writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');

  const addedCount = Object.keys(NEW_KEYS).reduce((acc, ns) => {
    const val = NEW_KEYS[ns];
    return acc + (typeof val === 'object' ? Object.keys(val).length : 1);
  }, 0);
  console.log(`[${lang}] Updated — ${addedCount} keys across ${Object.keys(NEW_KEYS).length} namespaces`);
}

console.log('\nDone! All 8 language files updated.');
