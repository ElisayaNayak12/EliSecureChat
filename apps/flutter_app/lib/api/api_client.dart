import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';

/// Default server, set at build time: flutter build apk --dart-define=SERVER_URL=https://chat.example.com
/// (10.0.2.2 is the PC running the backend, as seen from the Android emulator).
const String kDefaultServer = String.fromEnvironment('SERVER_URL', defaultValue: 'http://10.0.2.2:3000');

class ApiException implements Exception {
  ApiException(this.status, this.message, [this.field]);
  final int status;
  final String message;
  /// Form field the error is about (sign-up: name, phone, email, password, sms).
  final String? field;
  @override
  String toString() => message;
}

/// Talks to the backend as a "native" client: the short-lived access token stays in memory; the refresh token
/// is kept in Android's encrypted storage (Keystore-backed) and rotated on every refresh.
class ApiClient {
  ApiClient._(this.server);

  static const _refreshKey = 'sc_refresh_token';
  static const _serverKey = 'sc_server_url';
  static const _storage = FlutterSecureStorage();

  String server;
  String? _accessToken;
  AppUser? currentUser;
  Future<bool>? _refreshing;
  Timer? _renewTimer;

  /// Fires when the session ends (signed out here, revoked elsewhere, or expired).
  final StreamController<void> sessionEnded = StreamController<void>.broadcast();

  String? get accessToken => _accessToken;

  static Future<ApiClient> create() async {
    final prefs = await SharedPreferences.getInstance();
    return ApiClient._(normalizeServer(prefs.getString(_serverKey) ?? kDefaultServer));
  }

  static String normalizeServer(String url) {
    var s = url.trim();
    if (s.isEmpty) return kDefaultServer;
    if (!s.startsWith('http://') && !s.startsWith('https://')) s = 'https://$s';
    return s.replaceAll(RegExp(r'/+$'), '');
  }

