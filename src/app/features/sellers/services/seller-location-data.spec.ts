import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirebaseService } from '../../../core/firebase/firebase.client';
import { SellerLocationDataClient } from './seller-location-data';

const firebaseDatabase = vi.hoisted(() => ({
  onValue: vi.fn(),
  ref: vi.fn(() => ({})),
}));
vi.mock('firebase/database', () => firebaseDatabase);

type ValueCallback = (snapshot: { val: () => unknown }) => void;
type ErrorCallback = (error: Error) => void;

describe('SellerLocationDataClient', () => {
  const unsubscribe = vi.fn();
  let client: SellerLocationDataClient;

  function lastListener(): { next: ValueCallback; error: ErrorCallback } {
    const call = firebaseDatabase.onValue.mock.calls.at(-1);
    if (!call) {
      throw new Error('onValue was never called');
    }
    return { next: call[1] as ValueCallback, error: call[2] as ErrorCallback };
  }

  beforeEach(() => {
    firebaseDatabase.onValue.mockReset();
    firebaseDatabase.onValue.mockReturnValue(unsubscribe);
    unsubscribe.mockReset();
    TestBed.configureTestingModule({
      providers: [SellerLocationDataClient, { provide: FirebaseService, useValue: { database: {} } }],
    });
    client = TestBed.inject(SellerLocationDataClient);
  });

  it('registers an error callback with the listener', () => {
    client.watch(vi.fn(), vi.fn());
    expect(typeof firebaseDatabase.onValue.mock.calls[0]?.[2]).toBe('function');
  });

  it('reports a permission error as Spanish copy, not the raw SDK message', () => {
    const onError = vi.fn();
    client.watch(vi.fn(), onError);

    lastListener().error(
      new FirebaseError('PERMISSION_DENIED', 'permission_denied at /sellers: Client denied'),
    );

    expect(onError).toHaveBeenCalledWith('No hay permiso para acceder a estos datos.');
  });

  it('reports an unknown failure with the generic fallback', () => {
    const onError = vi.fn();
    client.watch(vi.fn(), onError);

    lastListener().error(new Error('socket exploded'));

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^No se pudo/));
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('socket exploded'));
  });

  it('delivers parsed snapshots to onNext', () => {
    const onNext = vi.fn();
    client.watch(onNext, vi.fn());

    lastListener().next({ val: () => null });

    expect(onNext).toHaveBeenCalledWith([]);
  });

  it('detaches the listener on destroy', () => {
    client.watch(vi.fn(), vi.fn());
    client.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('detaches the previous listener when watching again', () => {
    client.watch(vi.fn(), vi.fn());
    client.watch(vi.fn(), vi.fn());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
