import * as vscode from 'vscode';
import * as Core from './index';

export function activate(ctx: vscode.ExtensionContext): void {
  if (typeof (Core as any).activate === 'function') {
    (Core as any).activate(ctx);
  }
}

export function deactivate(): void {
  if (typeof (Core as any).deactivate === 'function') {
    (Core as any).deactivate();
  }
}
