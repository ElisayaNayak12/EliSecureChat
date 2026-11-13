import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../theme.dart';
import 'verify_screens.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onSignedIn});

  final ApiClient api;
  final Future<void> Function() onSignedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _countryCode = TextEditingController(text: '+91');
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _password2 = TextEditingController();
  Map<String, String> _fieldErrors = {};
  late final _server = TextEditingController(text: widget.api.server);
  bool _signUp = false;
  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _countryCode.dispose();
    _email.dispose();
    _password.dispose();
    _password2.dispose();
    _server.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
      _fieldErrors = {};
    });
    try {
      if (_server.text.trim() != widget.api.server) await widget.api.setServer(_server.text);
      if (_signUp) {
        final raw = _phone.text.replaceAll(RegExp(r'[\s()-]'), '');
        final phone = raw.startsWith('+') ? raw : '${_countryCode.text.trim()}$raw';
        final pending = await widget.api.signUpStart(name: _name.text.trim(), phone: phone, email: _email.text.trim(), password: _password.text);
        if (!mounted) return;
        // Step 2: codes. The verify screen signs in and tells the app when the account exists.
        await Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => SignUpVerifyScreen(api: widget.api, pending: pending, onSignedIn: widget.onSignedIn)));
      } else {
        final id = _phone.text.trim();
        await widget.api.signIn(id.contains('@') ? id : id.replaceAll(RegExp(r'[\s-]'), ''), _password.text);
        await widget.onSignedIn();
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          if (e.field != null) {
            _fieldErrors = {e.field!: e.message};
          } else {
            _error = e.toString();
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const SizedBox(height: 12),
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: Verdant.brand700,
                    child: const Icon(Icons.lock_outline, color: Verdant.tile300, size: 32),
                  ),
                  const SizedBox(height: 16),
                  Text('EliSecureChat', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text(
                    _signUp ? 'Use your real mobile number and email; we will email you a code' : 'Sign in with your phone number or email',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 28),
                  if (_signUp) ...[
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Your name', prefixIcon: Icon(Icons.person_outline)),
                      validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your name (at least 2 characters)' : null,
                      onChanged: (_) {
                        if (_fieldErrors.isNotEmpty) setState(() => _fieldErrors = {});
                      },
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (!_signUp)
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Phone number or email', prefixIcon: Icon(Icons.person_outline)),
                      validator: (v) => (v ?? '').trim().length < 5 ? 'Enter your phone number or email' : null,
                    )
                  else ...[
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(
                        width: 88,
                        child: TextFormField(
                          controller: _countryCode,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(labelText: 'Code'),
                          validator: (v) => RegExp(r'^\+\d{1,4}$').hasMatch((v ?? '').trim()) ? null : '+91',
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          autofillHints: const [AutofillHints.telephoneNumberNational],
                          decoration: InputDecoration(labelText: 'Mobile number', errorText: _fieldErrors['phone'], helperText: 'Must be a real mobile number'),
                          validator: (v) => RegExp(r'^\+?[0-9]{6,15}$').hasMatch((v ?? '').replaceAll(RegExp(r'[\s()-]'), '')) ? null : 'Enter a valid mobile number',
                        ),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: InputDecoration(labelText: 'Email', prefixIcon: const Icon(Icons.mail_outline), errorText: _fieldErrors['email'], helperText: 'We will email a code to confirm it'),
                      validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim()) ? null : 'Enter a valid email address',
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _password,
                    obscureText: !_showPassword,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.key_outlined),
                      suffixIcon: IconButton(
                        tooltip: _showPassword ? 'Hide password' : 'Show password',
                        icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                        onPressed: () => setState(() => _showPassword = !_showPassword),
                      ),
                    ),
                    validator: (v) {
                      final pw = v ?? '';
                      if (!_signUp) return pw.isEmpty ? 'Enter your password' : null;
                      if (pw.length < 8) return 'Use at least 8 characters';
                      if (!RegExp(r'[A-Za-z]').hasMatch(pw) || !RegExp(r'\d').hasMatch(pw)) return 'Use both letters and numbers';
                      return null;
                    },
                    onFieldSubmitted: (_) => _submit(),
                  ),
                  if (_signUp && _fieldErrors['password'] != null)
                    Padding(padding: const EdgeInsets.only(top: 6, left: 4), child: Text(_fieldErrors['password']!, style: TextStyle(color: scheme.error, fontSize: 12))),
                  if (_signUp) ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password2,
                      obscureText: !_showPassword,
                      decoration: const InputDecoration(labelText: 'Confirm password', prefixIcon: Icon(Icons.key_outlined)),
                      validator: (v) => v != _password.text ? 'The passwords do not match' : null,
                    ),
                  ],
                  if (!_signUp)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                final changed = await Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => ForgotPasswordScreen(api: widget.api)));
                                if (changed == true && context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed. Sign in with your new password.')));
                                }
                              },
                        child: const Text('Forgot password?'),
                      ),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Text(_error!, style: TextStyle(color: scheme.error), textAlign: TextAlign.center),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                        : Text(_signUp ? 'Continue' : 'Sign in'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _busy ? null : () => setState(() => _signUp = !_signUp),
                    child: Text(_signUp ? 'I already have an account' : 'New here? Create an account'),
                  ),
                  const SizedBox(height: 8),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text('Server', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 14)),
                    subtitle: Text(widget.api.server, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                    children: [
                      TextFormField(
                        controller: _server,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(labelText: 'Server address', hintText: 'https://chat.example.com'),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Use the address where your EliSecureChat backend runs. On the Android emulator, http://10.0.2.2:3000 is the PC.',
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                      ),
                    ],
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
