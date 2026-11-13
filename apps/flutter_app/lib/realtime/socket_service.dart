import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../api/api_client.dart';
import '../models.dart';

/// Realtime connection to the backend's /chat namespace. Authenticated with the access token on every
/// (re)connect; on `auth_error` the token is refreshed and the socket reconnects.
class SocketService {
  SocketService(this.api);

  final ApiClient api;
  io.Socket? _socket;
  final Set<String> _joined = {};
  final _messages = StreamController<Message>.broadcast();
  final _connected = StreamController<bool>.broadcast();

  Stream<Message> get messages => _messages.stream;
  Stream<bool> get connection => _connected.stream;
  bool get isConnected => _socket?.connected ?? false;

  void connect() {
    _socket?.dispose();
    final s = io.io(
      '${api.server}/chat',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/socket.io')
          .disableAutoConnect()
          .enableForceNew()
          .enableReconnection()
          .setAuthFn((cb) => cb({'token': api.accessToken ?? ''}))
          .build(),
    );
    s.onConnect((_) {
      _connected.add(true);
      final me = api.currentUser?.id;
      if (me != null) unawaited(emitAck('register_presence', {'userId': me}));
      final rooms = _joined.toList();
      _joined.clear();
      for (final chatId in rooms) {
        unawaited(joinChat(chatId));
      }
    });
    s.onDisconnect((_) => _connected.add(false));
    s.on('auth_error', (_) async {
      if (await api.refreshSession()) {
        s.disconnect();
        s.connect();
      }
    });
    s.on('receive_message', (data) {
      if (data is Map) _messages.add(Message.fromJson(Map<String, dynamic>.from(data)));
    });
    _socket = s;
    s.connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _joined.clear();
  }

  Future<void> joinChat(String chatId) async {
    if (_joined.contains(chatId)) return;
    final r = await emitAck('join_chat', {'chatId': chatId});
    if (r?['ok'] == true) _joined.add(chatId);
  }

  /// Emits with an acknowledgement. Returns the server's reply, or null on timeout / when offline.
  Future<Map<String, dynamic>?> emitAck(String event, Map<String, dynamic> payload, {Duration timeout = const Duration(seconds: 5)}) {
    final s = _socket;
    if (s == null || !s.connected) return Future.value(null);
    final done = Completer<Map<String, dynamic>?>();
    final timer = Timer(timeout, () {
      if (!done.isCompleted) done.complete(null);
    });
    s.emitWithAck(event, payload, ack: (dynamic data, [dynamic _]) {
      timer.cancel();
      if (!done.isCompleted) done.complete(data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{'ok': true});
    });
    return done.future;
  }
}
