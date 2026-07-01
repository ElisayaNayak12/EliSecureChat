import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export function SettingsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.item}>
        <Text style={styles.label}>Fingerprint lock</Text>
        <Text style={styles.value}>Enabled</Text>
      </View>
      <View style={styles.item}>
        <Text style={styles.label}>Screenshot block</Text>
        <Text style={styles.value}>Enabled</Text>
      </View>
      <View style={styles.item}>
        <Text style={styles.label}>Encryption mode</Text>
        <Text style={styles.value}>E2EE (placeholder)</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#060B14",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 14,
  },
  item: {
    backgroundColor: "#0B1220",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    color: "#FFFFFF",
  },
  value: {
    color: "#60A5FA",
    fontWeight: "700",
  },
});

