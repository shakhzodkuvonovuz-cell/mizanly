"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ContentSettingsScreen;
var react_1 = require("react");
var react_native_1 = require("react-native");
var expo_router_1 = require("expo-router");
var react_query_1 = require("@tanstack/react-query");
var react_native_safe_area_context_1 = require("react-native-safe-area-context");
var Icon_1 = require("@/components/ui/Icon");
var Skeleton_1 = require("@/components/ui/Skeleton");
var BottomSheet_1 = require("@/components/ui/BottomSheet");
var theme_1 = require("@/theme");
var api_1 = require("@/services/api");
var store_1 = require("@/store");
// Reuse Row and SectionHeader from settings.tsx (copied inline)
function Row(_a) {
    var label = _a.label, hint = _a.hint, value = _a.value, onToggle = _a.onToggle, onPress = _a.onPress, destructive = _a.destructive;
    return (<react_native_1.TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress && !onToggle}>
      <react_native_1.View style={styles.rowText}>
        <react_native_1.Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</react_native_1.Text>
        {hint ? <react_native_1.Text style={styles.rowHint}>{hint}</react_native_1.Text> : null}
      </react_native_1.View>
      {onToggle !== undefined && value !== undefined ? (<react_native_1.Switch value={value} onValueChange={onToggle} trackColor={{ false: theme_1.colors.dark.border, true: theme_1.colors.emerald }} thumbColor="#fff"/>) : onPress ? (<Icon_1.Icon name="chevron-right" size="sm" color={theme_1.colors.text.tertiary}/>) : null}
    </react_native_1.TouchableOpacity>);
}
function SectionHeader(_a) {
    var title = _a.title;
    return <react_native_1.Text style={styles.sectionHeader}>{title}</react_native_1.Text>;
}
function ContentSettingsScreen() {
    var router = (0, expo_router_1.useRouter)();
    var safFeedType = (0, store_1.useSafFeedType)();
    var majlisFeedType = (0, store_1.useMajlisFeedType)();
    var setSafFeedType = (0, store_1.useStore)(function (s) { return s.setSafFeedType; });
    var setMajlisFeedType = (0, store_1.useStore)(function (s) { return s.setMajlisFeedType; });
    // Settings from API
    var settingsQuery = (0, react_query_1.useQuery)({
        queryKey: ['settings'],
        queryFn: function () { return api_1.settingsApi.get(); },
    });
    var s = settingsQuery.data;
    // Local state mirrors fetched settings
    var _a = (0, react_1.useState)(false), sensitiveContent = _a[0], setSensitiveContent = _a[1];
    var _b = (0, react_1.useState)('off'), dailyReminder = _b[0], setDailyReminder = _b[1];
    var _c = (0, react_1.useState)(false), hideRepostedContent = _c[0], setHideRepostedContent = _c[1]; // local only
    (0, react_1.useEffect)(function () {
        var _a;
        if (s) {
            setSensitiveContent((_a = s.sensitiveContentFilter) !== null && _a !== void 0 ? _a : false);
        }
    }, [s]);
    // BottomSheet states
    var _d = (0, react_1.useState)(false), safPickerVisible = _d[0], setSafPickerVisible = _d[1];
    var _e = (0, react_1.useState)(false), majlisPickerVisible = _e[0], setMajlisPickerVisible = _e[1];
    var _f = (0, react_1.useState)(false), dailyReminderPickerVisible = _f[0], setDailyReminderPickerVisible = _f[1];
    var wellbeingMutation = (0, react_query_1.useMutation)({
        mutationFn: api_1.settingsApi.updateWellbeing,
        onError: function (err) { return react_native_1.Alert.alert('Error', err.message); },
    });
    var handleUpdateSensitiveContent = function (v) {
        setSensitiveContent(v);
        wellbeingMutation.mutate({ sensitiveContentFilter: v });
    };
    var handleUpdateDailyReminder = function (option) {
        setDailyReminder(option);
        // TODO: send to backend if endpoint exists; currently not in schema
    };
    var safOptions = [
        { label: 'Following', value: 'following' },
        { label: 'For You', value: 'foryou' },
    ];
    var majlisOptions = [
        { label: 'For You', value: 'foryou' },
        { label: 'Following', value: 'following' },
        { label: 'Trending', value: 'trending' },
    ];
    var dailyReminderOptions = [
        { label: 'Off', value: 'off' },
        { label: '30 minutes', value: '30min' },
        { label: '1 hour', value: '1h' },
        { label: '2 hours', value: '2h' },
    ];
    if (settingsQuery.isLoading) {
        return (<react_native_safe_area_context_1.SafeAreaView style={styles.container} edges={['top']}>
        <react_native_1.View style={{ flex: 1, padding: theme_1.spacing.base, gap: theme_1.spacing.lg }}>
          {Array.from({ length: 6 }).map(function (_, i) { return (<Skeleton_1.Skeleton.Rect key={i} width="100%" height={48}/>); })}
        </react_native_1.View>
      </react_native_safe_area_context_1.SafeAreaView>);
    }
    return (<react_native_safe_area_context_1.SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <react_native_1.View style={styles.header}>
        <react_native_1.Pressable onPress={function () { return router.back(); }} hitSlop={8}>
          <Icon_1.Icon name="arrow-left" size="md" color={theme_1.colors.text.primary}/>
        </react_native_1.Pressable>
        <react_native_1.Text style={styles.headerTitle}>Content Preferences</react_native_1.Text>
        <react_native_1.View style={{ width: 36 }}/>
      </react_native_1.View>

      <react_native_1.ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Feed Preferences */}
        <SectionHeader title="Feed Preferences"/>
        <react_native_1.View style={styles.card}>
          <react_native_1.TouchableOpacity style={styles.row} onPress={function () { return setSafPickerVisible(true); }}>
            <react_native_1.View style={styles.rowText}>
              <react_native_1.Text style={styles.rowLabel}>Saf default</react_native_1.Text>
              <react_native_1.Text style={styles.rowHint}>Choose default feed for Saf</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.View style={{ flexDirection: 'row', alignItems: 'center', gap: theme_1.spacing.xs }}>
              <react_native_1.Text style={styles.valueText}>
                {safFeedType === 'following' ? 'Following' : 'For You'}
              </react_native_1.Text>
              <Icon_1.Icon name="chevron-right" size="sm" color={theme_1.colors.text.tertiary}/>
            </react_native_1.View>
          </react_native_1.TouchableOpacity>
          <react_native_1.View style={styles.divider}/>
          <react_native_1.TouchableOpacity style={styles.row} onPress={function () { return setMajlisPickerVisible(true); }}>
            <react_native_1.View style={styles.rowText}>
              <react_native_1.Text style={styles.rowLabel}>Majlis default</react_native_1.Text>
              <react_native_1.Text style={styles.rowHint}>Choose default feed for Majlis</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.View style={{ flexDirection: 'row', alignItems: 'center', gap: theme_1.spacing.xs }}>
              <react_native_1.Text style={styles.valueText}>
                {majlisFeedType === 'foryou' ? 'For You' : majlisFeedType === 'following' ? 'Following' : 'Trending'}
              </react_native_1.Text>
              <Icon_1.Icon name="chevron-right" size="sm" color={theme_1.colors.text.tertiary}/>
            </react_native_1.View>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>

        {/* Content Filters */}
        <SectionHeader title="Content Filters"/>
        <react_native_1.View style={styles.card}>
          <Row label="Filter sensitive content" hint="Hide posts marked as sensitive" value={sensitiveContent} onToggle={handleUpdateSensitiveContent}/>
          <react_native_1.View style={styles.divider}/>
          <Row label="Hide reposted content" hint="Don't show reposted posts in feeds" value={hideRepostedContent} onToggle={setHideRepostedContent}/>
        </react_native_1.View>

        {/* Blocked Keywords */}
        <SectionHeader title="Blocked Keywords"/>
        <react_native_1.View style={styles.card}>
          <Row label="Manage Blocked Keywords" hint="Add or remove filtered keywords" onPress={function () { return router.push('/(screens)/blocked-keywords'); }}/>
        </react_native_1.View>

        {/* Digital Wellbeing */}
        <SectionHeader title="Digital Wellbeing"/>
        <react_native_1.View style={styles.card}>
          <react_native_1.TouchableOpacity style={styles.row} onPress={function () { return setDailyReminderPickerVisible(true); }}>
            <react_native_1.View style={styles.rowText}>
              <react_native_1.Text style={styles.rowLabel}>Daily reminder</react_native_1.Text>
              <react_native_1.Text style={styles.rowHint}>Get a reminder after using app for a while</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.View style={{ flexDirection: 'row', alignItems: 'center', gap: theme_1.spacing.xs }}>
              <react_native_1.Text style={styles.valueText}>
                {dailyReminder === 'off' ? 'Off' : dailyReminder === '30min' ? '30 min' : dailyReminder === '1h' ? '1 hour' : '2 hours'}
              </react_native_1.Text>
              <Icon_1.Icon name="chevron-right" size="sm" color={theme_1.colors.text.tertiary}/>
            </react_native_1.View>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
      </react_native_1.ScrollView>

      {/* BottomSheet for Saf feed picker */}
      <BottomSheet_1.BottomSheet visible={safPickerVisible} onClose={function () { return setSafPickerVisible(false); }}>
        {safOptions.map(function (opt) { return (<BottomSheet_1.BottomSheetItem key={opt.value} label={opt.label} onPress={function () {
                setSafFeedType(opt.value);
                setSafPickerVisible(false);
            }} icon={safFeedType === opt.value ? <Icon_1.Icon name="check" size="sm" color={theme_1.colors.emerald}/> : undefined}/>); })}
      </BottomSheet_1.BottomSheet>

      {/* BottomSheet for Majlis feed picker */}
      <BottomSheet_1.BottomSheet visible={majlisPickerVisible} onClose={function () { return setMajlisPickerVisible(false); }}>
        {majlisOptions.map(function (opt) { return (<BottomSheet_1.BottomSheetItem key={opt.value} label={opt.label} onPress={function () {
                setMajlisFeedType(opt.value);
                setMajlisPickerVisible(false);
            }} icon={majlisFeedType === opt.value ? <Icon_1.Icon name="check" size="sm" color={theme_1.colors.emerald}/> : undefined}/>); })}
      </BottomSheet_1.BottomSheet>

      {/* BottomSheet for daily reminder picker */}
      <BottomSheet_1.BottomSheet visible={dailyReminderPickerVisible} onClose={function () { return setDailyReminderPickerVisible(false); }}>
        {dailyReminderOptions.map(function (opt) { return (<BottomSheet_1.BottomSheetItem key={opt.value} label={opt.label} onPress={function () {
                handleUpdateDailyReminder(opt.value);
                setDailyReminderPickerVisible(false);
            }} icon={dailyReminder === opt.value ? <Icon_1.Icon name="check" size="sm" color={theme_1.colors.emerald}/> : undefined}/>); })}
      </BottomSheet_1.BottomSheet>
    </react_native_safe_area_context_1.SafeAreaView>);
}
var styles = react_native_1.StyleSheet.create({
    container: { flex: 1, backgroundColor: theme_1.colors.dark.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: theme_1.spacing.base, paddingVertical: theme_1.spacing.sm,
        borderBottomWidth: 0.5, borderBottomColor: theme_1.colors.dark.border,
    },
    headerTitle: { color: theme_1.colors.text.primary, fontSize: theme_1.fontSize.base, fontWeight: '700' },
    body: { flex: 1 },
    bodyContent: { paddingBottom: 60 },
    sectionHeader: {
        color: theme_1.colors.text.secondary, fontSize: theme_1.fontSize.xs, fontWeight: '600',
        textTransform: 'uppercase', letterSpacing: 0.8,
        paddingHorizontal: theme_1.spacing.base, paddingTop: theme_1.spacing.xl, paddingBottom: theme_1.spacing.sm,
    },
    card: {
        backgroundColor: theme_1.colors.dark.bgElevated,
        marginHorizontal: theme_1.spacing.base, borderRadius: theme_1.radius.lg, overflow: 'hidden',
    },
    row: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: theme_1.spacing.base, paddingVertical: theme_1.spacing.md,
    },
    rowText: { flex: 1, marginRight: theme_1.spacing.md },
    rowLabel: { color: theme_1.colors.text.primary, fontSize: theme_1.fontSize.base },
    rowHint: { color: theme_1.colors.text.tertiary, fontSize: theme_1.fontSize.xs, marginTop: 2 },
    destructive: { color: '#FF453A' },
    valueText: { color: theme_1.colors.text.primary, fontSize: theme_1.fontSize.base },
    divider: { height: 0.5, backgroundColor: theme_1.colors.dark.border, marginLeft: theme_1.spacing.base },
});
