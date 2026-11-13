// End-to-end encryption envelopes, byte-for-byte compatible with the web app (apps/web/src/e2ee/envelope.ts).
//
// Per message:
//  1. a fresh random 256-bit content key encrypts the text with AES-256-GCM; the chat, sender and sender device
//     are bound in as additional authenticated data;
//  2. the content key is sealed for every recipient DEVICE with ECDH P-256 (one-time ephemeral key) +
//     HKDF-SHA256 + AES-256-GCM;
//  3. the sender device signs the envelope with ECDSA P-256 / SHA-256 (raw r||s, like WebCrypto).
//
// Pure Dart (pointycastle), so the same code runs on Android and in plain `dart test`.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/ecc/ecdh.dart' show ECDHBasicAgreement; // not re-exported by export.dart
import 'package:pointycastle/export.dart';

const String envelopePrefix = 'e2e1:';
const int _version = 1;

final ECDomainParameters _curve = ECCurve_secp256r1();
final Random _secure = Random.secure();

Uint8List randomBytes(int length) => Uint8List.fromList(List<int>.generate(length, (_) => _secure.nextInt(256)));

SecureRandom _fortuna() {
  final r = FortunaRandom();
  r.seed(KeyParameter(randomBytes(32)));
  return r;
}

Uint8List _bigIntToBytes(BigInt value, int length) {
  final out = Uint8List(length);
  var v = value;
  for (var i = length - 1; i >= 0; i--) {
    out[i] = (v & BigInt.from(0xff)).toInt();
    v = v >> 8;
  }
  return out;
}

BigInt _bytesToBigInt(List<int> bytes) {
  var r = BigInt.zero;
  for (final b in bytes) {
    r = (r << 8) | BigInt.from(b);
  }
  return r;
}

/// Raw uncompressed P-256 public key (0x04 || X || Y), as WebCrypto exports it.
Uint8List _rawPublic(ECPoint q) => q.getEncoded(false);

ECPoint _importRaw(String b64) {
  final bytes = base64Decode(b64);
  if (bytes.length != 65 || bytes[0] != 4) throw const FormatException('Not a raw uncompressed P-256 public key');
  final point = _curve.curve.decodePoint(bytes);
  if (point == null || point.isInfinity) throw const FormatException('Invalid P-256 point');
  return point;
}

/// This device's long-term keys. Private parts are scalars `d` (stored encrypted by the OS keystore).
class DeviceKeys {
  DeviceKeys({required this.deviceId, required this.agreementD, required this.signingD});

  final String deviceId;
  final BigInt agreementD;
  final BigInt signingD;

  factory DeviceKeys.generate(String deviceId) {
    BigInt newScalar() {
      final gen = ECKeyGenerator()..init(ParametersWithRandom(ECKeyGeneratorParameters(_curve), _fortuna()));
      return gen.generateKeyPair().privateKey.d!;
    }

    return DeviceKeys(deviceId: deviceId, agreementD: newScalar(), signingD: newScalar());
  }

  /// From base64 32-byte scalars (used by tests with keys exported from WebCrypto JWK `d`).
  factory DeviceKeys.fromScalars(String deviceId, String agreementDb64, String signingDb64) =>
      DeviceKeys(deviceId: deviceId, agreementD: _bytesToBigInt(base64Decode(agreementDb64)), signingD: _bytesToBigInt(base64Decode(signingDb64)));

  String get agreementKey => base64Encode(_rawPublic((_curve.G * agreementD)!));
  String get signingKey => base64Encode(_rawPublic((_curve.G * signingD)!));

  Map<String, String> toJson() => {
        'deviceId': deviceId,
        'agreementD': base64Encode(_bigIntToBytes(agreementD, 32)),
        'signingD': base64Encode(_bigIntToBytes(signingD, 32)),
      };

  factory DeviceKeys.fromJson(Map<String, dynamic> j) =>
      DeviceKeys.fromScalars(j['deviceId'] as String, j['agreementD'] as String, j['signingD'] as String);
}

/// A recipient device from the server's key directory.
class PublicDevice {
  const PublicDevice({required this.deviceId, required this.userId, required this.agreementKey, required this.signingKey, this.revoked = false});

  final String deviceId;
  final String userId;
  final String agreementKey;
  final String signingKey;
  final bool revoked;

