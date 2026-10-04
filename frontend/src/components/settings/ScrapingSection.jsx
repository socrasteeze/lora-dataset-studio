import { Card, SecretField } from './primitives'

// Keep the stored credential for explicit model downloads. Online browsing and
// scraping are not part of this fork's runtime workflow.
const CIVITAI_SECRET = {
  key: 'CIVITAI_API_KEY',
  label: 'Civitai API Key',
  help: 'Used only for model downloads you start in Setup. Online browsing and scraping are disabled.',
}

export default function ScrapingSection(props) {
  return (
    <div className="space-y-4">
      <Card id="scrape-credentials" title="Download Credentials"
        help="Saved keys remain private. The field stays blank after saving.">
        <SecretField field={CIVITAI_SECRET} {...props} />
      </Card>
    </div>
  )
}
