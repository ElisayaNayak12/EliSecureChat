import 'package:flutter/material.dart';

import '../main.dart';
import '../widgets/avatar.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.services});

  final AppServices services;

  Future<void> _signOut(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your phone number and password to sign in again. Your encryption keys stay on this phone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    await services.api.signOut(); // the app returns to the sign-in screen
  }

  @override
  Widget build(BuildContext context) {
    final user = services.api.currentUser;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(children: [
        const SizedBox(height: 20),
        Center(child: UserAvatar(api: services.api, user: user, radius: 40)),
        const SizedBox(height: 12),
        Center(child: Text(user?.name ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600))),
        if (user?.phone != null) Center(child: Text(user!.phone!, style: TextStyle(color: scheme.onSurfaceVariant))),
        const SizedBox(height: 20),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('End-to-end encryption'),
          subtitle: Text(services.e2ee.ready ? 'On. This phone: ${services.e2ee.deviceId}' : 'Not set up on this phone yet'),
        ),
        ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Server'), subtitle: Text(services.api.server)),
        ListTile(
          leading: Icon(services.socket.isConnected ? Icons.wifi : Icons.wifi_off),
          title: const Text('Live connection'),
          subtitle: Text(services.socket.isConnected ? 'Connected' : 'Offline. Messages still send over HTTPS.'),
        ),
        const ListTile(
          leading: Icon(Icons.info_outline),
          title: Text('Coming next to the Android app'),
          subtitle: Text('Voice messages, photos, calls, blocking and sign/caption assistance. Use the web app for these today.'),
        ),
        const Divider(),
        ListTile(
          leading: Icon(Icons.logout, color: scheme.error),
          title: Text('Sign out', style: TextStyle(color: scheme.error)),
          onTap: () => _signOut(context),
        ),
      ]),
    );
  }
}
