import React, { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet } from "react-native";
import { ChatBubble } from "../components/ChatBubble";
import { MessageInput } from "../components/MessageInput";
import { SecureHeader } from "../components/SecureHeader";
import { useSecureScreen } from "../hooks/useSecureScreen";
import { decryptMessage, encryptMessage } from "../services/encryption";
import { socket } from "../services/socket";
import { Message } from "../types/chat";

const CHAT_ID = "demo-chat";
const USER_ID = "demo-user";

export function SecretChatScreen() {
  useSecureScreen(true);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    socket.connect();
    socket.emit("join_chat", { chatId: CHAT_ID });
    socket.on("receive_message", async (message: Message) => {
      setMessages((prev) => [
        ...prev,
        {
          ...message,
          plainText: await decryptMessage(CHAT_ID, message.encryptedContent),
        },
      ]);
    });

    return () => {
      socket.off("receive_message");
      socket.disconnect();
    };
  }, []);

  async function sendMessage(text: string) {
    const encrypted = await encryptMessage(CHAT_ID, text);
    socket.emit("send_message", {
      chatId: CHAT_ID,
      senderId: USER_ID,
      ...encrypted,
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <SecureHeader title="Secret Chat" subtitle="End-to-end encrypted. Screenshot block enabled." />
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} mine={item.senderId === USER_ID} />}
      />
      <MessageInput onSend={sendMessage} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#060B14",
  },
});

