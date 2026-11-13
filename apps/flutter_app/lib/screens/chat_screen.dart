import 'dart:async';

import 'package:flutter/material.dart';

import '../crypto/e2ee_service.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/avatar.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.services, required this.summary});

  final AppServices services;
  final ChatSummary summary;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _draft = TextEditingController();
  final _scroll = ScrollController();
  List<Message> _messages = const [];
  bool _loading = true;
  bool _sending = false;
  Timer? _poll;
  StreamSubscription<Message>? _incoming;

  AppServices get s => widget.services;
  Chat get chat => widget.summary.chat;
  String get me => s.api.currentUser!.id;

  static const _refusals = {
    'BLOCKED': 'One of you has blocked the other.',
    'NOT_A_CHAT_MEMBER': 'You are not a member of this chat.',
    'INVALID_CONTENT': 'The message is too large.',
    'NOT_AUTHENTICATED': 'Your session expired. Please sign in again.',
  };

  @override
  void initState() {
    super.initState();
    s.e2ee.addListener(_refresh);
    _incoming = s.socket.messages.where((m) => m.chatId == chat.id).listen(_onIncoming);
    unawaited(s.socket.joinChat(chat.id));
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 4), (_) => unawaited(_load(quiet: true)));
  }

  @override
  void dispose() {
    s.e2ee.removeListener(_refresh);
    _incoming?.cancel();
    _poll?.cancel();
    _draft.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  void _onIncoming(Message m) {
    if (_messages.any((x) => x.id == m.id)) return;
    setState(() => _messages = [..._messages, m]);
    unawaited(s.e2ee.decryptAll([m]));
    if (m.senderId != me) unawaited(_markRead([m.id]));
  }

  Future<void> _load({bool quiet = false}) async {
    try {
      final list = ((await s.api.get('/messages/${chat.id}')) as List).map((e) => Message.fromJson(e as Map<String, dynamic>)).toList();
      if (!mounted) return;
      final changed = list.length != _messages.length ||
          (list.isNotEmpty && (list.last.id != _messages.last.id || list.last.readBy.length != _messages.last.readBy.length));
      if (changed || _loading) setState(() => _messages = list);
      _loading = false;
      // Newest first, so the visible part of the chat is readable quickly.
      unawaited(s.e2ee.decryptAll(list.reversed.take(200).toList()));
      final unread = list.where((m) => m.senderId != me && !m.readBy.contains(me)).map((m) => m.id).toList();
      if (unread.isNotEmpty) unawaited(_markRead(unread));
    } catch (e) {
      if (!mounted) return;
      if (_loading) setState(() => _loading = false);
      if (!quiet) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not load messages: $e')));
    }
  }

  Future<void> _markRead(List<String> ids) async {
    final r = await s.socket.emitAck('mark_read', {'chatId': chat.id, 'userId': me, 'messageIds': ids});
    if (r == null) {
      try {
        await s.api.post('/messages/${chat.id}/read', {'userId': me, 'messageIds': ids});
      } catch (_) {}
    }
  }

  Future<void> _send() async {
    final text = _draft.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final content = await s.e2ee.encryptFor(chat, text);
      final payload = {'chatId': chat.id, 'senderId': me, 'encryptedContent': content, 'messageType': 'TEXT'};
      final ack = await s.socket.emitAck('send_message', payload);
      if (ack != null && ack['ok'] == false) {
        final why = ack['error']?.toString() ?? '';
        throw Exception(_refusals[why] ?? 'Refused by the server ($why).');
      }
      if (ack == null) await s.api.post('/messages', payload); // socket offline or slow: send over HTTPS
      _draft.clear();
      await _load(quiet: true);
      _scrollToEnd();
    } on MissingKeysError catch (e) {
      _toast(e.toString());
    } catch (e) {
      _toast('Not sent: ${e.toString().replaceFirst('Exception: ', '')}');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toast(String msg) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  Future<void> _showSecurity() async {
    final peer = widget.summary.peer;
    String? code;
    String? error;
    try {
      if (peer != null) code = await s.e2ee.safetyCodeFor(chat.id, peer.id);
    } catch (e) {
      error = e.toString();
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('End-to-end encrypted'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Messages in this chat are encrypted on this phone and can only be read on your and the other person\'s devices. The server cannot read them.'),
          const SizedBox(height: 16),
          if (code != null) ...[
            Text('Security code with ${peer!.name}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            SelectableText(code, style: const TextStyle(fontFamily: 'monospace', fontSize: 15, height: 1.5)),
            const SizedBox(height: 8),
            const Text('Compare this code with the one on the other person\'s phone or the web app. If they match, nobody is listening in.', style: TextStyle(fontSize: 13)),
          ] else
            Text(error ?? 'Security codes are available in one-to-one chats.'),
          const SizedBox(height: 12),
          Text('This phone: ${s.e2ee.deviceId ?? 'not set up'}', style: const TextStyle(fontSize: 12)),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final peer = widget.summary.peer;
    final items = _messages.reversed.toList();
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          UserAvatar(api: s.api, user: peer, radius: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.summary.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
              const Text('🔒 End-to-end encrypted', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
            ]),
          ),
        ]),
        actions: [IconButton(tooltip: 'Encryption and security code', icon: const Icon(Icons.verified_user_outlined), onPressed: _showSecurity)],
      ),
      body: Column(children: [
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : items.isEmpty
                  ? Center(child: Text('No messages yet. Say hello!', style: TextStyle(color: scheme.onSurfaceVariant)))
                  : ListView.builder(
                      controller: _scroll,
                      reverse: true,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                      itemCount: items.length,
                      itemBuilder: (context, i) => _Bubble(message: items[i], mine: items[i].senderId == me, text: s.e2ee.view(items[i].encryptedContent), peerId: peer?.id),
                    ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: TextField(
                  controller: _draft,
                  minLines: 1,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'Message',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Send',
                onPressed: _sending ? null : _send,
                icon: _sending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine, required this.text, this.peerId});

  final Message message;
  final bool mine;
  final MessageText text;
  final String? peerId;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = mine ? (dark ? Verdant.brand600 : Verdant.cta) : (dark ? Verdant.darkSurface2 : Verdant.surface);
    final fg = mine ? Verdant.onCta : (dark ? Verdant.darkInk900 : Verdant.ink900);
    final dim = text.state == TextState.pending || text.state == TextState.unreadable || text.state == TextState.rejected;
    final read = peerId != null && message.readBy.contains(peerId);
    final delivered = peerId != null && message.deliveredTo.contains(peerId);
    final hasAttachment = message.attachmentUrl != null && message.messageType != 'TEXT';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(mine ? 16 : 4),
              bottomRight: Radius.circular(mine ? 4 : 16),
            ),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
            if (hasAttachment)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  message.messageType == 'AUDIO' ? '🎤 Voice message — play it in the web app for now' : '📎 ${message.fileName ?? 'Attachment'} — open it in the web app for now',
                  style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 13, fontStyle: FontStyle.italic),
                ),
              ),
            Text(text.text, style: TextStyle(color: dim ? fg.withValues(alpha: 0.7) : fg, fontSize: 15.5, fontStyle: dim ? FontStyle.italic : null)),
            const SizedBox(height: 2),
            Row(mainAxisSize: MainAxisSize.min, children: [
              if (text.state == TextState.unverified) Icon(Icons.gpp_maybe_outlined, size: 13, color: fg.withValues(alpha: 0.7)),
              Text(formatTime(message.createdAt), style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 11)),
              if (mine) ...[
                const SizedBox(width: 4),
                Icon(read || delivered ? Icons.done_all : Icons.done, size: 14, color: read ? Verdant.tile300 : fg.withValues(alpha: 0.7)),
              ],
            ]),
          ]),
        ),
      ),
    );
  }
}
