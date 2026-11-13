import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models.dart';
import '../theme.dart';

class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.api, required this.user, this.radius = 22});

  final ApiClient api;
  final AppUser? user;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final url = user?.avatarUrl;
    return CircleAvatar(
      radius: radius,
      backgroundColor: Verdant.tile300,
      foregroundImage: url != null && url.isNotEmpty ? NetworkImage(api.mediaUrl(url)) : null,
      child: Text(user?.initials ?? '?', style: TextStyle(color: Verdant.brand700, fontWeight: FontWeight.w700, fontSize: radius * 0.7)),
    );
  }
}

String formatTime(DateTime t) {
  final now = DateTime.now();
  final hh = t.hour.toString().padLeft(2, '0');
  final mm = t.minute.toString().padLeft(2, '0');
  if (t.year == now.year && t.month == now.month && t.day == now.day) return '$hh:$mm';
  final yesterday = now.subtract(const Duration(days: 1));
  if (t.year == yesterday.year && t.month == yesterday.month && t.day == yesterday.day) return 'Yesterday';
  return '${t.day.toString().padLeft(2, '0')}/${t.month.toString().padLeft(2, '0')}/${t.year % 100}';
}
