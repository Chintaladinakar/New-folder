import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import type { IAudioMetadata } from 'music-metadata';
import { pictureFromDataUrl } from '../src/services/artwork.js';
import { AuthService, generatePin, pinProblem } from '../src/services/authService.js';
import { MetadataService } from '../src/services/metadataService.js';
import { audioMimeTypeFor, getFileExtension, normalizeImageFormat, titleFromFileName } from '../src/utils/file.js';
import { TEST_PASSWORD, TEST_SECRET, TINY_PNG, makeWav } from './helpers.js';

describe('AuthService', () => {
  const auth = new AuthService({ password: TEST_PASSWORD, secret: TEST_SECRET, tokenTtlDays: 1 });

  it('checks the password', () => {
    expect(auth.checkPassword(TEST_PASSWORD)).toBe(true);
    expect(auth.checkPassword('wrong')).toBe(false);
    expect(auth.checkPassword('')).toBe(false);
  });

  const account = { id: '5b0e1c7e-1111-4222-8333-944455556666', tokenVersion: 3 };

  it('issues tokens that name their account and verify until they expire', () => {
    const now = Date.now();
    const { token, expiresAt } = auth.issueToken(account, now);
    expect(auth.verifyToken(token, now)).toEqual({ sub: account.id, v: 3 });
    expect(Date.parse(expiresAt)).toBeGreaterThan(now);
    expect(auth.verifyToken(token, now + 2 * 86400 * 1000)).toBeNull();
  });

  it('rejects tampered and foreign tokens', () => {
    const { token } = auth.issueToken(account);
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'owner', exp: 9999999999 })).toString('base64url');
    expect(auth.verifyToken(`${forged}.${signature}`)).toBeNull();
    expect(auth.verifyToken(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
    expect(auth.verifyToken(`${token}.extra`)).toBeNull();
    expect(auth.verifyToken('garbage')).toBeNull();

    const otherPassword = new AuthService({ password: 'changed', secret: TEST_SECRET, tokenTtlDays: 1 });
    expect(otherPassword.verifyToken(token)).toBeNull();
  });

  it('hashes PINs so that only the right PIN, with the same secret, verifies', async () => {
    const hash = await auth.hashPin('902817');
    expect(hash).not.toContain('902817');
    expect(await auth.verifyPin('902817', hash)).toBe(true);
    expect(await auth.verifyPin('902818', hash)).toBe(false);
    expect(await auth.verifyPin('902817', null)).toBe(false);
    // Each hash is salted, and the pepper comes from AUTH_SECRET.
    expect(await auth.hashPin('902817')).not.toBe(hash);
    const otherSecret = new AuthService({ password: TEST_PASSWORD, secret: `${TEST_SECRET}-rotated`, tokenTtlDays: 1 });
    expect(await otherSecret.verifyPin('902817', hash)).toBe(false);
  });

  it('refuses PINs that are too easy, and generates ones that are not', () => {
    for (const pin of ['123456', '654321', '000000', '777777', '12345', '1234567', 'abcdef', '12 456']) {
      expect(pinProblem(pin), pin).not.toBeNull();
    }
    for (const pin of ['902817', '135790', '112358']) expect(pinProblem(pin), pin).toBeNull();
    for (let i = 0; i < 200; i += 1) expect(pinProblem(generatePin())).toBeNull();
  });

  it('is disabled without a password or with a short secret', () => {
    expect(new AuthService({ secret: TEST_SECRET, tokenTtlDays: 1 }).isConfigured).toBe(false);
    const short = new AuthService({ password: TEST_PASSWORD, secret: 'short', tokenTtlDays: 1 });
    expect(short.isConfigured).toBe(false);
    expect(short.checkPassword(TEST_PASSWORD)).toBe(false);
  });
});

describe('MetadataService', () => {
  const service = new MetadataService();
  const metadata = (common: Partial<IAudioMetadata['common']>, duration?: number) =>
    ({ common: { track: { no: null, of: null }, disk: { no: null, of: null }, ...common }, format: { duration } }) as unknown as IAudioMetadata;

  it('falls back to the file name and cleans values', () => {
    const result = service.mapMetadata(metadata({ artist: '  Artist\0 ', album: '' }, 183.6), 'My_Great_Song.flac');
    expect(result).toMatchObject({ title: 'My Great Song', artist: 'Artist', album: null, duration: 184 });
  });

  it('parses years and rejects nonsense numbers', () => {
    expect(service.mapMetadata(metadata({ year: 1999 }), 'a.mp3').year).toBe(1999);
    expect(service.mapMetadata(metadata({ track: { no: 0, of: null } }), 'a.mp3').trackNumber).toBeNull();
    expect(service.mapMetadata(metadata({ track: { no: 7, of: 12 }, disk: { no: 2, of: 2 } }), 'a.mp3')).toMatchObject({
      trackNumber: 7,
      discNumber: 2,
    });
    expect(service.mapMetadata(metadata({}, Number.NaN), 'a.mp3').duration).toBeNull();
  });

  it('reads tags, duration and artwork from a real stream', async () => {
    const parse = (file: Buffer) =>
      service.extractMetadataFromStream(Readable.from([file], { objectMode: false }), { mimeType: 'audio/wav', size: file.length }, 'file.wav');

    const tagged = await parse(makeWav({ seconds: 2, title: 'Silence', artist: 'Nobody', album: 'Quiet' }));
    expect(tagged).toMatchObject({ title: 'Silence', artist: 'Nobody', album: 'Quiet', duration: 2, picture: null });

    const withArt = await parse(makeWav({ title: 'Covered', picture: TINY_PNG }));
    expect(withArt.title).toBe('Covered');
    expect(Buffer.from(withArt.picture!.data).equals(TINY_PNG)).toBe(true);
  });

  it('throws on data that is not audio', async () => {
    await expect(
      service.extractMetadataFromStream(Readable.from([Buffer.from("definitely not audio")], { objectMode: false }), { mimeType: 'audio/mpeg', size: 20 }, 'x.mp3'),
    ).rejects.toThrow();
  });
});

describe('file helpers', () => {
  it('maps extensions to stored content types', () => {
    expect(getFileExtension('Song.Name.MP3')).toBe('mp3');
    expect(getFileExtension('noextension')).toBe('');
    expect(getFileExtension('.hidden')).toBe('');
    expect(audioMimeTypeFor('a.flac')).toBe('audio/flac');
    expect(audioMimeTypeFor('a.m4a')).toBe('audio/mp4');
    expect(audioMimeTypeFor('a.exe')).toBeNull();
    expect(titleFromFileName('C:\\music\\01_intro.mp3')).toBe('01 intro');
    expect(titleFromFileName('.mp3')).toBe('Untitled Track');
  });

  it('normalises picture formats', () => {
    expect(normalizeImageFormat('image/jpg')).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(normalizeImageFormat('PNG')).toEqual({ mimeType: 'image/png', extension: 'png' });
    expect(normalizeImageFormat('image/svg+xml')).toBeNull();
    expect(pictureFromDataUrl(`data:image/png;base64,${TINY_PNG.toString('base64')}`)?.data).toEqual(TINY_PNG);
    expect(pictureFromDataUrl('https://example.com/a.png')).toBeNull();
  });
});
