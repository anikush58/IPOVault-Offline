import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleSheet,
  StyleProp,
  TextStyle,
} from 'react-native';

export interface RupeeTextProps extends RNTextProps {
  children?: React.ReactNode;
  rupeeStyle?: StyleProp<TextStyle>;
}

/**
 * Splits any string containing the Indian Rupee symbol ('₹') so that
 * '₹' is rendered with Space Mono, and the numerical value / surrounding text
 * uses Google Sans Flex (or the parent Text component's style).
 */
export function formatRupeeNodes(
  node: React.ReactNode,
  isBold: boolean = false,
  rupeeStyle?: StyleProp<TextStyle>,
  keyPrefix: string = 'rt'
): React.ReactNode {
  if (node == null || typeof node === 'boolean') {
    return node;
  }

  if (typeof node === 'string') {
    if (!node.includes('₹')) {
      return node;
    }
    const parts = node.split(/(₹)/g);
    return parts.map((part, index) => {
      if (part === '₹') {
        return (
          <RNText
            key={`${keyPrefix}-rupee-${index}`}
            style={[
              isBold ? styles.rupeeBold : styles.rupeeRegular,
              rupeeStyle,
            ]}
          >
            ₹
          </RNText>
        );
      }
      return part;
    });
  }

  if (Array.isArray(node)) {
    return node.map((child, index) =>
      formatRupeeNodes(child, isBold, rupeeStyle, `${keyPrefix}-${index}`)
    );
  }

  return node;
}

/**
 * RupeeText: Universal typography-aware component that ensures all '₹' symbols
 * render in Space Mono, while numeric values and labels render in Google Sans Flex.
 */
export function RupeeText({ style, rupeeStyle, children, ...restProps }: RupeeTextProps) {
  const flattened = StyleSheet.flatten(style) || {};
  const isBold =
    flattened.fontWeight === 'bold' ||
    flattened.fontWeight === '700' ||
    (typeof flattened.fontFamily === 'string' &&
      (flattened.fontFamily.includes('Bold') ||
        flattened.fontFamily.includes('700') ||
        flattened.fontFamily.includes('SemiBold') ||
        flattened.fontFamily.includes('600')));

  const targetFont =
    typeof flattened.fontFamily === 'string'
      ? flattened.fontFamily
      : isBold
      ? 'GoogleSansFlex_700Bold'
      : 'GoogleSansFlex_400Regular';

  return (
    <RNText style={[styles.defaultSans, style]} {...restProps}>
      {formatRupeeNodes(children, isBold, [
        { fontFamily: targetFont },
        typeof flattened.fontSize === 'number' ? { fontSize: flattened.fontSize } : null,
        rupeeStyle,
      ])}
    </RNText>
  );
}

const styles = StyleSheet.create({
  defaultSans: {
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  rupeeRegular: {
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  rupeeBold: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
});

export default RupeeText;
