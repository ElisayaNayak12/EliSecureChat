import React, { useState } from "react";
import { SafeAreaView, StyleSheet, Text } from "react-native";
import { AppButton } from "../components/AppButton";
import { unlockWithBiometric } from "../services/biometric";

export function BiometricLockScreen() {
  const [status, setStatus] = useState("Locked");

  async function unlock() {
    const ok = await unlockWithBiometric();
    setStatus(ok ? "Unlocked" : "Unlock failed");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Unlock Secret Chat</Text>
      <AppButton title="Unlock with Fingerprint" onPress={unlock} />
      <Text style={styles.status}>{status}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#060B14",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  title: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 20,
  },
  status: {
    color: "#8A94A6",
    textAlign: "center",
    marginTop: 12,
  },
});

