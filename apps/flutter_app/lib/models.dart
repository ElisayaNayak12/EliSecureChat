/// Data shapes returned by the EliSecureChat backend (same as the web app's types.ts).
class AppUser {
  const AppUser({required this.id, required this.name, this.phone, this.avatarUrl, this.lastSeenAt});

  final String id;
  final String name;
  final String? phone;
  final String? avatarUrl;
  final String? lastSeenAt;

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? 'Unknown',
        phone: j['phone'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
        lastSeenAt: j['lastSeenAt'] as String?,
      );

  String get initials {
    // Only words that start with a letter or digit, so "Asha (Deaf, ISL)" gives "AD", not "A(".
    final parts = name.trim().split(RegExp(r'\s+')).map((p) => p.replaceFirst(RegExp(r'^[^\p{L}\p{N}]+', unicode: true), '')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first[0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
  }
}

class Chat {
  const Chat({required this.id, required this.type, required this.memberIds, this.title});

  final String id;
  final String type;
  final List<String> memberIds;
  final String? title;

  factory Chat.fromJson(Map<String, dynamic> j) => Chat(
        id: j['id'] as String,
        type: (j['type'] as String?) ?? 'ONE_TO_ONE',
        memberIds: ((j['memberIds'] as List?) ?? const []).cast<String>(),
        title: j['title'] as String?,
      );
}

class Message {
  const Message({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.encryptedContent,
    required this.messageType,
    required this.createdAt,
    this.readBy = const [],
    this.deliveredTo = const [],
    this.attachmentUrl,
    this.fileName,
    this.mimeType,
  });

  final String id;
  final String chatId;
  final String senderId;
  final String encryptedContent;
  final String messageType;
  final DateTime createdAt;
  final List<String> readBy;
  final List<String> deliveredTo;
  final String? attachmentUrl;
  final String? fileName;
  final String? mimeType;

  factory Message.fromJson(Map<String, dynamic> j) => Message(
        id: j['id'] as String,
        chatId: j['chatId'] as String,
        senderId: j['senderId'] as String,
        encryptedContent: (j['encryptedContent'] as String?) ?? '',
        messageType: (j['messageType'] as String?) ?? 'TEXT',
        createdAt: DateTime.tryParse((j['createdAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
        readBy: ((j['readBy'] as List?) ?? const []).cast<String>(),
        deliveredTo: ((j['deliveredTo'] as List?) ?? const []).cast<String>(),
        attachmentUrl: j['attachmentUrl'] as String?,
        fileName: j['fileName'] as String?,
        mimeType: j['mimeType'] as String?,
      );
}

class ChatSummary {
  const ChatSummary({required this.chat, this.peer, this.lastMessage, this.unreadCount = 0});

  final Chat chat;
  final AppUser? peer;
  final Message? lastMessage;
  final int unreadCount;

  factory ChatSummary.fromJson(Map<String, dynamic> j) => ChatSummary(
        chat: Chat.fromJson(j['chat'] as Map<String, dynamic>),
        peer: j['peer'] is Map<String, dynamic> ? AppUser.fromJson(j['peer'] as Map<String, dynamic>) : null,
        lastMessage: j['lastMessage'] is Map<String, dynamic> ? Message.fromJson(j['lastMessage'] as Map<String, dynamic>) : null,
        unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
      );

  String get title => peer?.name ?? chat.title ?? 'Chat';
}
