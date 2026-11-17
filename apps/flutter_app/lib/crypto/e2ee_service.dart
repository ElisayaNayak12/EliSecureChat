import 'dart:convert';
import 'dart:isolate';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../models.dart';
import 'envelope.dart';

class MissingKeysError implements Exception {
  MissingKeysError(this.userIds);
  final List<String> userIds;
  @override
  String toString() => 'The other person has not opened the app since encryption was enabled, so a secure message cannot be sent yet.';
}

enum TextState { legacy, verified, unverified, pending, unreadable, rejected }

class MessageText {
  const MessageText(this.text, this.state);
  final String text;
  final TextState state;
}

/// One device's end-to-end encryption, compatible with the web app: keys live only on this phone (in Android's
/// encrypted storage); the server only stores public keys and opaque envelopes.
class E2eeService extends ChangeNotifier {
  E2eeService(this.api);

  final ApiClient api;
  static const _storage = FlutterSecureStorage();

  DeviceKeys? _keys;
  List<DeviceKeys> _retired = const [];
  String? _userId;
  final Map<String, MessageText> _results = {};
  final Set<String> _inflight = {};
  final Map<String, ({DateTime at, List<PublicDevice> devices})> _chatDevices = {};

  bool get ready => _keys != null;
  String? get deviceId => _keys?.deviceId;

  String _storeKey(String userId) => 'sc_e2ee_keys_$userId';

  /// Loads (or creates) this phone's keys and registers the public half with the server.
  Future<void> init(String userId) async {
    if (_userId == userId && _keys != null) return;
    final raw = await _storage.read(key: _storeKey(userId));
    DeviceKeys keys;
    var retired = <DeviceKeys>[];
    if (raw != null) {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      keys = DeviceKeys.fromJson(j['keys'] as Map<String, dynamic>);
      retired = ((j['retired'] as List?) ?? const []).map((e) => DeviceKeys.fromJson(e as Map<String, dynamic>)).toList();
    } else {
      keys = await _generateKeys();
      await _save(userId, keys, retired);
    }
    try {
      await _register(keys);
    } on ApiException catch (e) {
      // Signed out remotely or pushed out by the device limit: start a new device identity, keep old keys for history.
      if (!(e.status == 409 && (e.message.contains('DEVICE_REVOKED') || e.message.contains('DEVICE_ID_TAKEN')))) rethrow;
      retired = [...retired, keys];
      if (retired.length > 5) retired = retired.sublist(retired.length - 5);
      keys = await _generateKeys();
      await _save(userId, keys, retired);
      await _register(keys);
    }
    _userId = userId;
    _keys = keys;
    _retired = retired;
    _results.clear();
    notifyListeners();
  }

  void reset() {
    _keys = null;
    _userId = null;
    _retired = const [];
    _results.clear();
    _chatDevices.clear();
    notifyListeners();
  }

  Future<void> _save(String userId, DeviceKeys keys, List<DeviceKeys> retired) =>
      _storage.write(key: _storeKey(userId), value: jsonEncode({'keys': keys.toJson(), 'retired': retired.map((k) => k.toJson()).toList()}));

  Future<void> _register(DeviceKeys keys) =>
      api.post('/keys/devices', {'deviceId': keys.deviceId, 'agreementKey': keys.agreementKey, 'signingKey': keys.signingKey, 'label': 'Android app'});

  Future<List<PublicDevice>> devicesFor(String chatId, {Duration maxAge = const Duration(seconds: 30)}) async {
    final hit = _chatDevices[chatId];
    if (hit != null && DateTime.now().difference(hit.at) < maxAge) return hit.devices;
    final list = ((await api.get('/keys/chats/$chatId')) as List).map((e) => PublicDevice.fromJson(e as Map<String, dynamic>)).toList();
    _chatDevices[chatId] = (at: DateTime.now(), devices: list);
    return list;
  }

  /// Encrypts for every active device of every member (never falls back to plaintext).
  Future<String> encryptFor(Chat chat, String plaintext) async {
    final keys = _keys;
    final me = _userId;
    if (keys == null || me == null) throw StateError('Encryption is not ready on this device.');
    final devices = (await devicesFor(chat.id, maxAge: Duration.zero)).where((d) => !d.revoked).toList();
    final missing = chat.memberIds.where((id) => id != me && !devices.any((d) => d.userId == id)).toList();
    if (missing.isNotEmpty) throw MissingKeysError(missing);
    final recipients = devices.any((d) => d.deviceId == keys.deviceId)
        ? devices
        : [...devices, PublicDevice(deviceId: keys.deviceId, userId: me, agreementKey: keys.agreementKey, signingKey: keys.signingKey)];
    final content = await _encrypt(plaintext, chat.id, me, keys, recipients);
    _results[content] = MessageText(plaintext, TextState.verified);
    return content;
  }

