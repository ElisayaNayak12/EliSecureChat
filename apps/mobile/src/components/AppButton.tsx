import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

export function AppButton(props: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={props.onPress}>
      <Text style={styles.text}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});

