import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';

export interface NumberedTextProps extends TextProps {
  children?: React.ReactNode;
  style?: TextStyle | (TextStyle | undefined | false)[];
  monoFont?: string;
  sansFont?: string;
  monoStyle?: TextStyle;
}

export function NumberedText({
  children,
  style,
  monoFont = 'SpaceMono_700Bold',
  sansFont,
  monoStyle,
  ...props
}: NumberedTextProps) {
  if (typeof children !== 'string' && typeof children !== 'number') {
    return (
      <Text style={style} {...props}>
        {children}
      </Text>
    );
  }

  const str = String(children);
  // Match contiguous groups of digits, currency symbols, and numerical punctuation
  const regex = /([₹$€£%+\-]?\d+(?:[.,]\d+)*(?:\s*-\s*\d+)?%?)/g;
  const parts: { text: string; isNum: boolean }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: str.substring(lastIdx, match.index), isNum: false });
    }
    parts.push({ text: match[0], isNum: true });
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < str.length) {
    parts.push({ text: str.substring(lastIdx), isNum: false });
  }

  return (
    <Text style={style} {...props}>
      {parts.map((part, idx) => {
        if (part.isNum) {
          return (
            <Text
              key={idx}
              style={[
                { fontFamily: monoFont },
                monoStyle,
              ]}
            >
              {part.text}
            </Text>
          );
        }

        return (
          <Text key={idx} style={sansFont ? { fontFamily: sansFont } : undefined}>
            {part.text}
          </Text>
        );
      })}
    </Text>
  );
}
