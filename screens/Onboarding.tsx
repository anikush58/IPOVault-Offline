import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeAsyncStorage } from '@/utils/safeAsyncStorage';
import { ONBOARDING_SLIDES, ONBOARDING_STORAGE_KEY } from '@/constants/onboarding';
import { useColorSchemeAssets } from '@/hooks/useColorSchemeAssets';
import { OnboardingSlide } from '@/components/onboarding/OnboardingSlide';
import { PageIndicator } from '@/components/onboarding/PageIndicator';
import { PrimaryButton } from '@/components/onboarding/PrimaryButton';
import { ThemeToggle } from '@/components/onboarding/ThemeToggle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function OnboardingScreenView() {
  const router = useRouter();
  const { isDark, getSlideImage } = useColorSchemeAssets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < ONBOARDING_SLIDES.length) {
      setCurrentIndex(index);
    }
  };

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      try {
        await safeAsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      } catch (e) {
        if (__DEV__) console.warn('Failed to save onboarding completion state', e);
      }
      router.replace('/(tabs)');
    }
  };

  const bgColor = isDark ? '#0A0A0A' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#111827';
  const subtitleColor = isDark ? '#9CA3AF' : '#6B7280';

  const buttonLabel = currentIndex === ONBOARDING_SLIDES.length - 1 ? 'Get Started' : 'Next';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'bottom']}>
      {/* Top Header with Theme Switcher in Top Right */}
      <View style={styles.headerBar}>
        <View style={styles.headerRight}>
          <ThemeToggle />
        </View>
      </View>

      <View style={styles.content}>
        {/* Horizontal Carousel */}
        <FlatList
          ref={flatListRef}
          data={ONBOARDING_SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item, index }) => (
            <OnboardingSlide
              slide={item}
              imageSource={getSlideImage(item)}
              isActive={index === currentIndex}
              textColor={textColor}
              subtitleColor={subtitleColor}
            />
          )}
        />

        {/* Footer Controls (Page Indicator & Primary Button) */}
        <View style={styles.footer}>
          <PageIndicator
            total={ONBOARDING_SLIDES.length}
            currentIndex={currentIndex}
            isDark={isDark}
          />
          <View style={styles.buttonWrapper}>
            <PrimaryButton label={buttonLabel} onPress={handleNext} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerRight: {
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 24,
  },
  buttonWrapper: {
    width: '100%',
  },
});
