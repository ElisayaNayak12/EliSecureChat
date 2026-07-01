import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function SecureHeader(props: { title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{props.title}</Text>
      {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#0B1220",
    borderBottomColor: "#1F2937",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 20,
  },
  subtitle: {
    color: "#8A94A6",
    marginTop: 2,
  },
});

