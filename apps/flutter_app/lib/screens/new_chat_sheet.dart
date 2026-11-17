import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_contacts/flutter_contacts.dart';

import '../main.dart';
import '../models.dart';
import '../widgets/avatar.dart';

/// "New chat", the WhatsApp way: shows only people from your phone's contacts (or numbers/emails you add) who use
/// EliSecureChat. Contacts who don't use it yet are listed under "Invite". Nobody can browse all users.
/// The phone's address book is checked once and is not stored on the server; only the matches are saved.
class NewChatSheet extends StatefulWidget {
  const NewChatSheet({super.key, required this.services});
  final AppServices services;

  @override
  State<NewChatSheet> createState() => _NewChatSheetState();
}

class _NewChatSheetState extends State<NewChatSheet> {
  List<AppUser> _contacts = const [];
  List<String> _invite = const []; // display names of phone contacts not on the app
  bool _busy = false;
  bool _syncedPhone = false;
  String _query = '';
  String? _note;

  String get _me => widget.services.api.currentUser!.id;

  @override
  void initState() {
    super.initState();
    _load(); // the phone's contacts are only read after the person taps "Find friends" (and allows it)
  }

  Future<void> _load() async {
    try {
      final list = ((await widget.services.api.get('/users/$_me/contacts')) as List).map((e) => AppUser.fromJson(e as Map<String, dynamic>)).toList();
      if (mounted) setState(() => _contacts = list);
    } catch (_) {}
  }

  /// Reads the phone's contacts (with permission) and asks the server which of them use EliSecureChat.
  Future<void> _syncPhoneContacts() async {
    if (_busy) return;
    final granted = await FlutterContacts.requestPermission(readonly: true);
    if (!granted) {
      if (mounted) setState(() => _note = 'Allow access to contacts in Settings to find friends who use EliSecureChat.');
      return;
    }
    setState(() {
      _busy = true;
      _note = null;
    });
    try {
      final phone = await FlutterContacts.getContacts(withProperties: true);
      final entries = <String>[];
      final nameOf = <String, String>{};
      for (final c in phone) {
        for (final p in c.phones) {
          final n = p.normalizedNumber.isNotEmpty ? p.normalizedNumber : p.number;
          if (n.replaceAll(RegExp(r'\D'), '').length >= 7) {
            entries.add(n);
            nameOf[n] = c.displayName;
          }
        }
        for (final e in c.emails) {
          if (e.address.contains('@')) {
            entries.add(e.address);
            nameOf[e.address] = c.displayName;
          }
        }
        if (entries.length >= 2000) break;
      }
      if (entries.isEmpty) {
        setState(() => _syncedPhone = true);
        return;
      }
      final r = await widget.services.api.post('/users/$_me/contacts/discover', {'entries': entries}) as Map<String, dynamic>;
      final notOnApp = (r['notOnApp'] as List).cast<String>();
      final names = <String>{for (final n in notOnApp) if ((nameOf[n] ?? '').isNotEmpty) nameOf[n]!}.toList()..sort();
      await _load();
      if (mounted) {
        setState(() {
          _invite = names;
          _syncedPhone = true;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _note = '$e'.contains('DAILY_CONTACT_CHECK_LIMIT') ? 'You checked a lot of contacts today. Try again tomorrow.' : 'Could not check your contacts. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool get _looksLikeIdentifier {
    final q = _query.trim();
    return q.contains('@') ? RegExp(r'^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$').hasMatch(q) : q.replaceAll(RegExp(r'\D'), '').length >= 7;
  }

  Future<void> _addByIdentifier() async {
    final q = _query.trim();
    setState(() => _busy = true);
    try {
      final u = AppUser.fromJson(await widget.services.api.post('/users/$_me/contacts', {'identifier': q}) as Map<String, dynamic>);
      if (mounted) Navigator.of(context).pop(u);
    } catch (e) {
      if (mounted) setState(() => _note = '$e'.contains('NOT_ON_ELISECURECHAT') ? '$q isn\'t on EliSecureChat yet. Tap Invite to send them the app.' : 'Enter a valid phone number or email.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyInvite([String? who]) async {
    final base = widget.services.api.server;
    await Clipboard.setData(ClipboardData(text: 'Join me on EliSecureChat: private, end-to-end encrypted chats and video calls, with sign language and captions built in. $base'));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Invite copied${who != null ? ' for $who' : ''}. Paste it into WhatsApp or SMS.')));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final q = _query.trim().toLowerCase();
    final shown = q.isEmpty ? _contacts : _contacts.where((u) => u.name.toLowerCase().contains(q) || (u.phone ?? '').contains(q)).toList();
    final invites = q.isEmpty ? _invite : _invite.where((n) => n.toLowerCase().contains(q)).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Search contacts, or type a phone number / email', prefixIcon: Icon(Icons.search)),
              keyboardType: TextInputType.text,
              onChanged: (v) => setState(() {
                _query = v;
                _note = null;
              }),
            ),
          ),
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          if (_note != null)
            Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 4), child: Text(_note!, style: TextStyle(color: scheme.error))),
          Expanded(
            child: ListView(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Row(children: [
                  Icon(Icons.lock_outline, size: 14, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Expanded(child: Text('Only your contacts who use EliSecureChat are shown.', style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant))),
                ]),
              ),
              if (!_syncedPhone)
                ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.contacts_outlined)),
                  title: const Text('Find friends from my contacts'),
                  subtitle: const Text('See which of your phone contacts use EliSecureChat'),
                  onTap: () => _syncPhoneContacts(),
                ),
              if (_looksLikeIdentifier && shown.isEmpty)
                ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.person_add_alt_1_outlined)),
                  title: Text('Find "${_query.trim()}" on EliSecureChat'),
                  trailing: _note != null && _note!.contains('isn\'t on') ? TextButton(onPressed: () => _copyInvite(_query.trim()), child: const Text('Invite')) : null,
                  onTap: _addByIdentifier,
                ),
              if (shown.isNotEmpty) _header(context, 'Contacts on EliSecureChat'),
              for (final u in shown)
                ListTile(
                  leading: UserAvatar(api: widget.services.api, user: u, radius: 20),
                  title: Text(u.name),
                  subtitle: u.phone != null ? Text(u.phone!) : null,
                  onTap: () => Navigator.of(context).pop(u),
                ),
              if (shown.isEmpty && q.isEmpty && _syncedPhone)
                const Padding(padding: EdgeInsets.all(24), child: Text('None of your contacts use EliSecureChat yet. Invite them below, or type a phone number above.', textAlign: TextAlign.center)),
              if (invites.isNotEmpty) _header(context, 'Invite to EliSecureChat'),
              for (final name in invites.take(200))
                ListTile(
                  leading: CircleAvatar(child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?')),
                  title: Text(name),
                  trailing: TextButton(onPressed: () => _copyInvite(name), child: const Text('Invite')),
                ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _header(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(text.toUpperCase(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .6, color: Theme.of(context).colorScheme.primary)),
      );
}
