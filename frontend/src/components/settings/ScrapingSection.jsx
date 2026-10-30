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
      <Card id="image-sources-visibility" title="Image Sources">
        <label htmlFor="image-sources-hidden" className="flex min-h-10 items-start gap-2 text-sm text-content lg:min-h-0">
          <input id="image-sources-hidden" type="checkbox"
            checked={props.config.image_sources?.hidden === true}
            onChange={(e) => props.setField('image_sources', 'hidden', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border-strong" />
          <span>
            <span className="font-medium">Hide Image Sources</span>
            <span className="block text-xs text-content-muted">
              Remove the Image Sources panel from the Bank and dataset pages.
              Saved jobs and credentials are kept.
            </span>
          </span>
        </label>
      </Card>
    </div>
  )
}
