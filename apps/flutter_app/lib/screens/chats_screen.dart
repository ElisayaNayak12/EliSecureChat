import 'dart:async';

import 'package:flutter/material.dart';

import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/avatar.dart';
import 'chat_screen.dart';
import '../rich_text.dart';
import 'settings_screen.dart';

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key, required this.services, this.startupWarning});

  final AppServices services;
  final String? startupWarning;

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  List<ChatSummary> _chats = const [];
  bool _loading = true;
  String? _error;
  Timer? _poll;
  StreamSubscription<Message>? _incoming;

  AppServices get s => widget.services;

  @override
  void initState() {
    super.initState();
    s.e2ee.addListener(_onDecrypted);
    _incoming = s.socket.messages.listen((_) => unawaited(_load()));
    unawaited(_load());
    // Fallback refresh; live updates arrive over the socket.
    _poll = Timer.periodic(const Duration(seconds: 6), (_) => unawaited(_load(quiet: true)));
    if (widget.startupWarning != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(widget.startupWarning!)));
      });
    }
  }

  @override
  void dispose() {
    s.e2ee.removeListener(_onDecrypted);
    _incoming?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  void _onDecrypted() {
    if (mounted) setState(() {});
  }

  Future<void> _load({bool quiet = false}) async {
    final me = s.api.currentUser;
    if (me == null) return;
    try {
      final list = ((await s.api.get('/chats/summaries?userId=${Uri.encodeQueryComponent(me.id)}')) as List)
          .map((e) => ChatSummary.fromJson(e as Map<String, dynamic>))
          .toList();
      if (!mounted) return;
      setState(() {
        _chats = list;
        _loading = false;
        _error = null;
      });
      for (final c in list) {
        unawaited(s.socket.joinChat(c.chat.id)); // receive live messages for every chat
      }
      unawaited(s.e2ee.decryptAll([for (final c in list) if (c.lastMessage != null) c.lastMessage!]));
    } catch (e) {
      if (!mounted || quiet) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _open(ChatSummary summary) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatScreen(services: s, summary: summary)));
    unawaited(_load(quiet: true));
  }

  Future<void> _newChat() async {
    final peer = await showModalBottomSheet<AppUser>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _UserSearchSheet(services: s),
    );
    if (peer == null || !mounted) return;
    final me = s.api.currentUser!;
    final existing = _chats.where((c) => c.chat.type == 'ONE_TO_ONE' && c.peer?.id == peer.id).toList();
    if (existing.isNotEmpty) return _open(existing.first);
    try {
      final chat = Chat.fromJson(await s.api.post('/chats', {'type': 'ONE_TO_ONE', 'memberIds': [me.id, peer.id]}) as Map<String, dynamic>);
      if (!mounted) return;
      await _open(ChatSummary(chat: chat, peer: peer));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start the chat: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chats', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SettingsScreen(services: s))),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'New chat',
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        onPressed: _newChat,
        child: const Icon(Icons.chat_outlined),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null && _chats.isEmpty
                ? ListView(children: [
                    const SizedBox(height: 120),
                    Icon(Icons.cloud_off_outlined, size: 40, color: scheme.onSurfaceVariant),
                    const SizedBox(height: 12),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 32), child: Text(_error!, textAlign: TextAlign.center)),
                    TextButton(onPressed: _load, child: const Text('Try again')),
                  ])
                : _chats.isEmpty
                    ? ListView(children: [
                        const SizedBox(height: 120),
                        Icon(Icons.forum_outlined, size: 44, color: scheme.onSurfaceVariant),
                        const SizedBox(height: 12),
                        const Text('No chats yet', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text('Tap the button to start one.', textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
                      ])
                    : ListView.separated(
                        itemCount: _chats.length,
                        separatorBuilder: (_, _) => const Divider(height: 1, indent: 76),
                        itemBuilder: (context, i) {
                          final c = _chats[i];
                          final last = c.lastMessage;
                          final preview = last == null ? 'No messages yet' : displayText(s.e2ee.view(last.encryptedContent).text);
                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            leading: UserAvatar(api: s.api, user: c.peer),
                            title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text(
                              last != null && last.senderId == s.api.currentUser?.id ? 'You: $preview' : preview,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                              if (last != null) Text(formatTime(last.createdAt), style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                              if (c.unreadCount > 0) ...[
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(color: Verdant.tile500, borderRadius: BorderRadius.circular(10)),
                                  child: Text('${c.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                                ),
                              ],
                            ]),
                            onTap: () => _open(c),
                          );
                        },
                      ),
      ),
    );
  }
}

class _UserSearchSheet extends StatefulWidget {
  const _UserSearchSheet({required this.services});
  final AppServices services;

  @override
  State<_UserSearchSheet> createState() => _UserSearchSheetState();
}

class _UserSearchSheetState extends State<_UserSearchSheet> {
  List<AppUser> _results = const [];
  bool _busy = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _search(String q) async {
    setState(() => _busy = true);
    try {
      final me = widget.services.api.currentUser?.id;
      final list = ((await widget.services.api.get('/users/search?q=${Uri.encodeQueryComponent(q)}')) as List)
          .map((e) => AppUser.fromJson(e as Map<String, dynamic>))
          .where((u) => u.id != me)
          .toList();
      if (mounted) setState(() => _results = list);
    } catch (_) {
      if (mounted) setState(() => _results = const []);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(hintText: 'Search by name or phone', prefixIcon: Icon(Icons.search)),
              onChanged: (q) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 300), () => _search(q.trim()));
              },
            ),
          ),
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, i) {
                final u = _results[i];
                return ListTile(
                  leading: UserAvatar(api: widget.services.api, user: u, radius: 20),
                  title: Text(u.name),
                  subtitle: u.phone != null ? Text(u.phone!) : null,
                  onTap: () => Navigator.of(context).pop(u),
                );
              },
            ),
          ),
        ]),
      ),
    );
  }
}
