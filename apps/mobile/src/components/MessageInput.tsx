import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function MessageInput(props: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Secret message"
        placeholderTextColor="#8A94A6"
      />
      <Pressable
        style={styles.send}
        onPress={() => {
          const text = value.trim();
          if (!text) return;
          props.onSend(text);
          setValue("");
        }}
      >
        <Text style={styles.sendText}>Send</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#0B1220",
  },
  input: {
    flex: 1,
    backgroundColor: "#111827",
    color: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  send: {
    marginLeft: 8,
    backgroundColor: "#2F80ED",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});

