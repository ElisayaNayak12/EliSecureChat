/// Readable text for messages the web app sends in a special format: stickers, GIFs and time capsules.
/// (The phone app shows a label; the web app draws the full sticker or animation.)
final _rich = RegExp(r'^::(sticker|gif):([a-z0-9-]{1,40})::$');
final _capsule = RegExp(r'^::capsule:(\d{4}-\d{2}-\d{2})::([\s\S]{1,4000})$');

String _title(String id) => id.split('-').map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1)).join(' ');

/// Returns the text to show for [text]; ordinary messages come back unchanged.
String displayText(String text, {DateTime? now}) {
  final t = text.trim();
  final r = _rich.firstMatch(t);
  if (r != null) {
    return r.group(1) == 'sticker' ? '🌿 Sticker: ${_title(r.group(2)!)}' : '🎞️ GIF: ${_title(r.group(2)!)}';
  }
  final c = _capsule.firstMatch(text);
  if (c != null) {
    final opens = DateTime.tryParse('${c.group(1)}T00:00:00');
    if (opens != null && (now ?? DateTime.now()).isBefore(opens)) return '⏳ Sealed time capsule, opens on ${c.group(1)}';
    return '⏳ ${c.group(2)}';
  }
  return text;
}
