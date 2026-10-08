import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { loadBusinessQuotes, loadMarketplaceQuotes } from '@/lib/artisanOS';
import { businessStatus, money } from '@/lib/artisanExperience';
import { ArtisanPage, ArtisanChoices, ArtisanField, ArtisanEmpty, ArtisanMessage, useArtisanQuery, art } from '@/components/ArtisanEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { QuoteBreakdown } from '@/components/QuoteBreakdown';
const load = async () => { const [personal, marketplace] = await Promise.all([loadBusinessQuotes(), loadMarketplaceQuotes()]); return {personal, marketplace}; };
export default function Quotes() {
  const q = useArtisanQuery(load), [source,setSource] = useState('personal'), [search,setSearch] = useState('');
  const rows = [
    ...(q.data?.personal || []).map(quote => ({id:quote.id, source:'personal' as const, quote, market:null})),
    ...(q.data?.marketplace || []).map(market => ({id:market.id, source:'fixeo' as const, quote:null, market})),
  ].filter(row => row.source === source && `${row.quote?.title || row.market?.service_description} ${row.quote?.quote_number || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <ArtisanPage title="Vos devis" eyebrow="DEVIS STUDIO" activeKey="quotes" loading={q.loading} onRefresh={() => void q.reload()}
    list={{data:rows,keyExtractor:row=>row.source+':'+row.id,renderItem:({item:row})=><View style={art.row}>
      {row.quote ? <>
        <FixeoText variant="eyebrow" tone="secondary">{row.quote.quote_number} · {businessStatus[row.quote.status] || row.quote.status}</FixeoText>
        <FixeoText variant="heading">{row.quote.title}</FixeoText><FixeoText>{money(row.quote.total)}</FixeoText>
        <FixeoAction label="Ouvrir ce devis" variant="ghost" onPress={()=>router.push({pathname:'/artisan-workspace/quote/[id]',params:{id:row.id}})} />
      </> : row.market && <>
        <FixeoText variant="heading">{row.market.service_description}</FixeoText><QuoteBreakdown total={row.market.proposed_price} source="fixeo" />
        <FixeoText tone="secondary">{businessStatus[row.market.review_status] || row.market.review_status} · Version {row.market.quote_version}</FixeoText>
      </>}
    </View>}}>
    <ArtisanMessage message={q.error} retry={()=>void q.reload()} />
    <FixeoAction label="Nouveau devis" onPress={()=>router.push('/artisan-workspace/quote/new')} />
    <ArtisanChoices label="Origine" value={source} onChange={setSource} options={[{value:'personal',label:'Clients personnels'},{value:'fixeo',label:'FIXEO'}]} />
    <ArtisanField label="Rechercher un devis" value={search} onChangeText={setSearch} />
    {q.data && !rows.length && <ArtisanEmpty title="Aucun devis à afficher." detail={search ? 'Modifiez votre recherche.' : 'Vos devis de cette origine apparaîtront ici.'} />}
  </ArtisanPage>;
}