  Future<void> setServer(String url) async {
    server = normalizeServer(url);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_serverKey, server);
  }

  /// Full URL for a server-relative media path such as "/api/uploads/x.png", with the access token for media.
  String mediaUrl(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final p = path.startsWith('/api/') ? path.substring(4) : path; // the backend also serves without /api
    final sep = p.contains('?') ? '&' : '?';
    return '$server$p${_accessToken != null ? '${sep}access_token=${Uri.encodeQueryComponent(_accessToken!)}' : ''}';
  }

  // ---------------- session ----------------

  Future<void> _startSession(Map<String, dynamic> body) async {
    _accessToken = body['accessToken'] as String?;
    if (body['user'] is Map<String, dynamic>) currentUser = AppUser.fromJson(body['user'] as Map<String, dynamic>);
    final refresh = body['refreshToken'] as String?;
    if (refresh != null) await _storage.write(key: _refreshKey, value: refresh);
    final expiresIn = (body['expiresIn'] as num?)?.toInt() ?? 900;
    _renewTimer?.cancel();
    final inSeconds = expiresIn > 70 ? expiresIn - 60 : (expiresIn > 20 ? expiresIn ~/ 2 : 10);
    _renewTimer = Timer(Duration(seconds: inSeconds), () => unawaited(refreshSession()));
  }

  Future<AppUser> signIn(String phone, String password) async {
    final body = await _send('POST', '/auth/sign-in', body: {'phone': phone, 'password': password, 'client': 'native'}, auth: false);
    await _startSession(body as Map<String, dynamic>);
    return currentUser!;
  }

  /// What this server can deliver (email / SMS) and its default country.
  Future<Map<String, dynamic>> authOptions() async => (await _send('GET', '/auth/options', auth: false)) as Map<String, dynamic>;

  /// Verified sign-up, step 1: validates everything and sends the code(s). Returns the pending registration.
  Future<Map<String, dynamic>> signUpStart({required String name, required String phone, required String email, required String password}) async =>
      (await _send('POST', '/auth/sign-up/start', body: {'name': name, 'phone': phone, 'email': email, 'password': password}, auth: false)) as Map<String, dynamic>;

  Future<Map<String, dynamic>> signUpResend(String registrationId, String channel) async =>
      (await _send('POST', '/auth/sign-up/resend', body: {'registrationId': registrationId, 'channel': channel}, auth: false)) as Map<String, dynamic>;

  /// Step 2: the codes; on success the account exists and this phone is signed in.
  Future<AppUser> signUpVerify(String registrationId, String emailCode, String? smsCode) async {
    final body = await _send('POST', '/auth/sign-up/verify', body: {'registrationId': registrationId, 'emailCode': emailCode, if (smsCode != null) 'smsCode': smsCode, 'client': 'native'}, auth: false);
    await _startSession(body as Map<String, dynamic>);
    return currentUser!;
  }

  Future<String> requestPasswordReset(String identifier, String channel) async {
    final body = await _send('POST', '/auth/password-reset/request', body: {'identifier': identifier, 'channel': channel}, auth: false);
    return (body as Map)['message'] as String? ?? 'If an account matches, we sent a code.';
  }

  Future<void> confirmPasswordReset(String identifier, String code, String newPassword) =>
      _send('POST', '/auth/password-reset/confirm', body: {'identifier': identifier, 'code': code, 'newPassword': newPassword}, auth: false);

  /// Restores the session from the stored refresh token (app start). Returns false if the user must sign in.
  Future<bool> restore() => refreshSession();

  /// Single-flight refresh with rotation. A reused/expired token ends the session.
  Future<bool> refreshSession() {
    return _refreshing ??= () async {
      try {
        final token = await _storage.read(key: _refreshKey);
        if (token == null) return false;
        final res = await http
            .post(Uri.parse('$server/auth/refresh'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'client': 'native', 'refreshToken': token}))
            .timeout(const Duration(seconds: 15));
        if (res.statusCode == 401) {
          await _endSession();
          return false;
        }
        if (res.statusCode >= 400) return false; // server trouble: keep the stored token and try later
        await _startSession(jsonDecode(res.body) as Map<String, dynamic>);
        return true;
      } catch (_) {
        return false; // offline: keep the stored token
      } finally {
        _refreshing = null;
      }
    }();
  }

  Future<void> signOut() async {
    try {
      final token = await _storage.read(key: _refreshKey);
      if (token != null) {
        await http
            .post(Uri.parse('$server/auth/logout'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'client': 'native', 'refreshToken': token}))
            .timeout(const Duration(seconds: 10));
      }
    } catch (_) {
      // Signing out locally still works offline.
    }
    await _endSession();
  }

  Future<void> _endSession() async {
    _renewTimer?.cancel();
    _accessToken = null;
    currentUser = null;
    await _storage.delete(key: _refreshKey);
    sessionEnded.add(null);
  }

  // ---------------- requests ----------------

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body ?? const {});
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true, bool retried = false}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (auth && _accessToken != null) headers['Authorization'] = 'Bearer $_accessToken';
    final uri = Uri.parse('$server$path');
    late http.Response res;
    try {
      final req = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) req.body = jsonEncode(body);
      res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 20)));
    } on TimeoutException {
      throw ApiException(0, 'The server did not respond. Check your connection.');
    } catch (_) {
      throw ApiException(0, 'Cannot reach the server at $server.');
    }
    if (res.statusCode == 401 && auth && !retried) {
      if (await refreshSession()) return _send(method, path, body: body, auth: auth, retried: true);
    }
    if (res.statusCode >= 400) throw ApiException(res.statusCode, _errorMessage(res), _errorField(res));
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  static String? _errorField(http.Response res) {
    try {
      final j = jsonDecode(res.body);
      return j is Map && j['field'] is String ? j['field'] as String : null;
    } catch (_) {
      return null;
    }
  }

  static String _errorMessage(http.Response res) {
    try {
      final j = jsonDecode(res.body);
      final m = j is Map ? j['message'] : null;
      if (m is List) return m.join(', ');
      if (m is String) return _friendly(m);
    } catch (_) {}
    return 'Request failed (HTTP ${res.statusCode}).';
  }

  static String _friendly(String code) => const {
        'INVALID_CREDENTIALS': 'Wrong phone number or password.',
        'PHONE_ALREADY_REGISTERED': 'This phone number is already registered.',
        'ACCOUNT_SUSPENDED': 'This account is suspended.',
        'BLOCKED': 'One of you has blocked the other.',
        'TOO_MANY_REQUESTS': 'Too many attempts. Please wait a minute.',
        'INVALID_CODE': 'That code is not correct.',
        'CODE_EXPIRED': 'The code expired. Request a new one.',
      }[code] ??
      (code.startsWith('TOO_MANY_ATTEMPTS') ? 'Too many failed attempts. Try again in 15 minutes.' : code);
}
