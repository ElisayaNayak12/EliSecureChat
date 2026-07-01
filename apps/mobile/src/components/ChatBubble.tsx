import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Message } from "../types/chat";

export function ChatBubble(props: { message: Message; mine: boolean }) {
  return (
    <View style={[styles.row, props.mine ? styles.right : styles.left]}>
      <View style={[styles.bubble, props.mine ? styles.mine : styles.theirs]}>
        <Text style={styles.text}>{props.message.plainText ?? "Encrypted message"}</Text>
        {props.message.isEdited ? <Text style={styles.meta}>edited</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  left: {
    alignItems: "flex-start",
  },
  right: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    backgroundColor: "#2F80ED",
  },
  theirs: {
    backgroundColor: "#1F2937",
  },
  text: {
    color: "#FFFFFF",
  },
  meta: {
    color: "#D1D5DB",
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
});

