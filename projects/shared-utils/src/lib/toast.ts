import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ToastService } from './toast.service';

@Component({
  selector: 'lib-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class Toast {
  private toastService = inject(ToastService);

  protected toasts = toSignal(this.toastService.toasts$, { initialValue: [] });

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