  /// Synchronous read for rendering.
  MessageText view(String content) {
    if (!content.startsWith(envelopePrefix)) return MessageText(legacyDecode(content), TextState.legacy);
    return _results[content] ?? const MessageText('🔒 Decrypting…', TextState.pending);
  }

  /// Decrypts not-yet-seen envelopes in a background isolate (P-256 in pure Dart is too slow for the UI thread).
  Future<void> decryptAll(List<Message> messages) async {
    final keys = _keys;
    if (keys == null) return;
    final todo = messages.where((m) => m.encryptedContent.startsWith(envelopePrefix) && !_results.containsKey(m.encryptedContent) && !_inflight.contains(m.encryptedContent)).toList();
    if (todo.isEmpty) return;
    for (final m in todo) {
      _inflight.add(m.encryptedContent);
    }
    try {
      final jobs = <_Job>[];
      for (final m in todo) {
        final env = parseEnvelope(m.encryptedContent);
        String? signingKey;
        if (env != null) {
          var devices = await devicesFor(m.chatId);
          var sender = _findDevice(devices, env['sd'], m.senderId);
          if (sender == null) {
            devices = await devicesFor(m.chatId, maxAge: Duration.zero); // a new device may have joined
            sender = _findDevice(devices, env['sd'], m.senderId);
          }
          signingKey = sender?.signingKey;
        }
        jobs.add((content: m.encryptedContent, chatId: m.chatId, senderId: m.senderId, signingKey: signingKey));
      }
      final results = await _decryptBatch(jobs, [keys, ..._retired]);
      for (var i = 0; i < jobs.length; i++) {
        _results[jobs[i].content] = results[i];
      }
    } catch (_) {
      // Network trouble while looking up keys: leave them pending; the next refresh retries.
    } finally {
      for (final m in todo) {
        _inflight.remove(m.encryptedContent);
      }
      notifyListeners();
    }
  }

  /// 60-digit code to compare with the other person (identical to the web app's).
  Future<String?> safetyCodeFor(String chatId, String peerId) async {
    final me = _userId;
    if (me == null) return null;
    final devices = await devicesFor(chatId, maxAge: Duration.zero);
    List<String> keysOf(String uid) => devices.where((d) => d.userId == uid && !d.revoked).map((d) => d.signingKey).toList();
    final a = keysOf(me), b = keysOf(peerId);
    return _safety(me, a, peerId, b);
  }
}

// ---- Background-isolate helpers. Top-level on purpose: their closures capture only these plain arguments
// (a closure inside an instance method could capture `this`, which cannot be sent to another isolate).

PublicDevice? _findDevice(List<PublicDevice> devices, Object? deviceId, String userId) {
  for (final d in devices) {
    if (d.deviceId == deviceId && d.userId == userId) return d;
  }
  return null;
}

typedef _Job = ({String content, String chatId, String senderId, String? signingKey});

Future<DeviceKeys> _generateKeys() => Isolate.run(() => DeviceKeys.generate(_uuid()));

Future<String> _encrypt(String plaintext, String chatId, String senderId, DeviceKeys sender, List<PublicDevice> recipients) =>
    Isolate.run(() => encryptEnvelope(plaintext: plaintext, chatId: chatId, senderId: senderId, sender: sender, recipients: recipients));

Future<List<MessageText>> _decryptBatch(List<_Job> jobs, List<DeviceKeys> keys) =>
    Isolate.run(() => [for (final j in jobs) _decryptOne(j.content, j.chatId, j.senderId, j.signingKey, keys)]);

Future<String> _safety(String userA, List<String> keysA, String userB, List<String> keysB) =>
    Isolate.run(() => safetyCode(userA: userA, keysA: keysA, userB: userB, keysB: keysB));

MessageText _decryptOne(String content, String chatId, String senderId, String? signingKey, List<DeviceKeys> keys) {
  final env = parseEnvelope(content);
  if (env == null) return const MessageText('⚠️ This message is damaged.', TextState.rejected);
  final slots = env['keys'];
  final me = keys.firstWhere((k) => slots is Map && slots.containsKey(k.deviceId), orElse: () => keys.first);
  final r = decryptEnvelope(envelope: env, chatId: chatId, senderId: senderId, me: me, senderSigningKey: signingKey);
  if (r.ok) return MessageText(r.text!, r.verified ? TextState.verified : TextState.unverified);
  return switch (r.failure) {
    DecryptFailure.notForThisDevice => const MessageText("🔒 This message was sent before this phone was set up, so it can't be read here.", TextState.unreadable),
    _ => const MessageText('⚠️ This message failed its security check and was hidden.', TextState.rejected),
  };
}

String _uuid() {
  final b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}
