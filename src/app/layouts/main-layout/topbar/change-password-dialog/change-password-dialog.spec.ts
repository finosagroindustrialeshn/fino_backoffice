import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormControl, FormGroup } from '@angular/forms';

import { ChangePasswordDialog } from './change-password-dialog';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DialogInternals {
  readonly form: FormGroup<{
    currentPassword: FormControl<string>;
    newPassword: FormControl<string>;
    confirmPassword: FormControl<string>;
  }>;
  submit(): void;
}

describe('ChangePasswordDialog', () => {
  let fixture: ComponentFixture<ChangePasswordDialog>;
  let cmp: DialogInternals;
  let emitted: { currentPassword: string; newPassword: string }[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChangePasswordDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePasswordDialog);
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as DialogInternals;
    emitted = [];
    fixture.componentInstance.submitted.subscribe((payload) =>
      emitted.push(payload),
    );
  });

  function fill(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): void {
    cmp.form.setValue({ currentPassword, newPassword, confirmPassword });
  }

  it('is invalid when the confirmation does not match the new password', () => {
    fill('old-password', 'new-password-1', 'new-password-2');

    expect(cmp.form.hasError('passwordsMatch')).toBe(true);
    expect(cmp.form.invalid).toBe(true);
  });

  it('refuses to submit when the passwords do not match', () => {
    fill('old-password', 'new-password-1', 'new-password-2');
    cmp.submit();

    expect(emitted).toEqual([]);
  });

  it('emits the current and new password on a valid submit', () => {
    fill('old-password', 'new-password-1', 'new-password-1');
    cmp.submit();

    expect(emitted).toEqual([
      { currentPassword: 'old-password', newPassword: 'new-password-1' },
    ]);
  });

  it('rejects a new password shorter than the minimum length', () => {
    fill('old-password', 'short', 'short');

    expect(cmp.form.controls.newPassword.hasError('minlength')).toBe(true);
    expect(cmp.form.invalid).toBe(true);
  });

  it('clears the form on reset', () => {
    fill('old-password', 'new-password-1', 'new-password-1');

    fixture.componentInstance.reset();

    expect(cmp.form.getRawValue()).toEqual({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  });
});
