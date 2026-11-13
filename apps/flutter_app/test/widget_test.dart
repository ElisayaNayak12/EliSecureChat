// App-level unit/widget tests. (This file also stops `flutter create` from adding its default counter test.)
import 'package:elisecurechat/api/api_client.dart';
import 'package:elisecurechat/models.dart';
import 'package:elisecurechat/theme.dart';
import 'package:elisecurechat/widgets/avatar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('server addresses are normalised', () {
    expect(ApiClient.normalizeServer('chat.example.com/'), 'https://chat.example.com');
    expect(ApiClient.normalizeServer(' http://10.0.2.2:3000// '), 'http://10.0.2.2:3000');
    expect(ApiClient.normalizeServer(''), kDefaultServer);
  });

  test('models parse backend JSON', () {
    final s = ChatSummary.fromJson({
      'chat': {'id': 'c1', 'type': 'ONE_TO_ONE', 'memberIds': ['u1', 'u2'], 'createdAt': '2026-11-12T10:00:00Z'},
      'peer': {'id': 'u2', 'name': 'Ravi Kumar', 'status': 'ACTIVE'},
      'lastMessage': {
        'id': 'm1', 'chatId': 'c1', 'senderId': 'u2', 'encryptedContent': 'e2e1:{}', 'messageType': 'TEXT',
        'createdAt': '2026-11-12T10:05:00Z', 'readBy': ['u2'], 'deliveredTo': ['u1', 'u2'], 'reactions': [], 'isEdited': false,
      },
      'unreadCount': 3,
      'updatedAt': '2026-11-12T10:05:00Z',
    });
    expect(s.title, 'Ravi Kumar');
    expect(s.peer!.initials, 'RK');
    expect(const AppUser(id: 'x', name: 'Asha (Deaf, ISL)').initials, 'AD');
    expect(s.unreadCount, 3);
    expect(s.lastMessage!.deliveredTo, contains('u1'));
  });

  test('times are formatted for the chat list', () {
    final now = DateTime.now();
    expect(formatTime(DateTime(now.year, now.month, now.day, 9, 5)), '09:05');
    expect(formatTime(now.subtract(const Duration(days: 1))), 'Yesterday');
  });

  testWidgets('Verdant theme builds in light and dark mode', (tester) async {
    for (final theme in [Verdant.light(), Verdant.dark()]) {
      await tester.pumpWidget(MaterialApp(theme: theme, home: const Scaffold(body: Text('EliSecureChat'))));
      expect(find.text('EliSecureChat'), findsOneWidget);
    }
  });
}
