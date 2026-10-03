import type { FixeoRole } from './auth';

export type MobileEntryRoute = '/' | '/artisan';

export function mobileEntryRouteForRole(role: FixeoRole): MobileEntryRoute | null {
  if (role === 'client') return '/';
  if (role === 'artisan') return '/artisan';
  return null;
}

export function signInErrorMessage(error: unknown) {
  const message = String((error as any)?.message || '').toLowerCase();

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid_credentials') ||
    message.includes('email not confirmed')
  ) {
    return 'Email ou mot de passe incorrect.';
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout')
  ) {
    return 'Connexion momentanément indisponible. Réessayez dans un instant.';
  }

  if (message.includes('role_invalid') || message.includes('unsupported_mobile_role')) {
    return 'Cet espace n’est pas disponible dans l’application mobile.';
  }

  return 'Connexion impossible pour le moment.';
}
