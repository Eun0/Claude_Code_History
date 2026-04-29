import { navigate } from '../App.jsx'

export default function SourceTabs({ servers, activeServerId }) {
  // activeServerId: null = local, string = remote server id
  return (
    <div className="source-tabs">
      <a
        className={'source-tab' + (activeServerId == null ? ' active' : '')}
        href="#/"
        onClick={(e) => {
          e.preventDefault()
          navigate('/')
        }}
      >
        Local
      </a>
      {servers.map((s) => (
        <a
          key={s.id}
          className={'source-tab' + (activeServerId === s.id ? ' active' : '')}
          href={`#/server/${encodeURIComponent(s.id)}`}
          onClick={(e) => {
            e.preventDefault()
            navigate(`/server/${encodeURIComponent(s.id)}`)
          }}
        >
          {s.label}
        </a>
      ))}
      <a
        className="source-tab source-tab-settings"
        href="#/settings"
        title="Manage servers"
        onClick={(e) => {
          e.preventDefault()
          navigate('/settings')
        }}
      >
        +
      </a>
    </div>
  )
}
