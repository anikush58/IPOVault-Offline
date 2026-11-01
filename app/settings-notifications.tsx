import React, { useState, useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from '@/components/ui/Icon';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { DesignSystem } from '@/constants/DesignSystem';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { IOSToggle } from '@/components/ui/IOSToggle';
import {
  getNotificationPreferences,
  setNotificationPreference,
} from '@/services/notifications/notificationEngine';

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function SettingsNotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const settingIconColor = isDark ? '#FFFFFF' : '#111827';
  const settingIconBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(17, 24, 39, 0.06)';

  // Toggle states
  const [ipoUpdates, setIpoUpdates] = useState(true);
  const [allotmentResults, setAllotmentResults] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [appUpdates, setAppUpdates] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);

  useEffect(() => {
    getNotificationPreferences().then((prefs) => {
      setIpoUpdates(prefs.ipoUpdates);
      setAllotmentResults(prefs.allotmentResults);
      setPriceAlerts(prefs.priceAlerts);
      setAppUpdates(prefs.appUpdates);
      setNotificationSound(prefs.sound);
    });
  }, []);

  // Quiet Hours Modal State
  const [showQuietHoursModal, setShowQuietHoursModal] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [startTime, setStartTime] = useState('10:00 PM');
  const [endTime, setEndTime] = useState('7:00 AM');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const toggleDay = (idx: number) => {
    Haptics.selectionAsync();
    setSelectedDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
  };

  const handleSaveQuietHours = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowQuietHoursModal(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        eyebrow="SETTINGS"
        title="Notifications"
        centerTitle
        showBack
        transparent
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: topPad + 60 + 12,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
          Choose what you want to be notified about
        </Text>

        {/* Main Notifications Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* IPO Updates */}
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="bar-chart-2" size={17} color={settingIconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>IPO Updates</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                New IPOs, opened and closing soon
              </Text>
            </View>
            <IOSToggle
              value={ipoUpdates}
              onValueChange={(val) => {
                setIpoUpdates(val);
                setNotificationPreference('IPO_UPDATES', val);
              }}
            />
          </View>

          {/* Allotment Results */}
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="award" size={17} color={settingIconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Allotment Results</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Allotment status and updates
              </Text>
            </View>
            <IOSToggle
              value={allotmentResults}
              onValueChange={(val) => {
                setAllotmentResults(val);
                setNotificationPreference('ALLOTMENT_RESULTS', val);
              }}
            />
          </View>

          {/* Price Alerts */}
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="trending-up" size={17} color={settingIconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Price Alerts</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Significant price movements
              </Text>
            </View>
            <IOSToggle
              value={priceAlerts}
              onValueChange={(val) => {
                setPriceAlerts(val);
                setNotificationPreference('PRICE_ALERTS', val);
              }}
            />
          </View>

          {/* App Updates */}
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={[styles.iconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="bell" size={17} color={settingIconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>App Updates</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                New features and improvements
              </Text>
            </View>
            <IOSToggle
              value={appUpdates}
              onValueChange={(val) => {
                setAppUpdates(val);
                setNotificationPreference('APP_UPDATES', val);
              }}
            />
          </View>
        </View>

        {/* Quiet Hours Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
          <TouchableOpacity
            style={styles.clickableRow}
            activeOpacity={0.7}
            onPress={() => setShowQuietHoursModal(true)}
          >
            <View style={[styles.iconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="moon" size={17} color={settingIconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Quiet Hours</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                {quietHoursEnabled ? `Active: ${startTime} - ${endTime}` : 'Pause notifications during specific hours'}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Notification Sound Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: settingIconBg }]}>
              <Icon name="volume-2" size={17} color={settingIconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Notification Sound</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>App notification sound</Text>
            </View>
            <IOSToggle
              value={notificationSound}
              onValueChange={(val) => {
                setNotificationSound(val);
                setNotificationPreference('SOUND', val);
              }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Quiet Hours Sheet Modal */}
      <Modal visible={showQuietHoursModal} transparent animationType="fade" onRequestClose={() => setShowQuietHoursModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQuietHoursModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Quiet Hours</Text>
                <Text style={[styles.modalSubTitle, { color: colors.mutedForeground }]}>
                  Pause notifications during specific hours
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowQuietHoursModal(false)} hitSlop={8}>
                <Icon name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Enable Quiet Hours */}
            <View style={[styles.modalToggleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalToggleLabel, { color: colors.foreground }]}>Enable Quiet Hours</Text>
              <IOSToggle
                value={quietHoursEnabled}
                onValueChange={setQuietHoursEnabled}
              />
            </View>

            {/* Time Rows */}
            <View style={[styles.timeRow, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="clock" size={15} color={colors.mutedForeground} />
                <Text style={[styles.timeLabel, { color: colors.foreground }]}>Start Time</Text>
              </View>
              <Text style={[styles.timeVal, { color: colors.accentColor }]}>{startTime}</Text>
            </View>

            <View style={[styles.timeRow, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="clock" size={15} color={colors.mutedForeground} />
                <Text style={[styles.timeLabel, { color: colors.foreground }]}>End Time</Text>
              </View>
              <Text style={[styles.timeVal, { color: colors.accentColor }]}>{endTime}</Text>
            </View>

            {/* Day of Week Selector */}
            <View style={styles.daysRow}>
              {DAYS_OF_WEEK.map((d, idx) => {
                const isSelected = selectedDays.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => toggleDay(idx)}
                    style={[
                      styles.dayCircle,
                      {
                        backgroundColor: isSelected
                          ? colors.accentColor
                          : isDark
                          ? 'rgba(255,255,255,0.06)'
                          : '#F1F5F9',
                        borderColor: isSelected ? colors.accentColor : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: isSelected
                            ? '#FFFFFF'
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveQuietHours}
            >
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  clickableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.1,
  },
  rowSub: {
    fontSize: 11.5,
    fontFamily: 'GoogleSansFlex_400Regular',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.3,
  },
  modalSubTitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_400Regular',
    marginTop: 2,
  },
  modalToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalToggleLabel: {
    fontSize: 14.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  timeLabel: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex_500Medium',
  },
  timeVal: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 18,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  saveBtn: {
    height: 48,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_700Bold',
    color: '#FFFFFF',
  },
});
