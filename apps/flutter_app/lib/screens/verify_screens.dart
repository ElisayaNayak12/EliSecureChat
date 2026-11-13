import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';

/// Six-digit code field (works with SMS autofill).
class CodeField extends StatelessWidget {
  const CodeField({super.key, required this.controller, required this.label, this.autofocus = false, this.error});

  final TextEditingController controller;
  final String label;
  final bool autofocus;
  final String? error;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        autofocus: autofocus,
        keyboardType: TextInputType.number,
        autofillHints: const [AutofillHints.oneTimeCode],
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 26, letterSpacing: 12, fontWeight: FontWeight.w700),
        decoration: InputDecoration(labelText: label, hintText: '••••••', errorText: error),
      );
}

/// "Resend code" with a 60-second countdown.
class ResendButton extends StatefulWidget {
  const ResendButton({super.key, required this.onResend, this.label = 'Resend code', this.seconds = 60});

  final Future<void> Function() onResend;
  final String label;
  final int seconds;

  @override
  State<ResendButton> createState() => _ResendButtonState();
}

class _ResendButtonState extends State<ResendButton> {
  late int _left = widget.seconds;
  Timer? _timer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _left = _left > 0 ? _left - 1 : 0);
      if (_left == 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          onPressed: _left > 0 || _busy
              ? null
              : () async {
                  setState(() => _busy = true);
                  try {
                    await widget.onResend();
                    setState(() => _left = widget.seconds);
                    _start();
                  } catch (_) {
                    // the caller shows the error
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
          child: Text(_left > 0 ? '${widget.label} in ${_left}s' : (_busy ? 'Sending…' : widget.label)),
        ),
      );
}

/// Step 2 of sign-up: the codes sent by email (and SMS). Pops with `true` once the account exists.
class SignUpVerifyScreen extends StatefulWidget {
  const SignUpVerifyScreen({super.key, required this.api, required this.pending, required this.onSignedIn});

  final ApiClient api;
  final Map<String, dynamic> pending;
  final Future<void> Function() onSignedIn;

  @override
  State<SignUpVerifyScreen> createState() => _SignUpVerifyScreenState();
}

class _SignUpVerifyScreenState extends State<SignUpVerifyScreen> {
  final _email = TextEditingController();
  final _sms = TextEditingController();
  late Map<String, dynamic> _pending = widget.pending;
  bool _busy = false;
  String? _emailError, _smsError, _error;

  bool get _hasSms => (_pending['channels'] as Map?)?['sms'] == true;

  @override
  void dispose() {
    _email.dispose();
    _sms.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _emailError = _smsError = _error = null;
    });
    try {
      await widget.api.signUpVerify(_pending['registrationId'] as String, _email.text, _hasSms ? _sms.text : null);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      await widget.onSignedIn();
    } on ApiException catch (e) {
      setState(() {
        if (e.field == 'email') {
          _emailError = e.message;
        } else if (e.field == 'sms') {
          _smsError = e.message;
        } else {
          _error = e.message;
        }
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend(String channel) async {
    try {
      final p = await widget.api.signUpResend(_pending['registrationId'] as String, channel);
      setState(() => _pending = p);
      _snack(channel == 'email' ? 'New code sent to ${p['email']}.' : 'New code sent by SMS to ${p['phone']}.');
    } on ApiException catch (e) {
      _snack(e.message);
      rethrow;
    }
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify it\'s you')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Text(
            'We sent a 6-digit code to ${_pending['email']}${_hasSms ? ' and by SMS to ${_pending['phone']}' : ''}. Codes are valid for ${_pending['codeMinutes'] ?? 10} minutes.',
            style: const TextStyle(fontSize: 15, height: 1.4),
          ),
          const SizedBox(height: 20),
          CodeField(controller: _email, label: 'Email code', autofocus: true, error: _emailError),
          ResendButton(label: 'Resend email code', onResend: () => _resend('email')),
          if (_hasSms) ...[
            const SizedBox(height: 8),
            CodeField(controller: _sms, label: 'SMS code', error: _smsError),
            ResendButton(label: 'Resend SMS', onResend: () => _resend('sms')),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 16),
          ListenableBuilder(
            listenable: Listenable.merge([_email, _sms]),
            builder: (context, _) => FilledButton(
              onPressed: _busy || !(_email.text.length == 6 && (!_hasSms || _sms.text.length == 6)) ? null : _verify,
              child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)) : const Text('Verify and create account'),
            ),
          ),
          const SizedBox(height: 12),
          Text('Didn\'t get the email? Check Spam or Promotions, or go back to fix the address.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
        ]),
      ),
    );
  }
}

/// Forgot password: code by email or SMS, then a new password. Pops with `true` when the password was changed.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _identifier = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _password2 = TextEditingController();
  String _channel = 'email';
  bool _smsAvailable = false;
  bool _codeSent = false;
  bool _busy = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadOptions();
  }

  Future<void> _loadOptions() async {
    try {
      final o = await widget.api.authOptions();
      if (mounted) setState(() => _smsAvailable = (o['resetChannels'] as Map?)?['sms'] == true);
    } catch (_) {
      // Offline: email stays available as the default.
    }
  }

  @override
  void dispose() {
    for (final c in [_identifier, _code, _password, _password2]) {
      c.dispose();
    }
    super.dispose();
  }

  void _say(String m, {bool error = false}) => setState(() {
        _message = m;
        _messageIsError = error;
      });

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      _say(await widget.api.requestPasswordReset(_identifier.text.trim(), _channel));
      setState(() => _codeSent = true);
    } on ApiException catch (e) {
      _say(e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    if (_password.text != _password2.text) {
      _say('The passwords do not match.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.confirmPasswordReset(_identifier.text.trim(), _code.text, _password.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _say(e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          if (!_codeSent) ...[
            // The Email/SMS choice appears only once an SMS provider is set up on the server.
            if (_smsAvailable) ...[
              const Text('Where should we send the code?', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'email', label: Text('Email'), icon: Icon(Icons.mail_outline)),
                  ButtonSegment(value: 'sms', label: Text('SMS'), icon: Icon(Icons.sms_outlined)),
                ],
                selected: {_channel},
                onSelectionChanged: (v) => setState(() => _channel = v.first),
              ),
              const SizedBox(height: 16),
            ] else
              const Padding(padding: EdgeInsets.only(bottom: 16), child: Text('We will email you a one-time code.')),
            TextField(
              controller: _identifier,
              keyboardType: _channel == 'email' ? TextInputType.emailAddress : TextInputType.phone,
              decoration: InputDecoration(labelText: _channel == 'email' ? 'Your account email' : 'Your mobile number (with +country code)'),
            ),
          ] else ...[
            Text('If an account matches, we sent a 6-digit code by ${_channel == 'email' ? 'email' : 'SMS'}.', style: const TextStyle(height: 1.4)),
            const SizedBox(height: 16),
            CodeField(controller: _code, label: '6-digit code', autofocus: true),
            ResendButton(onResend: () => widget.api.requestPasswordReset(_identifier.text.trim(), _channel)),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: '8+ characters with letters and numbers; not your name, phone or email')),
            const SizedBox(height: 12),
            TextField(controller: _password2, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm new password')),
          ],
          if (_message != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_message!, style: TextStyle(color: _messageIsError ? scheme.error : scheme.onSurfaceVariant))),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : (_codeSent ? _confirm : _send),
            child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)) : Text(_codeSent ? 'Set new password' : 'Send code'),
          ),
        ]),
      ),
    );
  }
}
