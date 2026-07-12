import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  readonly title = input.required<string>();
}
