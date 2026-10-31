import { Alert, type AlertButton, Platform } from 'react-native';

/**
 * react-native-web ships `Alert.alert` as a no-op, which silently disables every confirmation flow
 * (finish workout, delete…) on web. Map it to the browser dialogs: OK runs the last non-cancel button.
 */
export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = buttons ?? [];
    const confirm = [...actions].reverse().find((button) => button.style !== 'cancel');
    const cancel = actions.find((button) => button.style === 'cancel');
    if (!confirm || actions.length <= 1) {
      window.alert(text);
      confirm?.onPress?.();
      return;
    }
    if (window.confirm(text)) confirm.onPress?.();
    else cancel?.onPress?.();
  };
}