  factory PublicDevice.fromJson(Map<String, dynamic> j) => PublicDevice(
        deviceId: j['deviceId'] as String,
        userId: j['userId'] as String,
        agreementKey: j['agreementKey'] as String,
        signingKey: j['signingKey'] as String,
        revoked: j['revoked'] == true,
      );
}

Uint8List _ecdh(BigInt privateD, ECPoint publicPoint) {
  final agreement = ECDHBasicAgreement()..init(ECPrivateKey(privateD, _curve));
  final z = agreement.calculateAgreement(ECPublicKey(publicPoint, _curve));
  return _bigIntToBytes(z, 32); // WebCrypto deriveBits(256) = the 32-byte x-coordinate
}

Uint8List _hkdf(Uint8List ikm, Uint8List salt, String info) {
  final hkdf = HKDFKeyDerivator(SHA256Digest())..init(HkdfParameters(ikm, 32, salt, Uint8List.fromList(utf8.encode(info))));
  final out = Uint8List(32);
  hkdf.deriveKey(null, 0, out, 0);
  return out;
}

Uint8List _wrappingKey(BigInt privateD, ECPoint publicPoint, Uint8List salt, String deviceId) =>
    _hkdf(_ecdh(privateD, publicPoint), salt, 'sc-e2e-v1:wrap:$deviceId');

/// AES-256-GCM with a 128-bit tag appended to the ciphertext (WebCrypto layout). Throws on a bad tag.
Uint8List _gcm(bool encrypt, Uint8List key, Uint8List iv, Uint8List data, [Uint8List? aad]) {
  final cipher = GCMBlockCipher(AESEngine())..init(encrypt, AEADParameters(KeyParameter(key), 128, iv, aad ?? Uint8List(0)));
  return cipher.process(data);
}

Uint8List _aad(String chatId, String senderId, String senderDevice) =>
    Uint8List.fromList(utf8.encode('sc-e2e-v1|$chatId|$senderId|$senderDevice'));

/// Canonical bytes covered by the signature: same JSON array as the web (device entries sorted).
Uint8List _signedBytes(String chatId, String senderId, Map<String, dynamic> e) {
  final keys = Map<String, dynamic>.from(e['keys'] as Map);
  final ids = keys.keys.toList()..sort();
  final entries = [
    for (final k in ids) [k, (keys[k] as Map)['iv'], (keys[k] as Map)['wk']]
  ];
  return Uint8List.fromList(utf8.encode(jsonEncode([e['v'], chatId, senderId, e['sd'], e['epk'], e['salt'], e['iv'], e['ct'], entries])));
}

Uint8List _sign(BigInt d, Uint8List message) {
  // Deterministic ECDSA (RFC 6979) over SHA-256; output raw r||s like WebCrypto.
  final signer = ECDSASigner(SHA256Digest(), HMac(SHA256Digest(), 64))..init(true, PrivateKeyParameter<ECPrivateKey>(ECPrivateKey(d, _curve)));
  final sig = signer.generateSignature(message) as ECSignature;
  return Uint8List.fromList([..._bigIntToBytes(sig.r, 32), ..._bigIntToBytes(sig.s, 32)]);
}

bool _verify(ECPoint q, Uint8List message, Uint8List sig) {
  if (sig.length != 64) return false;
  final verifier = ECDSASigner(SHA256Digest())..init(false, PublicKeyParameter<ECPublicKey>(ECPublicKey(q, _curve)));
  try {
    return verifier.verifySignature(message, ECSignature(_bytesToBigInt(sig.sublist(0, 32)), _bytesToBigInt(sig.sublist(32))));
  } catch (_) {
    return false;
  }
}

