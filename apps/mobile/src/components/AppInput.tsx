import React from "react";
import { StyleSheet, TextInput, TextInputProps } from "react-native";

export function AppInput(props: TextInputProps) {
  return <TextInput {...props} style={styles.input} placeholderTextColor="#8A94A6" />;
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#111827",
    color: "#FFFFFF",
    borderColor: "#1F2937",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
});

