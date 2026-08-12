import type { UserProfile } from './user-profile.model';
import {
  clearCachedProfile,
  readCachedProfile,
  writeCachedProfile,
} from './profile-cache';

const STORAGE_KEY = 'fino.auth.profile';
const USER_ID = '3f1c9b7a-2d4e-4a6b-8c0d-1e2f3a4b5c6d';
const OTHER_USER_ID = '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d';

const PROFILE: UserProfile = {
  id: USER_ID,
  email: 'ana@fino.hn',
  fullName: 'Ana Castillo',
  phone: null,
  role: 'SUPERVISOR',
  isActive: true,
  createdAt: '2026-01-15T14:30:00.000Z',
  updatedAt: '2026-01-15T14:30:00.000Z',
};

describe('profile cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns the profile it stored for the same user', () => {
    writeCachedProfile(USER_ID, PROFILE);

    expect(readCachedProfile(USER_ID)).toEqual(PROFILE);
  });

  it('returns null when nothing was cached', () => {
    expect(readCachedProfile(USER_ID)).toBeNull();
  });

  it('never hands one user the profile cached for another', () => {
    writeCachedProfile(USER_ID, PROFILE);

    expect(readCachedProfile(OTHER_USER_ID)).toBeNull();
  });

  it('drops the entry on clear', () => {
    writeCachedProfile(USER_ID, PROFILE);
    clearCachedProfile();

    expect(readCachedProfile(USER_ID)).toBeNull();
  });

  it('overwrites the previous entry instead of accumulating', () => {
    writeCachedProfile(USER_ID, PROFILE);
    writeCachedProfile(OTHER_USER_ID, { ...PROFILE, id: OTHER_USER_ID });

    expect(readCachedProfile(USER_ID)).toBeNull();
    expect(readCachedProfile(OTHER_USER_ID)?.id).toBe(OTHER_USER_ID);
  });

  it('survives a corrupt entry and discards it', () => {
    sessionStorage.setItem(STORAGE_KEY, '{ not json');

    expect(readCachedProfile(USER_ID)).toBeNull();
    // Discarded, so it stops being reconsidered on every load.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects an entry whose shape no longer matches the model', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userId: USER_ID, profile: { id: USER_ID } }),
    );

    expect(readCachedProfile(USER_ID)).toBeNull();
  });

  it('rejects a role the app does not know', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: USER_ID,
        profile: { ...PROFILE, role: 'SUPERADMIN' },
      }),
    );

    expect(readCachedProfile(USER_ID)).toBeNull();
  });

  it('keeps a profile whose optional phone is set', () => {
    const withPhone: UserProfile = { ...PROFILE, phone: '+504 9999-9999' };
    writeCachedProfile(USER_ID, withPhone);

    expect(readCachedProfile(USER_ID)?.phone).toBe('+504 9999-9999');
  });
});
