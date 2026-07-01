export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  encryptedContent: string;
  plainText?: string;
  createdAt: string;
  editedAt?: string;
  isEdited?: boolean;
};

export type ChatPreview = {
  id: string;
  title: string;
  subtitle: string;
  unread: number;
  isPrivate?: boolean;
};

