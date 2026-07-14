import { getFaqItems } from '@mpstats/ai';
import SupportClient from './SupportClient';

export default function SupportPage() {
  const faqItems = getFaqItems();

  return <SupportClient faqItems={faqItems} />;
}
