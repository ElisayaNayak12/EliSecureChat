import 'dart:async';

import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'crypto/e2ee_service.dart';
import 'realtime/socket_service.dart';
import 'screens/chats_screen.dart';
import 'screens/login_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await ApiClient.create();
  runApp(EliSecureChatApp(api: api));
}

/// Shared services, handed to screens explicitly (no global state).
class AppServices {
  AppServices(this.api)
      : e2ee = E2eeService(api),
        socket = SocketService(api);

  final ApiClient api;
  final E2eeService e2ee;
  final SocketService socket;
}

enum _Phase { starting, signedOut, signedIn }

class EliSecureChatApp extends StatefulWidget {
  const EliSecureChatApp({super.key, required this.api});
  final ApiClient api;

  @override
  State<EliSecureChatApp> createState() => _EliSecureChatAppState();
}

class _EliSecureChatAppState extends State<EliSecureChatApp> {
  late final AppServices services = AppServices(widget.api);
  _Phase _phase = _Phase.starting;
  String? _e2eeError;
  StreamSubscription<void>? _ended;

  @override
  void initState() {
    super.initState();
    _ended = widget.api.sessionEnded.stream.listen((_) => _onSignedOut());
    unawaited(_restore());
  }

  @override
  void dispose() {
    _ended?.cancel();
    services.socket.disconnect();
    super.dispose();
  }

  Future<void> _restore() async {
    final ok = await widget.api.restore();
    if (!mounted) return;
    if (ok && widget.api.currentUser != null) {
      await _onSignedIn();
    } else {
      setState(() => _phase = _Phase.signedOut);
    }
  }

  Future<void> _onSignedIn() async {
    final user = widget.api.currentUser!;
    _e2eeError = null;
    try {
      await services.e2ee.init(user.id);
    } catch (e) {
      _e2eeError = 'Encryption could not start: $e';
    }
    services.socket.connect();
    if (mounted) setState(() => _phase = _Phase.signedIn);
  }

  void _onSignedOut() {
    services.socket.disconnect();
    services.e2ee.reset();
    if (mounted) setState(() => _phase = _Phase.signedOut);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EliSecureChat',
      debugShowCheckedModeBanner: false,
      theme: Verdant.light(),
      darkTheme: Verdant.dark(),
      home: switch (_phase) {
        _Phase.starting => const _Splash(),
        _Phase.signedOut => LoginScreen(api: widget.api, onSignedIn: _onSignedIn),
        _Phase.signedIn => ChatsScreen(services: services, startupWarning: _e2eeError),
      },
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: Verdant.brand700,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.lock_outline, color: Verdant.tile300, size: 48),
            SizedBox(height: 16),
            Text('EliSecureChat', style: TextStyle(color: Color(0xFFEEF3E6), fontSize: 22, fontWeight: FontWeight.w600)),
          ]),
        ),
      );
}
