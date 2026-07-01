import React, { useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { api } from "../services/api";

export function LoginScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  async function login() {
    const result = await api<{ accessToken: string }>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ name, phone, email }),
    });
    setStatus(`Logged in. token=${result.accessToken.slice(0, 16)}...`);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Secret Chat</Text>
        <Text style={styles.subtitle}>Private. Encrypted. Secure.</Text>
        <AppInput placeholder="Name" value={name} onChangeText={setName} />
        <AppInput placeholder="Mobile number" value={phone} onChangeText={setPhone} />
        <AppInput placeholder="Email" value={email} onChangeText={setEmail} />
        <AppButton title="Continue Securely" onPress={login} />
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#060B14",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: "#0B1220",
    borderRadius: 20,
    padding: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
  },
  subtitle: {
    color: "#8A94A6",
    marginBottom: 16,
  },
  status: {
    marginTop: 12,
    color: "#A7F3D0",
    fontSize: 12,
  },
});

