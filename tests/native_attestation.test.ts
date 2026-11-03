import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  androidAppIntegrityAllowed,
  createNativeAttestationChallenge,
  nativeAttestationRequired,
  verifyNativeAttestation,
  verifyNativeAttestationChallenge,
} from '../server/native_attestation';

const originalEnv = { ...process.env };

function req(headers: Record<string, string> = {}): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '203.0.113.10' },
  } as unknown as IncomingMessage;
}

interface AndroidArtifactPayload {
  requestDetails: {
    nonce: string;
    requestPackageName: string;
  };
  appIntegrity: {
    packageName: string;
    appRecognitionVerdict: string;
    certificateSha256Digest: string[];
  };
  deviceIntegrity: {
    deviceRecognitionVerdict?: string[];
  };
}

const enforcedAndroidAuthEnv = {
  NODE_ENV: 'production',
  NATIVE_ATTESTATION_REQUIRED: '1',
  GOOGLE_PLAY_INTEGRITY_PACKAGE_NAME: 'com.worldofclaudecraft',
  GOOGLE_PLAY_INTEGRITY_CERT_DIGESTS: 'google-play-signing-cert',
};

function validPlayArtifactPayload(nonce: string): AndroidArtifactPayload {
  return {
    requestDetails: {
      nonce,
      requestPackageName: 'com.worldofclaudecraft',
    },
    appIntegrity: {
      packageName: 'com.worldofclaudecraft',
      appRecognitionVerdict: 'PLAY_RECOGNIZED',
      certificateSha256Digest: ['google-play-signing-cert'],
    },
    deviceIntegrity: {
      deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
    },
  };
}

