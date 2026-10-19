import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'

export default function InstanceProfile() {
  const [name, setName] = useState('')
  useEffect(() => {
    let live = true
    apiFetch('/api/instance-profile', { background: true })
      .then((profile) => { if (live) setName(profile.name || '') })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return <span aria-label="Active Profile" title={name}
    className="block min-h-4 max-w-full truncate text-xs font-normal text-content-muted">{name}</span>
}
