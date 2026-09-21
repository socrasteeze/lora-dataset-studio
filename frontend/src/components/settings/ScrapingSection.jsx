import { Card, SecretField } from './primitives'

// The browser remains in core. Scraper credentials and rescue settings belong
// to the Scrape plugin and disappear with its settings contribution.
const CIVITAI_SECRET = {
  key: 'CIVITAI_API_KEY',
  label: 'Civitai API Key',
  help: 'Used by the Civitai browser for prompts and adult content. Create a key under civitai.com > Account settings > API Keys.',
}

export default function ScrapingSection(props) {
  return (
    <div className="space-y-6">
      <Card id="scrape-credentials" title="Source Credentials"
        help="Saved keys remain private. The field stays blank after saving.">
        <SecretField field={CIVITAI_SECRET} {...props} />
      </Card>
    </div>
  )
}