describe('native attestation', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is opt-in until production enforcement is configured', () => {
    delete process.env.NATIVE_ATTESTATION_REQUIRED;
    process.env.NODE_ENV = 'development';
    expect(nativeAttestationRequired()).toBe(false);
    process.env.NODE_ENV = 'production';
    expect(nativeAttestationRequired()).toBe(true);
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    expect(nativeAttestationRequired()).toBe(false);
    process.env.NATIVE_ATTESTATION_REQUIRED = '1';
    expect(nativeAttestationRequired()).toBe(true);
  });

  it('allows recognised native origins while enforcement is disabled', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    await expect(
      verifyNativeAttestation(req({ origin: 'capacitor://localhost' }), undefined),
    ).resolves.toBe(true);
    await expect(
      verifyNativeAttestation(req({ origin: 'http://localhost' }), undefined),
    ).resolves.toBe(true);
  });

  it('does not allow non-native origins through the native path', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    await expect(
      verifyNativeAttestation(req({ origin: 'https://worldofclaudecraft.com' }), undefined),
    ).resolves.toBe(false);
  });

  it('rejects missing or invalid proofs when enforcement is enabled', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '1';
    const request = req({ origin: 'capacitor://localhost' });
    await expect(verifyNativeAttestation(request, undefined)).resolves.toBe(false);
    const challenge = createNativeAttestationChallenge(request, 'login');
    await expect(
      verifyNativeAttestation(request, {
        platform: 'unknown',
        challengeId: challenge.challengeId,
        token: 'token',
      }),
    ).resolves.toBe(false);
  });

  it.each(['login', 'register'] as const)(
    'accepts a Google Play recognised artifact for enforced native %s',
    async (action) => {
      const request = req({ origin: 'capacitor://localhost' });
      const challenge = createNativeAttestationChallenge(request, action);
      const payload = validPlayArtifactPayload(challenge.nonce);

      await expect(
        verifyNativeAttestation(
          request,
          {
            platform: 'android',
            challengeId: challenge.challengeId,
            token: 'integrity-token',
          },
          {
            decodeIntegrityToken: async () => payload,
            env: enforcedAndroidAuthEnv,
          },
        ),
      ).resolves.toBe(true);
    },
  );

  const invalidNativeLoginArtifactCases: Array<{
    name: string;
    mutate(payload: AndroidArtifactPayload, env: NodeJS.ProcessEnv): void;
  }> = [
    {
      // The retired Solana Store arm used to admit this shape when its own
      // allowlist was configured; the stale env must no longer open it.
      name: 'an unrecognised sideload build, even with the retired Solana Store env set',
      mutate: (payload, env) => {
        payload.appIntegrity.appRecognitionVerdict = 'UNRECOGNIZED_VERSION';
        payload.appIntegrity.certificateSha256Digest = ['solana-release-cert'];
        env.SEEKER_SOLANA_INTEGRITY_PACKAGE_NAME = 'com.worldofclaudecraft';
        env.SEEKER_SOLANA_INTEGRITY_CERT_DIGESTS = 'solana-release-cert';
      },
    },
    {
      name: 'Google Play certificate on an unrecognised build',
      mutate: (payload) => {
        payload.appIntegrity.appRecognitionVerdict = 'UNRECOGNIZED_VERSION';
      },
    },
    {
      name: 'unknown certificate',
      mutate: (payload) => {
        payload.appIntegrity.certificateSha256Digest = ['attacker-cert'];
      },
    },
    {
      name: 'nonce mismatch',
      mutate: (payload) => {
        payload.requestDetails.nonce = 'different-nonce';
      },
    },
    {
      name: 'missing required device verdict',
      mutate: (payload) => {
        delete payload.deviceIntegrity.deviceRecognitionVerdict;
      },
    },
  ];

  it.each(invalidNativeLoginArtifactCases)(
    'rejects a native login artifact with $name',
    async ({ mutate }) => {
      const request = req({ origin: 'capacitor://localhost' });
      const challenge = createNativeAttestationChallenge(request, 'login');
      const payload = validPlayArtifactPayload(challenge.nonce);
      const env: NodeJS.ProcessEnv = { ...enforcedAndroidAuthEnv };
      mutate(payload, env);

      await expect(
        verifyNativeAttestation(
          request,
          {
            platform: 'android',
            challengeId: challenge.challengeId,
            token: 'integrity-token',
          },
          {
            decodeIntegrityToken: async () => payload,
            env,
          },
        ),
      ).resolves.toBe(false);
    },
  );

  it('returns only the consumed server nonce for the expected action', async () => {
    process.env.NATIVE_ATTESTATION_REQUIRED = '0';
    const request = req({ origin: 'capacitor://localhost' });
    const challenge = createNativeAttestationChallenge(request, 'apple');
    const proof = { platform: 'ios', challengeId: challenge.challengeId, token: 'dev-token' };
    await expect(verifyNativeAttestationChallenge(request, proof, 'discord')).resolves.toBeNull();
    const appleChallenge = createNativeAttestationChallenge(request, 'apple');
    const appleProof = {
      platform: 'ios',
      challengeId: appleChallenge.challengeId,
      token: 'dev-token',
    };
    await expect(verifyNativeAttestationChallenge(request, appleProof, 'apple')).resolves.toEqual({
      nonce: appleChallenge.nonce,
    });
    await expect(
      verifyNativeAttestationChallenge(request, appleProof, 'apple'),
    ).resolves.toBeNull();
  });

  it('accepts a non-Play build only with an explicitly trusted certificate', () => {
    const sideloadVerdict = {
      appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
      certificateSha256Digest: ['release-cert'],
    };
    expect(androidAppIntegrityAllowed(sideloadVerdict, ['release-cert'], true)).toBe(true);
    expect(androidAppIntegrityAllowed(sideloadVerdict, [], true)).toBe(false);
    expect(androidAppIntegrityAllowed(sideloadVerdict, ['attacker-cert'], true)).toBe(false);
    expect(androidAppIntegrityAllowed(sideloadVerdict, ['release-cert'], false)).toBe(false);
  });
});
