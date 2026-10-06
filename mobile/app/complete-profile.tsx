import { CityField } from '@/components/CityField';
import { canonicalCity } from '@/lib/clientLocation';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { authStyles } from '@/components/AuthFrame';
import { AuthFrame, AuthField, AuthError } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { finishArtisan } from '@/lib/authFlows';
import { signOut } from '@/lib/auth';
import { authIssue, type AuthIssue } from '@/lib/authContract';
const trades = ['Plomberie', 'Électricité', 'Climatisation', 'Peinture', 'Menuiserie', 'Maçonnerie', 'Carrelage', 'Nettoyage', 'Toiture', 'Jardinage', 'Bricolage', 'Déménagement', 'Serrurerie'];
export default function CompleteProfile() {
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [services, setServices] = useState<string[]>([]), [city, setCity] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<AuthIssue | null>(null);
  async function submit() { if (busy) return; setBusy(true); setError(null);
    try { await finishArtisan({ name, phone, services, cities: [city.trim()], available: false }); }
    catch (e) { setError(authIssue(e)); } finally { setBusy(false); }
  }
  return <AuthFrame back={false} title="Présentons votre activité." detail="Votre compte Artisan est confirmé. Complétez votre profil pour ouvrir Artisan OS. Vous choisirez ensuite votre disponibilité.">
    <AuthError issue={error} />
    <AuthField label="Nom professionnel" value={name} onChangeText={setName} autoCapitalize="words" editable={!busy} />
    <AuthField label="Téléphone professionnel" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={!busy} />
    <Text style={authStyles.label}>Vos services</Text>
    <View style={{ gap: 8 }}>{trades.map(trade => <FixeoAction key={trade} label={trade} variant="secondary" selected={services.includes(trade)} disabled={busy}
      onPress={() => setServices(previous => previous.includes(trade) ? previous.filter(x => x !== trade) : [...previous, trade])} />)}</View>
    <CityField label="Ville principale" value={city} onChange={setCity} disabled={busy} />
    <FixeoAction label="Ouvrir Artisan OS" busy={busy} busyLabel="Création de votre profil…" disabled={name.trim().length < 3 || services.length === 0 || !canonicalCity(city)} onPress={() => void submit()} />
    <FixeoAction label="Me déconnecter" variant="ghost" disabled={busy} onPress={() => void signOut().catch(e => setError(authIssue(e)))} />
  </AuthFrame>;
}
