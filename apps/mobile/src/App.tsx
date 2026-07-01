import React, { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { BiometricLockScreen } from "./screens/BiometricLockScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { SecretChatScreen } from "./screens/SecretChatScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

type Screen = "login" | "lock" | "home" | "chat" | "settings";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {screen === "login" ? <LoginScreen /> : null}
        {screen === "lock" ? <BiometricLockScreen /> : null}
        {screen === "home" ? <HomeScreen /> : null}
        {screen === "chat" ? <SecretChatScreen /> : null}
        {screen === "settings" ? <SettingsScreen /> : null}
      </View>
      <View style={styles.nav}>
        <Tab label="Login" onPress={() => setScreen("login")} />
        <Tab label="Lock" onPress={() => setScreen("lock")} />
        <Tab label="Home" onPress={() => setScreen("home")} />
        <Tab label="Chat" onPress={() => setScreen("chat")} />
        <Tab label="Settings" onPress={() => setScreen("settings")} />
      </View>
    </SafeAreaView>
  );
}

function Tab(props: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.tab} onPress={props.onPress}>
      <Text style={styles.tabText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#02060F",
  },
  content: {
    flex: 1,
  },
  nav: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    borderTopColor: "#1F2937",
    borderTopWidth: 1,
    backgroundColor: "#0B1220",
  },
  tab: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    margin: 4,
  },
  tabText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});

