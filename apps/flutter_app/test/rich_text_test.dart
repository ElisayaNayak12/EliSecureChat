import 'package:elisecurechat/rich_text.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('stickers and GIFs from the web app get readable labels', () {
    expect(displayText('::sticker:thanks::'), '🌿 Sticker: Thanks');
    expect(displayText('::gif:happy-birthday::'), '🎞️ GIF: Happy Birthday');
    expect(displayText('hello ::sticker:thanks::'), 'hello ::sticker:thanks::');
  });

  test('time capsules stay sealed until their date', () {
    const msg = '::capsule:2027-01-02::Happy new year!';
    expect(displayText(msg, now: DateTime(2026, 12, 31)), '⏳ Sealed time capsule, opens on 2027-01-02');
    expect(displayText(msg, now: DateTime(2027, 1, 2, 9)), '⏳ Happy new year!');
  });

  test('ordinary messages are unchanged', () {
    expect(displayText('See you at 8'), 'See you at 8');
  });
}
