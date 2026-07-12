import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-catalogos',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './catalogos.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogosShell {}
