import { registerRootComponent } from 'expo';
import { Alert } from 'react-native';

import App from './App';

// Sin esto, un error de JS fuera del renderizado (por ejemplo en un evento o
// una promesa) cierra la app en producción sin mostrar nada. Lo mostramos en
// pantalla para poder diagnosticar builds nativas fuera de Expo Go.
const errorUtils = (global as { ErrorUtils?: { setGlobalHandler: (h: (e: Error, isFatal?: boolean) => void) => void; getGlobalHandler?: () => (e: Error, isFatal?: boolean) => void } }).ErrorUtils;
if (errorUtils) {
  const defaultHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    Alert.alert(
      isFatal ? 'Error fatal' : 'Error',
      String(error?.message ?? error) + '\n\n' + String(error?.stack ?? '')
    );
    defaultHandler?.(error, isFatal);
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