/// Encrypts [plaintext] for every device in [recipients] and returns the serialized envelope ("e2e1:{...}").
String encryptEnvelope({required String plaintext, required String chatId, required String senderId, required DeviceKeys sender, required List<PublicDevice> recipients}) {
  if (recipients.isEmpty) throw StateError('No recipient devices to encrypt for.');
  final contentKey = randomBytes(32);
  final iv = randomBytes(12);
  final ct = _gcm(true, contentKey, iv, Uint8List.fromList(utf8.encode(plaintext)), _aad(chatId, senderId, sender.deviceId));

  final ephD = DeviceKeys.generate('ephemeral').agreementD;
  final salt = randomBytes(32);
  final keys = <String, Map<String, String>>{};
  for (final r in recipients) {
    final wk = _wrappingKey(ephD, _importRaw(r.agreementKey), salt, r.deviceId);
    final wiv = randomBytes(12);
    keys[r.deviceId] = {'iv': base64Encode(wiv), 'wk': base64Encode(_gcm(true, wk, wiv, contentKey))};
  }
  contentKey.fillRange(0, contentKey.length, 0);

  final unsigned = <String, dynamic>{
    'v': _version,
    'sd': sender.deviceId,
    'epk': base64Encode(_rawPublic((_curve.G * ephD)!)),
    'salt': base64Encode(salt),
    'iv': base64Encode(iv),
    'ct': base64Encode(ct),
    'keys': keys,
  };
  final sig = _sign(sender.signingD, _signedBytes(chatId, senderId, unsigned));
  return envelopePrefix + jsonEncode({...unsigned, 'sig': base64Encode(sig)});
}

enum DecryptFailure { notForThisDevice, badSignature, decryptFailed, malformed }

class DecryptResult {
  const DecryptResult.ok(this.text, this.verified) : failure = null;
  const DecryptResult.failed(this.failure)
      : text = null,
        verified = false;

  final String? text;
  final bool verified;
  final DecryptFailure? failure;
  bool get ok => failure == null;
}

/// Parses "e2e1:{...}". Returns null for anything else (e.g. legacy messages).
Map<String, dynamic>? parseEnvelope(String content) {
  if (!content.startsWith(envelopePrefix)) return null;
  try {
    final v = jsonDecode(content.substring(envelopePrefix.length));
    return v is Map<String, dynamic> ? v : null;
  } catch (_) {
    return null;
  }
}

/// [senderSigningKey]: the sender device's public signing key from the directory, or null if unknown
/// (then the text is shown but marked unverified).
DecryptResult decryptEnvelope({required Map<String, dynamic> envelope, required String chatId, required String senderId, required DeviceKeys me, String? senderSigningKey}) {
  final e = envelope;
  if (e['v'] != _version || e['ct'] is! String || e['keys'] is! Map) return const DecryptResult.failed(DecryptFailure.malformed);
  var verified = false;
  if (senderSigningKey != null) {
    try {
      final unsigned = Map<String, dynamic>.from(e)..remove('sig');
      verified = _verify(_importRaw(senderSigningKey), _signedBytes(chatId, senderId, unsigned), base64Decode(e['sig'] as String));
    } catch (_) {
      verified = false;
    }
    if (!verified) return const DecryptResult.failed(DecryptFailure.badSignature);
  }
  final mine = (e['keys'] as Map)[me.deviceId];
  if (mine is! Map) return const DecryptResult.failed(DecryptFailure.notForThisDevice);
  try {
    final wk = _wrappingKey(me.agreementD, _importRaw(e['epk'] as String), base64Decode(e['salt'] as String), me.deviceId);
    final contentKey = _gcm(false, wk, base64Decode(mine['iv'] as String), base64Decode(mine['wk'] as String));
    final pt = _gcm(false, contentKey, base64Decode(e['iv'] as String), base64Decode(e['ct'] as String), _aad(chatId, senderId, e['sd'] as String));
    return DecryptResult.ok(utf8.decode(pt), verified);
  } catch (_) {
    return const DecryptResult.failed(DecryptFailure.decryptFailed);
  }
}

/// 60-digit safety code (12 groups of 5), identical to the web's, from both users' device signing keys.
String safetyCode({required String userA, required List<String> keysA, required String userB, required List<String> keysB}) {
  String part(String u, List<String> k) => '$u:${([...k]..sort()).join(',')}';
  final canonical = ([part(userA, keysA), part(userB, keysB)]..sort()).join('|');
  final digest = SHA512Digest().process(Uint8List.fromList(utf8.encode('sc-safety-v1|$canonical')));
  final groups = <String>[];
  for (var i = 0; i < 12; i++) {
    final n = _bytesToBigInt(digest.sublist(i * 5, i * 5 + 5));
    groups.add((n % BigInt.from(100000)).toString().padLeft(5, '0'));
  }
  return groups.join(' ');
}

/// Messages from before E2EE were Base64(UTF-8) text.
String legacyDecode(String content) {
  try {
    return utf8.decode(base64Decode(content));
  } catch (_) {
    return '[Unreadable message]';
  }
}
