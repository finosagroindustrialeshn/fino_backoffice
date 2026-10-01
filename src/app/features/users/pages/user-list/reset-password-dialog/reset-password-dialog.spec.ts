import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormControl, FormGroup } from '@angular/forms';

import { ResetPasswordDialog } from './reset-password-dialog';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DialogInternals {
  readonly form: FormGroup<{
    newPassword: FormControl<string>;
    confirmPassword: FormControl<string>;
  }>;
  submit(): void;
}

describe('ResetPasswordDialog', () => {
  let fixture: ComponentFixture<ResetPasswordDialog>;
  let cmp: DialogInternals;
  let emitted: string[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPasswordDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordDialog);
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as DialogInternals;
    emitted = [];
    fixture.componentInstance.submitted.subscribe((payload) =>
      emitted.push(payload),
    );
  });

  function fill(newPassword: string, confirmPassword: string): void {
    cmp.form.setValue({ newPassword, confirmPassword });
  }

  it('is invalid when the confirmation does not match the new password', () => {
    fill('new-password-1', 'new-password-2');

    expect(cmp.form.hasError('passwordsMatch')).toBe(true);
    expect(cmp.form.invalid).toBe(true);
  });

  it('refuses to submit when the passwords do not match', () => {
    fill('new-password-1', 'new-password-2');
    cmp.submit();

    expect(emitted).toEqual([]);
  });

  it('emits the new password on a valid submit', () => {
    fill('new-password-1', 'new-password-1');
    cmp.submit();

    expect(emitted).toEqual(['new-password-1']);
  });

  it('rejects a new password shorter than the minimum length', () => {
    fill('short', 'short');

    expect(cmp.form.controls.newPassword.hasError('minlength')).toBe(true);
    expect(cmp.form.invalid).toBe(true);
  });

  it('clears the form on reset', () => {
    fill('new-password-1', 'new-password-1');

    fixture.componentInstance.reset();

    expect(cmp.form.getRawValue()).toEqual({
      newPassword: '',
      confirmPassword: '',
    });
  });
});
