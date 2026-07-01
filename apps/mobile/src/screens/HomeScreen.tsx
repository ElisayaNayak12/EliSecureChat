import React from "react";
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { ChatPreview } from "../types/chat";

const DATA: ChatPreview[] = [
  {
    id: "1",
    title: "John Secret",
    subtitle: "Tap to open encrypted chat",
    unread: 2,
    isPrivate: true,
  },
];

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Chats</Text>
      <FlatList
        data={DATA}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.item}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>S</Text>
            </View>
            <View style={styles.meta}>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
            {item.unread > 0 ? <Text style={styles.badge}>{item.unread}</Text> : null}
          </Pressable>
        )}
      />
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
    fontWeight: "900",
    fontSize: 30,
    marginBottom: 10,
  },
  item: {
    backgroundColor: "#0B1220",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  meta: {
    flex: 1,
  },
  name: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  subtitle: {
    color: "#8A94A6",
    fontSize: 12,
  },
  badge: {
    color: "#FFFFFF",
    backgroundColor: "#2F80ED",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
});

