export type ClipboardEnv = {
  navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
  isSecureContext?: boolean;
  document?: {
    body?: { appendChild: (el: any) => void; removeChild: (el: any) => void };
    createElement: (tag: string) => any;
    execCommand?: (command: string) => boolean;
  };
};

export async function copyToClipboard(text: string, env: ClipboardEnv = globalThis as any): Promise<boolean> {
  const nav = env.navigator as ClipboardEnv['navigator'] | undefined;
  const secure = Boolean(env.isSecureContext);

  if (secure && nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }

  const doc = env.document as ClipboardEnv['document'] | undefined;
  if (!doc?.body || !doc.createElement || !doc.execCommand) {
    return false;
  }

  try {
    const textarea = doc.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    textarea.style.opacity = '0';

    doc.body.appendChild(textarea);
    if (textarea.focus) textarea.focus();
    if (textarea.select) textarea.select();
    if (textarea.setSelectionRange) {
      textarea.setSelectionRange(0, textarea.value.length);
    }

    const ok = Boolean(doc.execCommand('copy'));
    doc.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
