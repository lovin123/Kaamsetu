import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import {
  AuthRole,
  BootstrapStatus,
  OtpPurpose,
  getBootstrapStatus,
} from '../api/client';
import { Field, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

type Step = 'details' | 'otp';

export function LoginScreen() {
  const { requestOtp, verifyOtp } = useAuth();
  const c = useThemeColors();
  const [mode, setMode] = useState<OtpPurpose>('login');
  const [step, setStep] = useState<Step>('details');
  const [phone, setPhone] = useState(__DEV__ ? '9000000001' : '');
  const [name, setName] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [otp, setOtp] = useState('');
  const [devHint, setDevHint] = useState<string | undefined>();
  const [assignedRole, setAssignedRole] = useState<AuthRole | undefined>();
  const [busy, setBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);

  useEffect(() => {
    getBootstrapStatus()
      .then(setBootstrap)
      .catch(() => setBootstrap(null));
  }, [mode]);

  const defaultRole = bootstrap?.defaultRegisterRole ?? 'WORKER';
  const willBeAdmin =
    mode === 'register' &&
    (showRecovery || defaultRole === 'ADMIN');

  const resetToDetails = () => {
    setStep('details');
    setOtp('');
    setDevHint(undefined);
    setAssignedRole(undefined);
  };

  const onSendOtp = async () => {
    const trimmed = phone.trim();
    if (!/^\+?[0-9]{8,15}$/.test(trimmed)) {
      Alert.alert('Invalid phone', 'Enter a valid mobile number (8–15 digits).');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert('Name required', 'Enter your name to create an account.');
      return;
    }
    if (showRecovery && bootstrapSecret.trim().length < 8) {
      Alert.alert(
        'Bootstrap secret required',
        'Enter ADMIN_BOOTSTRAP_SECRET from the server to create an admin.',
      );
      return;
    }
    try {
      setBusy(true);
      const res = await requestOtp({
        phone: trimmed,
        purpose: mode,
        bootstrapSecret:
          mode === 'register' && showRecovery
            ? bootstrapSecret.trim() || undefined
            : undefined,
      });
      setAssignedRole(res.assignedRole);
      setDevHint(res.devCode);
      setOtp('');
      // Never auto-fill OTP from API (even in dev) — paste from hint if needed
      setStep('otp');
    } catch (err) {
      Alert.alert('Could not send OTP', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    const code = otp.trim();
    if (!/^[0-9]{4,8}$/.test(code)) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code sent to your phone.');
      return;
    }
    try {
      setBusy(true);
      await verifyOtp({
        phone: phone.trim(),
        code,
        purpose: mode,
        name: mode === 'register' ? name.trim() : undefined,
        bootstrapSecret:
          mode === 'register' && showRecovery
            ? bootstrapSecret.trim() || undefined
            : undefined,
      });
    } catch (err) {
      Alert.alert(
        mode === 'login' ? 'Sign in failed' : 'Registration failed',
        (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  const flowHint =
    mode === 'register'
      ? willBeAdmin
        ? 'No admin yet — you will be onboarded as Admin after OTP. Then create supervisors and workers.'
        : 'New accounts join as Worker. Supervisors are added by an Admin. Use recovery secret only to create another Admin.'
      : 'Sign in with mobile OTP. Your role (Admin / Supervisor / Worker) comes from your account.';

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ color: c.accent, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
          KaamSetu
        </Text>
        <Title>
          {step === 'otp'
            ? 'Enter OTP'
            : mode === 'login'
              ? 'Sign in'
              : willBeAdmin
                ? 'Create admin account'
                : 'Create account'}
        </Title>
        <Subtitle>{step === 'otp' ? `Code sent to ${phone.trim()}.` : flowHint}</Subtitle>
        <View style={{ height: 24 }} />

        {step === 'details' && (
          <>
            {mode === 'register' && (
              <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
            )}
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={setPhone}
              placeholder="9000000001"
              keyboardType="phone-pad"
              autoComplete="tel"
            />

            {mode === 'register' && !!bootstrap && (
              <Text style={{ color: c.muted, marginBottom: 12, fontSize: 13 }}>
                Default role for this signup:{' '}
                <Text style={{ color: c.ink, fontWeight: '700' }}>
                  {showRecovery ? 'ADMIN (recovery)' : defaultRole}
                </Text>
              </Text>
            )}

            {mode === 'register' &&
              bootstrap !== null &&
              !bootstrap.firstAdminOpen && (
              <>
                <Pressable
                  onPress={() => setShowRecovery((v) => !v)}
                  style={{ marginBottom: 12 }}
                >
                  <Text style={{ color: c.accent, fontWeight: '600' }}>
                    {showRecovery
                      ? 'Hide admin recovery'
                      : 'Have an admin bootstrap secret?'}
                  </Text>
                </Pressable>
                {showRecovery && (
                  <Field
                    label="Admin bootstrap secret"
                    value={bootstrapSecret}
                    onChangeText={setBootstrapSecret}
                    placeholder="From ADMIN_BOOTSTRAP_SECRET"
                    secureTextEntry
                  />
                )}
              </>
            )}

            <PrimaryButton
              label={busy ? 'Sending…' : 'Send OTP'}
              onPress={onSendOtp}
              disabled={busy}
            />
            <Pressable
              onPress={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setShowRecovery(false);
                setBootstrapSecret('');
                resetToDetails();
              }}
              style={{ marginTop: 16 }}
            >
              <Text style={{ color: c.accent, fontWeight: '600' }}>
                {mode === 'login' ? 'New here? Create account' : 'Have an account? Sign in'}
              </Text>
            </Pressable>
          </>
        )}

        {step === 'otp' && (
          <>
            {!!assignedRole && (
              <Text style={{ color: c.muted, marginBottom: 12, fontSize: 13 }}>
                Continuing as <Text style={{ color: c.ink, fontWeight: '700' }}>{assignedRole}</Text>
              </Text>
            )}
            <Field
              label="OTP"
              value={otp}
              onChangeText={setOtp}
              placeholder="6-digit code"
              keyboardType="number-pad"
              maxLength={8}
            />
            {__DEV__ && !!devHint && (
              <Text style={{ color: c.muted, marginBottom: 12, fontSize: 13 }}>
                Dev OTP: {devHint}
              </Text>
            )}
            <PrimaryButton
              label={
                busy
                  ? 'Verifying…'
                  : mode === 'login'
                    ? 'Verify & sign in'
                    : 'Verify & create account'
              }
              onPress={onVerify}
              disabled={busy}
            />
            <Pressable onPress={onSendOtp} style={{ marginTop: 16 }} disabled={busy}>
              <Text style={{ color: c.accent, fontWeight: '600' }}>Resend OTP</Text>
            </Pressable>
            <Pressable onPress={resetToDetails} style={{ marginTop: 12 }}>
              <Text style={{ color: c.muted, fontWeight: '600' }}>Change number</Text>
            </Pressable>
          </>
        )}

        {__DEV__ && (
          <Text style={{ color: c.muted, marginTop: 20, fontSize: 13 }}>
            Demo — worker 9000000001 / supervisor 9000000009 / admin 9000000000
          </Text>
        )}
      </View>
    </Screen>
  );
}
