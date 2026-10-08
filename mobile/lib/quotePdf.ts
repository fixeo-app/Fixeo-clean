import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { quoteDocumentHtml, type QuoteDocument } from './quoteDocument';

/** Explicit action only. This never changes the business status or sends a message. */
export async function shareQuotePdf(document: QuoteDocument) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('PDF_SHARING_UNAVAILABLE');
  const result = await Print.printToFileAsync({ html: quoteDocumentHtml(document), width: 595, height: 842 });
  const file = new File(result.uri);
  try {
    const bytes = await file.bytes();
    if (result.numberOfPages < 1 || bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF_INVALID');
    await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Devis ${document.number}` });
    return { pages: result.numberOfPages, bytes: bytes.length };
  } catch (error) {
    // Remove failed exports only; a recipient may still be reading a shared file.
    if (file.exists) file.delete();
    throw error;
  }
}
